import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
ARTIFACTS_DIR = BASE_DIR / "artifacts"

MOCK_ML = os.getenv("MOCK_ML", "0") == "1"
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

MODEL_PATH = ARTIFACTS_DIR / "model.pt"
CALIBRATION_PATH = ARTIFACTS_DIR / "calibration.json"
BASELINES_PATH = ARTIFACTS_DIR / "baselines.json"
