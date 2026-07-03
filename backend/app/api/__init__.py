"""
Compatibility package exposing the implemented routers in ``backend/api``.
"""

from pathlib import Path

_TOP_LEVEL_DIR = Path(__file__).resolve().parents[2] / "api"
if str(_TOP_LEVEL_DIR) not in __path__:
    __path__.append(str(_TOP_LEVEL_DIR))

from .chat_router import router as chat_router
from .profile_router import router as profile_router
from .shortlist_router import router as shortlist_router
from .university_router import router as university_router
from .search_router import router as search_router

ALL_ROUTERS = [
    ("/api/chat", chat_router, ["chat"]),
    ("/api/profile", profile_router, ["profile"]),
    ("/api/shortlist", shortlist_router, ["shortlist"]),
    ("/api/universities", university_router, ["universities"]),
    ("/api/search", search_router, ["search"]),
]

__all__ = [
    "ALL_ROUTERS",
    "chat_router",
    "profile_router",
    "search_router",
    "shortlist_router",
    "university_router",
]
