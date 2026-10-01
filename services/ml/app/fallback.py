"""
Handcrafted-feature fallback model.

Uses a logistic regression (or gradient-boosted) classifier trained on a
19-dimensional feature vector derived from audio statistics. This is the
guaranteed fallback path when the CNN is unavailable.

Feature vector (19 dims):
  - MFCC 1-13 mean (13)
  - MFCC 1-13 std (13) — actually MFCC stats is 26 total, but we use 13 mean only
  Wait, let us use MFCC mean (13) + spectral centroid mean (1) + rolloff mean (1) +
  ZCR mean (1) + spectral flatness mean (1) + high-band energy ratio (1) + pitch
  perturbation (1) = 19 features total.

Training:
    from fallback import FallbackClassifier
    clf = FallbackClassifier()
    clf.fit(X_train, y_train)
    clf.save(path)

Inference:
    clf = FallbackClassifier.load(path)
    p_spoof = clf.predict_proba_spoof(y_audio)
"""
import logging
import pickle
from pathlib import Path
from typing import Optional

import numpy as np
import librosa

logger = logging.getLogger(__name__)

SR = 16000


def extract_fallback_features(y: np.ndarray) -> np.ndarray:
    """
    Extract 19-dim feature vector from a 1-second (16000-sample) audio chunk.
    All values are scalars (float32). Does NOT require a trained model.
    """
    # MFCC mean (13 dims)
    mfcc = librosa.feature.mfcc(y=y, sr=SR, n_mfcc=13, n_fft=512, hop_length=160)
    mfcc_mean = mfcc.mean(axis=1)  # (13,)

    # Spectral centroid mean (1 dim)
    centroid = librosa.feature.spectral_centroid(y=y, sr=SR, n_fft=512, hop_length=160)
    centroid_mean = centroid.mean()

    # Spectral roll-off 85% mean (1 dim)
    rolloff = librosa.feature.spectral_rolloff(y=y, sr=SR, roll_percent=0.85)
    rolloff_mean = rolloff.mean()

    # Zero crossing rate mean (1 dim)
    zcr = librosa.feature.zero_crossing_rate(y, frame_length=512, hop_length=160)
    zcr_mean = zcr.mean()

    # Spectral flatness mean (1 dim)
    flatness = librosa.feature.spectral_flatness(y=y, n_fft=512, hop_length=160)
    flatness_mean = flatness.mean()

    # High-band (4-8 kHz) energy ratio (1 dim)
    D = librosa.stft(y, n_fft=512, hop_length=160)
    power = np.abs(D) ** 2
    hf_ratio = float(power[128:, :].sum() / (power.sum() + 1e-9))

    # Pitch perturbation via yin (1 dim)
    try:
        f0 = librosa.yin(y, fmin=70, fmax=400, sr=SR, frame_length=1024, hop_length=256)
        valid = f0[f0 > 0]
        if len(valid) > 2:
            T = 1.0 / valid
            pitch_pert = float(np.mean(np.abs(np.diff(T))) / (np.mean(T) + 1e-9))
        else:
            pitch_pert = 0.02
    except Exception:
        pitch_pert = 0.02

    feat = np.concatenate([
        mfcc_mean,
        [centroid_mean, rolloff_mean, zcr_mean, flatness_mean, hf_ratio, pitch_pert],
    ]).astype(np.float32)

    return feat  # (19,)


class FallbackClassifier:
    """
    Thin wrapper around sklearn LogisticRegression with a standard scaler.
    """

    def __init__(self):
        self._model = None
        self._scaler = None

    def fit(self, X: np.ndarray, y: np.ndarray) -> "FallbackClassifier":
        from sklearn.linear_model import LogisticRegression
        from sklearn.preprocessing import StandardScaler
        from sklearn.pipeline import Pipeline

        pipe = Pipeline([
            ("scaler", StandardScaler()),
            ("lr", LogisticRegression(C=1.0, max_iter=1000, class_weight="balanced")),
        ])
        pipe.fit(X, y)
        self._model = pipe
        return self

    def predict_proba_spoof(self, y_audio: np.ndarray) -> float:
        """Return P(spoof) for a 1-second audio frame. Falls back to 0.5 if not fitted."""
        if self._model is None:
            return 0.5
        feat = extract_fallback_features(y_audio).reshape(1, -1)
        try:
            proba = self._model.predict_proba(feat)[0]
            # classes_[1] should be spoof (1); verify at training time
            return float(proba[1])
        except Exception:
            return 0.5

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as f:
            pickle.dump(self._model, f)
        logger.info("Saved fallback classifier to %s", path)

    @classmethod
    def load(cls, path: Path) -> "FallbackClassifier":
        obj = cls()
        if not path.exists():
            logger.warning("Fallback model not found at %s — will return 0.5", path)
            return obj
        with open(path, "rb") as f:
            obj._model = pickle.load(f)
        logger.info("Loaded fallback classifier from %s", path)
        return obj
