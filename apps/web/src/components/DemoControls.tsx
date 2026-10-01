import { useState } from "react";
import { Play, Square, RotateCcw, ShieldCheck, ShieldAlert, Sparkles } from "lucide-react";

interface DemoClip {
  id: string;
  label: string;
  subtitle: string;
  url: string;
  type: "human" | "clone";
  tag: string;
}

const DEMO_CLIPS: DemoClip[] = [
  {
    id: "asv_bonafide",
    label: "ASVspoof Real Human",
    subtitle: "Dataset ground-truth natural speaker from training split",
    url: "/demo/asv_bonafide.wav",
    type: "human",
    tag: "Bonafide",
  },
  {
    id: "asv_spoof_a02",
    label: "ASVspoof Neural Clone (A02)",
    subtitle: "Neural acoustic model + HiFi-GAN vocoder artifact",
    url: "/demo/asv_spoof_a02.wav",
    type: "clone",
    tag: "Vocoder A02",
  },
  {
    id: "human_sample",
    label: "Natural Voice Recording",
    subtitle: "Clean studio microphone capture from consenting speaker",
    url: "/demo/human_sample.wav",
    type: "human",
    tag: "Natural",
  },
  {
    id: "clone_sample",
    label: "TTS Vocoder Buzz Deepfake",
    subtitle: "Rigid F0 micro-tremor jitter with anomalous phase buzz",
    url: "/demo/clone_sample.wav",
    type: "clone",
    tag: "Deepfake",
  },
];

interface Props {
  onClipSelected: (url: string) => void;
  onReset: () => void;
  disabled?: boolean;
}

export function DemoControls({ onClipSelected, onReset, disabled }: Props) {
  const [activeClip, setActiveClip] = useState<string | null>(null);

  const select = (clip: DemoClip) => {
    setActiveClip(clip.url);
    onClipSelected(clip.url);
  };

  const handleReset = () => {
    setActiveClip(null);
    onReset();
  };

  return (
    <div className="rounded-xl border border-slate-800/90 bg-slate-900/50 backdrop-blur p-5 space-y-4 shadow-xl">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-heading font-bold text-slate-200 uppercase tracking-wider">
            Forensic Test Presets
          </span>
        </div>
        <button
          onClick={handleReset}
          disabled={disabled}
          className="flex items-center gap-1.5 text-xs font-mono text-slate-400 hover:text-white px-3 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-slate-700 transition-colors disabled:opacity-40 cursor-pointer"
          title="Reset audio buffer"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {DEMO_CLIPS.map((clip) => {
          const isActive = activeClip === clip.url;
          const isHuman = clip.type === "human";

          return (
            <button
              key={clip.id}
              onClick={() => select(clip)}
              disabled={disabled}
              className={`group relative p-3.5 rounded-xl border text-left transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                isActive
                  ? isHuman
                    ? "border-emerald-500/80 bg-emerald-950/50 text-emerald-200 shadow-[0_0_20px_rgba(16,185,129,0.25)]"
                    : "border-rose-500/80 bg-rose-950/50 text-rose-200 shadow-[0_0_20px_rgba(244,63,94,0.25)]"
                  : "border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700 hover:bg-slate-800/70"
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  {isHuman ? (
                    <ShieldCheck className={`w-4 h-4 shrink-0 ${isActive ? "text-emerald-400" : "text-emerald-500/80"}`} />
                  ) : (
                    <ShieldAlert className={`w-4 h-4 shrink-0 ${isActive ? "text-rose-400" : "text-rose-500/80"}`} />
                  )}
                  <span className="font-heading font-bold text-sm leading-snug group-hover:text-white transition-colors">
                    {clip.label}
                  </span>
                </div>

                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase tracking-wider shrink-0 ${
                    isHuman
                      ? "bg-emerald-950 text-emerald-300 border border-emerald-800/70"
                      : "bg-rose-950 text-rose-300 border border-rose-800/70"
                  }`}
                >
                  {clip.tag}
                </span>
              </div>

              <p className="text-xs text-slate-400 font-sans leading-relaxed mb-2.5">
                {clip.subtitle}
              </p>

              <div className="flex items-center justify-between text-xs font-mono border-t border-slate-800/60 pt-2 text-slate-400">
                <span className={isHuman ? "text-emerald-400/90 font-medium" : "text-rose-400/90 font-medium"}>
                  Target: {isHuman ? "AUTHENTIC" : "CLONED"}
                </span>

                <span className="flex items-center gap-1.5 text-slate-300 group-hover:text-white transition-colors font-medium">
                  {isActive ? (
                    <>
                      <Square className="w-3 h-3 text-amber-400 fill-amber-400" />
                      <span className="text-amber-300">Evaluating Stream</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3 text-cyan-400" />
                      <span>Replay Clip</span>
                    </>
                  )}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="text-xs text-slate-400 text-center font-mono pt-1">
        Benchmarked on held-out ASVspoof 2019 LA evaluation partitions
      </div>
    </div>
  );
}
