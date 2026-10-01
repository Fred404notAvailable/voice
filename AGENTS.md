# VOICESENTRY: AGENT BUILD SPECIFICATION

> **Audience:** an autonomous coding agent (Google Antigravity) that will build this project end to end.
> **Owner:** a hackathon team with 24-48 hours. Time is the scarcest resource.
> **How to use this file:** put it at the repo root as `AGENTS.md` (and, if your Antigravity version supports workspace rules, copy it to `.agent/rules/voicesentry.md`). Then paste the **Kickoff Prompt** from Section 16 into the Agent Manager.

---

## 0. READ THIS FIRST (rules of engagement for the agent)

1. **This file is the single source of truth.** If something here conflicts with your assumptions, this file wins. If something is ambiguous or impossible, write the question into `docs/QUESTIONS.md`, make the most conservative choice, and continue.
2. **Work in phases (Section 7).** Finish a phase, run its acceptance checks, update `docs/PROGRESS.md`, commit, then continue. Never start a later phase while an earlier phase's acceptance checks fail, except where this file explicitly says a phase may run in parallel.
3. **Never claim something works without proof.** "Done" means you ran the stated verification command and the output matched the acceptance criterion. Paste the real command output into `docs/PROGRESS.md`.
4. **Vertical slice first.** The first goal is an ugly end-to-end pipeline (mic -> browser -> Node gateway -> Python -> result -> UI). Polish comes after the slice works.
5. **Graceful degradation is a requirement, not a bonus.** Every ML component has a defined fallback (Section 8.9). A demo that works at 90% is worth more than one that crashes at 97%.
6. **Ask the human only at the checkpoints marked `CHECKPOINT`** (Section 7), or when you need a dataset path, a credential, or a license decision. Otherwise act.
7. **Do not invent facts about libraries, checkpoints, or datasets.** If you need a pretrained checkpoint or an API detail, look it up (docs or package metadata), verify it loads, and record the exact name, version, and license in `docs/MODEL_CARD.md`. If you cannot verify it, do not use it.
8. **Do not download huge files without asking.** Datasets over ~2 GB require the human's approval at a checkpoint.
9. **Commit early and often**, small commits with the message format `phase<N>: <what>` (example: `phase3: add SPRT risk engine + tests`).

### 0.1 Hard anti-goals (do NOT build these)

- No speech recognition or transcription of any kind.
- No scraping of YouTube, social media, or any bulk voice collection.
- No telecom-layer hooks (SIP, carrier APIs, call interception).
- No cloning of anyone's voice without their explicit consent. Demo clones are generated only from consenting volunteers (team members or a judge who agreed).
- No storing of raw audio beyond the session unless the user explicitly clicks "Save session". Default is memory only.
- Do not build generative or "attack" tooling beyond what is needed to create a small, consented test set with off-the-shelf open-source TTS.

---

## 1. MISSION AND SCORING MAP

**One-line mission:** a live forensic co-pilot that listens to a voice stream, decides early whether it is a human or an AI clone, and shows visual evidence for the verdict.

**Judging rubric (design every task against this):**

| Criterion | Weight | What wins it in this project |
|---|---|---|
| Detection accuracy on test audio | 40% | Calibrated model, evaluated on held-out generators and on phone-codec audio, with a published metrics table |
| Forensic explainability and spectrogram insights | 30% | Grad-CAM heatmap on the live spectrogram plus a biomarker panel with human-baseline bands |
| Real-time latency and UX | 30% | Sliding 1 s windows, 0.5 s hop, visible latency meter, 3-tier gauge, "decided at X.Xs" readout |

**Quantified targets (the agent must measure and report these in `docs/RESULTS.md`):**

| Metric | Target | Hard floor |
|---|---|---|
| ML time per 1 s window (CPU, features + model + Grad-CAM) | <= 150 ms | <= 300 ms |
| End-to-end latency (chunk captured -> UI updated) | <= 400 ms | <= 800 ms |
| Time-to-verdict on an obvious clone | <= 2.5 s | <= 4 s |
| Accuracy / EER on in-distribution test split | EER <= 5% | EER <= 10% |
| Accuracy on phone-codec-degraded test split | within 10 points of clean | within 20 points |
| UI frame rate during live streaming | 30+ fps | 20 fps |

If a target cannot be met, report the real number honestly. Honest numbers with a clear explanation beat inflated numbers.

---

## 2. CORE CONCEPT (what makes this different)

Most teams will build "upload a file -> one CNN -> a percent". VoiceSentry differs in three ways, all of which must be visible in the demo:

1. **Sequential decision, not one-shot classification.** Per-window evidence is accumulated by a Sequential Probability Ratio Test (SPRT-style) risk engine. The UI shows the running score, the tier, and a forecast ("verdict expected in ~0.8 s"). The verdict has a recorded **decision time**.
2. **Evidence, not just a score.** Grad-CAM on the spectrogram highlights the time-frequency regions that drove the decision. A biomarker panel shows pitch perturbation, spectral roll-off, high-band energy, flatness, and phase coherence against a **human baseline band** computed from real speech.
3. **Telephony robustness.** The model is trained and evaluated on codec-degraded audio (G.711, Opus, low-bitrate), and the results table shows clean vs. phone-quality performance.

---

## 3. IMPORTANT TECHNICAL DECISIONS (already made; do not relitigate)

| Decision | Choice | Reason |
|---|---|---|
| Model input sample rate | **16 kHz mono** | Standard for anti-spoofing datasets and keeps the payload small |
| Window / hop | **1.0 s window, 0.5 s hop** | Balance of context and latency |
| Primary explainable model | **Small custom CNN on log-mel spectrograms** (trained by us) | Fully controllable, fast on CPU, Grad-CAM works reliably |
| Baseline model | **Gradient-boosted / logistic model on handcrafted features** (MFCC stats, roll-off, etc.) | Guaranteed fallback and a sanity benchmark |
| Optional upgrade | **Pretrained anti-spoofing backbone** (AASIST / RawNet2 / wav2vec2-based) | Only if verified to load and to beat the small CNN on our held-out set; see 8.4 |
| Inference runtime | **PyTorch on CPU** for the small CNN (ONNX Runtime only for a heavy pretrained backbone) | The small CNN is already fast; ONNX adds risk with Grad-CAM |
| Calibration | **Temperature scaling** on the dev split | Keeps probabilities honest so SPRT thresholds mean something |
| Streaming decision | **Leaky SPRT accumulator** with hysteresis | Cuts flicker; gives decision time and ETA |
| Transport | Browser <-> Gateway: **WebSocket**; Gateway <-> ML: **WebSocket** | One persistent session, low overhead |

### 3.1 The 8 kHz ceiling (read carefully)

At 16 kHz sampling the Nyquist limit is **8 kHz**. That means a synthetic-speech "frequency cutoff at ~8 kHz or above" **cannot be observed** in the 16 kHz stream. Therefore:

- The cutoff / roll-off analysis operates **inside 0-8 kHz** (for example the 4-8 kHz band energy ratio and the 95% roll-off point).
- Do **not** claim in the UI or the pitch that the system sees cutoffs above 8 kHz.
- Stretch option (only if time permits): capture at 32 kHz in a second parallel path for a "wideband cutoff" biomarker. Default is off.

---

## 4. ARCHITECTURE

```
┌──────────────────────────── Browser (Vite + React + TypeScript) ────────────────────────────┐
│ getUserMedia (mic) | getDisplayMedia (tab audio) | file upload                               │
│   -> AudioContext({sampleRate:16000}) -> AudioWorklet -> Int16 PCM, 8000 samples (0.5 s)     │
│   -> WebSocket binary frames: [uint32 seq][int16 PCM...]                                     │
│ UI: LiveSpectrogram canvas + Heatmap overlay + RiskGauge + LatencyMeter + Biomarkers +       │
│     Timeline + Verdict banner + (stretch) Attribution badge + Demo controls                  │
└───────────────────────────────────────┬──────────────────────────────────────────────────────┘
                                        │ ws://gateway:8080/ws/live      (and HTTP /api/*)
┌───────────────────────────────────────▼──────────────────────────────────────────────────────┐
│ Node.js Gateway (Fastify + TypeScript)                                                       │
│  - Session mgmt, per-session upstream socket to ML, backpressure, heartbeat, CORS            │
│  - /api/analyze (multipart file upload) -> forwards to ML /analyze_file                      │
│  - /api/health, /api/session/:id/export (JSON timeline)                                      │
│  - Adds gateway timestamps for latency accounting                                            │
└───────────────────────────────────────┬──────────────────────────────────────────────────────┘
                                        │ ws://ml:8000/ws/session   (and HTTP /analyze_file)
┌───────────────────────────────────────▼──────────────────────────────────────────────────────┐
│ Python ML Service (FastAPI, PyTorch, librosa)                                                │
│  SessionEngine: ring buffer -> log-mel -> CNN -> temperature scaling -> LLR -> SPRT engine   │
│                 -> Grad-CAM (when not clearly authentic) -> biomarkers -> JSON result        │
│  Artifacts: model.pt, calibration.json, baselines.json, metrics.json                         │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Latency budget per 0.5 s hop

| Stage | Budget |
|---|---|
| Browser capture + framing | ~10 ms (worklet) |
| Browser -> gateway -> ML (localhost / LAN) | ~10-30 ms |
| log-mel + CNN + calibration | ~20-60 ms |
| Grad-CAM | ~15-40 ms |
| Biomarkers | ~30-80 ms (use `yin`, not `pyin`; see 8.6) |
| Serialization + return + render | ~20-40 ms |
| **Total** | **<= ~250 ms typical** |

Every result carries `timings_ms`; the UI latency meter plots them live. Measure, do not guess.

---

## 5. REPOSITORY LAYOUT (create exactly this)

```
voicesentry/
├── AGENTS.md                        # this file
├── README.md                        # quickstart for humans (written in Phase 9)
├── docker-compose.yml
├── .env.example
├── Makefile                         # dev, test, eval, demo targets
├── docs/
│   ├── PROGRESS.md                  # agent logs each phase here with real command output
│   ├── QUESTIONS.md                 # open questions for the human
│   ├── MODEL_CARD.md                # model, data, license, limits
│   ├── RESULTS.md                   # metrics tables, latency measurements
│   ├── DEMO_SCRIPT.md               # 3-minute pitch + live demo steps
│   └── PITCH_QA.md                  # anticipated judge questions
├── apps/
│   └── web/                         # Vite + React + TS
│       ├── index.html
│       ├── package.json
│       ├── vite.config.ts
│       ├── tsconfig.json
│       ├── public/pcm-worklet.js
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── types/protocol.ts            # shared message types (Section 6)
│           ├── lib/
│           │   ├── audioCapture.ts          # mic + tab capture + worklet wiring
│           │   ├── wsClient.ts              # reconnecting WebSocket client
│           │   ├── colormap.ts              # viridis / inferno LUT
│           │   └── latency.ts               # RTT accounting by seq
│           ├── state/useSession.ts          # zustand store (or useReducer)
│           └── components/
│               ├── LiveSpectrogram.tsx      # canvas, scrolling
│               ├── HeatmapOverlay.tsx       # Grad-CAM overlay
│               ├── RiskGauge.tsx
│               ├── LatencyMeter.tsx
│               ├── BiomarkerPanel.tsx
│               ├── Timeline.tsx             # risk over time + decision marker
│               ├── VerdictBanner.tsx
│               ├── UploadDropzone.tsx
│               ├── AttributionBadge.tsx     # stretch
│               └── DemoControls.tsx         # fallback playback, A/B clip buttons
├── services/
│   ├── gateway/                     # Node + TS
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── server.ts
│   │       ├── routes/live.ts
│   │       ├── routes/analyze.ts
│   │       ├── protocol.ts          # same types as web (copy or shared package)
│   │       └── config.ts
│   └── ml/                          # Python
│       ├── pyproject.toml or requirements.txt
│       ├── Dockerfile
│       ├── app/
│       │   ├── main.py              # FastAPI app, lifespan model loading
│       │   ├── config.py
│       │   ├── schemas.py           # Pydantic models mirroring Section 6
│       │   ├── features.py          # log-mel, biomarkers
│       │   ├── model.py             # SpoofCNN + loader
│       │   ├── calibration.py
│       │   ├── risk_engine.py       # SPRT engine
│       │   ├── gradcam.py
│       │   ├── session_engine.py    # ring buffer + pipeline
│       │   ├── file_analysis.py     # decode + replay as windows
│       │   └── fallback.py          # handcrafted-feature model path
│       ├── training/
│       │   ├── build_manifest.py
│       │   ├── augment_codecs.py
│       │   ├── dataset.py
│       │   ├── train_cnn.py
│       │   ├── train_baseline.py
│       │   ├── calibrate.py
│       │   ├── compute_baselines.py
│       │   └── evaluate.py
│       ├── artifacts/               # model.pt, calibration.json, baselines.json, metrics.json
│       └── tests/
├── data/                            # gitignored
│   ├── raw/                         # ASVspoof etc. (human provides path)
│   ├── own_eval/                    # consented recordings + clones
│   └── processed/                   # manifests, codec copies
└── scripts/
    ├── e2e_smoke.py                 # streams a wav through the gateway, asserts results
    ├── bench_latency.py
    └── make_demo_clips.py
```

---

## 6. CONTRACTS (implement exactly; both sides must match)

### 6.1 Audio format

- 16 kHz, mono, signed 16-bit little-endian PCM.
- Browser sends frames of **8000 samples (0.5 s)**.
- Binary frame layout: `bytes[0:4]` = `uint32 LE sequence number` (starting at 0), `bytes[4:]` = PCM samples.
- ML service keeps a ring buffer of the latest 16000 samples. After the first 16000 samples have arrived, it analyzes on every new frame (so hop = 0.5 s, window = 1 s).
- Before 16000 samples exist, ML returns `state: "ANALYZING"` with `p_spoof: null`.

### 6.2 Control messages (JSON text frames)

Client -> server:

```json
{ "type": "start", "session_id": "uuid", "sample_rate": 16000, "mode": "live" }
{ "type": "stop" }
{ "type": "reset" }
```

Server -> client (besides `window_result`):

```json
{ "type": "ready", "model": "spoofcnn-v1", "calibrated": true, "window_s": 1.0, "hop_s": 0.5 }
{ "type": "error", "code": "BAD_FRAME" , "message": "..." }
{ "type": "final", "session_id": "...", "verdict": "CLONED", "decision_time_s": 1.5, "summary": { } }
```

### 6.3 `window_result` (one per hop)

```ts
// apps/web/src/types/protocol.ts   (mirror in services/gateway/src/protocol.ts and ml/app/schemas.py)
export type RiskState = "ANALYZING" | "AUTHENTIC" | "SUSPICIOUS" | "CLONED";

export interface Biomarker {
  key: "pitch_perturbation" | "rolloff_95_hz" | "hf_ratio_4_8k" | "spectral_flatness" | "phase_coherence";
  label: string;
  value: number;
  unit: string;
  baseline_low: number;      // human 10th percentile
  baseline_high: number;     // human 90th percentile
  flagged: boolean;          // value outside baseline band in the "synthetic" direction
}

export interface PackedMatrix {
  shape: [number, number];   // [rows(mel bins), cols(frames)]
  encoding: "u8_b64";        // values scaled 0..255, base64 of row-major bytes
  data: string;
}

export interface WindowResult {
  type: "window_result";
  session_id: string;
  seq: number;
  t_start_s: number;
  t_end_s: number;
  p_spoof: number | null;          // calibrated probability, null while ANALYZING
  llr: number | null;              // per-window log-likelihood ratio
  score: number | null;            // accumulated SPRT statistic S_t
  risk_pct: number;                // 0..100 for the gauge (sigmoid-mapped S_t)
  state: RiskState;
  committed: boolean;              // true once a threshold was crossed (verdict locked in)
  decision_time_s: number | null;  // time since stream start when first committed
  eta_to_decision_s: number | null;// forecast; null if no upward trend
  biomarkers: Biomarker[];
  spec_new: PackedMatrix;          // new 0.5 s of log-mel for the scrolling display (64 x ~50)
  heatmap: PackedMatrix | null;    // Grad-CAM over the full 1 s window (64 x 101), null if skipped
  attribution?: { family: string; probs: Record<string, number> } | null; // stretch
  timings_ms: { features: number; model: number; gradcam: number; biomarkers: number; total: number };
  client_seq_echo: number;         // == seq; lets the client compute RTT
}
```

Rules:
- Packing: normalize to 0..1, multiply by 255, round, `uint8`, base64 (standard alphabet). The browser decodes with `atob` into a `Uint8Array`.
- `heatmap` may be `null` when state is clearly AUTHENTIC (to save CPU). The UI keeps showing the previous heatmap faded.

### 6.4 File analysis (HTTP)

`POST /api/analyze` (gateway) -> `POST /analyze_file` (ML), multipart field `file`. ML decodes with ffmpeg/soundfile, resamples to 16 kHz mono, then **replays the audio as 0.5 s hops through the same SessionEngine** and returns:

```json
{
  "duration_s": 12.4,
  "verdict": "CLONED",
  "decision_time_s": 1.5,
  "final_risk_pct": 94.2,
  "windows": [ /* array of WindowResult, same schema as live */ ]
}
```

The UI then **animates the timeline at real-time speed** (or 2x) so upload mode feels like live mode.

### 6.5 Health

- `GET /health` on ML: `{ "status": "ok", "model_loaded": true, "calibrated": true, "version": "..." }`
- `GET /api/health` on gateway: aggregates ML health.

---

## 7. PHASES (the execution plan)

Time estimates assume the 48 h plan. For a **24 h plan**, skip items marked `[STRETCH]` and compress phases 6-8.

### PHASE 0: Bootstrap (0-1.5 h)

**Tasks**
1. Create the repo layout from Section 5 (empty files with TODO headers are fine).
2. Initialize `apps/web` with Vite (`react-ts` template), `services/gateway` with TypeScript and `tsx`, and `services/ml` with a Python venv.
3. Add `.gitignore` (data/, artifacts/*.pt, node_modules, venv, `__pycache__`, `.env`).
4. Write `docker-compose.yml` with services `web`, `gateway`, `ml` (ports 5173, 8080, 8000), and a `Makefile` with `dev`, `test`, `eval`, `up`.
5. Create `docs/PROGRESS.md` with a table of phases and status.

**Acceptance checks**
- `cd apps/web && npm run dev` serves a page.
- `cd services/gateway && npm run dev` serves `GET /api/health`.
- `cd services/ml && uvicorn app.main:app --port 8000` serves `GET /health`.

### PHASE 1: Echo vertical slice (1.5-4 h) **[CRITICAL PATH]**

Goal: prove the entire pipe works with fake ML.

**Tasks**
1. Web: implement `audioCapture.ts` and `public/pcm-worklet.js` (see 9.1) and `wsClient.ts`. A "Start mic" button streams frames.
2. Gateway: `/ws/live` accepts a client socket, opens an upstream socket to ML `/ws/session`, pipes both ways (see 10.2).
3. ML: `/ws/session` accepts frames, parses `[seq][pcm]`, and returns a **dummy** `window_result` with `p_spoof = 0.5`, a real `spec_new` computed from audio, and `timings_ms`.
4. Web: render the incoming `spec_new` in `LiveSpectrogram` and show seq numbers and RTT.

**Acceptance checks**
- Speaking into the mic shows a scrolling spectrogram in the browser.
- RTT (browser send -> result) is displayed and is < 300 ms on localhost.
- `scripts/e2e_smoke.py` streams a sample wav through the gateway and asserts that N expected results come back with strictly increasing `seq`.

`CHECKPOINT 1`: post a short status in `docs/PROGRESS.md` and, if you are an interactive agent, ask the human to confirm the slice works on their machine (mic permission, browser, OS).

### PHASE 2: Data, manifest, own eval set (4-9 h; can run parallel with Phase 1 UI work)

**Tasks**
1. **Ask the human** for the path to ASVspoof 2019 LA (or a subset) and approval to use it. Expected folders (verify on disk; do not assume): `ASVspoof2019_LA_train/flac`, `ASVspoof2019_LA_dev/flac`, `ASVspoof2019_LA_eval/flac`, and `ASVspoof2019_LA_cm_protocols/`.
2. `training/build_manifest.py`: parse the CM protocol files. Each line has 5 fields: `speaker utterance_id - system_id key` (key is `bonafide` or `spoof`; system_id is the attack, e.g. `A01`). Output `data/processed/manifest.csv` with columns:
   `path,label,attack_id,split,condition,duration_s` where `label` is 0 for bonafide and 1 for spoof, `condition` starts as `clean`.
3. **Subsample** for hackathon speed: default cap of **6,000 training utterances, 1,500 dev, 3,000 eval**, balanced as far as possible (ASVspoof is heavily spoof-skewed; keep roughly 1:1 bonafide:spoof in train via subsampling and also keep a stratified eval). Make caps CLI flags.
4. Document the **held-out generator protocol**: ASVspoof 2019 LA train/dev contain attacks A01-A06; the eval set contains additional unseen attacks (A07-A19). Evaluate on eval attacks separately and label them "unseen generators" in the results table. (Verify the attack split from the protocol files themselves and record what you find.)
5. **Own eval set** (`data/own_eval/`), made only with consenting voices:
   - 20+ real clips (5-15 s) recorded by teammates on laptop mics and phones.
   - 20+ cloned clips generated with open-source zero-shot TTS/voice cloning from consenting speakers. Pick tools installable via pip with a license compatible with a hackathon; record tool name, version, license in `MODEL_CARD.md`.
   - Add `own_eval_manifest.csv` with a `generator` column.
6. `training/augment_codecs.py` (see 8.5): produce codec-degraded copies for train/dev/eval subsets and add rows with `condition` set to `g711_mulaw`, `g711_alaw`, `opus_16k`, `opus_8k`, `mp3_32k`, `noise_20db`, and (only if ffmpeg supports it) `amrnb`.

**Acceptance checks**
- `python -m training.build_manifest --root <path> --out data/processed/manifest.csv` prints counts per split/label/attack.
- `ffmpeg -codecs` was checked and `docs/PROGRESS.md` lists which codecs are actually available.
- At least 4 codec conditions exist on disk for the dev and eval subsets.

### PHASE 3: Baseline model + features (9-13 h)

**Tasks**
1. Implement `features.py` (8.1, 8.6).
2. `training/train_baseline.py`: extract MFCC (20) mean/std, delta mean/std, roll-off, flatness, ZCR, band energies per utterance; train logistic regression and a small gradient-boosted model (scikit-learn `HistGradientBoostingClassifier` is enough). Save the best as `artifacts/baseline.joblib`.
3. `training/evaluate.py` (8.8) computes EER, accuracy at EER threshold, F1, confusion matrix per `condition` and per `attack_id`.

**Acceptance checks**
- `make eval MODEL=baseline` writes `artifacts/metrics_baseline.json` and a markdown table.
- Baseline EER on dev is reported (any number; this is the benchmark to beat).

### PHASE 4: CNN training + calibration (13-20 h) **[CRITICAL PATH for the 40% accuracy score]**

**Tasks**
1. `training/dataset.py`: yields random 1 s crops (pad short clips by wrapping), converts to log-mel (64 x 101), per-sample mean/variance normalization, optional SpecAugment-style time/frequency masking (train only), balanced sampling by label **and** condition.
2. `app/model.py`: `SpoofCNN` (8.3).
3. `training/train_cnn.py`: AdamW, lr 1e-3 with cosine decay, 8-15 epochs (use early stopping on dev EER), batch 64, weighted loss or balanced sampler, seed everything, save `artifacts/model.pt` and `artifacts/train_log.json`. Use GPU if present, otherwise CPU with a smaller subset; print epoch time estimates in the first minute so the human can intervene.
4. `training/calibrate.py`: temperature scaling on dev logits (8.4), save `artifacts/calibration.json` with `{"temperature": T, "prior_spoof": p}`.
5. `training/compute_baselines.py`: compute each biomarker on **bonafide** training windows; store the 10th and 90th percentile (and median) in `artifacts/baselines.json`.
6. Re-run `evaluate.py` on dev, eval (unseen attacks), and the own eval set for both clean and codec conditions.

**Acceptance checks**
- `artifacts/model.pt`, `calibration.json`, `baselines.json` exist.
- `docs/RESULTS.md` contains: EER and accuracy for CNN vs baseline, clean vs each codec condition, seen vs unseen attacks, and a reliability (calibration) number such as ECE before and after temperature scaling.
- If CNN dev EER > 15%: apply the fallback rules in 8.9 before moving on.

`CHECKPOINT 2`: report the metrics table to the human. Ask whether to spend time on the optional pretrained backbone (8.4) or proceed to streaming. **Default if no answer: proceed to streaming.**

### PHASE 5: Streaming engine in the ML service (20-26 h) **[CRITICAL PATH]**

**Tasks**
1. `risk_engine.py`: leaky SPRT (8.2) with unit tests.
2. `session_engine.py`: ring buffer, hop scheduling, pipeline: log-mel -> CNN -> temperature scaling -> LLR -> engine -> (conditional) Grad-CAM -> biomarkers -> pack -> result.
3. Grad-CAM (8.7). Run it when `risk_pct > 25` or every 4th window otherwise.
4. Biomarkers (8.6). Run every window, but if total time exceeds the budget, run every 2nd window and reuse the last values (flag `stale: true` internally).
5. Replace the dummy result from Phase 1 with the real pipeline. Keep the dummy path behind `MOCK_ML=1` for UI development.
6. `file_analysis.py`: decode, resample, replay hops, return the full timeline (6.4).

**Acceptance checks**
- Unit tests pass: `pytest services/ml/tests -q`.
- `python scripts/e2e_smoke.py --wav <real.wav>` ends in AUTHENTIC; `--wav <clone.wav>` ends in CLONED, each with a printed decision time.
- `python scripts/bench_latency.py` prints p50/p95 of `timings_ms.total` over 200 windows and the numbers meet Section 1 hard floors.

### PHASE 6: Frontend, the visuals that win (26-34 h) **[CRITICAL PATH for the 30%+30%]**

Implement the components in Section 9. Order of priority:
1. `LiveSpectrogram` + `HeatmapOverlay` (the explainability centerpiece).
2. `RiskGauge` + `VerdictBanner` (the "decided at X.Xs" moment).
3. `LatencyMeter` and `Timeline`.
4. `BiomarkerPanel` with baseline bands.
5. `UploadDropzone` (upload -> animated replay).
6. `DemoControls` (A/B clip buttons and fallback mode).
7. `[STRETCH]` `AttributionBadge`.

**Acceptance checks**
- Manual script in `docs/DEMO_SCRIPT.md` section "UI checklist" passes: start, speak, verdict transitions through tiers, heatmap appears, reset works, upload works, reconnect after killing the ML service works.
- 30+ fps on a mid-range laptop while streaming (use `performance.now()` frame timing overlay behind `?debug=1`).

`CHECKPOINT 3`: screen-record or screenshot the UI; the human reviews it.

### PHASE 7: Robustness and honesty (34-40 h)

**Tasks**
1. Retrain (or fine-tune) the CNN on a mix of clean and codec-augmented data if Phase 4's codec results are weak. Re-calibrate.
2. Produce the final **results tables** and a **confusion matrix image** (`docs/img/confusion_*.png`) using matplotlib.
3. Write `docs/MODEL_CARD.md`: data used, licenses, intended use, known failure modes (unseen generators, noisy rooms, very short clips, whispered speech, singing, non-English), and the 8 kHz ceiling note.
4. `[STRETCH]` attribution head (8.10).
5. `[STRETCH]` tab-audio capture polish (9.2) and a tested path for Google Meet / Zoom in Chrome.

**Acceptance checks**
- `docs/RESULTS.md` has the clean-vs-codec table and the seen-vs-unseen-attack table.
- All numbers in docs are reproducible by `make eval`.

### PHASE 8: Demo hardening (40-46 h)

**Tasks**
1. **Fallback mode** in `DemoControls`: pre-recorded `real.wav` and `clone.wav` buttons that stream through the **real pipeline** (not a fake animation). Also an "offline replay" mode that plays a saved `session.json` timeline in case the ML service fails on stage.
2. Error handling: ML down -> UI shows a clear banner and auto-reconnects with backoff; mic denied -> instructions; unsupported browser -> message.
3. Performance pass: avoid React re-renders per frame (use refs and canvas drawing outside React state), cap the Timeline to the last 120 s.
4. Accessibility basics: color-blind-safe gauge (icons + labels, not color only), keyboard shortcuts (`Space` start/stop, `R` reset).
5. Pre-warm: ML loads the model and runs one dummy window at startup so the first live window is not slow.
6. Docker: `docker compose up --build` brings up everything. Verify from a clean clone.

**Acceptance checks**
- Kill the ML container during a session: UI recovers within 10 s of restart.
- Fresh-clone test: `git clone && cp .env.example .env && docker compose up --build` works, then `scripts/e2e_smoke.py` passes.

### PHASE 9: Docs and pitch support (46-48 h)

Write `README.md` (quickstart, architecture image, how to reproduce eval), `docs/DEMO_SCRIPT.md` (Section 13), and `docs/PITCH_QA.md` (Section 14). Generate an architecture diagram (Mermaid in the README is enough).

---

## 8. ML SERVICE DETAILS

### 8.1 Feature extraction (`features.py`)

```python
import numpy as np, librosa

SR = 16000
WIN = 16000          # 1 s
HOP = 8000           # 0.5 s
N_FFT = 512
HOP_LEN = 160        # 10 ms -> 101 frames for 1 s with center=True
N_MELS = 64

def log_mel(y: np.ndarray) -> np.ndarray:
    """y: float32 mono 16 kHz, len 16000 -> (64, 101) float32, per-sample normalized."""
    S = librosa.feature.melspectrogram(
        y=y, sr=SR, n_fft=N_FFT, hop_length=HOP_LEN, n_mels=N_MELS, fmin=20, fmax=8000, power=2.0
    )
    S = librosa.power_to_db(S, ref=1.0, top_db=80.0).astype(np.float32)
    return (S - S.mean()) / (S.std() + 1e-6)

def log_mel_display(y_half: np.ndarray) -> np.ndarray:
    """For the scrolling display: the newest 0.5 s (8000 samples) -> (64, ~50), scaled 0..1 using fixed dB limits."""
    S = librosa.feature.melspectrogram(y=y_half, sr=SR, n_fft=N_FFT, hop_length=HOP_LEN,
                                       n_mels=N_MELS, fmin=20, fmax=8000)
    db = librosa.power_to_db(S, ref=1.0, top_db=80.0)
    return np.clip((db + 80.0) / 80.0, 0.0, 1.0).astype(np.float32)
```

Rules: use **fixed** dB limits for display so the picture does not flicker; use per-sample normalization only for the model input.

### 8.2 Streaming risk engine (`risk_engine.py`)

```python
import math
from dataclasses import dataclass, field

@dataclass
class RiskConfig:
    alpha: float = 0.02         # false CLONED rate budget
    beta: float = 0.02          # missed clone rate budget
    decay: float = 0.85         # leakiness: old evidence fades so a stream can change speakers
    min_windows: int = 2        # warm-up before any state besides ANALYZING
    suspicious_frac: float = 0.25   # S above 0.25*upper -> SUSPICIOUS
    unlatch_frac: float = 0.30      # hysteresis: leave CLONED only if S < 0.30*upper
    llr_clip: float = 4.0
    prior_spoof: float = 0.5

def _logit(p: float) -> float:
    p = min(max(p, 1e-6), 1 - 1e-6)
    return math.log(p / (1 - p))

class RiskEngine:
    def __init__(self, cfg: RiskConfig = RiskConfig(), hop_s: float = 0.5):
        self.cfg, self.hop_s = cfg, hop_s
        self.upper = math.log((1 - cfg.beta) / cfg.alpha)      # about +3.89
        self.lower = math.log(cfg.beta / (1 - cfg.alpha))      # about -3.89
        self.reset()

    def reset(self):
        self.S = 0.0
        self.n = 0
        self.state = "ANALYZING"
        self.committed = False
        self.decision_time_s = None
        self._slope_ema = 0.0

    def update(self, p_spoof: float, t_end_s: float) -> dict:
        c = self.cfg
        llr = _logit(p_spoof) - _logit(c.prior_spoof)
        llr = max(-c.llr_clip, min(c.llr_clip, llr))
        prev = self.S
        self.S = c.decay * self.S + llr
        self.S = max(2 * self.lower, min(2 * self.upper, self.S))
        self.n += 1
        self._slope_ema = 0.7 * self._slope_ema + 0.3 * ((self.S - prev) / self.hop_s)

        if self.n < c.min_windows:
            self.state = "ANALYZING"
        elif self.S >= self.upper:
            self.state = "CLONED"
            if not self.committed:
                self.committed, self.decision_time_s = True, t_end_s
        elif self.state == "CLONED" and self.S >= c.unlatch_frac * self.upper:
            pass                                   # hysteresis: stay CLONED
        elif self.S <= self.lower:
            self.state = "AUTHENTIC"
            if not self.committed:
                self.committed, self.decision_time_s = True, t_end_s
        elif self.S > c.suspicious_frac * self.upper:
            self.state = "SUSPICIOUS"
        else:
            self.state = "AUTHENTIC"               # tentative lean (committed stays False)

        eta = None
        if self.state != "CLONED" and self._slope_ema > 0.05:
            eta = max(0.0, (self.upper - self.S) / self._slope_ema)
            eta = eta if eta < 10 else None
        risk_pct = 100.0 / (1.0 + math.exp(-self.S / 1.5))
        return dict(llr=llr, score=self.S, risk_pct=risk_pct, state=self.state,
                    committed=self.committed, decision_time_s=self.decision_time_s,
                    eta_to_decision_s=eta)
```

Required unit tests (`tests/test_risk_engine.py`):
- Feeding `p_spoof=0.95` repeatedly reaches `CLONED` within 4 windows and records a decision time.
- Feeding `p_spoof=0.05` repeatedly reaches `AUTHENTIC` and never passes through `CLONED`.
- Alternating 0.4 / 0.6 never commits (no flicker).
- After `CLONED`, a single `p_spoof=0.1` does not immediately flip the state (hysteresis); a long run of 0.05 does.
- `reset()` clears everything.

Tune `decay`, `alpha`, `beta` on the **dev set simulated streams** (concatenate bonafide / spoof clips) to hit the Section 1 time-to-verdict target with a false CLONED rate below 2% on bonafide streams. Record the chosen values in `MODEL_CARD.md`.

### 8.3 Model (`model.py`)

A compact CNN: input `(B, 1, 64, 101)`.

```python
import torch, torch.nn as nn

def block(cin, cout):
    return nn.Sequential(
        nn.Conv2d(cin, cout, 3, padding=1, bias=False), nn.BatchNorm2d(cout), nn.ReLU(inplace=True),
        nn.Conv2d(cout, cout, 3, padding=1, bias=False), nn.BatchNorm2d(cout), nn.ReLU(inplace=True),
        nn.MaxPool2d(2),
    )

class SpoofCNN(nn.Module):
    def __init__(self, n_attack_classes: int = 0):
        super().__init__()
        self.features = nn.Sequential(block(1, 16), block(16, 32), block(32, 64), block(64, 96))
        self.pool = nn.AdaptiveAvgPool2d(1)
        self.drop = nn.Dropout(0.3)
        self.head = nn.Linear(96, 2)                       # logits: [bonafide, spoof]
        self.attack_head = nn.Linear(96, n_attack_classes) if n_attack_classes else None

    def forward(self, x):
        f = self.features(x)                               # keep this tensor for Grad-CAM
        z = self.drop(self.pool(f).flatten(1))
        out = self.head(z)
        return (out, self.attack_head(z)) if self.attack_head is not None else out
```

Keep the model under about 1M parameters. Target CPU inference under 25 ms for a single window; verify and record.

### 8.4 Calibration and the optional pretrained backbone

**Temperature scaling (`calibrate.py`):** collect dev logits `z` (spoof minus bonafide logit), fit a scalar `T > 0` minimizing negative log-likelihood with LBFGS, so `p = sigmoid(z / T)`. Save `T` and the training class prior. Report ECE before and after. Without calibration the SPRT thresholds are meaningless, so this step is **mandatory**.

**Optional pretrained backbone (only at Checkpoint 2 approval):**
1. Search for a publicly available audio-deepfake / anti-spoofing checkpoint (AASIST, RawNet2, or a wav2vec2/XLS-R-based spoof detector). Verify the exact repository or model id, its license, and that it loads and runs on a test wav.
2. Wrap it behind the same interface: `predict_window(y_16k) -> logit_spoof`.
3. Evaluate it with `evaluate.py` on dev, unseen eval attacks, own eval, and codecs. **Adopt it only if it beats the small CNN on unseen attacks or codecs** and still meets the latency floor (otherwise keep it as an offline "second opinion" in file mode only).
4. Grad-CAM for a raw-waveform model is not direct; if adopted for the live path, keep the small CNN as the **explainer** and show both scores (ensemble average of logits before temperature scaling).

### 8.5 Codec augmentation (`augment_codecs.py`)

Use `ffmpeg` via `subprocess` (no shell string concatenation; pass argument lists). Always resample back to 16 kHz mono after the codec round trip. Reference commands (verify availability with `ffmpeg -encoders` first):

```bash
# G.711 mu-law (8 kHz telephony)
ffmpeg -y -i in.wav -ar 8000 -ac 1 -c:a pcm_mulaw tmp.wav && ffmpeg -y -i tmp.wav -ar 16000 -ac 1 out.wav
# G.711 A-law
ffmpeg -y -i in.wav -ar 8000 -ac 1 -c:a pcm_alaw tmp.wav && ffmpeg -y -i tmp.wav -ar 16000 -ac 1 out.wav
# Opus at low bitrate (wideband and narrowband variants)
ffmpeg -y -i in.wav -ar 16000 -c:a libopus -b:a 16k tmp.opus && ffmpeg -y -i tmp.opus -ar 16000 -ac 1 out.wav
ffmpeg -y -i in.wav -ar 8000  -c:a libopus -b:a 8k  tmp.opus && ffmpeg -y -i tmp.opus -ar 16000 -ac 1 out.wav
# MP3 low bitrate
ffmpeg -y -i in.wav -c:a libmp3lame -b:a 32k tmp.mp3 && ffmpeg -y -i tmp.mp3 -ar 16000 -ac 1 out.wav
# AMR-NB (ONLY if libopencore_amrnb is present in this ffmpeg build)
ffmpeg -y -i in.wav -ar 8000 -ac 1 -c:a libopencore_amrnb -b:a 12.2k tmp.amr && ffmpeg -y -i tmp.amr -ar 16000 -ac 1 out.wav
```

Additive noise at 20 dB SNR can be done in NumPy (no ffmpeg). Process in parallel with `concurrent.futures.ProcessPoolExecutor`. Skip files that already exist (idempotent).

### 8.6 Biomarkers (explainability panel)

Compute on the 1 s window. All five must exist; document each one's meaning in `MODEL_CARD.md`.

| Key | How | "Synthetic-leaning" direction |
|---|---|---|
| `pitch_perturbation` | `librosa.yin` (fast) with fmin 70, fmax 400; keep frames where RMS is above a floor; compute frame-to-frame relative period variation `mean(abs(diff(T)))/mean(T)`, `T=1/f0` | Often unnaturally low (too smooth) |
| `rolloff_95_hz` | `librosa.feature.spectral_rolloff(roll_percent=0.95)` median | Abnormally low or abnormally rigid |
| `hf_ratio_4_8k` | energy in 4-8 kHz / total energy from STFT | Abnormally low (band-limited) |
| `spectral_flatness` | `librosa.feature.spectral_flatness` mean | Out of human band either way |
| `phase_coherence` | see below | Out of human band |

**Pitch note:** this is a *frame-level pitch perturbation* approximation, not a clinical jitter measure. Name it honestly in the UI ("Pitch perturbation").

**Phase coherence (experimental):**

```python
def phase_coherence(y, n_fft=512, hop=128):
    D = librosa.stft(y, n_fft=n_fft, hop_length=hop)
    ph = np.angle(D)
    expected = 2*np.pi*hop*np.arange(D.shape[0])[:, None]/n_fft
    d = np.diff(ph, axis=1) - expected
    d = (d + np.pi) % (2*np.pi) - np.pi               # wrap to [-pi, pi]
    mag = np.abs(D[:, 1:]); w = mag / (mag.sum(axis=0, keepdims=True) + 1e-9)
    # magnitude-weighted circular concentration of phase deviation, averaged over time
    r = np.abs((w * np.exp(1j * d)).sum(axis=0))
    return float(r.mean())
```

**Baselines:** `compute_baselines.py` runs the biomarkers over bonafide training windows (clean and codec) and stores `{key: {p10, p50, p90}}` in `artifacts/baselines.json`. `flagged` is true when a value falls outside `[p10, p90]`. Because a flag on a single feature is weak evidence, the UI must present biomarkers as **supporting evidence** and the CNN score as the **decision**.

**Speed rule:** use `librosa.yin`, not `librosa.pyin`, in the live path (pyin is far slower). Cache the STFT once per window and reuse it across roll-off, flatness, HF ratio and phase.

### 8.7 Grad-CAM (`gradcam.py`)

```python
import torch, torch.nn.functional as F

class GradCAM:
    def __init__(self, model, target_layer):
        self.model, self.acts, self.grads = model.eval(), None, None
        target_layer.register_forward_hook(lambda m, i, o: setattr(self, "acts", o))
        target_layer.register_full_backward_hook(lambda m, gi, go: setattr(self, "grads", go[0]))

    def __call__(self, x, class_idx=1, out_hw=(64, 101)):
        x = x.requires_grad_(True)
        out = self.model(x)
        logits = out[0] if isinstance(out, tuple) else out
        self.model.zero_grad(set_to_none=True)
        logits[0, class_idx].backward()
        w = self.grads.mean(dim=(2, 3), keepdim=True)
        cam = F.relu((w * self.acts).sum(dim=1, keepdim=True))
        cam = F.interpolate(cam, size=out_hw, mode="bilinear", align_corners=False)[0, 0]
        cam = cam - cam.min(); cam = cam / (cam.max() + 1e-6)
        return cam.detach().cpu().numpy()
```

Use `model.features[-1][3]` (the last Conv2d's ReLU or conv layer in the final block, pick the last conv-activation before pooling) as the target layer; verify the shape is spatial. Grad-CAM needs gradients, so **do not** wrap the Grad-CAM forward in `torch.no_grad()`. Run the plain classification forward in `no_grad` separately for speed, or reuse the Grad-CAM forward pass for both when Grad-CAM is on. A sanity test: on a known clone, the CAM mean must be higher than on a bonafide clip (record the numbers).

### 8.8 Evaluation (`evaluate.py`)

Metrics, computed **per `condition` and per `attack_id`** and also over the own eval set:
- **EER** (equal error rate) via ROC.
- **Accuracy and F1** at the EER threshold and at the calibrated 0.5 threshold.
- **Confusion matrix** (save PNG).
- **ECE** before/after calibration.
- **Stream-level metrics** using the RiskEngine: simulate streams by concatenating 6-10 s of audio; report time-to-verdict, false CLONED rate on bonafide streams, missed-clone rate on spoof streams.

Output `artifacts/metrics.json` and a markdown table inserted into `docs/RESULTS.md` by a script (not by hand).

### 8.9 Fallback ladder (implement all)

| Condition | Fallback |
|---|---|
| CNN dev EER > 15% | Train longer or on more data; if still bad, ship the baseline (handcrafted-feature) model as primary and keep the CNN only for Grad-CAM visuals, with a visible note in the UI ("explainer only") |
| No GPU and training too slow | Reduce subset sizes, reduce epochs, use 48 mel bins; report truthfully |
| Grad-CAM slow | Compute every 2nd or 4th window and reuse the last map |
| Biomarkers slow | Compute every 2nd window |
| ML service down | UI banner + auto-reconnect; `DemoControls` offline replay from `session.json` |
| Codec performance poor | Make that the honest "limitation + next step" slide; do not hide it |
| `MOCK_ML=1` | Dummy results for UI work only; **must never be on in the demo build** (print a loud warning on startup) |

### 8.10 `[STRETCH]` Attribution head

Add an attack-family head (multi-class over `bonafide` + attack ids, grouped into families such as "neural vocoder", "concatenative", "VC") using the ASVspoof attack ids. Train jointly with a small loss weight on the attack head. Show a badge "Likely synthesis family: X (confidence)". If top-1 confidence < 0.5, show "Unknown generator". Only ship if it does not harm the main EER by more than 1 point.

---

## 9. FRONTEND DETAILS

**Stack:** Vite, React 18, TypeScript (strict), Tailwind (or plain CSS modules), zustand for state. No UI kit is required.

### 9.1 Audio capture (`audioCapture.ts`, `public/pcm-worklet.js`)

`public/pcm-worklet.js`:

```js
class PCMProcessor extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Int16Array(8000); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      this.buf[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.n === this.buf.length) {
        this.port.postMessage(this.buf.buffer.slice(0));
        this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor("pcm-processor", PCMProcessor);
```

`audioCapture.ts` outline:

```ts
export async function startCapture(source: "mic" | "tab", onFrame: (pcm: ArrayBuffer) => void) {
  const stream = source === "mic"
    ? await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
    : await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }); // user must tick "share tab audio"
  if (stream.getAudioTracks().length === 0) throw new Error("No audio track. For tab capture tick 'Share tab audio'.");
  const ctx = new AudioContext({ sampleRate: 16000 });             // browser resamples for us
  await ctx.audioWorklet.addModule("/pcm-worklet.js");
  const src = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
  const node = new AudioWorkletNode(ctx, "pcm-processor");
  node.port.onmessage = (e) => onFrame(e.data as ArrayBuffer);
  src.connect(node);                                                // do NOT connect to destination (avoids echo)
  return () => { stream.getTracks().forEach(t => t.stop()); node.disconnect(); ctx.close(); };
}
```

Critical details: **disable** echo cancellation, noise suppression and AGC for the mic (they alter exactly the artifacts the detector looks at). Send each frame as `[uint32 seq LE][pcm]` via `new Uint8Array(4 + pcm.byteLength)` with a `DataView`. Record `performance.now()` per `seq` in `latency.ts` to compute RTT when `client_seq_echo` returns.

### 9.2 Tab-audio capture (Google Meet / Zoom web)

Chrome supports capturing tab audio through `getDisplayMedia` when the user ticks "Share tab audio". Provide a "Analyze a live call" button with a one-line instruction. Caveat to show in UI: the analyzed audio is what the tab plays (the remote party), which is exactly the case to protect against. Test in Chrome; other browsers may not expose tab audio. Provide a clear unsupported-browser message.

### 9.3 Components

**LiveSpectrogram.tsx**
- Canvas 2D (`ImageData` column drawing). A ring of N columns (~600, about 12 s); each incoming `spec_new` column set is colormapped (viridis LUT in `colormap.ts`) and drawn at the write cursor; scroll by `drawImage` shifting, or use two-canvas ping-pong.
- Y axis: mel bins 0-63 with Hz labels (0, 1k, 2k, 4k, 8k); X axis: seconds relative to now.
- Draw outside React state: keep canvas refs and an imperative `pushColumns()` API.

**HeatmapOverlay.tsx**
- A second transparent canvas on top, drawn from `heatmap` (64 x 101) mapped to the **last 1 s** of the spectrogram, red-orange alpha proportional to CAM value (threshold below 0.3 -> transparent).
- Toggle button "Show evidence" on/off. Keep the last heatmap visible but dimmed when `heatmap == null`.

**RiskGauge.tsx**
- Semi-circular or horizontal gauge from `risk_pct` with three zones: Authentic (0-35), Suspicious (35-65), Cloned (65-100). Smooth needle animation (CSS transition or `requestAnimationFrame` lerp, 250 ms). Zone **icons and text labels**, not color alone. When `committed` becomes true, play a subtle pulse and show a lock icon.

**VerdictBanner.tsx**
- Large text: `AUTHENTIC` / `SUSPICIOUS` / `CLONED`, and a subline "Decided at 1.5 s" when committed, or "Verdict expected in ~0.8 s" from `eta_to_decision_s`, or "Listening…" during ANALYZING.

**LatencyMeter.tsx**
- Bar showing end-to-end RTT (ms) with segments for gateway/ML/features/model/gradcam from `timings_ms`, plus a rolling p50/p95 sparkline. Color thresholds from the Section 1 targets.

**BiomarkerPanel.tsx**
- For each biomarker: label, value+unit, a horizontal track with the human baseline band shaded and a marker for the current value; flagged ones get an icon and a short tooltip explaining why it matters. Footer: "Supporting evidence. The verdict comes from the model score."

**Timeline.tsx**
- Line chart (canvas or lightweight SVG, no heavy chart library needed) of `risk_pct` over time, threshold lines, and a vertical marker at `decision_time_s`.

**UploadDropzone.tsx**
- Accepts wav/mp3/m4a/flac/ogg up to 25 MB; posts to `/api/analyze`; on response animates `windows[]` through the same store/actions as live mode at 1x/2x speed; show "Replay" and "Export JSON" buttons.

**DemoControls.tsx**
- Buttons: "Play real sample", "Play cloned sample" (each streams a bundled wav through the real pipeline and also plays it through the speakers if enabled), "Offline replay", "Reset". Hidden unless `?demo=1`, but with a keyboard shortcut `D`.

### 9.4 UX copy rules

- Never say "100% sure". Say "High confidence" and show the percentage with one decimal at most.
- Show the disclaimer once in the footer: "Decision support, not proof. Detectors can fail on unseen generators."
- The layout fits a 1920x1080 projector without scrolling: spectrogram left/center (largest), gauge + verdict right-top, biomarkers right-bottom, latency + timeline bottom.

---

## 10. GATEWAY DETAILS (Node + TypeScript)

**Dependencies:** `fastify`, `@fastify/websocket`, `@fastify/multipart`, `@fastify/cors`, `ws`, `pino` (comes with fastify), `zod`. Use `tsx` for dev and `tsc` for build. **Check the installed `@fastify/websocket` major version** because the route handler signature differs across versions (older: `(connection, req)` with `connection.socket`; newer: `(socket, req)`). Write to the installed version.

### 10.1 Config (`config.ts`)

Env vars: `PORT=8080`, `ML_WS_URL=ws://ml:8000/ws/session`, `ML_HTTP_URL=http://ml:8000`, `MAX_UPLOAD_MB=25`, `CORS_ORIGIN=http://localhost:5173`. Validate with zod at startup; crash fast with a clear error if invalid.

### 10.2 Live route (`routes/live.ts`) behavior

1. On client connect, create `session_id`, open an upstream `ws` to ML. If the upstream fails, send `{type:"error", code:"ML_UNAVAILABLE"}` and close with a retryable code.
2. Pipe client **binary** frames to ML unchanged (no copying beyond what `ws` does). Pipe client JSON text frames through after validating `type`.
3. Pipe ML text frames to the client; optionally add `gateway_ts` to `timings_ms` as `gateway`.
4. **Backpressure:** if `upstream.bufferedAmount` exceeds ~64 KB, drop the **oldest unsent** frame rather than queue forever (latency matters more than completeness) and count drops in a metric the UI can show.
5. **Heartbeat:** ping both sides every 10 s; terminate dead sockets.
6. On either side closing, close the other and flush a `final` summary if available.
7. Keep a bounded in-memory timeline (last 600 windows) per session for `GET /api/session/:id/export`.

### 10.3 Analyze route (`routes/analyze.ts`)

Streams the multipart file to ML `/analyze_file` (do not buffer the entire file in memory if avoidable), enforces `MAX_UPLOAD_MB` and an allow-list of MIME types / extensions, and returns the ML JSON unchanged. Return `413` for oversize and `415` for unsupported type with a JSON error body.

### 10.4 Security basics (cheap but visible)

- CORS allow-list from env, no wildcard in production mode.
- Per-IP connection limit (e.g. 5 concurrent sockets) and a simple rate limit on `/api/analyze`.
- No audio persisted by default; log only metadata (session id, duration, verdict), never samples.
- Do not log full request bodies.

---

## 11. ML SERVICE API DETAILS (FastAPI)

- Use the **lifespan** handler to load: model weights, calibration, baselines, optional baseline model. Warm up with one dummy window. Fail fast if artifacts are missing unless `MOCK_ML=1`.
- `/ws/session`: receive loop handling both text and bytes. Handle `websocket.disconnect` gracefully (check `msg["type"]`), validate frame length (must be a multiple of 2 bytes after the 4-byte header; reject otherwise with `BAD_FRAME`).
- Run CPU-bound work with `run_in_threadpool` (or a dedicated single-thread executor per session to keep order), so the event loop stays responsive. **Results must be sent in `seq` order.**
- Set `torch.set_num_threads(min(4, os.cpu_count()))` and `torch.inference_mode()` for the classification path.
- Per-session state lives in a `SessionEngine` object: ring buffer (`np.ndarray` of 16000 float32), sample counter, `RiskEngine`, the last biomarkers, the last heatmap.
- Provide `POST /analyze_file`: `soundfile`/`librosa.load(sr=16000, mono=True)` with an ffmpeg fallback for mp3/m4a; guard max duration (e.g. 120 s); replay in 0.5 s hops through a **fresh** `SessionEngine`; return the schema in 6.4.
- Add `GET /metrics` (plain JSON) exposing rolling p50/p95 latencies for `scripts/bench_latency.py`.

---

## 12. TESTING AND VERIFICATION

### 12.1 Required automated tests

| Area | Test |
|---|---|
| risk engine | The five cases in 8.2 |
| features | `log_mel` output shape is `(64, 101)`; display spec for 8000 samples has 64 rows; no NaNs on silence and on full-scale noise |
| packing | Round trip: pack a float matrix to `u8_b64`, decode in a test, error under 1/255 |
| protocol | A frame with odd byte length yields `BAD_FRAME`; `seq` echoed correctly |
| gradcam | Output shape `(64, 101)`, values within [0, 1] |
| gateway | A mock ML WebSocket server: gateway forwards frames and results in order; closing the ML side closes the client side |
| e2e | `scripts/e2e_smoke.py` (below) |

### 12.2 `scripts/e2e_smoke.py`

CLI: `--wav path --ws ws://localhost:8080/ws/live --expect AUTHENTIC|CLONED`. It reads the wav, resamples to 16 kHz mono int16, sends 8000-sample frames paced at real time (flag `--fast` to send without pacing), collects `window_result` messages, prints a table of `seq, p_spoof, state, risk_pct, total_ms`, prints the decision time, and exits non-zero if the final state does not match `--expect` or if `seq` is not strictly increasing.

### 12.3 Manual verification checklist (paste results into `docs/PROGRESS.md`)

- [ ] Mic start/stop works; the browser permission denial path shows instructions.
- [ ] Spectrogram scrolls smoothly; the heatmap appears for a cloned clip and fades for a real one.
- [ ] Gauge transitions Authentic -> Suspicious -> Cloned on a cloned sample and does not flicker on a real voice.
- [ ] "Decided at X.Xs" appears and matches the Timeline marker.
- [ ] Upload mode works for wav and mp3; replay animates.
- [ ] Reconnect: stop the ML container for 20 s, restart it, the UI recovers.
- [ ] `docker compose up --build` from a clean clone works.
- [ ] No console errors during a 5-minute session; memory does not grow unbounded (check the browser Performance Monitor).
- [ ] With `MOCK_ML` unset, the model path is active (health endpoint shows `model_loaded: true`).

---

## 13. DEMO PLAN (write into `docs/DEMO_SCRIPT.md`)

**Length: 3 minutes pitch + 2 minutes live demo.**

1. **Hook (20 s):** "A 3-second clip is enough to clone a voice. Caller ID and OTP can't stop it. Here is a forensic co-pilot that decides in about a second and shows its evidence."
2. **Live A/B ("Clone a judge", with consent):** record about 5 seconds of a volunteer judge beforehand. Generate a clone with the open-source TTS in advance (never generate it live; it is slow and risky). Stream the **real** clip through VoiceSentry: the gauge stays Authentic and the heatmap stays quiet. Stream the **clone**: the gauge climbs, the heatmap lights up, the banner says CLONED, "Decided at 1.4 s". Ask the judge if they could tell the difference by ear.
3. **Explainability beat (30 s):** point at the heatmap and the biomarker panel: "these are the time-frequency regions and the measurements that drove the verdict."
4. **Robustness beat (30 s):** show the clean vs phone-codec table and say what happened before and after codec augmentation.
5. **Honest limits (20 s):** unseen generators, one number, one sentence about the retraining loop.
6. **Close (10 s):** decision support for call-center agents and consumers.

**Hard rules for the demo build:** the stream path must be the real pipeline; pre-generated audio is fine, fake animations are not. Keep `DemoControls` offline replay as the emergency fallback and say so honestly if it is used.

---

## 14. ANTICIPATED JUDGE Q&A (write into `docs/PITCH_QA.md`, agent fills in real numbers)

- *How does it handle generators it has never seen?* -> held-out attack results, calibration, "Suspicious" tier, retraining loop.
- *What about false positives on a noisy real call?* -> codec/noise augmentation, hysteresis, tiers, decision support.
- *Why SPRT instead of averaging?* -> principled early stopping with controllable error budgets, gives decision time and forecast.
- *Is the heatmap real or decorative?* -> Grad-CAM from the same network that produced the score; show the sanity test numbers.
- *Does it work on a real phone call?* -> tab-audio capture on web calls, codec tests; no telecom-layer integration by design.
- *Privacy?* -> audio is processed in memory and not stored by default.
- *Can an attacker adapt to evade it?* -> yes, state this honestly; propose adversarial retraining and ensemble defenses.

---

## 15. DEPLOYMENT AND OPERATIONS

### 15.1 `docker-compose.yml` expectations

```yaml
services:
  ml:
    build: ./services/ml
    ports: ["8000:8000"]
    environment: [MOCK_ML=0]
    volumes: ["./services/ml/artifacts:/app/artifacts:ro"]
    healthcheck: { test: ["CMD", "curl", "-f", "http://localhost:8000/health"], interval: 10s, retries: 6 }
  gateway:
    build: ./services/gateway
    ports: ["8080:8080"]
    environment:
      - ML_WS_URL=ws://ml:8000/ws/session
      - ML_HTTP_URL=http://ml:8000
      - CORS_ORIGIN=http://localhost:5173
    depends_on: { ml: { condition: service_healthy } }
  web:
    build: ./apps/web
    ports: ["5173:80"]       # static build behind nginx, proxying /api and /ws to the gateway
    depends_on: [gateway]
```

ML Dockerfile: `python:3.11-slim`, apt-install `ffmpeg libsndfile1 curl`, install the **CPU** build of PyTorch and torchaudio, pin versions in `requirements.txt`, run `uvicorn app.main:app --host 0.0.0.0 --port 8000` with a **single worker** (state lives in-process).

Note for the web container: `getUserMedia` and `getDisplayMedia` require a **secure context** (HTTPS or `localhost`). For a demo over a LAN IP, use HTTPS (a self-signed cert via the dev server is fine) or demo on `localhost`. Document this in the README.

### 15.2 Environment variables (`.env.example`)

```
MOCK_ML=0
ML_WS_URL=ws://localhost:8000/ws/session
ML_HTTP_URL=http://localhost:8000
CORS_ORIGIN=http://localhost:5173
MAX_UPLOAD_MB=25
LOG_LEVEL=info
```

### 15.3 Make targets

```
make dev      # run ml, gateway, web in parallel (3 terminals or a process manager)
make test     # pytest + vitest/tsc typecheck + gateway tests
make train    # manifest -> augment -> train_cnn -> calibrate -> baselines
make eval     # evaluate on dev, eval, own_eval; writes docs/RESULTS.md tables
make up       # docker compose up --build
make smoke    # runs scripts/e2e_smoke.py on bundled real and clone clips
```

---

## 16. KICKOFF PROMPT (paste this into Antigravity's Agent Manager)

```
You are the lead engineer for the VoiceSentry hackathon project. Read AGENTS.md fully
(it is the single source of truth). Use Planning mode.

Step 1: Produce an implementation plan artifact that lists every phase in Section 7 with
the files you will create, the commands you will run to verify each phase, and the risks you
see. Do not write code until the plan is written.

Step 2: Execute Phase 0 and Phase 1 only (repo bootstrap and the echo vertical slice).
Run the acceptance checks and record the real command output in docs/PROGRESS.md.
Commit with the message format "phase<N>: <what>".

Step 3: Stop at CHECKPOINT 1 and report: what works, what you verified, what you could not
verify, and any questions for me (dataset path, ffmpeg codec availability, GPU availability).

Rules: do not skip acceptance checks, do not invent model checkpoints or library APIs
(verify them), do not download datasets above 2 GB without asking, never enable MOCK_ML in
the demo build, and never include anything from the anti-goals list in Section 0.1.
Continue with later phases only after I reply "continue" (or, in unattended mode, continue
automatically but still stop at CHECKPOINT 2 and CHECKPOINT 3).
```

**Parallelization tip for Antigravity:** after Checkpoint 1, you can run two agents in separate workspaces/branches: **Agent A** = Phases 2-4 and 7 (data, training, evaluation, calibration), **Agent B** = Phase 6 (frontend) using `MOCK_ML=1` against the contracts in Section 6. Merge when Agent A's artifacts land and run Phase 5 integration together. Contracts in Section 6 are the integration surface; neither agent may change them without recording the change in `docs/QUESTIONS.md` and notifying the other.

---

## 17. DEFINITION OF DONE

The project is demo-ready when **all** of the following are true:

- [ ] `docker compose up --build` from a fresh clone works and `make smoke` passes.
- [ ] Real clip -> AUTHENTIC, cloned clip -> CLONED, each with a displayed decision time.
- [ ] Heatmap, biomarker panel, gauge, latency meter, and timeline all update live without console errors.
- [ ] `docs/RESULTS.md` includes: clean vs codec table, seen vs unseen attack table, per-window latency p50/p95, ECE before/after calibration, and stream-level time-to-verdict.
- [ ] `docs/MODEL_CARD.md` lists data sources, licenses, limits, and the 8 kHz note.
- [ ] Offline replay fallback tested.
- [ ] `docs/DEMO_SCRIPT.md` and `docs/PITCH_QA.md` are filled with real numbers.
- [ ] `MOCK_ML` is not enabled anywhere in the compose file or `.env.example`.

---

## 18. IF TIME RUNS OUT: CUT LIST (in order, cut from the top)

1. Attribution head (8.10)
2. Tab-audio capture polish (9.2)
3. Pretrained backbone (8.4)
4. Phase correlation biomarker (keep the other four)
5. AMR-NB codec (keep mu-law, A-law, Opus, MP3, noise)
6. Timeline component (keep gauge + verdict banner)
7. Upload mode (keep live + DemoControls playback)

**Never cut:** the live pipeline, the calibrated SPRT verdict with decision time, the Grad-CAM heatmap, the latency meter, the results table, the fallback mode.
