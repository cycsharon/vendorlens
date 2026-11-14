// Run with:  node run-tests.mjs
import { readFileSync } from "node:fs";
import { parseQuestionnaire, mapQuestion, assessAnswer, analyseSupplier, portfolio, followUpEmail, inherentRisk, findings } from "./analyzer.js";
import { QUESTIONS, SAMPLE_SUPPLIERS } from "./samples.js";
import { CONTROLS, CATEGORIES } from "./controls.js";

let pass = 0, fail = 0;
const t = (name, cond, info = "") => { if (cond) { pass++; console.log("  ✓", name); } else { fail++; console.log("  ✗", name, info); } };

console.log("Parsing");
t("CSV with quotes and header", parseQuestionnaire('No.,Question,Answer\n1,"Do you, really?","Yes, ""always"""\n').length === 1);
t("CSV keeps commas inside quotes", parseQuestionnaire('Question,Answer\n"A, B?","C, D"').at(0).a === "C, D");
t("Excel copy-paste (tab separated)", parseQuestionnaire("Question\tAnswer\nIs data encrypted?\tYes, AES-256").at(0).a === "Yes, AES-256");
t("Q:/A: text", parseQuestionnaire("Q: Is MFA on?\nA: Yes for all staff\nQ: Pen test?\nA: May 2026").length === 2);
t("sample CSV has 17 questions", parseQuestionnaire(readFileSync(new URL("./sample-questionnaire.csv", import.meta.url), "utf8")).length === 17);

console.log("Matching the bank's questions to controls");
const expect = { gov: "G1", genai: "G2", pdata: "D1", train: "D2", retention: "D3", location: "D4", encrypt: "D5", validation: "M1", bias: "M2", monitor: "M3", explain: "M4", safety: "M5", access: "S1", pentest: "S2", cert: "S3", bcp: "R1", exit: "R2", subs: "R3", human: "C1", disclose: "C2", complaints: "C3", incident: "I1", notify: "I2", audit: "I3" };
const misses = Object.entries(QUESTIONS).filter(([k, q]) => mapQuestion(q).controlId !== expect[k]).map(([k]) => k);
t("all 24 standard questions map correctly", !misses.length, misses.join(","));
const sample = parseQuestionnaire(readFileSync(new URL("./sample-questionnaire.csv", import.meta.url), "utf8"));
const got = sample.map(r => mapQuestion(r.q, r.a).controlId).join(" ");
t("differently worded questions map correctly", got === "G1 D1 D2 D3 D4 D5 M1 M5 M3 C2 C1 S1 S2 R3 I2 I3 R1", got);
t("unrelated question is not forced onto a control", mapQuestion("What is your favourite colour?").controlId === null);

console.log("Judging answers");
t("specific, evidenced answer is strong", assessAnswer("Independent penetration test completed in August 2026; all high findings fixed. Report attached.", "S2").status === "strong");
t("vague answer is weak", ["weak", "gap"].includes(assessAnswer("We review performance regularly.", "M3").status));
t("planned is a gap", assessAnswer("We plan to commission a penetration test next quarter.", "S2").status === "gap");
t("negative is a gap", assessAnswer("We do not currently label the chatbot as AI.", "C2").status === "gap");
t("blank is missing", assessAnswer("", "R2").status === "missing");
t("training on customer data is a red flag", assessAnswer("We use anonymised customer conversations to improve and fine-tune our models.", "D2").status === "redflag");
t("prohibition on training is good, not a red flag", ["adequate", "strong"].includes(assessAnswer("No. Client data is never used to train or improve any AI model.", "D2").status));
t("pasting code into ChatGPT is a red flag", assessAnswer("Developers use ChatGPT, including pasting client code to debug.", "G2").status === "redflag");
t("shared accounts are a red flag", assessAnswer("Developers share a team account for staging servers.", "S1").status !== "strong");
t("7-day breach notice is a red flag", assessAnswer("Within 7 days.", "I2").status === "redflag");
t("72-hour notice is weaker than 24-hour", assessAnswer("Within 72 hours.", "I2").score < assessAnswer("Within 24 hours.", "I2").score);
t("'no subcontractors' is fine", ["adequate", "strong"].includes(assessAnswer("No subcontractors.", "R3").status));
t("offshore data without safeguards is marked down", assessAnswer("Hosted in the US.", "D4").score < assessAnswer("Hosted in Hong Kong.", "D4").score);

console.log("Scoring and decisions");
const rs = SAMPLE_SUPPLIERS.map(analyseSupplier);
const by = n => rs.find(r => r.supplier.name.startsWith(n));
t("strong cloud host is approved", by("CloudNest").recommendation.key === "approve");
t("chatbot training on chats is put on hold", by("ChatterBox").recommendation.key === "hold");
t("credit model without bias testing is escalated", by("ScoreWise").rating === "High");
t("red flag always means High", rs.every(r => !r.redFlags.length || r.rating === "High"));
t("every category weights every control", CATEGORIES.every(c => CONTROLS.every(k => k.id in c.weights)));
t("inherent risk levels", inherentRisk({}).level === "Low" && inherentRisk({ personalData: true, decisions: true, critical: true, customerFacing: true }).level === "Critical");
const email = followUpEmail(by("ChatterBox"));
t("follow-up email lists every issue", by("ChatterBox").followUps.every(f => email.includes(f.text)) && email.includes("[URGENT]"));
const p = portfolio(rs);
t("portfolio counts add up", p.counts.High + p.counts.Medium + p.counts.Low === rs.length);
const ord = { High: 0, Medium: 1, Low: 2 };
t("queue is sorted by rating, highest risk first", p.queue.every((r, i, a) => !i || ord[a[i - 1].rating] <= ord[r.rating]));

const fc = findings(by("ChatterBox"));
t("findings put red flags first", fc.actions[0].status === "redflag" && fc.actions[0].priority === "Urgent");
t("every finding has answer, issue, action and source", fc.actions.every(a => a.issue && a.action && a.rules.length && a.actionType.label));
t("approved supplier has no required actions", findings(by("CloudNest")).actions.length === 0);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
