"""Tests for gradcam.py and fallback.py"""
import sys
from pathlib import Path
import numpy as np
import torch
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.model import SpoofCNN
from app.gradcam import compute_gradcam
from app.fallback import FallbackClassifier, extract_fallback_features

# Check if sklearn is importable (blocked by AppControl on some Windows machines)
try:
    from sklearn.linear_model import LogisticRegression  # noqa: F401
    _SKLEARN_OK = True
except (ImportError, OSError):
    _SKLEARN_OK = False

sklearn_required = pytest.mark.skipif(
    not _SKLEARN_OK,
    reason="sklearn blocked by AppControl policy on this machine",
)


def make_mel_tensor() -> torch.Tensor:
    """Random (1,1,64,101) tensor mimicking a log-mel input."""
    return torch.randn(1, 1, 64, 101)


# ── Grad-CAM tests ──────────────────────────────────────────────────────────

def test_gradcam_returns_packed_matrix():
    model = SpoofCNN()
    model.eval()
    x = make_mel_tensor()
    heatmap, elapsed_ms = compute_gradcam(model, x, target_class=1)
    assert heatmap is not None, "Grad-CAM returned None unexpectedly"
    assert heatmap.encoding == "u8_b64"
    assert heatmap.shape == (64, 101)
    assert isinstance(heatmap.data, str) and len(heatmap.data) > 0
    assert elapsed_ms >= 0.0


def test_gradcam_heatmap_range():
    """Decoded heatmap bytes should be in 0..255."""
    import base64
    model = SpoofCNN()
    model.eval()
    x = make_mel_tensor()
    heatmap, _ = compute_gradcam(model, x, target_class=1)
    assert heatmap is not None
    raw = np.frombuffer(base64.b64decode(heatmap.data), dtype=np.uint8)
    assert raw.min() >= 0
    assert raw.max() <= 255
    assert raw.shape == (64 * 101,)


def test_gradcam_latency_reasonable():
    """Grad-CAM on CPU should run in < 2000 ms (generous for CI)."""
    model = SpoofCNN()
    model.eval()
    x = make_mel_tensor()
    _, elapsed_ms = compute_gradcam(model, x, target_class=1)
    assert elapsed_ms < 2000.0, f"Grad-CAM too slow: {elapsed_ms:.1f}ms"


# ── Fallback classifier tests ────────────────────────────────────────────────

def test_fallback_features_shape():
    y = np.random.randn(16000).astype(np.float32)
    feat = extract_fallback_features(y)
    assert feat.shape == (19,), f"Expected 19 features, got {feat.shape}"
    assert np.isfinite(feat).all(), "Features contain NaN/Inf"


def test_fallback_unfitted_returns_05():
    clf = FallbackClassifier()
    y = np.random.randn(16000).astype(np.float32)
    p = clf.predict_proba_spoof(y)
    assert p == 0.5


@sklearn_required
def test_fallback_fitted_returns_valid_prob():
    """Fit on tiny synthetic dataset and verify output is a valid probability."""
    rng = np.random.default_rng(0)
    # Create tiny synthetic dataset: 20 "bonafide" + 20 "spoof" (random noise)
    X = rng.standard_normal((40, 19)).astype(np.float32)
    y = np.array([0] * 20 + [1] * 20, dtype=np.int64)

    clf = FallbackClassifier()
    clf.fit(X, y)

    test_y = rng.standard_normal(16000).astype(np.float32)
    p = clf.predict_proba_spoof(test_y)
    assert 0.0 <= p <= 1.0, f"Probability out of range: {p}"


@sklearn_required
def test_fallback_save_load(tmp_path):
    """Test that save/load round-trip preserves predictions."""
    rng = np.random.default_rng(1)
    X = rng.standard_normal((40, 19)).astype(np.float32)
    y = np.array([0] * 20 + [1] * 20, dtype=np.int64)

    clf = FallbackClassifier()
    clf.fit(X, y)

    path = tmp_path / "fallback.pkl"
    clf.save(path)

    clf2 = FallbackClassifier.load(path)
    test_y = rng.standard_normal(16000).astype(np.float32)
    p1 = clf.predict_proba_spoof(test_y)
    p2 = clf2.predict_proba_spoof(test_y)
    assert abs(p1 - p2) < 1e-6, "Save/load changed predictions"
