import math
from dataclasses import dataclass
from typing import Optional, Dict, Any

@dataclass
class RiskConfig:
    alpha: float = 0.02              # false CLONED rate budget
    beta: float = 0.02               # missed clone rate budget
    decay: float = 0.85              # leakiness: old evidence fades
    min_windows: int = 2             # warm-up before any state besides ANALYZING
    suspicious_frac: float = 0.25    # S above 0.25*upper -> SUSPICIOUS
    unlatch_frac: float = 0.30       # hysteresis: leave CLONED only if S < 0.30*upper
    llr_clip: float = 4.0
    prior_spoof: float = 0.5

def _logit(p: float) -> float:
    p = min(max(p, 1e-6), 1.0 - 1e-6)
    return math.log(p / (1.0 - p))

class RiskEngine:
    def __init__(self, cfg: RiskConfig = RiskConfig(), hop_s: float = 0.5):
        self.cfg = cfg
        self.hop_s = hop_s
        self.upper = math.log((1.0 - cfg.beta) / cfg.alpha)      # ~ +3.89
        self.lower = math.log(cfg.beta / (1.0 - cfg.alpha))      # ~ -3.89
        self.reset()

    def reset(self):
        self.S = 0.0
        self.n = 0
        self.state = "ANALYZING"
        self.committed = False
        self.decision_time_s: Optional[float] = None
        self._slope_ema = 0.0

    def update(self, p_spoof: float, t_end_s: float) -> Dict[str, Any]:
        c = self.cfg
        llr = _logit(p_spoof) - _logit(c.prior_spoof)
        llr = max(-c.llr_clip, min(c.llr_clip, llr))
        prev = self.S
        self.S = c.decay * self.S + llr
        self.S = max(2.0 * self.lower, min(2.0 * self.upper, self.S))
        self.n += 1
        self._slope_ema = 0.7 * self._slope_ema + 0.3 * ((self.S - prev) / self.hop_s)

        if self.n < c.min_windows:
            self.state = "ANALYZING"
        elif self.S >= self.upper:
            self.state = "CLONED"
            if not self.committed:
                self.committed, self.decision_time_s = True, t_end_s
        elif self.state == "CLONED" and self.S >= c.unlatch_frac * self.upper:
            pass  # hysteresis: stay CLONED
        elif self.S <= self.lower:
            self.state = "AUTHENTIC"
            if not self.committed:
                self.committed, self.decision_time_s = True, t_end_s
        elif self.S > c.suspicious_frac * self.upper:
            self.state = "SUSPICIOUS"
        else:
            self.state = "AUTHENTIC"  # tentative lean (committed stays False)

        eta: Optional[float] = None
        if self.state != "CLONED" and self._slope_ema > 0.05:
            eta = max(0.0, (self.upper - self.S) / self._slope_ema)
            eta = eta if eta < 10.0 else None

        risk_pct = 100.0 / (1.0 + math.exp(-self.S / 1.5))
        return dict(
            llr=llr,
            score=self.S,
            risk_pct=risk_pct,
            state=self.state,
            committed=self.committed,
            decision_time_s=self.decision_time_s,
            eta_to_decision_s=eta,
        )
