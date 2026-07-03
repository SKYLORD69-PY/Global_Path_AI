"""Compatibility package exposing top-level ``backend/auth`` as ``app.auth``."""

from pathlib import Path

_TOP_LEVEL_DIR = Path(__file__).resolve().parents[2] / "auth"
if str(_TOP_LEVEL_DIR) not in __path__:
    __path__.append(str(_TOP_LEVEL_DIR))
