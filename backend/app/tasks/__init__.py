"""Compatibility package exposing top-level ``backend/tasks`` as ``app.tasks``."""

from pathlib import Path

_TOP_LEVEL_DIR = Path(__file__).resolve().parents[2] / "tasks"
if str(_TOP_LEVEL_DIR) not in __path__:
    __path__.append(str(_TOP_LEVEL_DIR))
