// VendorLens analysis engine.
//
//   1. Parse   - read a questionnaire (CSV, Excel copy-paste or Q:/A: text) into question/answer pairs
//   2. Map     - match each of the bank's own questions to a control in the library (BM25 retrieval)
//   3. Assess  - judge each answer: stance (yes / partly / planned / no), specifics, evidence,
//                vague wording, shifted responsibility and red-flag patterns
//   4. Score   - weight controls by supplier category, combine with inherent risk
//   5. Decide  - rating, recommendation, approval conditions and a drafted follow-up email
//
// Everything runs in the browser; questionnaires never leave the device.

import { BM25, tokenize } from "./bm25.js";
import { CONTROLS, controlById, categoryByKey, PROFILE, FAMILIES } from "./controls.js";

// ---------------- 1. Parse ----------------
function parseCSV(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

export function parseQuestionnaire(text) {
  text = (text || "").replace(/\uFEFF/g, "").trim();
  if (!text) return [];
  let rows;
  if (/^\s*Q\s*[:：]/im.test(text) && /^\s*A\s*[:：]/im.test(text)) {
    const out = []; let cur = null;
    for (const line of text.split(/\r?\n/)) {
      const mq = line.match(/^\s*Q\s*\d*\s*[:：.]\s*(.*)$/i), ma = line.match(/^\s*A\s*\d*\s*[:：.]\s*(.*)$/i);
      if (mq) { cur = { q: mq[1].trim(), a: "" }; out.push(cur); }
      else if (ma && cur) cur.a = ma[1].trim();
      else if (cur && line.trim()) cur.a += (cur.a ? " " : "") + line.trim();
    }
    return out.filter(r => r.q);
  }
  rows = text.includes("\t") ? text.split(/\r?\n/).map(l => l.split("\t")) : parseCSV(text);
  if (!rows.length) return [];
  let qi = 0, ai = 1;
  const head = rows[0].map(h => h.trim().toLowerCase());
  const hq = head.findIndex(h => /question/.test(h)), ha = head.findIndex(h => /answer|response/.test(h));
  if (hq >= 0 && ha >= 0) { qi = hq; ai = ha; rows = rows.slice(1); }
  else if (rows[0].length >= 3 && /^(no|#|id|ref)\.?$/i.test(rows[0][0].trim())) rows = rows.slice(1);
  if (rows[0] && rows[0].length >= 3 && hq < 0) { qi = 1; ai = 2; } // "No, Question, Answer" without header
  return rows.map(r => ({ q: (r[qi] || "").trim(), a: (r[ai] || "").trim() })).filter(r => r.q);
}

// ---------------- 2. Map ----------------
const index = new BM25(CONTROLS.map(c => `${c.name} ${c.name} ${c.kw} ${c.kw} ${c.good}`));
const MIN_MAP = 2.2;

export function mapQuestion(question, answer = "") {
  // Match on the bank's question first; only use the answer as a tie-breaker when the question is unclear.
  let hits = index.search(question, 2);
  if (!hits.length || hits[0].score < MIN_MAP) hits = index.search(`${question} ${question} ${answer}`, 2);
  if (!hits.length || hits[0].score < MIN_MAP) return { controlId: null, confidence: 0 };
  const top = hits[0], second = hits[1]?.score || 0;
  const confidence = Math.max(0.35, Math.min(0.99, 0.5 + 0.04 * top.score + 0.15 * (1 - second / top.score)));
  return { controlId: CONTROLS[top.index].id, confidence: Math.round(confidence * 100) / 100, matched: top.matched };
}

// ---------------- 3. Assess ----------------
const RX = {
  negative: /^(no\b|not\b|none\b)|\b(we do not have|we don't have|we have not|we haven't|not currently|no formal|there is no|there are no|we do not (?:currently )?(?:perform|conduct|test|monitor|review|have|maintain|provide|offer|notify|disclose|track|log))\b/i,
  planned: /\b(plan(?:ned|ning)? to|will (?:start|introduce|implement|launch)|will be (?:implemented|introduced|rolled out|developed|launched|in place|completed)|in progress|under development|being (?:developed|drafted|implemented|reviewed)|roadmap|next (?:year|quarter)|by (?:q[1-4]|end of)|pilot(?:ing)?|working towards|intend)\b/i,
  partial: /\b(partially|partly|some (?:of|systems|models)|in some cases|for (?:key|major|critical) (?:systems|models|clients)|informal(?:ly)?|ad hoc|manual(?:ly)? where|limited)\b/i,
  affirm: /^(yes\b|y\b)|\b(we (?:have|maintain|perform|conduct|run|use|test|review|encrypt|apply|enforce|provide|notify|keep|log|delete|retain|store|host|disclose|offer|allow|grant|require)|is (?:encrypted|reviewed|tested|stored|hosted|enforced|logged|approved|disclosed)|are (?:encrypted|reviewed|tested|stored|hosted|enforced|logged|informed|disclosed|bound|required|deleted))\b/i,
  vague: /\b(regular(?:ly)?|periodic(?:ally)?|as (?:needed|appropriate|required)|where (?:possible|appropriate|applicable)|industry[- ]standard|best[- ]practice|reasonable|adequate|from time to time|case[- ]by[- ]case|as soon as (?:practicable|possible)|best effort|robust|appropriate measures)\b/gi,
  defer: /\b(rely (?:on|upon) (?:our |the )?(?:provider|vendor|third[- ]party|cloud|partner)|responsibility of (?:the )?(?:provider|customer|client|bank)|handled by (?:our )?(?:provider|partner|vendor)|covered by (?:our )?(?:provider|partner|vendor))\b/i,
  specific: [
    /\b(daily|weekly|monthly|quarterly|annually|yearly|every \d+ (?:days|weeks|months))\b/i,
    /\b\d+(?:\.\d+)?\s?(?:hours?|hrs?|days?|months?|years?|%|minutes?)\b/i,
    /\b(iso ?27001|soc ?2|iso ?42001|pci[- ]?dss|nist|type ii)\b/i,
    /\b(cto|ciso|dpo|chief \w+ officer|head of \w+|director|committee|board)\b/i,
    /\b(20\d\d|q[1-4] 20\d\d)\b/i,
    /\b(aes|tls ?1\.[23]|mfa|multi-factor|hong kong|singapore|tokyo|frankfurt)\b/i,
    /\b(contract(?:ual|ually)?|written|documented|signed|approved|certified|named)\b/i,
  ],
  doneVerb: /\b(certified|enforced|encrypted|retained|deleted|tested|reviewed|maintained|logged|returned|monitored|validated|blocked|processed|stored|hosted|approved|restricted|limited)\b/i,
  evidence: /\b(attached|appendix|enclosed|see (?:the |our )?(?:attached |latest )?(?:report|policy|certificate|document)|copy provided|report dated)\b/i,
  onRequest: /\b(available on request|can be provided|upon request)\b/i,
  prohibition: /\b(never|not (?:be )?(?:used|permitted|allowed|shared)|prohibit\w*|forbid\w*|must not|may not|no (?:customer|client|bank) data is|is not used|are not used|will not (?:be )?used|do not (?:use|share|train|enter|store))\b/i,
};

const REDFLAGS = {
  D2: { rx: /\b(use|used|uses|using|reuse|reused|leverage|retain)\b[^.]{0,70}\b(data|conversations|inputs|transcripts|chats|images|records)\b[^.]{0,70}\b(train|improv|fine-tun|enhanc|develop)|\b(data|conversations|inputs|transcripts|chats|images|records)\b[^.]{0,60}\b(used|reused|fed)\b[^.]{0,40}\b(train|improv|fine-tun|enhanc)/i,
        text: "Says bank or customer data is used to train or improve AI models" },
  G2: { rx: /\b(chatgpt|copilot|gemini|public (?:ai|genai|llm)s?|free ai tools?)\b[^.]{0,90}\b(code|data|documents|client|bank|customer)/i,
        text: "Staff put bank code or data into public GenAI tools" },
  S1: { rx: /\b(shared (?:accounts?|logins?|passwords?|credentials)|no mfa|without mfa|password[- ]only|single[- ]factor)\b/i,
        text: "Weak access control: shared accounts or no multi-factor login" },
  S2: { rx: /\b((?:never|not) (?:been )?(?:pen(?:etration)?[- ]?)?tested|no (?:penetration|pen) test)/i,
        text: "No independent security testing" },
  D4: { rx: /\b(not sure where|unknown (?:location|region)|cannot confirm (?:the )?location)\b/i,
        text: "Supplier cannot say where the data is stored" },
  I2: { rx: /\b(within (?:7|10|14|30) (?:business |working )?days|no (?:contractual )?obligation to notify)\b/i,
        text: "Breach notification far too slow or not committed" },
  M2: { rx: /\b(never (?:been )?tested for bias|no bias test(?:ing)?)\b/i, text: "Model never tested for bias" },
};
const PROHIBITION_GOOD = new Set(["D2", "G2"]);

export function assessAnswer(answer, controlId) {
  const a = (answer || "").trim();
  const signals = [];
  const words = a.split(/\s+/).filter(Boolean).length;
  if (!a) return { status: "missing", score: 0, stance: "blank", signals: [{ t: "bad", m: "No answer given" }] };

  const rf = REDFLAGS[controlId];
  const prohibited = RX.prohibition.test(a);
  if (rf && rf.rx.test(a) && !(PROHIBITION_GOOD.has(controlId) && prohibited)) {
    return { status: "redflag", score: 0, stance: "redflag", signals: [{ t: "bad", m: rf.text }], redFlag: rf.text };
  }

  let stance;
  if (PROHIBITION_GOOD.has(controlId) && prohibited) { stance = "affirm"; }
  else if (/^\s*n\/?a\b|not applicable/i.test(a)) stance = "na";
  else if (RX.planned.test(a)) stance = "planned";
  else if (RX.negative.test(a) && !RX.affirm.test(a.slice(0, 4))) stance = "negative";
  else if (RX.partial.test(a)) stance = "partial";
  else if (RX.affirm.test(a) || RX.doneVerb.test(a) || RX.specific.some(rx => rx.test(a)) || words >= 12) stance = "affirm";
  else stance = "unclear";

  const base = { affirm: 68, partial: 45, planned: 25, negative: 10, na: 30, unclear: 40 }[stance];
  let score = base;
  const stanceMsg = {
    affirm: ["good", "Confirms the control is in place"],
    partial: ["warn", "Only partly in place"],
    planned: ["bad", "Not in place yet: only planned"],
    negative: ["bad", "Says the control is not in place"],
    na: ["warn", "Claims \"not applicable\": check if that's true for this service"],
    unclear: ["warn", "Answer doesn't clearly say yes or no"],
  }[stance];
  signals.push({ t: stanceMsg[0], m: stanceMsg[1] });

  if (stance === "affirm" || stance === "partial") {
    const specifics = RX.specific.filter(rx => rx.test(a)).length;
    if (specifics) { score += Math.min(24, specifics * 8); signals.push({ t: "good", m: `Gives specifics (${specifics} detail${specifics > 1 ? "s" : ""}: frequency, numbers, standards or roles)` }); }
    if (PROHIBITION_GOOD.has(controlId) && prohibited) { score += 8; signals.push({ t: "good", m: "Clear commitment that this will not happen" }); }
    if (RX.evidence.test(a)) { score += 10; signals.push({ t: "good", m: "Points to evidence (report, policy or certificate)" }); }
    else if (RX.onRequest.test(a)) { score += 3; signals.push({ t: "warn", m: "Evidence only \"on request\": ask for it now" }); }
    const vague = [...new Set((a.match(RX.vague) || []).map(v => v.toLowerCase()))];
    if (vague.length) { score -= Math.min(30, vague.length * 15); signals.push({ t: "warn", m: `Vague wording: "${vague.slice(0, 3).join("\", \"")}"` }); }
    if (RX.defer.test(a)) { score -= 15; signals.push({ t: "warn", m: "Pushes responsibility to another party" }); }
    if (stance === "affirm" && words <= 4 && !specifics) { score = Math.min(score, 55); signals.push({ t: "warn", m: "Bare \"yes\" with no detail" }); }
  }
  if (controlId === "R3" && /^(no|none)\b|\bno subcontractors?\b/i.test(a)) {
    stance = "affirm"; score = 75; signals.length = 0; signals.push({ t: "good", m: "No subcontractors involved, so no fourth-party risk" });
  }
  if (controlId === "I2") {
    const m = a.match(/(\d+)\s?(hours?|hrs?|days?)/i);
    if (m) {
      const hrs = +m[1] * (/day/i.test(m[2]) ? 24 : 1);
      if (hrs <= 24) { score += 6; signals.push({ t: "good", m: `Commits to notify within ${hrs} hours` }); }
      else if (hrs <= 72) { score -= 20; signals.push({ t: "warn", m: `${hrs} hours is slow; banks usually expect 24 hours or less` }); }
      else { score -= 35; signals.push({ t: "bad", m: `${hrs} hours is far too slow for incident notification` }); }
    } else if (stance !== "negative") { score -= 10; signals.push({ t: "warn", m: "No time limit committed" }); }
  }
  if (controlId === "D4" && /\b(us|u\.s\.|united states|mainland|china|philippines|vietnam|india|overseas|singapore|europe|japan)\b/i.test(a)
      && !/\b(safeguard|contract\w*|encrypt\w*|same controls|approved|consent)\b/i.test(a)) {
    score -= 20; signals.push({ t: "warn", m: "Data goes outside Hong Kong with no safeguards mentioned" });
  }
  if (controlId === "R3" && /\b(subcontract|sub-processor|openai|anthropic|google cloud|aws|azure|third[- ]party model|language model|llm|model provider|freelancer|partner)\b/i.test(a) && !/\b(approv|disclos|notify|bound|same obligations|consent)\w*/i.test(a)) {
    score -= 15; signals.push({ t: "warn", m: "Uses subcontractors but doesn't say they're approved or bound by the same terms" });
  }
  score = Math.max(0, Math.min(100, score));
  const status = score >= 80 ? "strong" : score >= 60 ? "adequate" : score >= 40 ? "weak" : "gap";
  return { status, score, stance, signals };
}

// ---------------- 4 & 5. Score and decide ----------------
export const STATUS = {
  strong:   { label: "Strong",     rank: 5 },
  adequate: { label: "Adequate",   rank: 4 },
  weak:     { label: "Weak",       rank: 3 },
  gap:      { label: "Gap",        rank: 2 },
  missing:  { label: "Not answered", rank: 1 },
  redflag:  { label: "Red flag",   rank: 0 },
  na:       { label: "Not needed", rank: 6 },
};
const BAD = new Set(["weak", "gap", "missing", "redflag"]);

export function inherentRisk(profile = {}) {
  const points = PROFILE.reduce((s, p) => s + (profile[p.key] ? p.points : 0), 0);
  const level = points >= 7 ? "Critical" : points >= 5 ? "High" : points >= 3 ? "Medium" : "Low";
  const factor = { Low: 0.55, Medium: 0.7, High: 0.85, Critical: 1 }[level];
  return { points, level, factor };
}

export function analyseSupplier(supplier) {
  const cat = categoryByKey[supplier.category] || categoryByKey.software;
  const responses = (supplier.responses || []).map((r, i) => {
    const m = mapQuestion(r.q, r.a);
    const assessment = m.controlId ? assessAnswer(r.a, m.controlId) : null;
    return { ...r, i, controlId: m.controlId, confidence: m.confidence, assessment };
  });

  const controls = {};
  for (const c of CONTROLS) {
    const w = cat.weights[c.id] ?? 0;
    const mine = responses.filter(r => r.controlId === c.id);
    let status, score, best = null;
    if (!mine.length) { status = w ? "missing" : "na"; score = 0; }
    else {
      const red = mine.find(r => r.assessment.status === "redflag");
      best = red || mine.reduce((a, b) => (b.assessment.score > a.assessment.score ? b : a));
      status = best.assessment.status; score = best.assessment.score;
    }
    controls[c.id] = { id: c.id, weight: w, status, score, best, responses: mine.map(r => r.i) };
  }

  const scored = Object.values(controls).filter(c => c.weight > 0);
  const wsum = scored.reduce((s, c) => s + c.weight, 0) || 1;
  const controlScore = Math.round(scored.reduce((s, c) => s + c.weight * c.score, 0) / wsum);
  const families = FAMILIES.map(f => {
    const cs = scored.filter(c => controlById[c.id].fam === f.key);
    const fw = cs.reduce((s, c) => s + c.weight, 0);
    return { ...f, score: fw ? Math.round(cs.reduce((s, c) => s + c.weight * c.score, 0) / fw) : null,
      bad: cs.filter(c => BAD.has(c.status)).length, total: cs.length };
  });

  const inh = inherentRisk(supplier.profile);
  const redFlags = scored.filter(c => c.status === "redflag").map(c => ({ id: c.id, text: c.best.assessment.redFlag, quote: c.best.a }));
  const riskScore = Math.min(100, Math.round(inh.factor * (100 - controlScore) + 10 * redFlags.length));
  const issues = scored.filter(c => BAD.has(c.status) && c.weight >= 2)
    .sort((a, b) => b.weight - a.weight || STATUS[a.status].rank - STATUS[b.status].rank);
  const criticalIssues = issues.filter(c => c.weight === 3).length;

  // Rating: start from the risk score, then apply floors so serious gaps can't be averaged away.
  const order = ["Low", "Medium", "High"];
  let rating = riskScore >= 45 ? "High" : riskScore >= 25 ? "Medium" : "Low";
  const raise = (to) => { if (order.indexOf(to) > order.indexOf(rating)) rating = to; };
  const ratingReasons = [`Risk score ${riskScore}/100`];
  if (redFlags.length) { raise("High"); ratingReasons.push(`${redFlags.length} red flag(s)`); }
  if (criticalIssues >= 3) { raise("High"); ratingReasons.push(`${criticalIssues} gaps in critical controls`); }
  else if (criticalIssues >= 1) { raise("Medium"); ratingReasons.push(`${criticalIssues} gap(s) in critical controls`); }
  if (issues.length >= 4) { raise("Medium"); ratingReasons.push(`${issues.length} important controls need follow-up`); }
  const recommendation = redFlags.length ? { key: "hold", label: "Hold: resolve red flags first", short: "Hold" }
    : rating === "High" ? { key: "escalate", label: "Escalate: fix key gaps before approval", short: "Escalate" }
    : (rating === "Medium" || issues.length) ? { key: "conditions", label: "Approve with conditions", short: "Conditions" }
    : { key: "approve", label: "Approve", short: "Approve" };
  const conditions = issues.map(c => ({ id: c.id, text: controlById[c.id].good, critical: c.weight === 3 || c.status === "redflag" }));
  const followUps = issues.map(c => ({ id: c.id, text: controlById[c.id].followUp }));
  const reviewMonths = recommendation.key === "approve" ? 24 : recommendation.key === "conditions" ? 12 : 6;
  const coverage = { asked: scored.filter(c => c.responses.length).length, needed: scored.length };
  const unmapped = responses.filter(r => !r.controlId).length;

  return { supplier, category: cat, responses, controls, families, controlScore, inherent: inh, riskScore, rating, ratingReasons, criticalIssues,
    redFlags, issues, recommendation, conditions, followUps, reviewMonths, coverage, unmapped };
}

export function followUpEmail(result, bankName = "Harbour Bank") {
  const s = result.supplier;
  const lines = [
    `Subject: ${s.name}: follow-up questions on your supplier due-diligence questionnaire`,
    "",
    `Dear ${s.contact || s.name + " team"},`,
    "",
    `Thank you for completing our supplier questionnaire. Before we can complete our review, please respond to the points below${result.redFlags.length ? ". Items marked [URGENT] must be resolved before we can proceed" : ""}:`,
    "",
    ...result.followUps.map((f, i) => `${i + 1}. ${result.controls[f.id].status === "redflag" ? "[URGENT] " : ""}${controlById[f.id].name}: ${f.text}`),
    "",
    "Where possible, please attach supporting evidence (policies, reports or certificates).",
    "",
    "Kind regards,",
    `Third-Party Risk Management, ${bankName}`,
  ];
  return lines.join("\n");
}

export function portfolio(results) {
  const byControl = CONTROLS.map(c => {
    const affected = results.filter(r => r.controls[c.id].weight >= 2 && BAD.has(r.controls[c.id].status));
    return { id: c.id, name: c.name, count: affected.length, of: results.filter(r => r.controls[c.id].weight >= 2).length, suppliers: affected.map(r => r.supplier.name) };
  }).filter(x => x.count).sort((a, b) => b.count - a.count);
  const counts = { High: 0, Medium: 0, Low: 0 };
  results.forEach(r => counts[r.rating]++);
  return {
    total: results.length, counts,
    redFlags: results.reduce((s, r) => s + r.redFlags.length, 0),
    followUps: results.reduce((s, r) => s + r.followUps.length, 0),
    avgControl: results.length ? Math.round(results.reduce((s, r) => s + r.controlScore, 0) / results.length) : 0,
    commonGaps: byControl,
    queue: [...results].sort((a, b) => ({ High: 0, Medium: 1, Low: 2 }[a.rating] - { High: 0, Medium: 1, Low: 2 }[b.rating]) || (b.redFlags.length - a.redFlags.length) || (b.riskScore - a.riskScore)),
  };
}

// ---------------- Findings: the 1-2-3-4 view ----------------
// For every control that needs attention:
//   (1) the supplier's answer  (2) what's missing against the rules
//   (3) the required action    (4) the rule source
export const REC_MEANING = {
  approve: "The answers meet the bank's requirements. Onboard as normal.",
  conditions: "Can be onboarded once the required actions are written into the contract, with deadlines.",
  escalate: "Too many serious gaps for an analyst to approve alone. Send to the risk committee; the supplier must fix critical items first.",
  hold: "A red flag was found. Pause onboarding until the supplier fixes it.",
};
export const RED_FLAG_MEANING = "An answer that shows a serious problem, not just a missing detail. For example, the supplier says it trains its AI on bank customers' data. Any red flag puts the supplier on hold.";

const ACTION = {
  redflag: { label: "Fix before onboarding", cls: "redflag" },
  gap: { label: "Require before go-live", cls: "gap" },
  missing: { label: "Ask the supplier", cls: "missing" },
  weak: { label: "Request evidence", cls: "weak" },
};

export function findings(result) {
  const out = [], ok = [];
  for (const c of CONTROLS) {
    const rc = result.controls[c.id];
    if (!rc.weight) continue;
    if (rc.status === "strong" || rc.status === "adequate") { ok.push({ id: c.id, control: c, status: rc.status, answer: rc.best?.a || "" }); continue; }
    const b = rc.best, a = b?.a || "";
    const sig = b?.assessment?.signals || [];
    let issue, action;
    if (rc.status === "redflag") {
      issue = `${b.assessment.redFlag}.`;
      action = `Do not proceed until fixed. Require ${c.fix}.`;
    } else if (rc.status === "missing") {
      issue = rc.responses.length ? "The supplier left this blank." : "The questionnaire did not cover this.";
      action = `Ask the supplier: ${c.followUp}`;
    } else if (rc.status === "gap") {
      const st = b?.assessment?.stance;
      issue = st === "planned" ? "Not in place yet: only planned." : st === "negative" ? "The supplier says this is not in place."
        : st === "na" ? `The supplier says "not applicable", but this matters for a ${result.category.name.toLowerCase()} supplier.`
        : "The answer does not show this control is in place.";
      issue += " " + sig.filter(s => s.t !== "good" && !/not in place|only planned|not applicable/i.test(s.m)).map(s => s.m + ".").join(" ");
      action = `Require ${c.fix}, as a contract condition with a deadline.`;
    } else {
      const warns = sig.filter(s => s.t !== "good").map(s => s.m);
      const noEvidence = !sig.some(s => /evidence/i.test(s.m) && s.t === "good");
      issue = (warns.length ? warns.slice(0, 2).join(". ") + "." : "The answer is too general to rely on.") + (noEvidence ? " No evidence provided." : "");
      action = `Request evidence: ${c.evidence}.`;
    }
    out.push({
      id: c.id, control: c, status: rc.status, weight: rc.weight,
      priority: rc.status === "redflag" ? "Urgent" : rc.weight === 3 ? "High" : rc.weight === 2 ? "Medium" : "Low",
      question: b?.q || null, answer: a, issue: issue.trim(), expected: c.good, action, actionType: ACTION[rc.status] || ACTION.weak,
      rules: c.rules,
    });
  }
  const order = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
  out.sort((x, y) => order[x.priority] - order[y.priority]);
  return { actions: out, satisfactory: ok };
}
