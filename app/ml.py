"""
Advanced AI Defect Prediction Engine.
Features:
- Multi-Model Training & Benchmarking: Random Forest, Gradient Boosting, Logistic Regression.
- Model Evaluation Metrics: Accuracy, Precision, Recall, F1-Score, ROC-AUC.
- Explainable AI (XAI): Feature importance attribution and natural language explanation.
- Flexible Inference: Model selection (Ensemble, RF, GB, LR).
"""

from pathlib import Path
import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer

MODELS_DIR = Path("models")
MODEL_BUNDLE_PATH = MODELS_DIR / "defect_models_bundle.joblib"
BENCHMARK_CACHE_PATH = MODELS_DIR / "benchmark_cache.joblib"

FEATURES = ["loc", "complexity", "churn", "coupling", "code_smells"]

# Safe software engineering reference thresholds
SAFE_THRESHOLDS = {
    "loc": {"safe": 250, "high": 500, "unit": "lines"},
    "complexity": {"safe": 10.0, "high": 18.0, "unit": "McCabe score"},
    "churn": {"safe": 15, "high": 40, "unit": "revisions"},
    "coupling": {"safe": 6, "high": 12, "unit": "dependencies"},
    "code_smells": {"safe": 2, "high": 6, "unit": "detected smells"}
}


def _generate_synthetic_dataset(n=2500, seed=42):
    """
    Generates a realistic software metric defect dataset with non-linear relationships,
    interaction terms, noise, and class imbalance typical of real-world repositories (e.g. NASA MDP / PROMISE).
    """
    rng = np.random.default_rng(seed)
    
    # Software metrics distribution
    loc = rng.gamma(shape=2.5, scale=120, size=n).astype(int) + 15
    loc = np.clip(loc, 10, 2500)
    
    complexity = np.clip(1.0 + (loc / 80.0) + rng.normal(0, 2.5, n), 1.0, 45.0)
    churn = np.clip(rng.poisson(lam=12, size=n) + (loc // 120), 0, 100)
    coupling = np.clip(rng.poisson(lam=5, size=n) + (loc // 200), 0, 35)
    code_smells = np.clip((complexity // 6).astype(int) + (churn // 15).astype(int) + rng.poisson(lam=1, size=n), 0, 40)
    
    # Non-linear defect propensity score with metric interactions
    latent_defect_score = (
        0.0018 * loc +
        0.11 * complexity +
        0.035 * churn +
        0.065 * coupling +
        0.08 * code_smells +
        0.002 * (complexity * churn) + # Interaction: complex code that changes often has high defect risk
        rng.normal(0, 1.2, n) -
        3.8
    )
    
    # Binary defect label (approx 20-25% defective rate, realistic for empirical software engineering)
    y = (latent_defect_score > 0.0).astype(int)
    X = np.column_stack([loc, complexity, churn, coupling, code_smells])
    return X, y


def train_models():
    """
    Trains and evaluates Random Forest, Gradient Boosting, and Logistic Regression models.
    Saves the trained models and returns a comparative benchmark.
    """
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    X, y = _generate_synthetic_dataset()

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=42, stratify=y
    )

    models = {
        "rf": Pipeline([
            ("imputer", SimpleImputer(strategy="median")),
            ("classifier", RandomForestClassifier(
                n_estimators=160, max_depth=9, min_samples_split=4,
                class_weight="balanced", random_state=42
            ))
        ]),
        "gb": Pipeline([
            ("imputer", SimpleImputer(strategy="median")),
            ("classifier", GradientBoostingClassifier(
                n_estimators=140, learning_rate=0.07, max_depth=4,
                random_state=42
            ))
        ]),
        "lr": Pipeline([
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
            ("classifier", LogisticRegression(
                solver="liblinear", class_weight="balanced", max_iter=1000, random_state=42
            ))
        ])
    }

    comparison = {}
    fitted_models = {}

    for key, pipeline in models.items():
        pipeline.fit(X_train, y_train)
        y_pred = pipeline.predict(X_test)
        y_prob = pipeline.predict_proba(X_test)[:, 1]

        comparison[key] = {
            "name": "Random Forest" if key == "rf" else "Gradient Boosting" if key == "gb" else "Logistic Regression",
            "accuracy": round(float(accuracy_score(y_test, y_pred)), 4),
            "precision": round(float(precision_score(y_test, y_pred, zero_division=0)), 4),
            "recall": round(float(recall_score(y_test, y_pred, zero_division=0)), 4),
            "f1": round(float(f1_score(y_test, y_pred, zero_division=0)), 4),
            "roc_auc": round(float(roc_auc_score(y_test, y_prob)), 4)
        }
        fitted_models[key] = pipeline

    # Extract feature importances
    rf_clf = fitted_models["rf"].named_steps["classifier"]
    gb_clf = fitted_models["gb"].named_steps["classifier"]
    lr_clf = fitted_models["lr"].named_steps["classifier"]

    rf_imp = rf_clf.feature_importances_
    gb_imp = gb_clf.feature_importances_
    
    # Normalized absolute coefficients for Logistic Regression
    lr_abs = np.abs(lr_clf.coef_[0])
    lr_imp = lr_abs / (np.sum(lr_abs) if np.sum(lr_abs) > 0 else 1.0)

    # Ensemble average importance
    avg_imp = (rf_imp + gb_imp + lr_imp) / 3.0

    feature_importances = {
        feature: {
            "random_forest": round(float(rf_imp[i]), 3),
            "gradient_boosting": round(float(gb_imp[i]), 3),
            "logistic_regression": round(float(lr_imp[i]), 3),
            "ensemble_average": round(float(avg_imp[i]), 3)
        }
        for i, feature in enumerate(FEATURES)
    }

    # Sort features by overall importance
    ranked_features = sorted(
        FEATURES,
        key=lambda f: feature_importances[f]["ensemble_average"],
        reverse=True
    )

    benchmark_data = {
        "models": comparison,
        "feature_importances": feature_importances,
        "ranked_features": ranked_features,
        "sample_size": {
            "total": len(X),
            "training": len(X_train),
            "testing": len(X_test),
            "defect_ratio": round(float(np.mean(y)), 3)
        }
    }

    joblib.dump(fitted_models, MODEL_BUNDLE_PATH)
    joblib.dump(benchmark_data, BENCHMARK_CACHE_PATH)
    return benchmark_data


def get_models_bundle():
    """Retrieves trained models bundle, training if necessary."""
    if not MODEL_BUNDLE_PATH.exists() or not BENCHMARK_CACHE_PATH.exists():
        train_models()
    return joblib.load(MODEL_BUNDLE_PATH), joblib.load(BENCHMARK_CACHE_PATH)


def get_benchmark_results():
    """Returns cached or freshly trained multi-model comparison results."""
    _, benchmark = get_models_bundle()
    return benchmark


def predict(features, model_name="ensemble"):
    """
    Predicts defect probability and risk level.
    Supports model selection ('ensemble', 'rf', 'gb', 'lr').
    Returns probability, risk level, model used, and explainability breakdown.
    """
    models, benchmark = get_models_bundle()
    
    X = [[
        float(features.get("loc", 0)),
        float(features.get("complexity", 0)),
        float(features.get("churn", 0)),
        float(features.get("coupling", 0)),
        float(features.get("code_smells", 0))
    ]]

    if model_name == "rf":
        prob = float(models["rf"].predict_proba(X)[0][1])
        used_model = "Random Forest"
    elif model_name == "gb":
        prob = float(models["gb"].predict_proba(X)[0][1])
        used_model = "Gradient Boosting"
    elif model_name == "lr":
        prob = float(models["lr"].predict_proba(X)[0][1])
        used_model = "Logistic Regression"
    else:
        # Default: Ensemble average of all three models
        rf_p = float(models["rf"].predict_proba(X)[0][1])
        gb_p = float(models["gb"].predict_proba(X)[0][1])
        lr_p = float(models["lr"].predict_proba(X)[0][1])
        prob = float((rf_p * 0.40) + (gb_p * 0.40) + (lr_p * 0.20))
        used_model = "Multi-Model Ensemble (RF + GB + LR)"

    prob = max(0.01, min(0.99, prob))
    risk = "High" if prob >= 0.70 else "Medium" if prob >= 0.40 else "Low"

    # Compute Explainability
    explainability = explain_prediction(features, prob, risk, benchmark)

    return prob, risk, used_model, explainability


def explain_prediction(features, probability, risk, benchmark=None):
    """
    Explainable AI (XAI) feature attribution.
    Identifies which metrics contributed most heavily to the risk rating and provides
    human-readable engineering insights.
    """
    if benchmark is None:
        _, benchmark = get_models_bundle()

    importances = benchmark.get("feature_importances", {})
    contributions = []

    for feat in FEATURES:
        val = float(features.get(feat, 0))
        thresh = SAFE_THRESHOLDS[feat]
        weight = importances.get(feat, {}).get("ensemble_average", 0.2)

        # Ratio relative to safe threshold
        ratio = val / max(1.0, thresh["safe"])
        
        # Risk score calculation for this feature
        impact_score = min(1.0, (val / thresh["high"])) * weight
        severity = "Critical" if val >= thresh["high"] else "Warning" if val > thresh["safe"] else "Normal"

        explanation_msg = ""
        if feat == "complexity":
            if val >= thresh["high"]:
                explanation_msg = f"Cyclomatic complexity ({val:.1f}) is critically high (safe threshold is {thresh['safe']}). Dense branching significantly increases logic flaw probability."
            elif val > thresh["safe"]:
                explanation_msg = f"Complexity ({val:.1f}) exceeds the recommended threshold of {thresh['safe']}."
            else:
                explanation_msg = f"Complexity ({val:.1f}) is within standard maintainability limits."
        elif feat == "loc":
            if val >= thresh["high"]:
                explanation_msg = f"Large volume of code ({int(val)} LOC) increases cognitive load and defect surface area."
            elif val > thresh["safe"]:
                explanation_msg = f"Module size ({int(val)} LOC) is moderately large."
            else:
                explanation_msg = f"Module size ({int(val)} LOC) is compact and modular."
        elif feat == "churn":
            if val >= thresh["high"]:
                explanation_msg = f"High churn ({int(val)} revisions) indicates volatile code subject to frequent modifications and regression risk."
            elif val > thresh["safe"]:
                explanation_msg = f"Moderate revision velocity ({int(val)} changes)."
            else:
                explanation_msg = f"Low churn ({int(val)} changes) denotes a stable module."
        elif feat == "coupling":
            if val >= thresh["high"]:
                explanation_msg = f"High afferent/efferent coupling ({int(val)} dependencies) exposes this module to ripple effects from external failures."
            elif val > thresh["safe"]:
                explanation_msg = f"Moderate coupling ({int(val)} dependencies)."
            else:
                explanation_msg = f"Coupling ({int(val)} dependencies) is low and decoupled."
        elif feat == "code_smells":
            if val >= thresh["high"]:
                explanation_msg = f"Contains {int(val)} detected code smells (e.g. long functions, deep nesting, excess parameters)."
            elif val > thresh["safe"]:
                explanation_msg = f"Contains {int(val)} code smells requiring attention."
            else:
                explanation_msg = f"Clean code profile ({int(val)} smells)."

        contributions.append({
            "feature": feat,
            "label": feat.replace("_", " ").title(),
            "value": val,
            "safe_threshold": thresh["safe"],
            "high_threshold": thresh["high"],
            "unit": thresh["unit"],
            "severity": severity,
            "impact_score": round(float(impact_score), 4),
            "explanation": explanation_msg
        })

    # Sort by impact score descending
    contributions.sort(key=lambda x: x["impact_score"], reverse=True)
    top_drivers = [c for c in contributions if c["severity"] in ("Critical", "Warning")]

    summary_text = (
        f"Defect risk is rated as {risk} ({probability*100:.1f}% probability). "
    )
    if top_drivers:
        summary_text += f"Primary risk drivers: {', '.join(d['label'] for d in top_drivers[:2])}."
    else:
        summary_text += "All metrics are within safe engineering thresholds."

    return {
        "summary": summary_text,
        "contributions": contributions,
        "top_drivers": top_drivers
    }
