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
from pathlib import Path

from flask import Flask, Response, jsonify, request, send_from_directory

import ai_assistant
import youtube_resources
from carbon_engine import (
    DIET_FACTORS,
    HEATING_FACTORS,
    TRANSPORT_FACTORS,
    UserContext,
    ValidationError,
    analyse,
)

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


@app.after_request
def set_security_headers(response):
    """Apply a conservative set of security headers to every response."""
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' https://cdn.jsdelivr.net; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:"
    )
    return response


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

    return jsonify(analyse(ctx).to_dict())


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
    """Report whether the live AI service is configured (vs fallback mode)."""
    return jsonify({"ai_enabled": ai_assistant.is_available()})


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
