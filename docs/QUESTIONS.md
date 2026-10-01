# Open Questions and Checkpoints

## Environment & Prerequisites
1. **FFmpeg**: `ffmpeg` is not currently recognized on the Windows system PATH. Codec augmentation (Phase 2) will require ffmpeg (or Dockerized ffmpeg). Is ffmpeg installed in another path, or should we prepare to run codec conversions in Docker or via a static binary?
2. **ASVspoof Dataset**: Where is the ASVspoof 2019 LA dataset located on disk, or will a subset path be provided?
3. **Hardware / Acceleration**: CUDA GPU or CPU-only for Phase 4 CNN training?
