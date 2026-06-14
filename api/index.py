"""Vercel serverless entry point for GreenCityAI.

Vercel's Python runtime (@vercel/python) serves the module-level ``app`` object
as a WSGI application. We simply put ``backend/`` on the import path and expose
the existing Flask app — no duplication of logic.

Locally you still run ``python backend/app.py``; this file is only used by
Vercel. All routes (static files + /api/*) are handled by the Flask app, so a
single function powers the whole site.
"""

import os
import sys

# Make the backend package importable from the serverless bundle.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app import app  # noqa: E402  (Vercel detects and serves this WSGI `app`)

# Expose under a conventional name too, in case the runtime looks for `handler`.
handler = app
