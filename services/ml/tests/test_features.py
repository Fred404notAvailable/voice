import numpy as np
from app.features import log_mel, log_mel_display, pack_matrix_u8_b64
import base64

def test_log_mel_shapes_and_nans():
    # 1 second of silence
    silence = np.zeros(16000, dtype=np.float32)
    s_mel = log_mel(silence)
    assert s_mel.shape == (64, 101)
    assert not np.isnan(s_mel).any()

    # 1 second of full-scale noise
    noise = np.random.uniform(-1.0, 1.0, 16000).astype(np.float32)
    n_mel = log_mel(noise)
    assert n_mel.shape == (64, 101)
    assert not np.isnan(n_mel).any()

def test_log_mel_display_shape():
    half_sec = np.random.uniform(-0.5, 0.5, 8000).astype(np.float32)
    disp = log_mel_display(half_sec)
    assert disp.shape[0] == 64
    assert 48 <= disp.shape[1] <= 52  # approx 50-51 frames
    assert (disp >= 0.0).all() and (disp <= 1.0).all()

def test_matrix_packing_roundtrip():
    # Random normalized matrix
    orig = np.random.uniform(0.0, 1.0, (64, 50)).astype(np.float32)
    packed = pack_matrix_u8_b64(orig)

    assert packed.shape == (64, 50)
    assert packed.encoding == "u8_b64"

    decoded_bytes = base64.b64decode(packed.data)
    decoded_u8 = np.frombuffer(decoded_bytes, dtype=np.uint8).reshape(64, 50)
    decoded_float = decoded_u8.astype(np.float32) / 255.0

    max_err = np.max(np.abs(orig - decoded_float))
    assert max_err <= (1.0 / 255.0 + 1e-5), f"Max error {max_err} exceeds 1/255"
