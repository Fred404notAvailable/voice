export type RiskState = "ANALYZING" | "AUTHENTIC" | "SUSPICIOUS" | "CLONED";

export interface Biomarker {
  key: "pitch_perturbation" | "rolloff_95_hz" | "hf_ratio_4_8k" | "spectral_flatness" | "phase_coherence";
  label: string;
  value: number;
  unit: string;
  baseline_low: number;
  baseline_high: number;
  flagged: boolean;
}

export interface PackedMatrix {
  shape: [number, number];
  encoding: "u8_b64";
  data: string;
}

export interface WindowResult {
  type: "window_result";
  session_id: string;
  seq: number;
  t_start_s: number;
  t_end_s: number;
  p_spoof: number | null;
  llr: number | null;
  score: number | null;
  risk_pct: number;
  state: RiskState;
  committed: boolean;
  decision_time_s: number | null;
  eta_to_decision_s: number | null;
  biomarkers: Biomarker[];
  spec_new: PackedMatrix;
  heatmap: PackedMatrix | null;
  attribution?: { family: string; probs: Record<string, number> } | null;
  timings_ms: {
    features: number;
    model: number;
    gradcam: number;
    biomarkers: number;
    total: number;
    gateway?: number;
  };
  client_seq_echo: number;
}

export type ControlMessage =
  | { type: "start"; session_id: string; sample_rate: number; mode: "live" }
  | { type: "stop" }
  | { type: "reset" };

export type ServerMessage =
  | WindowResult
  | { type: "ready"; model: string; calibrated: boolean; window_s: number; hop_s: number }
  | { type: "error"; code: string; message: string }
  | { type: "final"; session_id: string; verdict: RiskState; decision_time_s: number | null; summary: Record<string, any> };
