"""
backend/app/api/__init__.py
============================
Package init for the API layer.

Imports all FastAPI routers and exposes them as a list so main.py can
register them with a single loop:

    from app.api import ALL_ROUTERS
    for prefix, router, tags in ALL_ROUTERS:
        app.include_router(router, prefix=prefix, tags=tags)

Adding a new router:
  1. Create backend/app/api/my_router.py with `router = APIRouter()`
  2. Import it here and append to ALL_ROUTERS below.
"""

from app.api.chat_router        import router as chat_router
from app.api.profile_router     import router as profile_router
from app.api.shortlist_router   import router as shortlist_router
from app.api.university_router  import router as university_router
from app.api.search_router      import router as search_router

# ── Router registry ───────────────────────────────────────────────────────────
# Each entry: (url_prefix, router_instance, openapi_tags)
ALL_ROUTERS = [
    ("/api/chat",         chat_router,       ["chat"]),
    ("/api/profile",      profile_router,    ["profile"]),
    ("/api/shortlist",    shortlist_router,  ["shortlist"]),
    ("/api/universities", university_router, ["universities"]),
    ("/api/search",       search_router,     ["search"]),
]

__all__ = [
    "chat_router",
    "profile_router",
    "shortlist_router",
    "university_router",
    "search_router",
    "ALL_ROUTERS",
]
