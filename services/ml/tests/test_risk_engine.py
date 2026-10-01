from app.risk_engine import RiskEngine, RiskConfig

def test_cloned_reaches_decision():
    engine = RiskEngine()
    states = []
    for i in range(5):
        t_end = (i + 1) * 0.5
        res = engine.update(0.95, t_end)
        states.append(res["state"])

    assert "CLONED" in states[:4], f"Expected CLONED within 4 windows, got {states}"
    assert engine.committed is True
    assert engine.decision_time_s is not None

def test_authentic_never_cloned():
    engine = RiskEngine()
    for i in range(10):
        t_end = (i + 1) * 0.5
        res = engine.update(0.05, t_end)
        assert res["state"] != "CLONED"

    assert engine.state == "AUTHENTIC"
    assert engine.committed is True

def test_alternating_no_commit():
    engine = RiskEngine()
    for i in range(20):
        t_end = (i + 1) * 0.5
        p = 0.4 if i % 2 == 0 else 0.6
        res = engine.update(p, t_end)
        assert res["committed"] is False

def test_hysteresis():
    engine = RiskEngine()
    # Drive into CLONED
    for i in range(5):
        engine.update(0.98, (i + 1) * 0.5)
    assert engine.state == "CLONED"

    # Single low score should NOT unlatch due to hysteresis
    res = engine.update(0.10, 3.0)
    assert res["state"] == "CLONED", f"Hysteresis failed, state unlatched immediately to {res['state']}"

    # Long run of 0.05 should eventually unlatch and shift to AUTHENTIC
    for i in range(10):
        engine.update(0.05, 3.5 + i * 0.5)
    assert engine.state == "AUTHENTIC"

def test_reset():
    engine = RiskEngine()
    for i in range(5):
        engine.update(0.95, (i + 1) * 0.5)
    assert engine.committed is True

    engine.reset()
    assert engine.S == 0.0
    assert engine.n == 0
    assert engine.state == "ANALYZING"
    assert engine.committed is False
    assert engine.decision_time_s is None
