// VendorLens - single-page app (no framework, no build step).

import { CONTROLS, controlById, CATEGORIES, PROFILE, RULES } from "./controls.js";
import { parseQuestionnaire, analyseSupplier, portfolio, followUpEmail, findings, REC_MEANING, RED_FLAG_MEANING } from "./analyzer.js";
import { SAMPLE_SUPPLIERS, BANK } from "./samples.js";

// ---------------- state ----------------
const KEY = "vendorlens.v1";
const fresh = () => ({ added: [], decisions: {} });
let S = (() => { try { return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return fresh(); } })();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* storage blocked */ } };

const app = document.getElementById("app");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = iso => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const addMonths = (iso, m) => { const d = new Date(iso); d.setMonth(d.getMonth() + m); return d.toISOString(); };
const ratingPill = r => `<span class="rating ${r}">${r} risk</span>`;
const ruleNames = ids => ids.map(k => esc(RULES[k].short)).join("<br>");
function toast(m) { const t = document.getElementById("toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2600); }

const allSuppliers = () => [...SAMPLE_SUPPLIERS, ...S.added];
let cache = null;
const results = () => (cache ||= allSuppliers().map(analyseSupplier));
const invalidate = () => { cache = null; };
const resultById = id => results().find(r => r.supplier.id === id);

// ---------------- router ----------------
const routes = { "": howView, dashboard, supplier: supplierView, add: addView, library, privacy };
const after = {};
function render() {
  const [path, query] = location.hash.replace(/^#\/?/, "").split("?");
  const params = new URLSearchParams(query || "");
  document.querySelectorAll(".topbar nav a").forEach(a => a.classList.toggle("active", a.dataset.route === path || (path === "supplier" && a.dataset.route === "dashboard")));
  app.innerHTML = (routes[path] || howView)(params);
  after[path]?.(params);
}
window.addEventListener("hashchange", () => { actionFilter = "all"; render(); window.scrollTo(0, 0); });
const go = r => { location.hash = "#/" + r; };

// ---------------- HOW IT WORKS (landing) ----------------
function howView() {
  return `
  <section class="hero">
    <div>
      <div class="eyebrow">For banks' third-party risk teams</div>
      <h1>Review AI suppliers in minutes, not weeks.</h1>
      <p class="lead">Every supplier that uses AI must be checked before a bank can work with it. VendorLens reads the supplier's questionnaire answers,
      checks each one against Hong Kong rules, and tells your team exactly what is missing and what to ask for next.</p>
      <div class="row" style="margin-top:18px"><a class="btn primary" href="#/dashboard">Open the demo dashboard →</a><a class="btn" href="#/add">Review a supplier</a></div>
      <p class="cite" style="margin-top:10px">The demo uses a fictional bank and fictional suppliers. Nothing you upload leaves your browser.</p>
    </div>
    <div class="card example">
      <div class="eyebrow">Example finding</div>
      <div class="ex-row"><span class="ex-n">1</span><div><b>Supplier's answer</b><div class="quote">"We use anonymised customer conversations to fine-tune our language models."</div></div></div>
      <div class="ex-row"><span class="ex-n">2</span><div><b>What's wrong</b><p>Bank customers' data is being used to train the supplier's AI. <span class="st redflag">Red flag</span></p></div></div>
      <div class="ex-row"><span class="ex-n">3</span><div><b>Required action</b><p>Do not proceed. Require a written commitment that bank data will never be used for training, and deletion of data already used.</p></div></div>
      <div class="ex-row"><span class="ex-n">4</span><div><b>Rule source</b><p>PDPO (DPP3: no new use without consent) · PCPD AI Framework</p></div></div>
    </div>
  </section>

  <section class="strip">
    <div><b>${CONTROLS.length}</b><span>requirements checked on every supplier</span></div>
    <div><b>${Object.keys(RULES).length}</b><span>Hong Kong rules, each finding linked to its source</span></div>
    <div><b>${CATEGORIES.length}</b><span>supplier types, each weighted differently</span></div>
    <div><b>&lt; 1 min</b><span>from questionnaire to findings and report</span></div>
  </section>

  <section class="grid g3" style="margin-bottom:26px">
    <div class="card"><div class="eyebrow">The rule</div><h3>Banks must check their suppliers</h3><p class="muted">HKMA outsourcing rules (SA-2) and the HKMA's AI Principles require due diligence on outside suppliers, including AI vendors.</p></div>
    <div class="card"><div class="eyebrow">The problem</div><h3>Answers are read by hand</h3><p class="muted">Long questionnaires arrive by email and Excel. Specialists read every answer, then spend weeks chasing missing details.</p></div>
    <div class="card"><div class="eyebrow">The fix</div><h3>Clear actions in seconds</h3><p class="muted">VendorLens turns every answer into a finding: what's missing, what to require, and which rule says so.</p></div>
  </section>

  <section class="card" style="margin-bottom:26px">
    <h2>How it works</h2>
    <div class="flow three">
      <div class="stepbox"><span class="num" style="background:var(--teal)">1</span><h3>Upload</h3><small>Add the supplier's questionnaire answers: CSV, copy-paste from Excel, any wording.</small></div>
      <div class="stepbox"><span class="num" style="background:var(--navy)">2</span><h3>VendorLens checks</h3><small>Each answer is matched to a requirement from Hong Kong rules and judged: in place, vague, missing, or a red flag.</small></div>
      <div class="stepbox"><span class="num" style="background:var(--red)">3</span><h3>You decide</h3><small>Get findings, required actions, a follow-up email and a professional report. Your analyst makes the final call.</small></div>
    </div>
  </section>

  <div class="center"><a class="btn primary" href="#/dashboard">Open the demo dashboard →</a></div>`;
}

// ---------------- DASHBOARD ----------------
let filters = { cat: "", rating: "", q: "", flags: false, pending: false };
const ACTION_TYPES = { redflag: "Fix before onboarding", gap: "Require before go-live", weak: "Request evidence", missing: "Ask the supplier" };
let actionFilter = "all";
const recTip = k => esc(REC_MEANING[k]);
function dashboard() {
  const rs = results();
  const p = portfolio(rs);
  const q = filters.q.toLowerCase();
  const shown = p.queue.filter(r => (!filters.cat || r.supplier.category === filters.cat) && (!filters.rating || r.rating === filters.rating)
    && (!filters.flags || r.redFlags.length) && (!filters.pending || !S.decisions[r.supplier.id]) && (!q || (r.supplier.name + " " + (r.supplier.service || "") + " " + r.category.name).toLowerCase().includes(q)));
  const decided = rs.filter(r => S.decisions[r.supplier.id]).length;
  const kpi = (val, label, sub, cls, data) => `<button class="card kpi-card ${cls}" ${data}><div class="kpi">${val}</div><div class="kpi-label">${label}</div><small class="muted">${sub}</small></button>`;
  const active = filters.cat || filters.rating || filters.q || filters.flags || filters.pending;
  return `
  <div class="page-head spread"><div><div class="eyebrow">${BANK} · Third-party risk (demo)</div><h1>Supplier reviews</h1>
    <p class="lead" style="margin:0">${p.total} AI suppliers have returned their questionnaires and every answer has been checked. Work from the top: the riskiest suppliers come first.</p></div>
    <a class="btn primary" href="#/add">+ Review a new supplier</a></div>

  <div class="grid g4" style="margin-bottom:18px">
    ${kpi(p.total, "Suppliers reviewed", "Show all", filters.rating || filters.flags || filters.pending ? "" : "on", 'data-act="kpi" data-k="all"')}
    ${kpi(p.counts.High, "High risk", `${p.counts.Medium} medium · ${p.counts.Low} low`, "red " + (filters.rating === "High" ? "on" : ""), 'data-act="kpi" data-k="High"')}
    ${kpi(p.redFlags, "Red flags to resolve", "Serious problems: supplier on hold", "red " + (filters.flags ? "on" : ""), 'data-act="kpi" data-k="flags"')}
    ${kpi(p.total - decided, "Awaiting your decision", `${decided} decided so far`, "teal " + (filters.pending ? "on" : ""), 'data-act="kpi" data-k="pending"')}
  </div>

  <div class="card" style="margin-bottom:18px">
    <div class="spread"><h2 style="margin:0">Review queue</h2>
      <div class="row"><button class="btn small" data-act="export-csv">Download list (CSV)</button><button class="btn small" data-act="reset" title="Remove suppliers you added and analyst decisions">Reset demo</button></div></div>
    <div class="filters">
      <input type="search" id="f-q" placeholder="Search suppliers…" value="${esc(filters.q)}" aria-label="Search suppliers">
      <select id="f-cat" aria-label="Category"><option value="">All categories</option>${CATEGORIES.map(c => `<option value="${c.key}" ${filters.cat === c.key ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>
      <select id="f-rating" aria-label="Risk"><option value="">Any risk</option>${["High", "Medium", "Low"].map(r => `<option value="${r}" ${filters.rating === r ? "selected" : ""}>${r} risk</option>`).join("")}</select>
      ${active ? `<button class="btn small" data-act="clear-filters">Clear filters</button>` : ""}
      <span class="muted small" style="margin-left:auto">Showing ${shown.length} of ${p.total}</span>
    </div>
    <div style="overflow:auto"><table class="queue"><thead><tr><th>Supplier</th><th>Risk</th><th>Recommendation and top issue</th><th class="num">Actions</th><th>Decision</th><th>Next review</th><th></th></tr></thead><tbody>
      ${shown.map(r => { const d = S.decisions[r.supplier.id]; const f = findings(r); const top = f.actions[0]; return `<tr class="clickable" data-href="supplier?id=${r.supplier.id}" tabindex="0">
        <td><b>${esc(r.supplier.name)}</b>${r.supplier.custom ? ` <span class="tag">Added by you</span>` : ""}<br><small class="muted">${esc(r.supplier.service || r.category.name)}</small></td>
        <td class="nowrap">${ratingPill(r.rating)}${r.redFlags.length ? `<br><span class="st redflag" style="margin-top:4px" title="${esc(RED_FLAG_MEANING)}">⚑ ${r.redFlags.length} red flag${r.redFlags.length > 1 ? "s" : ""}</span>` : ""}</td>
        <td><span class="rec ${r.recommendation.key}" title="${recTip(r.recommendation.key)}">${r.recommendation.label}</span>${top ? `<br><small class="muted">${top.status === "redflag" ? "⚑ " : ""}${esc(top.control.name)}</small>` : `<br><small class="muted">All requirements met</small>`}</td>
        <td class="num"><b>${f.actions.length}</b></td>
        <td class="nowrap">${d ? `<span class="decided ${d.label === "Reject" ? "no" : d.label.startsWith("Request") ? "info" : ""}">${d.label === "Reject" ? "✕" : d.label.startsWith("Request") ? "?" : "✓"} ${esc(d.label)}</span><br><small class="muted">${fmtDate(d.at)}</small>` : `<small class="muted">Pending</small>`}</td>
        <td class="nowrap"><small>${fmtDate(addMonths(r.supplier.assessed, r.reviewMonths))}</small></td>
        <td class="nowrap"><span class="btn small">Open →</span></td></tr>`; }).join("") || `<tr><td colspan="7" class="muted center" style="padding:24px">No suppliers match these filters. <a href="#" data-act="clear-filters">Clear filters</a></td></tr>`}
    </tbody></table></div>
  </div>`;
}
after.dashboard = () => {
  document.getElementById("f-cat").addEventListener("change", e => { filters.cat = e.target.value; render(); });
  document.getElementById("f-rating").addEventListener("change", e => { filters.rating = e.target.value; filters.flags = false; render(); });
  const q = document.getElementById("f-q");
  q.addEventListener("input", e => { filters.q = e.target.value; render(); const n = document.getElementById("f-q"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); });
};

// ---------------- SUPPLIER ----------------
function supplierView(params) {
  const r = resultById(params.get("id"));
  if (!r) return `<div class="card empty"><h2>Supplier not found</h2><a class="btn primary" href="#/dashboard">Back to dashboard</a></div>`;
  const s = r.supplier, d = S.decisions[s.id];
  const f = findings(r);
  const reds = f.actions.filter(a => a.status === "redflag").length;
  return `
  <div class="page-head spread"><div><a href="#/dashboard" class="muted">← All suppliers</a><h1 style="margin-top:6px">${esc(s.name)}</h1>
    <p class="muted" style="margin:0">${esc(r.category.name)} · ${esc(s.service || "")} · answers received ${fmtDate(s.assessed)}</p></div>
    <div class="row"><button class="btn primary" data-act="download-report" data-id="${s.id}">Download report</button>${s.custom ? `<button class="btn danger" data-act="delete" data-id="${s.id}">Remove</button>` : ""}</div></div>

  <div class="grid g3" style="margin-bottom:18px">
    <div class="card"><div class="kpi-label">Overall risk</div><div style="margin:8px 0">${ratingPill(r.rating)}</div>
      <small class="muted">${r.inherent.level} built-in risk (${PROFILE.filter(p => s.profile?.[p.key]).map(p => esc(p.label.toLowerCase())).join(", ") || "no high-risk features"}), answer quality ${r.controlScore}/100${r.redFlags.length ? `, ${r.redFlags.length} red flag(s)` : ""}.</small></div>
    <div class="card"><div class="kpi-label">Recommendation</div><div class="rec ${r.recommendation.key}" style="font-size:1.1rem;margin:8px 0">${r.recommendation.label}</div>
      <small class="muted">${esc(REC_MEANING[r.recommendation.key])}</small></div>
    <div class="card"><div class="kpi-label">Answers checked</div><div class="big-num">${f.actions.length + f.satisfactory.length}</div>
      <small class="muted">${reds ? `<b style="color:var(--red)">${reds} red flag(s)</b> · ` : ""}${f.actions.length - reds} need action · ${f.satisfactory.length} satisfactory</small></div>
  </div>

  <div class="card" style="margin-bottom:18px" id="findings">
    <div class="spread"><h2 style="margin:0">Findings and required actions</h2>
      ${f.actions.length ? `<div class="chips">${[["all", "All", f.actions.length], ...Object.entries(ACTION_TYPES).map(([k, v]) => [k, v, f.actions.filter(a => a.actionType.cls === k).length])].filter(x => x[2]).map(([k, label, n]) => `<button class="chip ${k} ${actionFilter === k ? "on" : ""}" data-act="filter-actions" data-k="${k}">${label} <b>${n}</b></button>`).join("")}</div>` : ""}</div>
    ${f.actions.length ? `<div style="overflow:auto;margin-top:12px"><table class="findings"><thead><tr><th style="width:15%">Topic</th><th style="width:22%">1 · Supplier's answer</th><th style="width:23%">2 · What's missing</th><th style="width:25%">3 · Required action</th><th style="width:15%">4 · Rule source</th></tr></thead><tbody>
      ${f.actions.filter(a => actionFilter === "all" || a.actionType.cls === actionFilter).map(a => `<tr class="pri-${a.priority.toLowerCase()}">
        <td><span class="prio ${a.priority.toLowerCase()}">${a.priority}</span><br><b>${esc(a.control.name)}</b></td>
        <td>${a.answer ? `<div class="quote">"${esc(a.answer)}"</div>` : `<span class="muted">${a.question ? "(left blank)" : "(not asked)"}</span>`}</td>
        <td>${a.status === "redflag" ? `<span class="st redflag" title="${esc(RED_FLAG_MEANING)}">⚑ Red flag</span><br>` : ""}${esc(a.issue)}<div class="cite" style="margin-top:4px"><b>Expected:</b> ${esc(a.expected)}</div></td>
        <td><span class="act ${a.actionType.cls}">${a.actionType.label}</span><br>${esc(a.action)}</td>
        <td class="cite">${ruleNames(a.rules)}</td></tr>`).join("")}
    </tbody></table></div>` : `<div class="callout ok" style="margin-top:12px">No actions needed: every important requirement is met.</div>`}
    ${f.satisfactory.length ? `<details style="margin-top:14px"><summary><span class="st strong">✓</span> ${f.satisfactory.length} requirements met</summary><table style="margin-top:8px"><tbody>
      ${f.satisfactory.map(x => `<tr><td style="width:25%"><b>${esc(x.control.name)}</b></td><td><div class="quote">"${esc(x.answer)}"</div></td><td class="cite" style="width:18%">${ruleNames(x.control.rules)}</td></tr>`).join("")}
    </tbody></table></details>` : ""}
  </div>

  <h2 class="section-title">Next steps</h2>
  <div class="grid g2" style="align-items:start">
    <div class="card"><div class="spread"><h3 style="margin:0"><span class="stepn">1</span>Send the follow-up email</h3>${r.followUps.length ? `<button class="btn small primary" data-act="copy-email" data-id="${s.id}">Copy email</button>` : ""}</div>
      ${r.followUps.length ? `<p class="cite">Drafted from the findings above. Send it once instead of weeks of back-and-forth.</p><pre class="email">${esc(followUpEmail(r, BANK))}</pre>` : `<p class="muted">No follow-up needed.</p>`}</div>
    <div class="card"><h3 style="margin-top:0"><span class="stepn">2</span>Record your decision</h3>
      <p class="cite">VendorLens recommends <b class="rec ${r.recommendation.key}">${r.recommendation.label}</b>. You make the final call.</p>
      ${d ? `<div class="callout" style="margin-bottom:10px"><b>${esc(d.label)}</b> on ${fmtDate(d.at)}${d.note ? `: ${esc(d.note)}` : ""}</div>` : ""}
      <input type="text" id="note" placeholder="Note (optional), e.g. approved subject to clauses 4 and 7" style="margin-bottom:8px">
      <div class="decision-row">${["Approve", "Approve with conditions", "Request more information", "Reject"].map(l => `<button class="btn small ${l === "Reject" ? "danger" : ""}" data-act="decide" data-id="${s.id}" data-label="${l}">${l}</button>`).join("")}</div>
      <hr class="sep"><h3><span class="stepn">3</span>Download the report</h3>
      <p class="cite">A signed-off assessment for the file, with your decision included.</p>
      <button class="btn primary" data-act="download-report" data-id="${s.id}">Download report</button></div>
  </div>
  ${r.unmapped ? `<div class="card" style="margin-top:18px"><h3>Other answers (${r.unmapped})</h3><p class="cite">These questions don't relate to the requirements VendorLens checks. Please read them yourself.</p>
    ${r.responses.filter(x => !x.controlId).map(x => `<p><b>${esc(x.q)}</b><br>${esc(x.a)}</p>`).join("")}</div>` : ""}`;
}

// ---------------- REPORT ----------------
function reportHtml(r) {
  const s = r.supplier, f = findings(r), d = S.decisions[s.id];
  const today = new Date().toISOString();
  const ref = `VL-${s.id.slice(0, 6).toUpperCase()}-${today.slice(0, 10).replace(/-/g, "")}`;
  const color = { High: "#c0392b", Medium: "#c98a0b", Low: "#1e8c5a" }[r.rating];
  const prioColor = { Urgent: "#c0392b", High: "#d35400", Medium: "#c98a0b", Low: "#7f8c8d" };
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${esc(s.name)}: Supplier AI Risk Assessment</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Calibri, "Segoe UI", Arial, sans-serif; color: #1b2433; margin: 0; background: #eef1f6; font-size: 10.5pt; line-height: 1.45; }
  .page { max-width: 210mm; margin: 20px auto; background: #fff; padding: 0 0 18mm; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
  .band { background: #14213d; color: #fff; padding: 16mm 14mm 10mm; }
  .band .org { font-size: 9pt; letter-spacing: .14em; text-transform: uppercase; opacity: .8; }
  .band h1 { font-size: 22pt; margin: 6px 0 2px; font-weight: 700; }
  .band .sub { font-size: 12pt; opacity: .9; }
  .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; background: #f4f6fa; border-bottom: 1px solid #dde2ea; }
  .meta div { padding: 8px 14px; font-size: 8.5pt; color: #5d6779; border-right: 1px solid #dde2ea; }
  .meta b { display: block; color: #14213d; font-size: 10pt; }
  .content { padding: 0 14mm; }
  h2 { font-size: 13pt; color: #14213d; border-bottom: 2px solid #0f9aa8; padding-bottom: 4px; margin: 22px 0 10px; }
  .summary { display: grid; grid-template-columns: 1.1fr 1fr 1fr; gap: 10px; margin-top: 16px; }
  .box { border: 1px solid #dde2ea; border-radius: 6px; padding: 10px 12px; }
  .box .lbl { font-size: 8pt; text-transform: uppercase; letter-spacing: .08em; color: #5d6779; }
  .box .val { font-size: 15pt; font-weight: 700; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  th { background: #14213d; color: #fff; text-align: left; padding: 6px 7px; font-weight: 600; }
  td { border-bottom: 1px solid #e3e7ee; padding: 6px 7px; vertical-align: top; }
  tr { page-break-inside: avoid; }
  .kv td:first-child { width: 32%; color: #5d6779; }
  .pill { display: inline-block; padding: 1px 7px; border-radius: 10px; color: #fff; font-size: 7.5pt; font-weight: 700; }
  .q { font-style: italic; color: #333; }
  .flag { background: #fdecea; border-left: 4px solid #c0392b; padding: 8px 10px; margin-bottom: 6px; }
  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 10px; }
  .line { border-bottom: 1px solid #999; height: 26px; }
  .small { font-size: 8pt; color: #6b7280; }
  .noprint { text-align: center; margin: 14px 0 0; }
  .noprint button { font: inherit; padding: 8px 18px; border-radius: 6px; border: 0; background: #0f9aa8; color: #fff; cursor: pointer; }
  @media print { body { background: #fff; } .page { box-shadow: none; margin: 0; max-width: none; } .noprint { display: none; } }
</style></head><body>
<div class="noprint"><button onclick="window.print()">Print / Save as PDF</button></div>
<div class="page">
  <div class="band"><div class="org">${BANK} · Third-Party Risk Management</div><h1>Supplier AI Risk Assessment</h1><div class="sub">${esc(s.name)} · ${esc(r.category.name)}</div></div>
  <div class="meta"><div>Reference<b>${ref}</b></div><div>Report date<b>${fmtDate(today)}</b></div><div>Answers received<b>${fmtDate(s.assessed)}</b></div><div>Classification<b>Confidential</b></div></div>
  <div class="content">
    <div class="summary">
      <div class="box" style="border-top:4px solid ${color}"><div class="lbl">Overall risk</div><div class="val" style="color:${color}">${r.rating}</div><div class="small">${r.inherent.level} built-in risk · answer quality ${r.controlScore}/100</div></div>
      <div class="box"><div class="lbl">Recommendation</div><div class="val" style="font-size:12.5pt">${esc(r.recommendation.label)}</div><div class="small">${esc(REC_MEANING[r.recommendation.key])}</div></div>
      <div class="box"><div class="lbl">Findings</div><div class="val">${f.actions.length} actions</div><div class="small">${r.redFlags.length} red flag(s) · ${f.satisfactory.length} requirements met · re-review in ${r.reviewMonths} months</div></div>
    </div>

    <h2>1. Executive summary</h2>
    <p>${esc(s.name)} will provide <b>${esc((s.service || r.category.name).toLowerCase())}</b>. The service has <b>${r.inherent.level.toLowerCase()}</b> built-in risk
      (${PROFILE.filter(p => s.profile?.[p.key]).map(p => esc(p.label.toLowerCase())).join("; ") || "no high-risk features"}). The supplier's questionnaire answers were checked against ${CONTROLS.length} requirements drawn from Hong Kong rules.</p>
    <p>${r.redFlags.length ? `<b>${r.redFlags.length} red flag(s)</b> were found. ` : "No red flags were found. "}${f.actions.length ? `${f.actions.length} item(s) require action before or as a condition of onboarding.` : "All important requirements are met."}
      The recommendation is <b>${esc(r.recommendation.label.toLowerCase())}</b>.</p>

    ${r.redFlags.length ? `<h2>2. Red flags</h2>${f.actions.filter(a => a.status === "redflag").map(a => `<div class="flag"><b>${esc(a.control.name)}:</b> ${esc(a.issue)}<div class="q">Supplier's answer: "${esc(a.answer)}"</div><div><b>Required:</b> ${esc(a.action)}</div></div>`).join("")}` : ""}

    <h2>${r.redFlags.length ? 3 : 2}. Findings and required actions</h2>
    ${f.actions.length ? `<table><tr><th style="width:8%">Priority</th><th style="width:14%">Topic</th><th style="width:22%">Supplier's answer</th><th style="width:22%">What's missing</th><th style="width:22%">Required action</th><th style="width:12%">Rule source</th></tr>
      ${f.actions.map(a => `<tr><td><span class="pill" style="background:${prioColor[a.priority]}">${a.priority}</span></td><td><b>${esc(a.control.name)}</b></td><td class="q">${a.answer ? `"${esc(a.answer)}"` : (a.question ? "(left blank)" : "(not asked)")}</td><td>${esc(a.issue)}</td><td><b>${esc(a.actionType.label)}:</b> ${esc(a.action)}</td><td>${a.rules.map(k => esc(RULES[k].short)).join("<br>")}</td></tr>`).join("")}</table>` : "<p>No actions required.</p>"}

    <h2>${r.redFlags.length ? 4 : 3}. Requirements met</h2>
    ${f.satisfactory.length ? `<table><tr><th style="width:30%">Requirement</th><th>Supplier's answer</th></tr>${f.satisfactory.map(x => `<tr><td><b>${esc(x.control.name)}</b></td><td class="q">"${esc(x.answer)}"</td></tr>`).join("")}</table>` : "<p>None.</p>"}

    <h2>${r.redFlags.length ? 5 : 4}. Follow-up questions sent to the supplier</h2>
    ${r.followUps.length ? `<ol>${r.followUps.map(x => `<li><b>${esc(controlById[x.id].name)}:</b> ${esc(x.text)}</li>`).join("")}</ol>` : "<p>None.</p>"}

    <h2>${r.redFlags.length ? 6 : 5}. Supplier profile</h2>
    <table class="kv"><tr><td>Supplier</td><td>${esc(s.name)}</td></tr><tr><td>Service</td><td>${esc(s.service || "")}</td></tr><tr><td>Category</td><td>${esc(r.category.name)}</td></tr>
      ${PROFILE.map(p => `<tr><td>${esc(p.label)}</td><td>${s.profile?.[p.key] ? "Yes" : "No"}</td></tr>`).join("")}</table>

    <h2>${r.redFlags.length ? 7 : 6}. Analyst decision and sign-off</h2>
    <table class="kv"><tr><td>Decision</td><td>${d ? `<b>${esc(d.label)}</b> (${fmtDate(d.at)})` : "Pending"}</td></tr><tr><td>Notes</td><td>${esc(d?.note || "")}</td></tr><tr><td>Next review due</td><td>${fmtDate(addMonths(s.assessed, r.reviewMonths))}</td></tr></table>
    <div class="sign"><div><div class="line"></div><div class="small">Reviewing analyst (name, signature, date)</div></div><div><div class="line"></div><div class="small">Approver, Third-Party Risk (name, signature, date)</div></div></div>

    <h2>${r.redFlags.length ? 8 : 7}. Method and rule sources</h2>
    <p class="small">Each questionnaire answer was matched to a requirement and assessed for whether the control is in place, the level of detail and evidence, vague or non-committal wording, and specific red-flag patterns. Requirements are weighted by supplier category and combined with the service's built-in risk.
    Rule sources: ${Object.values(RULES).map(x => esc(x.name)).join("; ")}.</p>
  </div>
</div></body></html>`;
}

// ---------------- REVIEW A SUPPLIER ----------------
function addView() {
  return `
  <div class="page-head"><div class="eyebrow">Review a supplier</div><h1>Check a new supplier's answers</h1>
  <p class="lead">Four quick steps. VendorLens does the reading and gives you findings, actions and a report.</p></div>
  <div class="callout" style="margin-bottom:16px"><b>No file handy?</b> Click <b>"Use a sample questionnaire"</b> in step 4. It fills in a fictional chatbot supplier's answers so you can see the full result.</div>
  <div class="card">
    <div class="wizard-step"><h3><span class="n">1</span> Supplier details</h3>
      <div class="grid g2"><label class="field">Supplier name<input type="text" id="w-name" placeholder="e.g. QuickChat Ltd"></label>
      <label class="field">What will they do for the bank?<input type="text" id="w-service" placeholder="e.g. WhatsApp chatbot for card enquiries"></label></div></div>
    <div class="wizard-step"><h3><span class="n">2</span> Type of supplier</h3><p class="cite">This decides which requirements matter most. A chatbot is checked hardest on telling customers it's AI; a cloud host on security and recovery.</p>
      <div class="cat-grid">${CATEGORIES.map((c, i) => `<label class="cat-opt"><input type="radio" name="w-cat" value="${c.key}" ${i === 0 ? "checked" : ""}><span><b>${esc(c.name)}</b><small>${esc(c.desc)}</small></span></label>`).join("")}</div></div>
    <div class="wizard-step"><h3><span class="n">3</span> What does the service involve?</h3><p class="cite">Tick all that apply. More ticks means the supplier's answers need to be stronger.</p>
      <div class="check-list">${PROFILE.map(p => `<label><input type="checkbox" class="w-prof" value="${p.key}"> ${esc(p.label)}</label>`).join("")}</div></div>
    <div class="wizard-step"><h3><span class="n">4</span> The supplier's answers</h3>
      <p class="cite">Upload a CSV with "Question" and "Answer" columns, copy and paste the two columns straight from Excel, or type <code>Q:</code> and <code>A:</code> lines. The bank's own wording is fine.</p>
      <div class="grid g2" style="gap:12px">
        <div class="dropzone" id="drop"><b>Drop a .csv file here</b><br><small class="muted">or</small><br><input type="file" id="w-file" accept=".csv,.txt,.tsv,text/csv,text/plain" style="margin-top:6px">
          <div style="margin-top:12px" class="row center"><button class="btn small primary" data-act="load-sample">Use a sample questionnaire</button><a class="btn small" href="sample-questionnaire.csv" download>Download sample CSV</a></div></div>
        <textarea id="w-text" placeholder="Question,Answer&#10;Will our data be used to train AI?,No. Client data is never used for training.&#10;..." style="min-height:200px"></textarea>
      </div>
      <div id="w-preview" class="cite" style="margin-top:8px"></div></div>
    <div class="row"><button class="btn primary" data-act="analyse">Check this supplier →</button><span class="muted">Runs in your browser. Nothing is uploaded.</span></div>
  </div>`;
}
after.add = () => {
  const drop = document.getElementById("drop"), ta = document.getElementById("w-text");
  const preview = () => { const n = parseQuestionnaire(ta.value).length; document.getElementById("w-preview").textContent = n ? `${n} questions found.` : ""; };
  const load = file => file && file.text().then(t => { ta.value = t; preview(); toast(`Loaded ${file.name}`); });
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
  document.getElementById("w-preview").textContent = `${parseQuestionnaire(t).length} questions found.`;
  toast("Sample loaded. Now click \"Check this supplier\"");
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
  const r = resultById(sup.id);
  const mapped = responses.length - r.unmapped;
  const steps = [`Reading ${responses.length} answers`, `Matching ${mapped} answers to ${CONTROLS.length} requirements`, "Checking each answer against Hong Kong rules", `Scoring risk and drafting actions`];
  const ov = document.createElement("div");
  ov.className = "overlay";
  ov.innerHTML = `<div class="card analysing"><div class="spinner"></div><h3>Checking ${esc(name)}</h3><ol>${steps.map(t => `<li>${esc(t)}</li>`).join("")}</ol></div>`;
  document.body.appendChild(ov);
  const lis = ov.querySelectorAll("li");
  lis.forEach((li, i) => setTimeout(() => { lis[i - 1]?.classList.replace("doing", "done"); li.classList.add("doing"); }, i * 450));
  setTimeout(() => { ov.remove(); go("supplier?id=" + sup.id); toast(`${responses.length} answers checked`); }, steps.length * 450 + 300);
}

// ---------------- RULES & REQUIREMENTS ----------------
function library() {
  return `
  <div class="page-head"><div class="eyebrow">Rules &amp; requirements</div><h1>What VendorLens checks</h1>
  <p class="lead">${CONTROLS.length} requirements, each linked to one or more of the Hong Kong rules below. Every finding shows its source.</p></div>
  <div class="card" style="margin-bottom:18px"><h2 style="margin-top:0">Hong Kong rules</h2>
    <table><tbody>${Object.values(RULES).map(r => `<tr><td style="width:30%"><b>${esc(r.name)}</b></td><td class="muted">${esc(r.summary)}</td></tr>`).join("")}</tbody></table>
    <p class="cite" style="margin-top:8px">Short summaries, not legal text or legal advice.</p></div>
  <div class="card"><h2 style="margin-top:0">Requirements</h2>
    <table><thead><tr><th style="width:26%">Requirement</th><th>What a good answer shows</th><th style="width:20%">Source</th></tr></thead><tbody>
    ${CONTROLS.map(c => `<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.good)}</td><td class="cite">${ruleNames(c.rules)}</td></tr>`).join("")}
    </tbody></table></div>`;
}

// ---------------- DATA & PRIVACY ----------------
function privacy() {
  const sec = (id, title, body) => `<section id="${id}"><h3>${title}</h3>${body}</section>`;
  return `
  <div class="page-head"><div class="eyebrow">Data &amp; privacy</div><h1>Data collection and privacy statement</h1>
  <p class="lead">What VendorLens collects, where it goes, and your rights. Written with the Personal Data (Privacy) Ordinance (Cap. 486) in mind.</p></div>
  <div class="privacy-grid">
    <aside class="card toc"><b>On this page</b>
      ${[["summary", "In short"], ["collect", "What we collect"], ["purpose", "Why we use it"], ["storage", "Where it is kept"], ["share", "Who can see it"], ["retain", "How long we keep it"], ["security", "Security"], ["rights", "Your rights"], ["bank", "In a bank deployment"], ["disclaimer", "Disclaimer"]].map(([k, t]) => `<a href="#/privacy" data-act="jump" data-k="${k}">${t}</a>`).join("")}
    </aside>
    <div class="card prose">
      ${sec("summary", "In short", `<div class="facts">
        <div><b>0</b><span>accounts or sign-ups</span></div><div><b>0</b><span>cookies or trackers</span></div><div><b>0</b><span>files uploaded to a server</span></div><div><b>100%</b><span>processed in your browser</span></div></div>
        <p>VendorLens checks questionnaires on your own device. We do not run a server that receives your files, and we cannot see what you check.</p>`)}
      ${sec("collect", "1. What we collect", `<table><thead><tr><th>Information</th><th>Collected?</th><th>Notes</th></tr></thead><tbody>
        <tr><td>Questionnaire answers you upload or paste</td><td>On your device only</td><td>Read by your browser to produce findings. Never sent to us.</td></tr>
        <tr><td>Supplier name, service and category you enter</td><td>On your device only</td><td>Saved so the supplier appears on your dashboard.</td></tr>
        <tr><td>Analyst decisions and notes</td><td>On your device only</td><td>Saved so they appear in the report.</td></tr>
        <tr><td>Your name, email or login</td><td>No</td><td>There are no accounts.</td></tr>
        <tr><td>Cookies, analytics or advertising IDs</td><td>No</td><td>We use none.</td></tr>
        <tr><td>Technical request data (e.g. IP address)</td><td>By the host only</td><td>The demo is hosted on GitHub Pages, which may log basic request data under GitHub's own privacy statement. We do not receive it.</td></tr>
      </tbody></table>`)}
      ${sec("purpose", "2. Why we use it", `<p>Information you enter is used <b>only</b> to check the supplier's answers, show findings, draft the follow-up email and build the report. It is never used to train AI models, for marketing, or for any other purpose (PDPO Data Protection Principles 1 and 3).</p>`)}
      ${sec("storage", "3. Where it is kept", `<p>In your browser's local storage on this device, under the key <code>vendorlens.v1</code>. It does not sync to other devices and is not backed up by us. Downloaded reports and CSV files are saved wherever you choose on your computer.</p>`)}
      ${sec("share", "4. Who can see it", `<p>Only people using this browser on this device. We do not sell, share or transfer information to anyone, in Hong Kong or overseas, because we never receive it.</p>`)}
      ${sec("retain", "5. How long we keep it", `<p>Until you delete it. To remove everything, use <b>Reset demo</b> on the dashboard, remove individual suppliers with <b>Remove</b>, or clear this site's data in your browser settings. Deletion is immediate and cannot be undone.</p>`)}
      ${sec("security", "6. Security", `<ul><li>Served over HTTPS.</li><li>No database or server to breach: there is nothing stored on our side.</li><li>No third-party scripts, fonts or AI services are loaded, so your answers are never passed to an outside provider.</li><li>Anyone with access to this device and browser can see saved suppliers, so use a work device and lock your screen.</li></ul>`)}
      ${sec("rights", "7. Your rights", `<p>Under the PDPO you may ask to access and correct personal data held about you (Data Protection Principle 6). Because VendorLens holds no personal data on its side, all data can be viewed, corrected and deleted directly by you in the app. Questions about this statement can be raised with the VendorLens team via our GitHub repository.</p>
        <p><b>Please avoid entering customers' personal data.</b> Supplier questionnaires should describe the supplier's controls, not individual customers. If answers include staff names or contact details, handle them under your organisation's own policies.</p>`)}
      ${sec("bank", "8. In a bank deployment", `<p>For production use, VendorLens is designed to run <b>inside the bank's own environment</b> (on-premises or the bank's private cloud in Hong Kong), so questionnaires never leave the bank. The bank would act as the data user under the PDPO, with VendorLens as its data processor bound by contract, in line with HKMA outsourcing guidance (SA-2). Access controls, audit logs and retention would follow the bank's own policies.</p>`)}
      ${sec("disclaimer", "9. Disclaimer", `<ul><li><b>Demonstration only.</b> This is a prototype built for BUHack 2.0. ${BANK} and all suppliers shown are fictional; any resemblance to real organisations is coincidental.</li>
        <li><b>Not legal advice.</b> Rule references are short paraphrased summaries, not legal text. Always refer to the official HKMA, PCPD and other sources.</li>
        <li><b>People make the decisions.</b> VendorLens highlights gaps and suggests actions. Final decisions on any supplier must be made by qualified staff.</li></ul>
        <p class="cite">Last updated 15 November 2026.</p>`)}
    </div>
  </div>`;
}

// ---------------- events ----------------
function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
}
app.addEventListener("click", e => {
  const el = e.target.closest("[data-act]");
  const row = e.target.closest("[data-href]");
  if (!el && row) { go(row.dataset.href); return; }
  if (!el) return;
  const act = el.dataset.act;
  if (act === "kpi") {
    const k = el.dataset.k;
    filters = { ...filters, rating: k === "High" ? (filters.rating === "High" ? "" : "High") : "", flags: k === "flags" ? !filters.flags : false, pending: k === "pending" ? !filters.pending : false };
    if (k === "all") filters = { cat: "", rating: "", q: "", flags: false, pending: false };
    app.addEventListener("keydown", e => { const row = e.target.closest?.("[data-href]"); if (row && e.key === "Enter") go(row.dataset.href); });

render();
  } else if (act === "clear-filters") { e.preventDefault(); filters = { cat: "", rating: "", q: "", flags: false, pending: false }; render(); }
  else if (act === "filter-actions") { actionFilter = el.dataset.k; render(); document.getElementById("findings")?.scrollIntoView({ block: "start" }); }
  else if (act === "jump") { e.preventDefault(); document.getElementById(el.dataset.k)?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  else if (act === "load-sample") loadSample();
  else if (act === "analyse") analyseNew();
  else if (act === "copy-email") {
    navigator.clipboard?.writeText(followUpEmail(resultById(el.dataset.id), BANK)).then(() => toast("Email copied"), () => toast("Select the text to copy it"));
  } else if (act === "decide") {
    S.decisions[el.dataset.id] = { label: el.dataset.label, at: new Date().toISOString(), note: document.getElementById("note").value.trim() };
    save(); render(); toast(`Decision recorded: ${el.dataset.label}`);
  } else if (act === "download-report") {
    const r = resultById(el.dataset.id);
    download(`${r.supplier.name.replace(/\W+/g, "-").toLowerCase()}-ai-risk-assessment.html`, reportHtml(r), "text/html");
    toast("Report downloaded. Open it and use Print to save as PDF");
  } else if (act === "export-csv") {
    const q = v => `"${String(v).replace(/"/g, '""')}"`;
    const head = ["Supplier", "Category", "Service", "Risk", "Recommendation", "Red flags", "Actions needed", "Answer quality", "Analyst decision", "Next review"];
    const lines = results().map(r => [r.supplier.name, r.category.name, r.supplier.service || "", r.rating, r.recommendation.label, r.redFlags.length, findings(r).actions.length, r.controlScore, S.decisions[r.supplier.id]?.label || "Pending", fmtDate(addMonths(r.supplier.assessed, r.reviewMonths))].map(q).join(","));
    download("vendorlens-suppliers.csv", [head.map(q).join(","), ...lines].join("\n"), "text/csv");
  } else if (act === "delete") {
    S.added = S.added.filter(s => s.id !== el.dataset.id); delete S.decisions[el.dataset.id]; save(); invalidate(); go("dashboard"); toast("Supplier removed");
  } else if (act === "reset") {
    S = fresh(); save(); invalidate(); render(); toast("Demo reset");
  }
});

app.addEventListener("keydown", e => { const row = e.target.closest?.("[data-href]"); if (row && e.key === "Enter") go(row.dataset.href); });

render();
