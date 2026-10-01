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
    subtitle: "Dataset ground-truth natural speaker",
    url: "/demo/asv_bonafide.wav",
    type: "human",
    tag: "Bonafide",
  },
  {
    id: "asv_spoof_a02",
    label: "ASVspoof Neural Clone (A02)",
    subtitle: "Neural acoustic model + vocoder artifact",
    url: "/demo/asv_spoof_a02.wav",
    type: "clone",
    tag: "Vocoder A02",
  },
  {
    id: "human_sample",
    label: "Natural Voice Recording",
    subtitle: "Clean studio microphone capture",
    url: "/demo/human_sample.wav",
    type: "human",
    tag: "Natural",
  },
  {
    id: "clone_sample",
    label: "TTS Vocoder Buzz Deepfake",
    subtitle: "Rigid F0 jitter + anomalous phase",
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
    <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 backdrop-blur p-4 space-y-3 shadow-lg">
      <div className="flex items-center justify-between pb-1 border-b border-slate-800/60">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-heading font-bold text-slate-300 uppercase tracking-wider">
            Forensic Test Presets
          </span>
        </div>
        <button
          onClick={handleReset}
          disabled={disabled}
          className="flex items-center gap-1 text-[11px] font-mono text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 transition-colors disabled:opacity-40"
          title="Reset audio buffer"
        >
          <RotateCcw className="w-3 h-3" /> Reset
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {DEMO_CLIPS.map((clip) => {
          const isActive = activeClip === clip.url;
          const isHuman = clip.type === "human";

          return (
            <button
              key={clip.id}
              onClick={() => select(clip)}
              disabled={disabled}
              className={`group relative p-2.5 rounded-lg border text-left transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                isActive
                  ? isHuman
                    ? "border-emerald-500/80 bg-emerald-950/40 text-emerald-200 shadow-[0_0_16px_rgba(16,185,129,0.2)]"
                    : "border-rose-500/80 bg-rose-950/40 text-rose-200 shadow-[0_0_16px_rgba(244,63,94,0.2)]"
                  : "border-slate-800/90 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:bg-slate-800/60"
              }`}
            >
              <div className="flex items-start justify-between gap-1 mb-1">
                <div className="flex items-center gap-1.5">
                  {isHuman ? (
                    <ShieldCheck className={`w-3.5 h-3.5 ${isActive ? "text-emerald-400" : "text-emerald-500/70"}`} />
                  ) : (
                    <ShieldAlert className={`w-3.5 h-3.5 ${isActive ? "text-rose-400" : "text-rose-500/70"}`} />
                  )}
                  <span className="font-heading font-semibold text-xs leading-snug group-hover:text-white transition-colors">
                    {clip.label}
                  </span>
                </div>

                <span
                  className={`text-[9px] font-mono px-1.5 py-0.2 rounded uppercase shrink-0 ${
                    isHuman
                      ? "bg-emerald-950 text-emerald-400 border border-emerald-800/60"
                      : "bg-rose-950 text-rose-400 border border-rose-800/60"
                  }`}
                >
                  {clip.tag}
                </span>
              </div>

              <p className="text-[10px] text-slate-400 leading-tight mb-2">
                {clip.subtitle}
              </p>

              <div className="flex items-center justify-between text-[10px] font-mono border-t border-slate-800/50 pt-1.5 text-slate-500">
                <span className={isHuman ? "text-emerald-400/80" : "text-rose-400/80"}>
                  Target: {isHuman ? "AUTHENTIC" : "CLONED"}
                </span>

                <span className="flex items-center gap-1 text-slate-400 group-hover:text-white transition-colors">
                  {isActive ? (
                    <>
                      <Square className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                      <span className="text-amber-300">Evaluating</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-2.5 h-2.5" />
                      <span>Replay</span>
                    </>
                  )}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="text-[10px] text-slate-500 text-center font-mono pt-1">
        Benchmarked on held-out ASVspoof 2019 LA evaluation partitions
      </div>
    </div>
  );
}
