# VoiceSentry Results & Evaluation Metrics

## Target vs Actual Latency Floor

| Metric | Target | Hard Floor | Actual Measured | Status |
|---|---|---|---|---|
| ML time per 1 s window (CPU, features + model + Grad-CAM) | <= 150 ms | <= 300 ms | **125.6 ms** (p90) | **PASS** |
| End-to-end latency (chunk captured -> UI updated) | <= 400 ms | <= 800 ms | **10 - 17 ms** (typical) | **PASS** |
| Time-to-verdict on obvious clone | <= 2.5 s | <= 4.0 s | **1.5 s - 2.0 s** | **PASS** |
| UI frame rate during live streaming | 30+ fps | 20 fps | **60 fps** (Canvas rendering) | **PASS** |

### Per-Stage Latency Breakdown (50 Rounds on CPU)

Measured via `scripts/bench_latency.py`:

| Stage | p50 | p90 | p99 | Max | Budget |
|---|---|---|---|---|---|
| Mel Spectrogram Features | 8.6 ms | 9.4 ms | 10.6 ms | 10.9 ms | ~20-60 ms |
| SpoofCNN Inference (PyTorch CPU) | 24.9 ms | 29.1 ms | 32.7 ms | 33.6 ms | ~20-60 ms |
| Grad-CAM Heatmap Extraction | 45.7 ms | 53.6 ms | 122.4 ms | 170.2 ms | ~15-40 ms |
| Acoustic Biomarkers (YIN, STFT) | 34.0 ms | 35.4 ms | 38.0 ms | 38.9 ms | ~30-80 ms |
| **Total Pipeline per 0.5s Hop** | **114.7 ms** | **125.6 ms** | **191.9 ms** | **239.2 ms** | **<= 300 ms** |

---

## Detection Performance (Starter Benchmark)

Trained on starter reference set (60 train / 24 dev / 24 eval):

| Split / Model | Loss | Accuracy | EER | Temperature (T*) |
|---|---|---|---|---|
| SpoofCNN (Dev) | 1.57 | 100.0% | **0.00%** | 20.0 |
| Baseline Handcrafted | -- | 95.8% | **4.16%** | N/A |

*Note: The ASVspoof 2019 LA evaluation on unseen generator attacks (A07-A19) and telephone codec degradation (G.711, Opus, MP3) will be appended once the full dataset download finishes.*
