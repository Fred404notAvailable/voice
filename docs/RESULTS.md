# VoiceSentry Results & Evaluation Metrics

## Model Evaluation

| Split | Condition | N | Accuracy | EER |
|---|---|---|---|---|
| dev | clean | 1500 | 88.5% | 11.60% |
| eval | clean | 3000 | 77.5% | 23.13% |

## Latency Targets vs Actual

| Metric | Target | Hard Floor | Actual Measured |
|---|---|---|---|
| ML time per 1s window (CPU) | ≤150ms | ≤300ms | _Pending bench_latency.py_ |
| End-to-end latency | ≤400ms | ≤800ms | _Pending bench_latency.py_ |
| Time-to-verdict (obvious clone) | ≤2.5s | ≤4s | _Pending manual test_ |
