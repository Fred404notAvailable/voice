# VoiceSentry Build Progress Log

| Phase | Description | Status | Verification Command & Real Output |
|---|---|---|---|
| Phase 0 | Bootstrap repo layout, packages, configs | COMPLETE | `npm --prefix apps/web run build` -> exit 0; `curl http://localhost:8080/api/health` -> 200 OK; `curl http://localhost:8000/health` -> 200 OK |
| Phase 1 | Echo vertical slice (Mic -> Gateway -> ML -> UI) | COMPLETE | `python -m pytest services/ml/tests -v` -> 8 passed; `python scripts/e2e_smoke.py` -> 6/6 frames processed, strictly increasing seq, avg latency ~5ms |
| Phase 2 | Data, manifest, own eval set | PENDING | Awaiting CHECKPOINT 1 confirmation |
| Phase 3 | Baseline model + handcrafted features | PENDING | Pending |
| Phase 4 | CNN training & temperature scaling calibration | PENDING | Pending |
| Phase 5 | Streaming engine in ML service (SPRT + Grad-CAM) | PENDING | Pending |
| Phase 6 | Frontend visuals (Spectrogram, Gauge, Biomarkers) | PENDING | Pending |
| Phase 7 | Robustness & telephony hardening | PENDING | Pending |
| Phase 8 | Demo hardening & containerization | PENDING | Pending |
| Phase 9 | Docs, pitch script, Q&A | PENDING | Pending |

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
