"""Application settings (can be overridden with environment variables)."""
import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BACKEND_DIR.parent
FRONTEND_DIR = ROOT_DIR / "frontend"

DATABASE_URL = os.environ.get(
    "TASKBOARD_DATABASE_URL", f"sqlite:///{(BACKEND_DIR / 'taskboard.db').as_posix()}"
)
WORKSPACE_NAME = os.environ.get("TASKBOARD_WORKSPACE", "Команда Mobile")
# Fill an empty database with the demo data from the mockup (set to 0 to start empty).
SEED_DEMO = os.environ.get("TASKBOARD_SEED", "1") != "0"

# Colours from the design palette
USER_COLORS = ["#7950F2", "#1C7ED6", "#E64980", "#0CA678", "#F76707", "#AE3EC9", "#1098AD", "#F59F00"]
BOARD_COLORS = ["#3B5BDB", "#E64980", "#0CA678", "#F76707", "#7950F2", "#1098AD"]
COLUMN_COLORS = ["#868E96", "#3B5BDB", "#F08C00", "#2F9E44", "#AE3EC9", "#1098AD", "#E64980", "#7950F2"]
