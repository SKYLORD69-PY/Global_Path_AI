"""Repo-root wrapper for the backend university seeder.

This lets the command work from the repository root:
    python -m scripts.seed_universities

It forwards execution to backend/scripts/seed_universities.py after adding
the backend directory to sys.path.
"""

from __future__ import annotations

import runpy
import sys
from pathlib import Path


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    backend_dir = repo_root / "backend"
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))

    runpy.run_path(str(backend_dir / "scripts" / "seed_universities.py"), run_name="__main__")


if __name__ == "__main__":
    main()
