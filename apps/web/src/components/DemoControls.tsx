import { useState } from "react";
import { Play, Square, RotateCcw, Zap } from "lucide-react";

interface DemoClip {
  label: string;
  url: string;
  type: "human" | "clone";
}

const DEMO_CLIPS: DemoClip[] = [
  { label: "Human Speech Sample", url: "/demo/human_sample.wav", type: "human" },
  { label: "TTS Clone Sample",    url: "/demo/clone_sample.wav", type: "clone" },
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

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          Demo Clips
        </div>
        <button
          onClick={onReset}
          disabled={disabled}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-white disabled:opacity-40 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {DEMO_CLIPS.map((clip) => (
          <button
            key={clip.url}
            onClick={() => select(clip)}
            disabled={disabled}
            className={`flex items-center gap-3 p-2.5 rounded-lg border text-left text-xs transition-all
              ${activeClip === clip.url
                ? clip.type === "human"
                  ? "border-emerald-700 bg-emerald-950/40 text-emerald-300"
                  : "border-rose-700 bg-rose-950/40 text-rose-300"
                : "border-slate-700 bg-slate-800/40 text-slate-300 hover:border-slate-600"
              }
              disabled:opacity-40`}
          >
            {activeClip === clip.url ? (
              <Square className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <Play className="w-3.5 h-3.5 shrink-0" />
            )}
            <div>
              <div className="font-semibold">{clip.label}</div>
              <div className="text-[10px] opacity-60 mt-0.5">
                {clip.type === "human" ? "Expected: AUTHENTIC" : "Expected: CLONED"}
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="text-[10px] text-slate-600 text-center">
        Demo clips use pre-recorded consented audio
      </div>
    </div>
  );
}
