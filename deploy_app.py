"""Backend-only production app for Hugging Face Spaces.

This mounts the main EUDORA API and the AI orchestrator into one FastAPI app
so HF only needs to expose port 7860. The frontend is deployed separately.
"""

from pathlib import Path
import importlib.util
import sys

from main import app


PROJECT_ROOT = Path(__file__).resolve().parent
ORCHESTRATOR_DIR = PROJECT_ROOT / "qwen-orchestrator"


def _load_orchestrator_app():
    sys.path.insert(0, str(ORCHESTRATOR_DIR))
    spec = importlib.util.spec_from_file_location(
        "eudora_orchestrator_app",
        ORCHESTRATOR_DIR / "app.py",
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load orchestrator app")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.app


app.mount("/orchestrator", _load_orchestrator_app())
