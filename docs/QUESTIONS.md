# Open Questions and Checkpoints

## CHECKPOINT 2: Data & Training

The following questions need human input before Phase 2 (training data) can proceed:

### 1. ASVspoof 2019 LA Dataset Path (REQUIRED)
- Do you have ASVspoof2019 LA on disk?
- If yes, what is the full path? Expected layout:
  ```
  <your_path>/
    ASVspoof2019_LA_cm_protocols/
      ASVspoof2019.LA.cm.train.trn.txt
      ASVspoof2019.LA.cm.dev.trl.txt
      ASVspoof2019.LA.cm.eval.trl.txt
    ASVspoof2019_LA_train/flac/
    ASVspoof2019_LA_dev/flac/
    ASVspoof2019_LA_eval/flac/
  ```
- Run: `python -m training.build_manifest --data_root <your_path> --train_cap 6000 --dev_cap 1500 --eval_cap 3000`

### 2. sklearn AppControl Policy
- sklearn DLLs are blocked by AppControl on this Windows machine
- This prevents training the fallback LogisticRegression classifier
- Options:
  a) Run training inside Docker: `make up` then `docker exec voicesentry-ml python -m training.train_baseline`
  b) Add a policy exception for the sklearn DLLs
  c) Skip fallback model (CNN-only, confirmed if CNN loads OK)

### 3. ffmpeg Availability
- ffmpeg is not on the system PATH
- Needed for: codec augmentation (G.711, Opus, MP3 degradation in Phase 7)
- Options:
  a) Install ffmpeg and add to PATH: https://ffmpeg.org/download.html
  b) Run codec augmentation inside Docker (ffmpeg is in the Docker image)
  c) Run only `noise_20db` augmentation (works without ffmpeg)

### 4. Own Eval Set (Optional but impactful for scoring)
- The spec requires 20+ real recordings + 20+ AI-cloned clips from consenting team members
- Tools needed (pip-installable, MIT/Apache licensed):
  - Recording: any mic software
  - Cloning: `bark` or `coqui-tts` (recommend `coqui-tts` for speed)
- Place recorded files in `data/own_eval/` and create `data/own_eval/own_eval_manifest.csv`

## Resolved Questions

| Question | Resolution |
|---|---|
| FFmpeg not in PATH | Documented above; codec aug runs in Docker |
| Training environment for sklearn | Documented above; use Docker or AppControl exception |

## Notes from CHECKPOINT 1

Phases 0 and 1 are complete and verified on the dev machine:
- Echo vertical slice works: mic → gateway → ML → spectrogram display
- RTT: ~5ms on localhost
- 8/8 unit tests pass
- Full Phase 1 smoke test passes (6 frames, strictly increasing seq)
