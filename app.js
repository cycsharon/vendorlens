// VendorLens - single-page app (no framework, no build step).

import { CONTROLS, controlById, FAMILIES, CATEGORIES, categoryByKey, PROFILE, RULES } from "./controls.js";
import { parseQuestionnaire, analyseSupplier, portfolio, followUpEmail, STATUS } from "./analyzer.js";
import { SAMPLE_SUPPLIERS, BANK } from "./samples.js";

// ---------------- state ----------------
const KEY = "vendorlens.v1";
const fresh = () => ({ added: [], decisions: {}, hidden: [] });
let S = (() => { try { return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return fresh(); } })();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* blocked */ } };

const app = document.getElementById("app");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = iso => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const addMonths = (iso, m) => { const d = new Date(iso); d.setMonth(d.getMonth() + m); return d.toISOString(); };
const st = s => `<span class="st ${s}">${STATUS[s].label}</span>`;
const ratingPill = r => `<span class="rating ${r}">${r}</span>`;
const famOf = id => FAMILIES.find(f => f.key === controlById[id].fam);
function toast(m) { const t = document.getElementById("toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2600); }

const allSuppliers = () => [...SAMPLE_SUPPLIERS, ...S.added].filter(s => !S.hidden.includes(s.id));
let cache = null;
const results = () => (cache ||= allSuppliers().map(analyseSupplier));
const invalidate = () => { cache = null; };
const resultById = id => results().find(r => r.supplier.id === id);
const heatClass = (score, status) => status === "redflag" ? "h1" : score == null ? "h0" : score >= 80 ? "h5" : score >= 60 ? "h4" : score >= 40 ? "h3" : "h2";

// ---------------- router ----------------
const routes = { "": dashboard, supplier: supplierView, add: addView, library, how };
const after = {};
async function render() {
  const [path, query] = location.hash.replace(/^#\/?/, "").split("?");
  const params = new URLSearchParams(query || "");
  document.querySelectorAll(".topbar nav a").forEach(a => a.classList.toggle("active", a.dataset.route === path));
  app.innerHTML = (routes[path] || dashboard)(params);
  after[path]?.(params);
}
window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });
const go = r => { location.hash = "#/" + r; };

// ---------------- DASHBOARD ----------------
let filters = { cat: "", rating: "" };
function dashboard() {
  const rs = results();
  const p = portfolio(rs);
  const shown = p.queue.filter(r => (!filters.cat || r.supplier.category === filters.cat) && (!filters.rating || r.rating === filters.rating));
  const dueSoon = rs.filter(r => new Date(addMonths(r.supplier.assessed, r.reviewMonths)) < new Date(Date.now() + 90 * 864e5)).length;
  return `
  <div class="intro">
    <b>What you're looking at:</b> the risk team at <b>${BANK}</b> (fictional) must check every outside supplier that uses AI, as HKMA outsourcing rules require.
    Each supplier filled in the bank's due-diligence questionnaire. <b>VendorLens read every answer</b>, matched it to ${CONTROLS.length} controls based on Hong Kong rules, and flagged what's risky.
    <ol><li>Start with the <b>review queue</b> below: riskiest suppliers first.</li><li>Click a supplier to see every answer judged, red flags, conditions and a ready-to-send follow-up email.</li><li>Or <a href="#/add">review a new supplier</a> by uploading its questionnaire (a sample file is provided).</li></ol>
  </div>

  <div class="grid g4" style="margin-bottom:18px">
    <div class="card"><div class="kpi">${p.total}</div><div class="kpi-label">AI suppliers reviewed</div></div>
    <div class="card"><div class="kpi" style="color:var(--red)">${p.counts.High}</div><div class="kpi-label">High risk · ${p.counts.Medium} medium · ${p.counts.Low} low</div></div>
    <div class="card"><div class="kpi" style="color:var(--red)">${p.redFlags}</div><div class="kpi-label">Red flags needing action</div></div>
    <div class="card"><div class="kpi">${p.followUps}</div><div class="kpi-label">Follow-up questions drafted · ${dueSoon} reviews due in 90 days</div></div>
  </div>

  <div class="card" style="margin-bottom:18px">
    <div class="spread"><div><h2 style="margin:0">Review queue</h2><small class="muted">Highest risk first. Click a row to open the full review.</small></div>
      <div class="row"><button class="btn small" data-act="export-csv">Download results (CSV)</button><button class="btn small" data-act="reset" title="Remove suppliers you added and analyst decisions">Reset demo</button></div></div>
    <div class="filters" style="margin-top:10px">
      <label class="field">Category<select id="f-cat"><option value="">All categories</option>${CATEGORIES.map(c => `<option value="${c.key}" ${filters.cat === c.key ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
      <label class="field">Risk<select id="f-rating"><option value="">All</option>${["High", "Medium", "Low"].map(r => `<option ${filters.rating === r ? "selected" : ""}>${r}</option>`).join("")}</select></label>
    </div>
    <div style="overflow:auto"><table><thead><tr><th>Supplier</th><th>Category</th><th>Built-in risk</th><th class="num">Answer quality</th><th>Overall risk</th><th>Red flags</th><th>Recommendation</th><th>Analyst decision</th><th>Next review</th></tr></thead><tbody>
      ${shown.map(r => { const d = S.decisions[r.supplier.id]; return `<tr class="clickable" data-href="supplier?id=${r.supplier.id}">
        <td><b>${esc(r.supplier.name)}</b><br><small class="muted">${esc(r.supplier.service || "")}</small></td>
        <td><small>${esc(r.category.name)}</small></td>
        <td><small>${r.inherent.level}</small></td>
        <td class="num">${r.controlScore}</td>
        <td>${ratingPill(r.rating)}</td>
        <td>${r.redFlags.length ? `<span class="st redflag">${r.redFlags.length}</span>` : `<span class="muted">–</span>`}</td>
        <td><span class="rec ${r.recommendation.key}">${r.recommendation.short}</span></td>
        <td>${d ? `<small><b>${esc(d.label)}</b><br>${fmtDate(d.at)}</small>` : `<small class="muted">Pending</small>`}</td>
        <td><small>${fmtDate(addMonths(r.supplier.assessed, r.reviewMonths))}</small></td></tr>`; }).join("") || `<tr><td colspan="9" class="muted">No suppliers match these filters.</td></tr>`}
    </tbody></table></div>
  </div>

  <div class="card" style="margin-bottom:18px">
    <h2 style="margin:0">Where each supplier is weak</h2><small class="muted">Each cell is the supplier's score for that area, weighted by what matters for its category. Click a row to drill in.</small>
    <div style="overflow:auto;margin-top:10px"><table class="heat"><thead><tr><th class="sup">Supplier</th>${FAMILIES.map(f => `<th>${esc(f.name)}</th>`).join("")}</tr></thead><tbody>
      ${p.queue.map(r => `<tr class="clickable" data-href="supplier?id=${r.supplier.id}"><td class="name">${esc(r.supplier.name)} ${ratingPill(r.rating)}</td>
        ${r.families.map(f => { const red = Object.values(r.controls).some(c => c.status === "redflag" && controlById[c.id].fam === f.key);
          return `<td class="${red ? "h1" : heatClass(f.score)}" title="${esc(f.name)}: ${f.score ?? "not relevant"}">${red ? "⚑ " : ""}${f.score ?? "–"}</td>`; }).join("")}</tr>`).join("")}
    </tbody></table></div>
    <div class="legend"><span><i class="h5"></i>80+ strong</span><span><i class="h4"></i>60–79 adequate</span><span><i class="h3"></i>40–59 weak</span><span><i class="h2"></i>below 40 gap</span><span><i class="h1"></i>⚑ red flag</span><span><i class="h0"></i>not relevant</span></div>
  </div>

  <div class="grid g2">
    <div class="card"><h3>Most common gaps across all suppliers</h3><p class="cite">Controls that matter for the supplier's category but are weak, missing or red-flagged. Fix these through standard contract clauses.</p>
      <div class="hbars gaps">${p.commonGaps.slice(0, 8).map(g => `<div class="hbar" title="${esc(g.suppliers.join(", "))}"><div class="hbar-label">${esc(g.name)}</div><div class="hbar-track"><div class="hbar-fill" style="width:${(g.count / Math.max(1, g.of)) * 100}%;background:${famOf(g.id).color}"></div></div><div class="hbar-val">${g.count} of ${g.of}</div></div>`).join("")}</div></div>
    <div class="card"><h3>Risk matrix</h3><p class="cite">How risky the service is (rows) against how good the answers are (columns). The top-left corner is the danger zone.</p>${matrix(rs)}</div>
  </div>`;
}
after[""] = () => {
  document.getElementById("f-cat").addEventListener("change", e => { filters.cat = e.target.value; render(); });
  document.getElementById("f-rating").addEventListener("change", e => { filters.rating = e.target.value; render(); });
};

function matrix(rs) {
  const rows = [["High", "High / critical service"], ["Medium", "Medium-risk service"], ["Low", "Low-risk service"]];
  const cols = [[0, 50, "Weak answers (<50)"], [50, 75, "Fair answers (50–74)"], [75, 101, "Good answers (75+)"]];
  const lvl = r => (r.inherent.level === "Critical" || r.inherent.level === "High") ? "High" : r.inherent.level;
  const tone = (ri, ci) => (ri + (2 - ci)) >= 3 ? "h2" : (ri + (2 - ci)) === 2 ? "h3" : "h4";
  return `<table class="heat matrix"><thead><tr><th></th>${cols.map(c => `<th>${c[2]}</th>`).join("")}</tr></thead><tbody>
    ${rows.map(([key, label], ri) => `<tr><th class="sup">${label}</th>${cols.map(([lo, hi], ci) => {
      const here = rs.filter(r => lvl(r) === key && r.controlScore >= lo && r.controlScore < hi);
      return `<td class="${tone(2 - ri, ci)}">${here.map(r => `<a href="#/supplier?id=${r.supplier.id}">${esc(r.supplier.name)}${r.redFlags.length ? " ⚑" : ""}</a>`).join("<br>") || "–"}</td>`; }).join("")}</tr>`).join("")}
  </tbody></table>`;
}

// ---------------- SUPPLIER ----------------
function supplierView(params) {
  const r = resultById(params.get("id"));
  if (!r) return `<div class="card empty"><h2>Supplier not found</h2><a class="btn primary" href="#/">Back to dashboard</a></div>`;
  const s = r.supplier, d = S.decisions[s.id];
  const byFam = FAMILIES.map(f => ({ f, cs: CONTROLS.filter(c => c.fam === f.key).map(c => r.controls[c.id]).filter(c => c.weight > 0 || c.responses.length) })).filter(x => x.cs.length);
  const strong = Object.values(r.controls).filter(c => c.weight && (c.status === "strong")).length;
  return `
  <div class="page-head spread"><div><a href="#/" class="muted">← Dashboard</a><h1 style="margin-top:6px">${esc(s.name)}</h1>
    <p class="muted" style="margin:0">${esc(r.category.name)} · ${esc(s.service || "")} · questionnaire received ${fmtDate(s.assessed)}</p></div>
    <div class="row"><button class="btn" data-act="download-report" data-id="${s.id}">Download report</button>${s.custom ? `<button class="btn danger" data-act="delete" data-id="${s.id}">Remove</button>` : ""}</div></div>

  <div class="grid g4" style="margin-bottom:18px">
    <div class="card"><div class="kpi-label">Overall risk</div><div style="margin:6px 0">${ratingPill(r.rating)}</div><small class="muted">${esc(r.ratingReasons.join(" · "))}</small></div>
    <div class="card"><div class="kpi-label">Recommendation</div><div class="rec ${r.recommendation.key}" style="font-size:1.05rem;margin:6px 0">${r.recommendation.label}</div><small class="muted">Re-review in ${r.reviewMonths} months</small></div>
    <div class="card"><div class="kpi-label">Answer quality</div><div class="big-num">${r.controlScore}<small style="font-size:1rem">/100</small></div><small class="muted">${strong} strong · ${r.issues.length} to follow up · ${r.coverage.asked}/${r.coverage.needed} needed controls covered</small></div>
    <div class="card"><div class="kpi-label">Built-in risk of the service</div><div class="big-num" style="font-size:1.6rem">${r.inherent.level}</div>
      <small class="muted">${PROFILE.filter(p => s.profile?.[p.key]).map(p => esc(p.label)).join(" · ") || "No high-risk features"}</small></div>
  </div>

  ${r.redFlags.length ? `<div class="card" style="margin-bottom:18px;border-color:#f0c2c8"><h2 style="color:var(--red);margin-top:0">⚑ Red flags (${r.redFlags.length})</h2>
    ${r.redFlags.map(f => `<div class="flag-box"><b>${esc(controlById[f.id].name)}:</b> ${esc(f.text)}<div class="quote">"${esc(f.quote)}"</div><div class="cite">Relevant rules: ${controlById[f.id].rules.map(k => esc(RULES[k].short)).join(" · ")}</div></div>`).join("")}</div>` : ""}

  <div class="grid g2" style="margin-bottom:18px;align-items:start">
    <div class="card"><h3>Summary for the risk committee</h3>${summary(r)}
      <h3 style="margin-top:16px">Analyst decision</h3>
      ${d ? `<div class="callout" style="margin-bottom:8px"><b>${esc(d.label)}</b> on ${fmtDate(d.at)}${d.note ? `: ${esc(d.note)}` : ""}</div>` : `<p class="cite">VendorLens recommends; a person decides.</p>`}
      <input type="text" id="note" placeholder="Note (optional), e.g. approved subject to clause 7" style="margin-bottom:8px">
      <div class="decision-row">${["Approve", "Approve with conditions", "Request more information", "Reject"].map(l => `<button class="btn small ${l === "Reject" ? "danger" : ""}" data-act="decide" data-id="${s.id}" data-label="${l}">${l}</button>`).join("")}</div></div>
    <div class="card"><div class="spread"><h3 style="margin:0">Follow-up email (drafted)</h3><button class="btn small primary" data-act="copy-email" data-id="${s.id}">Copy email</button></div>
      ${r.followUps.length ? `<p class="cite">Covers every important control that was weak, vague, missing or red-flagged. Replaces rounds of back-and-forth.</p><pre class="email">${esc(followUpEmail(r, BANK))}</pre>` : `<p class="muted">No follow-up needed: all important controls are adequately answered.</p>`}</div>
  </div>

  ${r.conditions.length ? `<div class="card" style="margin-bottom:18px"><h3>Conditions to put in the contract before approval</h3><table><tbody>
    ${r.conditions.map(c => `<tr><td>${c.critical ? `<span class="st gap">Must have</span>` : `<span class="st weak">Should have</span>`}</td><td><b>${esc(controlById[c.id].name)}</b><br>${esc(c.text)}</td><td class="cite">${controlById[c.id].rules.map(k => esc(RULES[k].short)).join("<br>")}</td></tr>`).join("")}
  </tbody></table></div>` : ""}

  <div class="card" style="margin-bottom:18px"><h2 style="margin-top:0">Every control, judged</h2>
    <p class="muted">Each of the bank's questions was matched to a control. VendorLens judged the answer: does it confirm the control, give specifics and evidence, or is it vague, only planned, or a red flag? Importance depends on the supplier's category.</p>
    ${byFam.map(({ f, cs }) => `<h3 style="margin-top:16px"><span class="swatch" style="background:${f.color}"></span> ${esc(f.name)}</h3>
      <table><thead><tr><th style="width:22%">Control</th><th style="width:9%">Importance</th><th style="width:10%">Result</th><th>Supplier's answer and why</th><th style="width:16%">Rules</th></tr></thead><tbody>
      ${cs.map(c => { const ctl = controlById[c.id], b = c.best;
        return `<tr class="ctrl-row"><td><b>${esc(ctl.name)}</b><br><small class="muted">Good looks like: ${esc(ctl.good)}</small></td>
          <td><small>${["Not needed", "Useful", "Important", "Critical"][c.weight]}</small></td><td>${st(c.status)}${c.score && c.status !== "redflag" ? `<br><small class="muted">${c.score}/100</small>` : ""}</td>
          <td>${b ? `<div class="quote">"${esc(b.a || "(left blank)")}"</div><small class="mapped">Asked as: "${esc(b.q)}" · match ${Math.round(b.confidence * 100)}%</small>${b.assessment.signals.map(x => `<span class="sig ${x.t}">${esc(x.m)}</span>`).join("")}`
            : c.weight ? `<span class="sig bad">The questionnaire didn't cover this. Ask the supplier.</span>` : `<small class="muted">Not needed for this category</small>`}</td>
          <td class="cite">${ctl.rules.map(k => esc(RULES[k].short)).join("<br>")}</td></tr>`; }).join("")}
      </tbody></table>`).join("")}
  </div>
  ${r.unmapped ? `<div class="card"><h3>Questions not linked to a control (${r.unmapped})</h3><p class="cite">These didn't match any control in the library. An analyst should read them.</p>
    ${r.responses.filter(x => !x.controlId).map(x => `<p><b>${esc(x.q)}</b><br>${esc(x.a)}</p>`).join("")}</div>` : ""}`;
}

function summary(r) {
  const s = r.supplier;
  const bad = r.issues.slice(0, 4).map(c => controlById[c.id].name.toLowerCase());
  const good = Object.values(r.controls).filter(c => c.weight >= 2 && c.status === "strong").slice(0, 3).map(c => controlById[c.id].name.toLowerCase());
  return `<p>${esc(s.name)} provides a <b>${esc(r.category.name.toLowerCase())}</b> service with <b>${r.inherent.level.toLowerCase()}</b> built-in risk.
    Its answers score <b>${r.controlScore}/100</b>, giving an overall rating of <b>${r.rating}</b>.</p>
    ${r.redFlags.length ? `<p style="color:var(--red)"><b>Red flags:</b> ${r.redFlags.map(f => esc(f.text.toLowerCase())).join("; ")}.</p>` : ""}
    ${good.length ? `<p><b>Strengths:</b> ${esc(good.join(", "))}.</p>` : ""}
    ${bad.length ? `<p><b>Main gaps:</b> ${esc(bad.join(", "))}${r.issues.length > 4 ? `, and ${r.issues.length - 4} more` : ""}.</p>` : ""}
    <p><b>Recommendation:</b> ${esc(r.recommendation.label)}. Re-review in ${r.reviewMonths} months.</p>`;
}

function reportHtml(r) {
  const rows = CONTROLS.map(c => r.controls[c.id]).filter(c => c.weight).map(c => `<tr><td>${esc(controlById[c.id].name)}</td><td>${STATUS[c.status].label}</td><td>${esc(c.best?.a || "")}</td></tr>`).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(r.supplier.name)}: AI supplier review</title><style>body{font-family:Calibri,Arial,sans-serif;max-width:900px;margin:30px auto;color:#1b2433}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:6px;font-size:13px;vertical-align:top}th{background:#14213d;color:#fff}</style></head><body>
    <h1>${esc(r.supplier.name)}: AI supplier review</h1><p>${BANK} · Third-Party Risk Management · generated by VendorLens on ${fmtDate(new Date().toISOString())}</p>
    ${summary(r)}<h2>Red flags</h2>${r.redFlags.length ? `<ul>${r.redFlags.map(f => `<li>${esc(f.text)}: "${esc(f.quote)}"</li>`).join("")}</ul>` : "<p>None.</p>"}
    <h2>Conditions</h2>${r.conditions.length ? `<ul>${r.conditions.map(c => `<li>${esc(controlById[c.id].name)}: ${esc(c.text)}</li>`).join("")}</ul>` : "<p>None.</p>"}
    <h2>Controls</h2><table><tr><th>Control</th><th>Result</th><th>Supplier answer</th></tr>${rows}</table>
    <h2>Follow-up email</h2><pre style="white-space:pre-wrap">${esc(followUpEmail(r, BANK))}</pre>
    <p style="font-size:11px;color:#777">Prototype output. Rule summaries are paraphrased and are not legal advice. A person must review before any decision.</p></body></html>`;
}

// ---------------- ADD SUPPLIER ----------------
function addView() {
  return `
  <div class="page-head"><div class="eyebrow">Review a new supplier</div><h1>Upload a supplier's questionnaire</h1>
  <p class="lead">Tell VendorLens what the supplier does, then upload its answers. VendorLens matches every question to a control, judges every answer and produces a full review in seconds.</p></div>
  <div class="card">
    <div class="wizard-step"><h3><span class="n">1</span> Supplier details</h3>
      <div class="grid g2"><label class="field">Supplier name<input type="text" id="w-name" placeholder="e.g. QuickChat Ltd"></label>
      <label class="field">What service will they provide?<input type="text" id="w-service" placeholder="e.g. WhatsApp chatbot for card enquiries"></label></div></div>
    <div class="wizard-step"><h3><span class="n">2</span> Category <small class="muted" style="font-weight:400">decides which controls matter most</small></h3>
      <div class="cat-grid">${CATEGORIES.map((c, i) => `<label class="cat-opt"><input type="radio" name="w-cat" value="${c.key}" ${i === 0 ? "checked" : ""}><span><b>${esc(c.name)}</b><small>${esc(c.desc)}</small></span></label>`).join("")}</div></div>
    <div class="wizard-step"><h3><span class="n">3</span> How risky is the service itself? <small class="muted" style="font-weight:400">tick all that apply</small></h3>
      <div class="check-list">${PROFILE.map(p => `<label><input type="checkbox" class="w-prof" value="${p.key}"> ${esc(p.label)}</label>`).join("")}</div></div>
    <div class="wizard-step"><h3><span class="n">4</span> The supplier's answers</h3>
      <p class="muted">Upload a <b>CSV</b> (columns: Question, Answer), <b>copy and paste straight from Excel</b>, or type <code>Q:</code> / <code>A:</code> lines. Any wording works: VendorLens matches the bank's own questions to its controls.</p>
      <div class="grid g2" style="gap:12px">
        <div class="dropzone" id="drop"><b>Drop a .csv or .txt file</b><br><small class="muted">or</small><br><input type="file" id="w-file" accept=".csv,.txt,.tsv,text/csv,text/plain" style="margin-top:6px">
          <div style="margin-top:10px" class="row" ><button class="btn small" data-act="load-sample">Use a sample questionnaire</button><a class="btn small" href="sample-questionnaire.csv" download>Download sample CSV</a></div></div>
        <textarea id="w-text" placeholder="Question,Answer&#10;Do you use our data to train AI?,No. Client data is never used for training.&#10;..." style="min-height:190px"></textarea>
      </div>
      <div id="w-preview" class="cite" style="margin-top:8px"></div></div>
    <div class="row"><button class="btn primary" data-act="analyse">Analyse supplier →</button><span class="muted">Runs in your browser. Nothing is uploaded.</span></div>
  </div>`;
}
after.add = () => {
  const drop = document.getElementById("drop"), ta = document.getElementById("w-text");
  const preview = () => { const n = parseQuestionnaire(ta.value).length; document.getElementById("w-preview").textContent = n ? `${n} questions detected.` : ""; };
  const load = f => f && f.text().then(t => { ta.value = t; preview(); toast(`Loaded ${f.name}`); });
  document.getElementById("w-file").addEventListener("change", e => load(e.target.files[0]));
  ["dragover", "dragenter"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("drag"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("drag"); }));
  drop.addEventListener("drop", e => load(e.dataTransfer.files[0]));
  ta.addEventListener("input", preview);
};

async function loadSample() {
  const t = await fetch("sample-questionnaire.csv").then(r => r.text()).catch(() => "");
  document.getElementById("w-text").value = t;
  document.getElementById("w-name").value ||= "QuickChat Ltd";
  document.getElementById("w-service").value ||= "WhatsApp chatbot answering credit card enquiries";
  document.querySelector('input[name="w-cat"][value="chatbot"]').checked = true;
  document.querySelectorAll(".w-prof").forEach(c => { c.checked = ["personalData", "customerFacing", "overseas"].includes(c.value); });
  document.getElementById("w-preview").textContent = `${parseQuestionnaire(t).length} questions detected.`;
  toast("Sample loaded. Click \"Analyse supplier\"");
}
function analyseNew() {
  const name = document.getElementById("w-name").value.trim();
  const responses = parseQuestionnaire(document.getElementById("w-text").value);
  if (!name) return toast("Enter the supplier's name");
  if (responses.length < 3) return toast("Add the supplier's answers (at least 3 questions)");
  const profile = Object.fromEntries([...document.querySelectorAll(".w-prof")].map(c => [c.value, c.checked]));
  const sup = { id: "custom-" + Date.now(), custom: true, name, service: document.getElementById("w-service").value.trim(),
    category: document.querySelector('input[name="w-cat"]:checked').value, profile, assessed: new Date().toISOString().slice(0, 10), responses };
  S.added.push(sup); save(); invalidate();
  go("supplier?id=" + sup.id);
  toast(`${responses.length} answers analysed`);
}

// ---------------- LIBRARY ----------------
function library() {
  return `
  <div class="page-head"><div class="eyebrow">Transparent by design</div><h1>Rules and controls</h1>
  <p class="lead">Every judgement VendorLens makes traces back to a control, and every control traces back to Hong Kong rules. Nothing is a black box.</p></div>
  <div class="card" style="margin-bottom:18px"><h2 style="margin-top:0">The 5 Hong Kong rules we check against</h2>
    <table><tbody>${Object.values(RULES).map(r => `<tr><td style="width:28%"><b>${esc(r.name)}</b></td><td>${esc(r.summary)}</td></tr>`).join("")}</tbody></table>
    <p class="cite" style="margin-top:8px">Short paraphrased summaries for this prototype, not legal text or legal advice. Next: SFC GenAI circular, HKMA TM-G-1 / OR-2, ISO/IEC 42001 and ISO 27001.</p></div>
  <div class="card" style="margin-bottom:18px"><h2 style="margin-top:0">${CONTROLS.length} controls</h2>
    ${FAMILIES.map(f => `<h3 style="margin-top:14px"><span class="swatch" style="background:${f.color}"></span> ${esc(f.name)}</h3>
      <table><tbody>${CONTROLS.filter(c => c.fam === f.key).map(c => `<tr><td style="width:24%"><b>${c.id} · ${esc(c.name)}</b></td><td>${esc(c.good)}<div class="cite">Follow-up if weak: ${esc(c.followUp)}</div></td><td class="cite" style="width:18%">${c.rules.map(k => esc(RULES[k].short)).join("<br>")}</td></tr>`).join("")}</tbody></table>`).join("")}</div>
  <div class="card"><h2 style="margin-top:0">What matters for each category</h2><p class="muted">3 = critical, 2 = important, 1 = useful, blank = not needed. A chatbot is judged hard on disclosure and GenAI safety; a cloud host on security and recovery.</p>
    <div style="overflow:auto"><table class="heat"><thead><tr><th class="sup">Control</th>${CATEGORIES.map(c => `<th title="${esc(c.name)}">${esc(c.name.split(/[ /(]/)[0])}</th>`).join("")}</tr></thead><tbody>
    ${CONTROLS.map(c => `<tr><td class="name">${c.id} · ${esc(c.name)}</td>${CATEGORIES.map(cat => { const w = cat.weights[c.id]; return `<td class="${w === 3 ? "h2" : w === 2 ? "h3" : w === 1 ? "h4" : "h0"}">${w || ""}</td>`; }).join("")}</tr>`).join("")}
    </tbody></table></div></div>`;
}

// ---------------- HOW IT WORKS ----------------
function how() {
  return `
  <div class="page-head"><div class="eyebrow">How it works</div><h1>From a pile of questionnaires to clear decisions</h1>
  <p class="lead">Under HKMA outsourcing rules, banks must check every outside supplier, and the HKMA's AI Principles add checks on AI vendors. Today that means reading long questionnaires by hand. VendorLens turns them into data.</p></div>
  <div class="grid g2" style="margin-bottom:18px">
    <div class="card"><h3>Today</h3><ol>
      <li>Send each supplier a long questionnaire (often 100+ questions) by email and Excel.</li>
      <li>Security, privacy, compliance and AI specialists each read the answers by hand.</li>
      <li>Weeks of follow-up emails for vague or missing answers.</li>
      <li>Each analyst judges differently; no view across all suppliers.</li>
      <li>Repeat every year.</li></ol></div>
    <div class="card"><h3>With VendorLens</h3><ol>
      <li>Upload the questionnaire in any format and wording.</li>
      <li>AI matches each question to a control and judges every answer in seconds.</li>
      <li>Red flags, conditions and a follow-up email are drafted automatically.</li>
      <li>Same ${CONTROLS.length} HK-mapped controls for every supplier; one dashboard for all.</li>
      <li>Analysts spend their time on the riskiest suppliers, and a person makes every decision.</li></ol></div>
  </div>
  <div class="card" style="margin-bottom:18px"><h3>The engine, step by step</h3>
    <div class="pipeline" style="grid-template-columns:repeat(5,1fr)">
      ${[["1 Parse", "Reads CSV, Excel copy-paste or Q:/A: text"], ["2 Match", "BM25 search links each of the bank's questions to one of 24 controls"], ["3 Judge", "Checks stance, specifics, evidence, vague wording and red-flag patterns"], ["4 Score", "Weights controls by category; combines with the service's built-in risk"], ["5 Decide", "Rating, recommendation, conditions, follow-up email; a person approves"]]
        .map(([a, b]) => `<div class="pipe done"><b>${a}</b>${b}</div>`).join("")}
    </div></div>
  <div class="grid g2" style="margin-bottom:18px">
    <div class="card"><h3>How an answer is judged</h3><ul>
      <li><b>Stance:</b> does it say yes, partly, only planned, or no?</li>
      <li><b>Specifics:</b> frequencies, numbers, standards (ISO 27001, SOC 2), named roles, dates raise the score.</li>
      <li><b>Evidence:</b> pointing to a report, policy or certificate raises it more.</li>
      <li><b>Vague wording</b> ("regularly", "industry standard", "as appropriate") lowers it.</li>
      <li><b>Shifting responsibility</b> ("we rely on our provider") lowers it.</li>
      <li><b>Red flags:</b> e.g. bank data used to train AI, staff pasting code into ChatGPT, shared accounts, notification in 7+ days.</li></ul></div>
    <div class="card"><h3>How the rating is set</h3><ul>
      <li><b>Answer quality</b> = weighted average of control scores (critical controls count 3×).</li>
      <li><b>Built-in risk</b> = what the service touches: customer data, customer-facing, decisions, critical, offshore.</li>
      <li><b>Risk score</b> = built-in risk × weakness of answers, plus red flags.</li>
      <li><b>Floors:</b> any red flag, or 3+ critical gaps, means High: serious gaps can't be averaged away.</li>
      <li><b>Recommendation:</b> Approve · Approve with conditions · Escalate · Hold.</li></ul></div>
  </div>
  <div class="card"><h3>Prototype today, production tomorrow</h3><table><thead><tr><th>Part</th><th>Prototype</th><th>Production</th></tr></thead><tbody>
    <tr><td>Matching questions</td><td>BM25 keyword retrieval, in the browser</td><td>Hybrid keyword + embedding search; learns from analyst corrections</td></tr>
    <tr><td>Judging answers</td><td>Transparent rules: stance, specifics, evidence, vagueness, red flags</td><td>Privately hosted language model, with the same rules as a check and human review</td></tr>
    <tr><td>Documents</td><td>CSV / Excel paste / text</td><td>Excel, PDF and Word questionnaires plus attached evidence</td></tr>
    <tr><td>Rules</td><td>5 HK rules, paraphrased</td><td>Full rule texts maintained by compliance staff; SFC, ISO and more</td></tr>
    <tr><td>Data</td><td>Stays in the browser</td><td>Bank-hosted or private HK cloud; integrates with vendor-risk systems</td></tr>
  </tbody></table></div>`;
}

// ---------------- events ----------------
function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
}
app.addEventListener("click", e => {
  const row = e.target.closest("[data-href]");
  const el = e.target.closest("[data-act]");
  if (!el && row) { go(row.dataset.href); return; }
  if (!el) return;
  const act = el.dataset.act;
  if (act === "load-sample") loadSample();
  else if (act === "analyse") analyseNew();
  else if (act === "copy-email") {
    const text = followUpEmail(resultById(el.dataset.id), BANK);
    navigator.clipboard?.writeText(text).then(() => toast("Email copied"), () => toast("Select the text to copy it"));
  } else if (act === "decide") {
    S.decisions[el.dataset.id] = { label: el.dataset.label, at: new Date().toISOString(), note: document.getElementById("note").value.trim() };
    save(); render(); toast(`Decision recorded: ${el.dataset.label}`);
  } else if (act === "download-report") {
    const r = resultById(el.dataset.id);
    download(`${r.supplier.name.replace(/\W+/g, "-").toLowerCase()}-review.html`, reportHtml(r), "text/html");
  } else if (act === "export-csv") {
    const head = ["Supplier", "Category", "Built-in risk", "Answer score", "Risk score", "Rating", "Red flags", "Recommendation", "Follow-ups", ...CONTROLS.map(c => c.id + " " + c.name)];
    const q = v => `"${String(v).replace(/"/g, '""')}"`;
    const lines = results().map(r => [r.supplier.name, r.category.name, r.inherent.level, r.controlScore, r.riskScore, r.rating, r.redFlags.length, r.recommendation.label, r.followUps.length, ...CONTROLS.map(c => STATUS[r.controls[c.id].status].label)].map(q).join(","));
    download("vendorlens-portfolio.csv", [head.map(q).join(","), ...lines].join("\n"), "text/csv");
  } else if (act === "delete") {
    S.added = S.added.filter(s => s.id !== el.dataset.id); save(); invalidate(); go(""); toast("Supplier removed");
  } else if (act === "reset") {
    S = fresh(); save(); invalidate(); render(); toast("Demo reset");
  }
});
// The scatter dots are SVG <g> elements, handled by the same [data-href] click above.

render();
