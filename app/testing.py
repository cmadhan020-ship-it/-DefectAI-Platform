def recommend_tests(risk, metrics):
    """Transparent rule-based test suggestions; not an LLM-generated test suite."""
    tests = [
        {"name": "Unit tests", "reason": "Verify individual functions and methods."},
        {"name": "Boundary-value tests", "reason": "Check minimum, maximum and edge inputs."}
    ]
    if risk in ("High", "Medium") or metrics.get("complexity", 0) >= 10:
        tests.append({"name": "Branch coverage tests", "reason": "Exercise conditional paths."})
    if metrics.get("churn", 0) >= 20:
        tests.append({"name": "Regression tests", "reason": "Recheck existing behavior after code changes."})
    if metrics.get("coupling", 0) >= 8:
        tests.append({"name": "Integration tests", "reason": "Check interactions between connected modules."})
    if risk == "High":
        tests.append({"name": "Security and input-validation tests", "reason": "Prioritize validation of untrusted inputs."})
    return tests
