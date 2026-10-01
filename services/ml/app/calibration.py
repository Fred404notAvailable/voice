"""
Temperature scaling calibration module.

After training, we find the scalar temperature T* that minimizes NLL on the dev set.
The calibrated probability is:  p = sigmoid(logit_diff / T*)

Usage (training time):
    from calibration import calibrate_temperature, save_calibration

Usage (inference time):
    temperature = load_temperature(CALIBRATION_PATH)
"""
import json
import logging
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from scipy.optimize import minimize_scalar

logger = logging.getLogger(__name__)


def compute_logit_diffs(
    model: torch.nn.Module,
    dataloader: "torch.utils.data.DataLoader",
) -> tuple[np.ndarray, np.ndarray]:
    """
    Run model on the entire dataloader and collect logit differences and labels.

    Returns:
        logit_diffs: array of shape (N,) — logit[spoof] - logit[bonafide]
        labels:      array of shape (N,) — 0=bonafide, 1=spoof
    """
    model.eval()
    all_diffs: list[float] = []
    all_labels: list[int] = []

    with torch.no_grad():
        for batch in dataloader:
            x, y = batch
            out = model(x)
            if isinstance(out, tuple):
                out = out[0]
            diffs = (out[:, 1] - out[:, 0]).cpu().numpy().tolist()
            all_diffs.extend(diffs)
            all_labels.extend(y.cpu().numpy().tolist())

    return np.array(all_diffs, dtype=np.float32), np.array(all_labels, dtype=np.int64)


def nll_with_temperature(temperature: float, logit_diffs: np.ndarray, labels: np.ndarray) -> float:
    """Cross-entropy loss at a given temperature (for optimization)."""
    t = max(temperature, 1e-4)
    scaled = logit_diffs / t
    probs = 1.0 / (1.0 + np.exp(-scaled))  # sigmoid
    probs = np.clip(probs, 1e-7, 1 - 1e-7)
    nll = -np.mean(labels * np.log(probs) + (1 - labels) * np.log(1 - probs))
    return float(nll)


def calibrate_temperature(
    logit_diffs: np.ndarray,
    labels: np.ndarray,
    bounds: tuple[float, float] = (0.05, 20.0),
) -> float:
    """
    Find optimal temperature T* via scalar optimization on the dev NLL.

    Returns:
        T*: optimal temperature (float)
    """
    result = minimize_scalar(
        nll_with_temperature,
        args=(logit_diffs, labels),
        bounds=bounds,
        method="bounded",
    )
    T_star = float(result.x)
    logger.info("Calibration complete: T* = %.4f (dev NLL = %.4f)", T_star, result.fun)
    return T_star


def save_calibration(temperature: float, path: Path, extra: dict | None = None) -> None:
    """Save calibration JSON to disk."""
    payload = {"temperature": round(temperature, 6)}
    if extra:
        payload.update(extra)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(payload, f, indent=2)
    logger.info("Saved calibration to %s", path)


def load_temperature(path: Path) -> float:
    """Load temperature from calibration.json. Returns 1.0 if file is missing."""
    if not path.exists():
        return 1.0
    with open(path, "r") as f:
        data = json.load(f)
    return float(data.get("temperature", 1.0))
