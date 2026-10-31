const $ = id => document.getElementById(id);
let authMode = "login", projects = [];
let riskChartInstance = null, benchmarkChartInstance = null, featureChartInstance = null;
let currentAstAnalysis = null;
let currentGeneratedPytest = null;

// Preset sample code snippets for demonstration
const SAMPLE_CODES = {
  complex_payment: `import hashlib
import time

class PaymentProcessor:
    def __init__(self, gateway_url, api_key, timeout=30):
        self.gateway_url = gateway_url
        self.api_key = api_key
        self.timeout = timeout
        self.retry_count = 0

    def process_transaction(self, user_id, amount, currency, payment_method, metadata=None):
        """Processes user payment transaction with fraud checks and boundary routing."""
        if amount <= 0:
            raise ValueError("Transaction amount must be positive.")
        if currency not in ["USD", "EUR", "GBP", "JPY", "CAD"]:
            raise ValueError(f"Unsupported currency: {currency}")
        
        # Branching logic and risk scoring
        fraud_risk = 0
        if amount > 10000:
            fraud_risk += 40
            if currency == "USD" and metadata and metadata.get("is_international"):
                fraud_risk += 30
            elif currency != "USD":
                fraud_risk += 20
        elif amount > 5000:
            fraud_risk += 15

        if payment_method == "crypto":
            fraud_risk += 25
            if not metadata or not metadata.get("wallet_verified"):
                return {"status": "declined", "reason": "Unverified crypto wallet"}
        elif payment_method == "credit_card":
            if metadata and metadata.get("cvv_attempts", 0) > 2:
                fraud_risk += 50
        elif payment_method == "wire_transfer":
            if amount < 100:
                raise ValueError("Wire transfers require minimum 100 threshold")

        if fraud_risk >= 70:
            return {"status": "flagged_fraud", "risk_score": fraud_risk}

        # Simulated authorization
        txn_hash = hashlib.sha256(f"{user_id}:{amount}:{time.time()}".encode()).hexdigest()
        return {"status": "approved", "txn_id": txn_hash, "amount": amount, "risk_score": fraud_risk}
`,
  auth_validator: `import jwt
import re

def validate_auth_token(token, secret_key, allowed_roles=None, require_mfa=False, ip_address=None):
    """Validates incoming authentication JWT headers and authorization scopes."""
    if not token or not isinstance(token, str):
        return {"valid": False, "error": "Token is missing or invalid type"}
    
    try:
        payload = jwt.decode(token, secret_key, algorithms=["HS256"])
        if "sub" not in payload or "exp" not in payload:
            return {"valid": False, "error": "Malformed claims"}
        
        user_role = payload.get("role", "guest")
        if allowed_roles:
            role_matched = False
            for r in allowed_roles:
                if r == user_role or (r == "admin" and payload.get("is_superuser")):
                    role_matched = True
                    break
            if not role_matched:
                return {"valid": False, "error": "Insufficient permissions"}

        if require_mfa:
            if not payload.get("mfa_verified"):
                if not payload.get("grace_period_active"):
                    return {"valid": False, "error": "MFA verification required"}

        if ip_address:
            token_ip = payload.get("origin_ip")
            if token_ip and token_ip != ip_address:
                return {"valid": False, "error": "IP binding mismatch detected"}

        return {"valid": True, "user_id": payload["sub"], "role": user_role}
    except Exception as exc:
        return {"valid": False, "error": str(exc)}
`,
  clean_math: `import math

def calculate_compound_interest(principal, annual_rate, years, compound_freq=12):
    """Calculates compound interest for financial projections."""
    if principal < 0 or annual_rate < 0 or years < 0:
        raise ValueError("Financial parameters cannot be negative.")
    rate_per_period = annual_rate / compound_freq
    total_periods = compound_freq * years
    amount = principal * math.pow(1 + rate_per_period, total_periods)
    return round(amount, 2)

def calculate_loan_emi(principal, annual_rate, months):
    """Calculates Equated Monthly Installment (EMI)."""
    if months <= 0:
        raise ValueError("Loan duration must be at least 1 month.")
    monthly_rate = annual_rate / (12 * 100)
    emi = (principal * monthly_rate * math.pow(1 + monthly_rate, months)) / (math.pow(1 + monthly_rate, months) - 1)
    return round(emi, 2)
`
};

async function api(url, options = {}) {
  const isForm = options.body instanceof FormData;
  const res = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: isForm ? (options.headers || {}) : { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2800);
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function showView(name) {
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  const viewElem = $(name + "View");
  if (viewElem) viewElem.classList.remove("hidden");
  
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === name));
  
  const titles = {
    dashboard: "Overview & Telemetry",
    projects: "Project Workspaces",
    ast: "Source Code AST Analyzer",
    prediction: "Defect Prediction & XAI",
    benchmark: "AI Model Benchmark & Comparison",
    testing: "Autonomous Intelligent Testing"
  };
  $("pageTitle").textContent = titles[name] || "Overview";

  if (name === "benchmark") {
    loadModelBenchmark();
  }
}

// Navigation event bindings
document.querySelectorAll(".nav-item").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));
document.querySelectorAll("[data-goto]").forEach(b => b.addEventListener("click", () => showView(b.dataset.goto)));

// Auth event bindings
document.querySelectorAll("[data-auth]").forEach(b => b.addEventListener("click", () => {
  authMode = b.dataset.auth;
  document.querySelectorAll("[data-auth]").forEach(x => x.classList.toggle("active", x === b));
  $("nameWrap").classList.toggle("hidden", authMode !== "register");
  $("authSubmit").textContent = authMode === "login" ? "Sign in →" : "Create account →";
  $("authMessage").textContent = "";
}));

$("authSubmit").addEventListener("click", async () => {
  const payload = { email: $("authEmail").value, password: $("authPassword").value };
  if (authMode === "register") payload.name = $("authName").value;
  try {
    await api("/api/" + authMode, { method: "POST", body: JSON.stringify(payload) });
    await startApp();
  } catch (e) {
    $("authMessage").textContent = e.message;
  }
});

$("logoutBtn").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  location.reload();
});

async function startApp() {
  const me = await api("/api/me");
  if (!me.logged_in) {
    $("authPanel").classList.remove("hidden");
    $("appContent").classList.add("hidden");
    return;
  }
  $("authPanel").classList.add("hidden");
  $("appContent").classList.remove("hidden");
  $("sideUser").textContent = me.name;
  if ($("sideRole")) $("sideRole").textContent = me.role || (me.is_admin ? "Lead Administrator" : "QA Engineer");
  if ($("sideAvatar")) {
    const initials = me.name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
    $("sideAvatar").textContent = initials || "MC";
  }
  await refreshDashboard();
  showView("dashboard");
}

async function refreshDashboard() {
  const d = await api("/api/dashboard");
  projects = d.projects;
  $("statProjects").textContent = d.stats.projects;
  $("statModules").textContent = d.stats.modules_analyzed;
  $("statRisk").textContent = d.stats.high_risk;
  $("statTests").textContent = d.stats.tests_recorded;

  $("recentList").innerHTML = d.recent_predictions.length
    ? d.recent_predictions.map(p => `
      <div class="recent-item">
        <div>
          <b>${escapeHtml(p.module_name)}</b>
          <small>${new Date(p.created_at).toLocaleDateString()} · ${p.probability}% defect probability</small>
        </div>
        <span class="risk-badge ${p.risk.toLowerCase()}">${p.risk}</span>
      </div>`).join("")
    : '<div class="empty">No predictions yet. Run your first analysis.</div>';

  const counts = [
    d.recent_predictions.filter(p => p.risk === "High").length,
    d.recent_predictions.filter(p => p.risk === "Medium").length,
    d.recent_predictions.filter(p => p.risk === "Low").length
  ];

  if (riskChartInstance) riskChartInstance.destroy();
  const hasData = counts.some(c => c > 0);
  riskChartInstance = new Chart($("riskChart"), {
    type: "doughnut",
    data: {
      labels: ["High risk", "Medium risk", "Low risk"],
      datasets: [{
        data: hasData ? counts : [0, 0, 1],
        backgroundColor: hasData ? ["#e2584c", "#f1a238", "#3ab285"] : ["#e2e8f0", "#e2e8f0", "#cbd5e1"],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8, font: { size: 11, family: "DM Sans" } } }
      }
    }
  });

  renderProjects();
  fillProjectSelects();
}

function renderProjects() {
  $("projectList").innerHTML = projects.length
    ? projects.map(p => `
      <div class="project-card">
        <h3>${escapeHtml(p.name)}</h3>
        <p>${escapeHtml(p.description || "No description provided.")}</p>
        <small class="muted">Workspace #${p.id}</small>
      </div>`).join("")
    : '<div class="empty">No projects yet. Create your first project above.</div>';
}

function fillProjectSelects() {
  ["predictionProject", "uploadProject", "testProject"].forEach(id => {
    $(id).innerHTML = projects.length
      ? projects.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("")
      : '<option value="">Default Workspace</option>';
  });
}

$("createProjectBtn").addEventListener("click", async () => {
  try {
    await api("/api/projects", {
      method: "POST",
      body: JSON.stringify({ name: $("projectName").value, description: $("projectDescription").value })
    });
    $("projectName").value = "";
    $("projectDescription").value = "";
    $("projectMessage").textContent = "Project workspace created.";
    await refreshDashboard();
  } catch (e) {
    $("projectMessage").textContent = e.message;
  }
});

// =========================================================
// 1. AST Code Analyzer Logic
// =========================================================
$("sampleCodeSelect").addEventListener("change", (e) => {
  const codeKey = e.target.value;
  if (SAMPLE_CODES[codeKey]) {
    $("astCodeInput").value = SAMPLE_CODES[codeKey];
    $("astMessage").textContent = `Loaded ${e.target.options[e.target.selectedIndex].text}`;
  }
});

$("astFileInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    $("astCodeInput").value = evt.target.result;
    $("astMessage").textContent = `Loaded file: ${file.name}`;
  };
  reader.readAsText(file);
});

$("analyzeAstBtn").addEventListener("click", async () => {
  const code = $("astCodeInput").value;
  if (!code.trim()) {
    $("astMessage").textContent = "Please enter or paste Python code.";
    return;
  }
  $("astMessage").textContent = "Parsing AST and computing code metrics...";
  try {
    const res = await api("/api/analyze-code", {
      method: "POST",
      body: JSON.stringify({ code })
    });

    currentAstAnalysis = res;
    const m = res.metrics;

    $("astSummary").textContent = res.summary;
    $("astLoc").textContent = m.loc;
    $("astSloc").textContent = `${m.sloc} SLOC, ${m.comment_lines} comments`;
    $("astComplexity").textContent = m.complexity;
    $("astMaxComplexity").textContent = `Max function: ${m.max_complexity}`;
    $("astChurn").textContent = m.churn;
    $("astCoupling").textContent = `${m.coupling} imports`;
    $("astSmellsCount").textContent = m.code_smells;
    $("astFuncClass").textContent = `${m.total_functions} / ${m.total_classes}`;

    $("astMetricsGrid").classList.remove("hidden");
    $("applyMetricsBtn").classList.remove("hidden");

    // Smells list
    const smellsBox = $("astSmellsBox");
    const smellsList = $("astSmellsList");
    if (res.smells && res.smells.length > 0) {
      smellsBox.classList.remove("hidden");
      smellsList.innerHTML = res.smells.map(s => {
        if (typeof s === "string") return `<div class="smell-row">⚠️ ${escapeHtml(s)}</div>`;
        return `
          <div class="smell-row">
            <b>[${s.severity}] ${escapeHtml(s.type)}:</b> ${escapeHtml(s.description)}
          </div>`;
      }).join("");
    } else {
      smellsBox.classList.remove("hidden");
      smellsList.innerHTML = `<div class="smell-row" style="color:#15803d;">✓ No architectural code smells detected. Clean modular structure.</div>`;
    }

    // Functions Table
    const funcsBox = $("astFunctionsBox");
    const tbody = $("astFunctionsTbody");
    if (res.functions && res.functions.length > 0) {
      funcsBox.classList.remove("hidden");
      tbody.innerHTML = res.functions.map(f => {
        const compBadge = f.complexity > 10 ? 'class="severity-pill severity-Critical"' : f.complexity > 5 ? 'class="severity-pill severity-Warning"' : 'class="severity-pill severity-Normal"';
        return `
          <tr>
            <td><b>${escapeHtml(f.name)}</b></td>
            <td><code>(${escapeHtml(f.arguments.join(", "))})</code></td>
            <td>${f.loc}</td>
            <td><span ${compBadge}>${f.complexity}</span></td>
            <td>${f.complexity > 10 ? 'High Risk' : 'Acceptable'}</td>
          </tr>`;
      }).join("");
    } else {
      funcsBox.classList.add("hidden");
    }

    $("astMessage").textContent = "AST Analysis completed successfully.";
    toast("Metrics extracted via AST parser!");
  } catch (e) {
    $("astMessage").textContent = e.message;
  }
});

$("applyMetricsBtn").addEventListener("click", () => {
  if (!currentAstAnalysis || !currentAstAnalysis.metrics) return;
  const m = currentAstAnalysis.metrics;
  $("loc").value = m.loc;
  $("complexity").value = m.complexity;
  $("churn").value = m.churn;
  $("coupling").value = m.coupling;
  $("code_smells").value = m.code_smells;

  // Infer module name from first function/class or filename
  if (currentAstAnalysis.classes && currentAstAnalysis.classes.length > 0) {
    $("moduleName").value = currentAstAnalysis.classes[0].name;
    $("testModule").value = currentAstAnalysis.classes[0].name;
  } else if (currentAstAnalysis.functions && currentAstAnalysis.functions.length > 0) {
    $("moduleName").value = currentAstAnalysis.functions[0].simple_name;
    $("testModule").value = currentAstAnalysis.functions[0].simple_name;
  } else {
    $("moduleName").value = "AstAnalyzedModule";
    $("testModule").value = "AstAnalyzedModule";
  }

  showView("prediction");
  toast("Metrics transferred to Defect Prediction form!");
});

// =========================================================
// 2. Defect Prediction & XAI Logic
// =========================================================
$("predictBtn").addEventListener("click", async () => {
  const payload = {
    project_id: Number($("predictionProject").value) || (projects[0] ? projects[0].id : 1),
    module_name: $("moduleName").value || "AnalyzedModule",
    model_name: $("modelSelect").value
  };
  ["loc", "complexity", "churn", "coupling", "code_smells"].forEach(k => payload[k] = Number($(k).value));

  try {
    const r = await api("/api/predict", { method: "POST", body: JSON.stringify(payload) });
    
    $("resultPlaceholder").classList.add("hidden");
    $("predictionResult").classList.remove("hidden");
    $("probability").textContent = r.probability + "%";
    $("riskBadge").textContent = r.risk + " risk";
    $("riskBadge").className = "risk-badge " + r.risk.toLowerCase();
    $("resultModule").textContent = r.module_name;
    $("resultModelBadge").textContent = r.model_used;
    $("riskMeter").style.width = r.probability + "%";

    // Explainable AI (XAI)
    if (r.explainability) {
      $("xaiSummary").textContent = r.explainability.summary;
      const drivers = r.explainability.contributions || [];
      $("xaiDriversList").innerHTML = drivers.map(d => `
        <div class="driver-item">
          <div class="driver-header">
            <span>${escapeHtml(d.label)} (${d.value} ${escapeHtml(d.unit)})</span>
            <span class="severity-pill severity-${d.severity}">${d.severity}</span>
          </div>
          <div class="driver-desc">${escapeHtml(d.explanation)}</div>
        </div>
      `).join("");
    }

    // Testing recommendations
    $("recommendations").innerHTML = r.recommendations.map(x => `
      <li><b>${escapeHtml(x.name)}</b> — ${escapeHtml(x.reason)}</li>
    `).join("");

    $("predictionMessage").textContent = `Prediction computed using ${r.model_used}.`;
    await refreshDashboard();
    toast(`Analysis complete: ${r.risk} risk`);
  } catch (e) {
    $("predictionMessage").textContent = e.message;
  }
});

$("generatePytestForModuleBtn").addEventListener("click", () => {
  const mod = $("resultModule").textContent || $("moduleName").value;
  const riskTxt = $("riskBadge").textContent.replace(" risk", "");
  $("testModule").value = mod;
  $("testRiskLevel").value = riskTxt;
  showView("testing");
  $("generatePytestBtn").click();
});

// Batch CSV upload
$("uploadBtn").addEventListener("click", async () => {
  const file = $("csvFile").files[0];
  if (!file) { $("uploadMessage").textContent = "Choose a CSV file first."; return; }
  const fd = new FormData();
  fd.append("file", file);
  fd.append("project_id", $("uploadProject").value || (projects[0] ? projects[0].id : 1));
  try {
    const r = await api("/api/upload-csv", { method: "POST", body: fd });
    $("uploadMessage").textContent = `Analyzed ${r.processed} modules successfully.`;
    await refreshDashboard();
    toast(`Processed batch of ${r.processed} modules!`);
  } catch (e) {
    $("uploadMessage").textContent = e.message;
  }
});

// =========================================================
// 3. AI Model Benchmark & Comparison Logic
// =========================================================
async function loadModelBenchmark() {
  try {
    const bm = await api("/api/model-benchmark");
    $("bmTotalSamples").textContent = bm.sample_size.total.toLocaleString();
    $("bmTrainSamples").textContent = bm.sample_size.training.toLocaleString();
    $("bmTestSamples").textContent = bm.sample_size.testing.toLocaleString();
    $("bmDefectRatio").textContent = (bm.sample_size.defect_ratio * 100).toFixed(1) + "%";

    // Table
    const tbody = $("benchmarkTableBody");
    const models = Object.keys(bm.models).map(k => bm.models[k]);
    tbody.innerHTML = models.map(m => `
      <tr>
        <td><b>${escapeHtml(m.name)}</b></td>
        <td>${(m.accuracy * 100).toFixed(2)}%</td>
        <td>${(m.precision * 100).toFixed(2)}%</td>
        <td>${(m.recall * 100).toFixed(2)}%</td>
        <td><b>${(m.f1 * 100).toFixed(2)}%</b></td>
        <td><b>${(m.roc_auc * 100).toFixed(2)}%</b></td>
      </tr>
    `).join("");

    // Performance comparison bar chart
    if (benchmarkChartInstance) benchmarkChartInstance.destroy();
    benchmarkChartInstance = new Chart($("benchmarkChart"), {
      type: "bar",
      data: {
        labels: models.map(m => m.name),
        datasets: [
          { label: "F1-Score (%)", data: models.map(m => (m.f1 * 100).toFixed(1)), backgroundColor: "#4169e1" },
          { label: "ROC-AUC (%)", data: models.map(m => (m.roc_auc * 100).toFixed(1)), backgroundColor: "#3ab285" }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "top", labels: { font: { size: 10, family: "DM Sans" } } } },
        scales: { y: { min: 50, max: 100 } }
      }
    });

    // Feature Importances chart
    const features = bm.ranked_features || Object.keys(bm.feature_importances);
    const avgWeights = features.map(f => (bm.feature_importances[f].ensemble_average * 100).toFixed(1));

    if (featureChartInstance) featureChartInstance.destroy();
    featureChartInstance = new Chart($("featureImportanceChart"), {
      type: "bar",
      data: {
        labels: features.map(f => f.replace("_", " ").toUpperCase()),
        datasets: [{
          label: "Ensemble Importance (%)",
          data: avgWeights,
          backgroundColor: ["#4169e1", "#5479eb", "#7894f0", "#9bb0f5", "#c2d0fa"]
        }]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    });

    // Feature importance list
    $("featureImportanceList").innerHTML = features.map(f => `
      <div style="display:flex;justify-content:space-between;font-size:11px;padding:4px 0;border-bottom:1px solid #f0f2f6;">
        <span>${escapeHtml(f.replace("_", " ").toUpperCase())}</span>
        <b>${(bm.feature_importances[f].ensemble_average * 100).toFixed(1)}% weight</b>
      </div>
    `).join("");

  } catch (e) {
    toast("Could not load benchmarks: " + e.message);
  }
}

$("retrainModelsBtn").addEventListener("click", async () => {
  $("retrainModelsBtn").disabled = true;
  $("retrainModelsBtn").textContent = "Retraining Models...";
  try {
    const res = await api("/api/train-models", { method: "POST" });
    await loadModelBenchmark();
    toast("All 3 models retrained and evaluated successfully!");
  } catch (e) {
    toast("Retraining failed: " + e.message);
  } finally {
    $("retrainModelsBtn").disabled = false;
    $("retrainModelsBtn").textContent = "↻ Retrain All Models";
  }
});

// =========================================================
// 4. Autonomous Pytest Generator & Testing Logic
// =========================================================
$("generatePytestBtn").addEventListener("click", async () => {
  const moduleName = $("testModule").value || "TestedModule";
  const riskLevel = $("testRiskLevel").value || "Medium";
  const functions = (currentAstAnalysis && currentAstAnalysis.functions) ? currentAstAnalysis.functions : [];
  const metrics = (currentAstAnalysis && currentAstAnalysis.metrics) ? currentAstAnalysis.metrics : {};
  const code = $("astCodeInput").value || "";

  $("generatePytestBtn").textContent = "Synthesizing Test Cases...";
  try {
    const res = await api("/api/generate-tests", {
      method: "POST",
      body: JSON.stringify({
        module_name: moduleName,
        risk_level: riskLevel,
        functions: functions,
        metrics: metrics,
        code: code
      })
    });

    currentGeneratedPytest = res;
    $("generatedSuiteTitle").textContent = res.filename;
    $("generatedSuiteSummary").textContent = res.summary;
    $("pytestCodeBlock").textContent = res.code;
    $("testSuiteStats").textContent = `${res.total_test_cases} test cases generated for ${res.functions_covered} function(s)`;

    toast(`Synthesized ${res.total_test_cases} test cases!`);
  } catch (e) {
    toast("Test synthesis failed: " + e.message);
  } finally {
    $("generatePytestBtn").textContent = "⚡ Synthesize Pytest Suite";
  }
});

$("copyPytestBtn").addEventListener("click", () => {
  if (!currentGeneratedPytest || !currentGeneratedPytest.code) {
    toast("Generate a test suite first.");
    return;
  }
  navigator.clipboard.writeText(currentGeneratedPytest.code);
  toast("Pytest code copied to clipboard!");
});

$("downloadPytestBtn").addEventListener("click", () => {
  if (!currentGeneratedPytest || !currentGeneratedPytest.code) {
    toast("Generate a test suite first.");
    return;
  }
  const blob = new Blob([currentGeneratedPytest.code], { type: "text/x-python;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = currentGeneratedPytest.filename || "test_suite.py";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast(`Downloaded ${currentGeneratedPytest.filename}`);
});

$("executeGeneratedBtn").addEventListener("click", async () => {
  if (!currentGeneratedPytest) {
    toast("Please synthesize a test suite first.");
    return;
  }
  try {
    const r = await api("/api/test-run", {
      method: "POST",
      body: JSON.stringify({
        project_id: Number($("testProject").value) || (projects[0] ? projects[0].id : 1),
        module_name: currentGeneratedPytest.module_name,
        test_name: `Pytest Autonomous Suite (${currentGeneratedPytest.filename})`,
        test_type: "pytest_execution"
      })
    });
    await refreshDashboard();
    toast(`Execution finished: ${r.status}!`);
  } catch (e) {
    toast(e.message);
  }
});

$("runTestBtn").addEventListener("click", async () => {
  try {
    const r = await api("/api/test-run", {
      method: "POST",
      body: JSON.stringify({
        project_id: Number($("testProject").value) || (projects[0] ? projects[0].id : 1),
        module_name: $("testModule").value,
        sample_value: $("testValue").value,
        test_type: "validation"
      })
    });
    const box = $("testResult");
    box.classList.remove("hidden", "fail");
    if (r.status === "Failed") box.classList.add("fail");
    box.textContent = `${r.status}: ${r.details}`;
    await refreshDashboard();
    toast(`Validation: ${r.status}`);
  } catch (e) {
    toast(e.message);
  }
});

$("reportBtn").addEventListener("click", () => {
  window.location.href = "/api/report.csv";
});

// Initialize application
startApp().catch(e => toast(e.message));
