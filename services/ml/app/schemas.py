from typing import List, Optional, Tuple, Dict, Any, Literal
from pydantic import BaseModel, Field

RiskState = Literal["ANALYZING", "AUTHENTIC", "SUSPICIOUS", "CLONED"]

class Biomarker(BaseModel):
    key: Literal["pitch_perturbation", "rolloff_95_hz", "hf_ratio_4_8k", "spectral_flatness", "phase_coherence"]
    label: str = Field(..., alias="label")
    value: float
    unit: str
    baseline_low: float
    baseline_high: float
    flagged: bool

class PackedMatrix(BaseModel):
    shape: Tuple[int, int]
    encoding: Literal["u8_b64"] = "u8_b64"
    data: str

class TimingsMs(BaseModel):
    features: float
    model: float
    gradcam: float
    biomarkers: float
    total: float
    gateway: Optional[float] = None

class WindowResult(BaseModel):
    type: Literal["window_result"] = "window_result"
    session_id: str
    seq: int
    t_start_s: float
    t_end_s: float
    p_spoof: Optional[float] = None
    llr: Optional[float] = None
    score: Optional[float] = None
    risk_pct: float
    state: RiskState
    committed: bool
    decision_time_s: Optional[float] = None
    eta_to_decision_s: Optional[float] = None
    biomarkers: List[Biomarker]
    spec_new: PackedMatrix
    heatmap: Optional[PackedMatrix] = None
    attribution: Optional[Dict[str, Any]] = None
    timings_ms: TimingsMs
    client_seq_echo: int

class ReadyMessage(BaseModel):
    type: Literal["ready"] = "ready"
    model: str = "spoofcnn-v1"
    calibrated: bool = True
    window_s: float = 1.0
    hop_s: float = 0.5

class ErrorMessage(BaseModel):
    type: Literal["error"] = "error"
    code: str
    message: str

class FinalMessage(BaseModel):
    type: Literal["final"] = "final"
    session_id: str
    verdict: RiskState
    decision_time_s: Optional[float] = None
    summary: Dict[str, Any] = {}

class FileAnalysisResponse(BaseModel):
    duration_s: float
    verdict: RiskState
    decision_time_s: Optional[float] = None
    final_risk_pct: float
    windows: List[WindowResult]
