import { useRef, useState } from "react";
import { Upload, X, FileAudio } from "lucide-react";

interface Props {
  onFile: (file: File) => void;
  disabled?: boolean;
}

export function UploadDropzone({ onFile, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = (file: File) => {
    setFileName(file.name);
    onFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type.startsWith("audio/") || file.name.match(/\.(wav|flac|mp3|ogg|m4a|json)$/i))) {
      handleFile(file);
    }
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`relative rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200 p-5 text-center
        ${dragging
          ? "border-indigo-500 bg-indigo-950/40"
          : disabled
          ? "border-slate-700 bg-slate-900/30 cursor-not-allowed opacity-50"
          : "border-slate-700 bg-slate-900/30 hover:border-indigo-600 hover:bg-indigo-950/20"
        }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.flac,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
        disabled={disabled}
      />

      {fileName ? (
        <div className="flex items-center justify-center gap-2 text-sm text-slate-300">
          <FileAudio className="w-4 h-4 text-indigo-400" />
          <span className="truncate max-w-[180px]">{fileName}</span>
          <button
            onClick={(e) => { e.stopPropagation(); setFileName(null); }}
            className="text-slate-500 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <>
          <Upload className="w-6 h-6 text-slate-400 mx-auto mb-2" />
          <div className="text-xs text-slate-300 font-medium">
            Drop audio file or <span className="text-cyan-400 underline underline-offset-2">browse</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">WAV, FLAC, MP3, OGG, or JSON session</div>
        </>
      )}
    </div>
  );
}
