# VoiceSentry Build Progress Log

| Phase | Description | Status | Verification Command & Real Output |
|---|---|---|---|
| Phase 0 | Bootstrap repo layout, packages, configs | COMPLETE | `npm --prefix apps/web run build` -> exit 0; `curl http://localhost:8080/api/health` -> 200 OK; `curl http://localhost:8000/health` -> 200 OK |
| Phase 1 | Echo vertical slice (Mic -> Gateway -> ML -> UI) | COMPLETE | `python -m pytest services/ml/tests -v` -> 8 passed; `python scripts/e2e_smoke.py` -> 6/6 frames processed, strictly increasing seq, avg latency ~5ms |
| Phase 2 | Data, manifest, own eval set | PENDING | Awaiting ASVspoof2019 LA dataset path from human (see QUESTIONS.md). Training scripts built and ready. |
| Phase 3 | Baseline model + handcrafted features | COMPLETE (code) | `services/ml/app/fallback.py` + `training/train_baseline.py` built. sklearn blocked by AppControl on dev machine (training must run in Docker or after policy fix). |
| Phase 4 | CNN training + temperature scaling calibration | COMPLETE (code) | `training/train_cnn.py`, `training/calibrate.py`, `training/compute_baselines.py` built. Awaiting data for actual training run. |
| Phase 5 | Streaming engine + Grad-CAM integration | COMPLETE | `session_engine.py` updated with Grad-CAM + fallback path. `gradcam.py` + `calibration.py` implemented. |
| Phase 6 | Frontend visuals (Spectrogram, Gauge, Biomarkers, Timeline, Verdict) | COMPLETE | `npm run build` -> exit 0, 258 KB bundle; All 8 components built. |
| Phase 7 | Robustness & telephony hardening | COMPLETE (code) | `training/augment_codecs.py` built; `training/evaluate.py` built with per-condition metrics. |
| Phase 8 | Demo hardening & containerization | PENDING | docker-compose.yml exists; `bench_latency.py` shows p90=6ms (no model). Full bench needs trained model. |
| Phase 9 | Docs, pitch script, Q&A | COMPLETE (initial) | `docs/DEMO_SCRIPT.md`, `docs/PITCH_QA.md`, `docs/MODEL_CARD.md` present. README pending. |

---

## Acceptance Run Outputs

### Phase 0 Verification Output
```json
// GET http://localhost:8000/health
{
  "status": "ok",
  "model_loaded": false,
  "calibrated": false,
  "mock_ml": false,
  "version": "0.1.0"
}

// GET http://localhost:8080/api/health
{
  "status": "ok",
  "gateway": "ok",
  "ml": {
    "status": "ok",
    "model_loaded": false,
    "calibrated": false,
    "mock_ml": false,
    "version": "0.1.0"
  }
}

// GET http://localhost:5173
StatusCode: 200 OK
```

### Phase 1 Verification Output
```
============================= test session starts =============================
platform win32 -- Python 3.13.13, pytest-9.0.3, pluggy-1.6.0
rootdir: D:\re\shavred\Projects\Projects\voice\services\ml
configfile: pytest.ini
collected 8 items

services\ml\tests\test_features.py::test_log_mel_shapes_and_nans PASSED  [ 12%]
services\ml\tests\test_features.py::test_log_mel_display_shape PASSED    [ 25%]
services\ml\tests\test_features.py::test_matrix_packing_roundtrip PASSED [ 37%]
services\ml\tests\test_risk_engine.py::test_cloned_reaches_decision PASSED [ 50%]
services\ml\tests\test_risk_engine.py::test_authentic_never_cloned PASSED [ 62%]
services\ml\tests\test_risk_engine.py::test_alternating_no_commit PASSED [ 75%]
services\ml\tests\test_risk_engine.py::test_hysteresis PASSED            [ 87%]
services\ml\tests\test_risk_engine.py::test_reset PASSED                 [100%]

======================== 8 passed in 120.09s (0:02:00) ========================
```

```
Connecting to WebSocket: ws://localhost:8080/ws/live ...
No --wav provided; generating 3.0 s synthetic test tone...
Server ready: {'type': 'ready', 'model': 'echo-slice-dummy', 'calibrated': False, 'window_s': 1, 'hop_s': 0.5}
[SEQ 000] t=0.5s | p_spoof=None | state=ANALYZING  | risk=  0.0% | latency=  1.1ms
[SEQ 001] t=1.0s | p_spoof=0.5000 | state=ANALYZING  | risk= 50.0% | latency=  5.5ms
[SEQ 002] t=1.5s | p_spoof=0.5000 | state=AUTHENTIC  | risk= 50.0% | latency=  5.4ms
[SEQ 003] t=2.0s | p_spoof=0.5000 | state=AUTHENTIC  | risk= 50.0% | latency=  4.5ms
[SEQ 004] t=2.5s | p_spoof=0.5000 | state=AUTHENTIC  | risk= 50.0% | latency=  5.0ms
[SEQ 005] t=3.0s | p_spoof=0.5000 | state=AUTHENTIC  | risk= 50.0% | latency=  6.8ms

--- Smoke Test Summary ---
Total frames sent: 6, received: 6
Final State: AUTHENTIC (Decision Time: None)
SUCCESS: End-to-end smoke test passed!
```

### Phase 5/6 Verification Output
```
============================= test session starts =============================
platform win32 -- Python 3.13.13, pytest-9.0.3, pluggy-1.6.0
collected 15 items

test_features.py::test_log_mel_shapes_and_nans PASSED         [  6%]
test_features.py::test_log_mel_display_shape PASSED           [ 13%]
test_features.py::test_matrix_packing_roundtrip PASSED        [ 20%]
test_gradcam_fallback.py::test_gradcam_returns_packed_matrix PASSED [ 26%]
test_gradcam_fallback.py::test_gradcam_heatmap_range PASSED   [ 33%]
test_gradcam_fallback.py::test_gradcam_latency_reasonable PASSED [ 40%]
test_gradcam_fallback.py::test_fallback_features_shape PASSED [ 46%]
test_gradcam_fallback.py::test_fallback_unfitted_returns_05 PASSED [ 53%]
test_gradcam_fallback.py::test_fallback_fitted_returns_valid_prob SKIPPED [60%]
test_gradcam_fallback.py::test_fallback_save_load SKIPPED     [ 66%]
test_risk_engine.py::test_cloned_reaches_decision PASSED      [ 73%]
test_risk_engine.py::test_authentic_never_cloned PASSED       [ 80%]
test_risk_engine.py::test_alternating_no_commit PASSED        [ 86%]
test_risk_engine.py::test_hysteresis PASSED                   [ 93%]
test_risk_engine.py::test_reset PASSED                        [100%]

======================== 13 passed, 2 skipped in 3.55s ========================
(2 skipped: sklearn DLLs blocked by AppControl policy on dev machine)
```

```
Frontend build:
> web@0.0.0 build
> tsc -b && vite build
vite v8.3.2 building...
dist/index.html          0.45 kB (gzip: 0.29 kB)
dist/assets/index.js   258.00 kB (gzip: 80.69 kB)
built in 331ms -- EXIT 0
```

### Latency Benchmark (no-model / echo mode)
```
=== VoiceSentry Latency Benchmark ===
Mode: no-model (echo)
Rounds: 50

Stage              p50       p90       p99       max
----------------------------------------------------
features          1.0ms      1.1ms      1.4ms      1.5ms
model             0.0ms      0.0ms      0.0ms      0.0ms
gradcam           0.0ms      0.0ms      0.0ms      0.0ms
biomarkers        4.2ms      4.9ms      5.2ms      5.3ms
total             5.3ms      6.0ms      6.3ms      6.3ms

ML time per window (p90): 6.0ms -- PASS (target <=300ms)
```
*Full model latency (with SpoofCNN + Grad-CAM) measured after Phase 4 training.*

---

## Blockers / Known Issues

| Issue | Severity | Resolution |
|---|---|---|
| sklearn DLLs blocked by Windows AppControl policy | Medium | Train using Docker (`make up`) or fix AppControl. 2 tests correctly SKIPPED. |
| ffmpeg not in system PATH | Low | Codec augmentation works only for `noise_20db` without Docker. Run `augment_codecs.py` inside Docker for full codec suite. |
| ASVspoof2019 LA dataset not provided | High | Blocked on human providing data path (CHECKPOINT 2). |
