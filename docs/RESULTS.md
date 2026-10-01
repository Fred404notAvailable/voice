# VoiceSentry Results & Evaluation Metrics

*This file will be updated automatically during Phase 3, 4, 5, and 7.*

## Target vs Actual Latency Floor

| Metric | Target | Hard Floor | Actual Measured |
|---|---|---|---|
| ML time per 1 s window (CPU, features + model + Grad-CAM) | <= 150 ms | <= 300 ms | Pending Phase 5 |
| End-to-end latency (chunk captured -> UI updated) | <= 400 ms | <= 800 ms | Pending Phase 1/5 |
| Time-to-verdict on an obvious clone | <= 2.5 s | <= 4 s | Pending Phase 5 |
| UI frame rate during live streaming | 30+ fps | 20 fps | Pending Phase 6 |

## Detection Performance (EER & Accuracy)

*Pending model training and evaluation in Phase 3 & 4.*
