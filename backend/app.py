"""Flask REST API and static-file server for GreenCityAI.

The API is deliberately thin: it validates the request, delegates all logic to
``carbon_engine``, and serialises the result. Keeping the web layer dumb makes
the business logic easy to test and the surface area easy to secure.

Run locally:
    python backend/app.py
Then open http://127.0.0.1:5000 in a browser.
"""

from __future__ import annotations

import json
import os
import time
from collections import deque
from pathlib import Path

import ai_assistant
import city_data
import youtube_resources
from carbon_engine import (
    DIET_FACTORS,
    HEATING_FACTORS,
    TRANSPORT_FACTORS,
    UserContext,
    ValidationError,
    analyse,
)
from flask import Flask, Response, jsonify, request, send_from_directory


def _load_dotenv() -> None:
    """Load KEY=VALUE pairs from a project-root .env into the environment.

    A tiny, dependency-free loader so users can drop their API key in a file.
    Existing environment variables always take precedence and are never
    overwritten.
    """
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip("'\"")
        if key and key not in os.environ:
            os.environ[key] = value


_load_dotenv()

# Serve the frontend straight from the sibling ``frontend`` directory.
FRONTEND_DIR = (Path(__file__).resolve().parent.parent / "frontend").resolve()

app = Flask(__name__, static_folder=None)

# Reject oversized bodies early — a cheap defence against memory-exhaustion.
# 64 KB comfortably covers a full chat history plus footprint context.
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024


# --------------------------------------------------------------------------- #
# Lightweight in-memory rate limiter — protects the AI endpoint (and its API
# key / cost) from abuse. A fixed window of N requests per IP. For a single
# process this needs no dependency; a multi-process deploy would use Redis.
# --------------------------------------------------------------------------- #
_RATE_LIMIT = 20          # requests allowed per IP...
_RATE_WINDOW = 60.0       # ...within this many seconds.
_rate_hits: dict[str, deque] = {}


def _rate_limited(key: str) -> bool:
    """Return True if this key has exceeded the request budget."""
    now = time.monotonic()
    hits = _rate_hits.setdefault(key, deque())
    while hits and now - hits[0] > _RATE_WINDOW:
        hits.popleft()
    if not hits and key in _rate_hits:
        # Keep the table from growing unbounded across many transient IPs.
        _rate_hits.pop(key, None)
        hits = _rate_hits.setdefault(key, deque())
    if len(hits) >= _RATE_LIMIT:
        return True
    hits.append(now)
    return False


@app.after_request
def set_security_headers(response):
    """Apply a conservative set of security headers to every response."""
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' https://cdn.jsdelivr.net; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data:"
    )
    return response


# Per-category presentation metadata for turning engine recommendations into
# user-facing "AI recommendation" cards.
_DIFFICULTY = {
    "transport": ("Medium", 600), "diet": ("Easy", 0),
    "home_heating": ("Hard", 800), "electricity": ("Easy", 300),
    "flights": ("Medium", 0), "waste": ("Easy", 0),
}

# A 12-tonne/year lifestyle maps to a carbon score of 100 (lower is greener).
_SCORE_BASELINE_TONNES = 12.0


def _carbon_score(total_tonnes: float) -> int:
    """Map an annual footprint (tonnes) to a 0-100 score; lower is greener."""
    return round(max(0, min(100, total_tonnes / _SCORE_BASELINE_TONNES * 100)))


def _recommendation_cards(recommendations: list) -> list:
    """Enrich engine recommendations with difficulty and financial savings."""
    cards = []
    for rec in recommendations:
        difficulty, inr = _DIFFICULTY.get(rec["category"], ("Medium", 0))
        cards.append(
            {
                "title": rec["message"].split(" — ")[0].split(". ")[0],
                "category": rec["category"],
                "impact_kg_month": round(rec["estimated_saving_kg"] / 12),
                "difficulty": difficulty,
                "savings_inr_month": inr,
            }
        )
    return cards


@app.get("/api/bootstrap")
def bootstrap():
    """Everything the dashboard needs on first load (profile, city, insights)."""
    return jsonify(city_data.bootstrap())


@app.get("/api/options")
def options():
    """Expose the valid choices so the frontend never hard-codes them."""
    return jsonify(
        {
            "transport_modes": sorted(TRANSPORT_FACTORS),
            "diets": sorted(DIET_FACTORS),
            "heating_types": sorted(HEATING_FACTORS),
        }
    )


@app.post("/api/analyse")
def analyse_endpoint():
    """Validate the posted context and return a full footprint analysis."""
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Request body must be a JSON object."}), 400

    # Whitelist the accepted keys; ignore anything unexpected.
    allowed_keys = {
        "transport_mode",
        "daily_commute_km",
        "diet",
        "heating",
        "monthly_electricity_kwh",
        "flights_per_year",
        "household_size",
        "recycles",
    }
    cleaned = {k: v for k, v in payload.items() if k in allowed_keys}

    try:
        ctx = UserContext(**cleaned)
    except ValidationError as exc:
        return jsonify({"error": str(exc)}), 400
    except TypeError as exc:
        # Wrong value types for known keys, e.g. a list where a number is needed.
        return jsonify({"error": f"Invalid input: {exc}"}), 400

    result = analyse(ctx).to_dict()
    result["score"] = _carbon_score(result["total_annual_tonnes"])
    result["recommendation_cards"] = _recommendation_cards(result["recommendations"])
    return jsonify(result)


@app.get("/api/resources")
def resources():
    """Return curated YouTube learning resources, optionally for one category."""
    category = request.args.get("category")
    if category:
        return jsonify({category: youtube_resources.resources_for(category)})
    return jsonify(youtube_resources.all_resources())


@app.post("/api/chat")
def chat():
    """Stream a reply from the AI assistant via Server-Sent Events.

    Body: ``{"messages": [{"role": "user"|"assistant", "content": str}, ...],
    "footprint": <optional analysis dict>}``. The response is a text/event-stream
    of ``{"text": "..."}`` chunks, terminated by ``{"done": true}``.
    """
    if _rate_limited(request.remote_addr or "unknown"):
        return jsonify({"error": "Too many requests — please slow down."}), 429

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Request body must be a JSON object."}), 400

    messages = payload.get("messages")
    if not isinstance(messages, list) or not messages:
        return jsonify({"error": "'messages' must be a non-empty list."}), 400

    footprint = payload.get("footprint")
    footprint = footprint if isinstance(footprint, dict) else None

    def event_stream():
        try:
            for chunk in ai_assistant.stream_reply(messages, footprint):
                yield f"data: {json.dumps({'text': chunk})}\n\n"
        except Exception:  # never leak internals to the client
            yield f"data: {json.dumps({'error': 'The assistant is unavailable.'})}\n\n"
        yield f"data: {json.dumps({'done': True})}\n\n"

    return Response(
        event_stream(),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/status")
def status():
    """Report whether the live AI service is configured, and which provider."""
    return jsonify(
        {
            "ai_enabled": ai_assistant.is_available(),
            "provider": ai_assistant.active_provider(),
        }
    )


@app.get("/health")
def health():
    """Lightweight liveness probe for deployment platforms."""
    return jsonify({"status": "ok"})


@app.get("/")
def index():
    """Serve the dashboard's entry point."""
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.get("/<path:filename>")
def static_files(filename: str):
    """Serve frontend assets. ``send_from_directory`` blocks path traversal."""
    return send_from_directory(FRONTEND_DIR, filename)


if __name__ == "__main__":
    # ``debug`` is opt-in via env var so production never runs the debugger.
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="127.0.0.1", port=port, debug=debug)
