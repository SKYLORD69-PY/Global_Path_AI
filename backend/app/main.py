"""
Package-level ASGI entrypoint.

This keeps ``uvicorn app.main:app`` working while the concrete FastAPI
application lives in the top-level ``backend/main.py`` module.
"""

from main import app

__all__ = ["app"]
