"""Flask REST API and static-file server for GreenCityAI.

The API is deliberately thin: it validates the request, delegates all logic to
``carbon_engine``, and serialises the result. Keeping the web layer dumb makes
the business logic easy to test and the surface area easy to secure.

Run locally:
    python backend/app.py
Then open http://127.0.0.1:5000 in a browser.
"""

from __future__ import annotations

import os
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

from carbon_engine import (
    DIET_FACTORS,
    HEATING_FACTORS,
    TRANSPORT_FACTORS,
    UserContext,
    ValidationError,
    analyse,
)

# Serve the frontend straight from the sibling ``frontend`` directory.
FRONTEND_DIR = (Path(__file__).resolve().parent.parent / "frontend").resolve()

app = Flask(__name__, static_folder=None)

# Reject oversized bodies early — a cheap defence against memory-exhaustion.
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024  # 16 KB is ample for this payload.


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
