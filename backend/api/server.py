"""
backend/api/server.py — Legacy entrypoint.

The primary entrypoint is main.py at the project root.
This file exists for backward compatibility if anything references
backend.api.server:app directly. It re-exports the hardened app
from main.py so all security configuration is in one place.
"""

# Re-export the app from the canonical entrypoint
from main import app  # noqa: F401

__all__ = ["app"]