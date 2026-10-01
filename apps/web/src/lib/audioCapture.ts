export async function startCapture(
  source: "mic" | "tab",
  onFrame: (pcm: ArrayBuffer) => void
): Promise<() => void> {
  const stream =
    source === "mic"
      ? await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        })
      : await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });

  if (stream.getAudioTracks().length === 0) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error(
      source === "tab"
        ? "No audio track found. Please ensure you ticked 'Share tab audio' in the browser prompt."
        : "No audio track available on microphone."
    );
  }

  const ctx = new AudioContext({ sampleRate: 16000 });
  await ctx.audioWorklet.addModule("/pcm-worklet.js");
  const src = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
  const node = new AudioWorkletNode(ctx, "pcm-processor");

  node.port.onmessage = (e) => {
    onFrame(e.data as ArrayBuffer);
  };

  src.connect(node);

  return () => {
    try {
      stream.getTracks().forEach((t) => t.stop());
      node.disconnect();
      src.disconnect();
      if (ctx.state !== "closed") {
        ctx.close();
      }
    } catch (err) {
      console.warn("Error cleaning up audio capture:", err);
    }
  };
}
