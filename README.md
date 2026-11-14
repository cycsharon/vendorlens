# VendorLens: AI supplier risk reviews for banks

> **Banks receive hundreds of supplier questionnaires and read them by hand. VendorLens turns them into data, so the risk team can see every AI supplier's weak spots on one screen and know exactly where to look first.**

**Live demo:** `https://<your-github-username>.github.io/<repo-name>/`
**Theme:** Data-driven Apps · **Built for:** BUHack 2.0 (13–15 Nov 2026)

The demo opens pre-loaded with a fictional bank, **Harbour Bank**, and **10 fictional AI suppliers**, so you can explore everything without uploading a file. To try an upload, open **+ Review a supplier → Use a sample questionnaire → Analyse**.

---

## The problem

- A bank relies on hundreds of outside suppliers: cloud hosts, payment processors, chatbots, credit-scoring and fraud models, ID-check tools, data providers.
- **HKMA rules require the bank to check them.** The outsourcing module (SA-2) requires risk assessment, supplier due diligence, data protection, contingency and audit rights. The HKMA's AI Principles add due diligence on AI vendors.
- Today that means sending long questionnaires (often 100+ questions) by email and Excel, specialists **reading every answer by hand**, weeks of follow-up emails, inconsistent judgements, and **no view across all suppliers**, repeated every year.
- AI suppliers are multiplying fast, and most questionnaires and tools were built for general IT security, not AI and not Hong Kong's AI and privacy guidance.

## What VendorLens does

1. **Upload** a supplier's questionnaire answers in any wording: CSV, copy-paste from Excel, or Q:/A: text.
2. **Match:** each of the bank's own questions is linked to one of **24 controls** in 7 areas, built on 5 Hong Kong rules.
3. **Judge every answer:** does it confirm the control, give specifics and evidence, or is it vague, only planned, missing, or a **red flag**?
4. **Score by category:** a chatbot is judged hardest on disclosure and GenAI safety, a credit model on bias and explainability, a cloud host on security and recovery. This is combined with the service's **built-in risk** (customer data, customer-facing, decisions, critical, offshore).
5. **Decide:** a rating (High / Medium / Low), a recommendation (Approve · Approve with conditions · Escalate · Hold), contract conditions and a **ready-to-send follow-up email**. **A person makes every final decision.**
6. **See the portfolio:** a review queue (riskiest first), a heatmap of suppliers × areas, the most common gaps across all suppliers, a risk matrix, and a CSV export.

## Hong Kong rules covered

| Rule | Why it matters |
|---|---|
| HKMA SPM **SA-2 Outsourcing** | Why the check exists: due diligence, data protection, contingency, exit, audit rights |
| HKMA **High-level Principles on AI** (2019) | Accountability, validation, monitoring, explainability, AI-vendor due diligence |
| HKMA **consumer protection** guidance on AI (2019) and GenAI (2024) | Fairness, disclosure, human review, complaints |
| **PDPO**, Data Protection Principles 1–4 | Purpose, retention, use, security of personal data |
| PCPD **AI Model Personal Data Protection Framework** (2024) | Governance, human oversight, supplier contracts, AI incidents |

Rule texts in the app are short paraphrased summaries for the prototype, **not legal text or legal advice**.

## How an answer is judged (`analyzer.js`)

- **Stance:** yes · partly · only planned · no · "not applicable" · unclear.
- **Specifics raise the score:** frequencies, numbers, time limits, standards (ISO 27001, SOC 2, PCI DSS), named roles, dates, contractual commitments.
- **Evidence raises it more:** "report attached", "see policy".
- **Vague wording lowers it:** "regularly", "industry standard", "as appropriate", "best effort".
- **Shifting responsibility lowers it:** "we rely on our provider".
- **Control-specific rules:** e.g. breach notice longer than 24 hours is marked down; data offshore without stated safeguards is marked down; "no subcontractors" is fine.
- **Red flags:** bank or customer data used to train AI, staff pasting code or data into public GenAI tools, shared accounts or no MFA, no security testing, data location unknown, breach notice in 7+ days, models never bias-tested.

## How the rating is set

- **Answer quality** = weighted average of control scores (critical controls count 3×, important 2×, useful 1×).
- **Built-in risk** = points for customer data, customer-facing, decisions about customers, critical service, offshore data.
- **Risk score** = built-in risk factor × (100 − answer quality) + 10 per red flag.
- **Floors**, so serious problems can't be averaged away: any red flag or 3+ critical gaps means **High**; any critical gap or 4+ important gaps means at least **Medium**.

## Run it

Static site, nothing to install.
- **GitHub Pages:** Settings → Pages → *Deploy from a branch* → `main` / root.
- **Locally:** `python3 -m http.server 8000`, then open `http://localhost:8000`.
- **Tests (Node 18+):** `node run-tests.mjs` (30 tests: parsing, question matching, answer judging, red flags, ratings, follow-up emails, portfolio).

## Files

```
index.html               App shell
style.css                Styles
app.js                   Dashboard, supplier review, upload wizard, library, how-it-works
controls.js              5 HK rules, 24 controls, 8 supplier categories and their weights
analyzer.js              Parse → match (BM25) → judge → score → decide; follow-up email; portfolio
bm25.js                  Tokeniser, stemmer and BM25 ranking
samples.js               Harbour Bank and 10 fictional suppliers' questionnaire answers
sample-questionnaire.csv A new supplier's answers, in different wording, to try the upload
run-tests.mjs            Automated tests
```

## Prototype today, production tomorrow

| Part | Prototype | Production |
|---|---|---|
| Matching questions | BM25 keyword retrieval in the browser | Hybrid keyword + embedding search that learns from analyst corrections |
| Judging answers | Transparent rules | Privately hosted language model, with the rules as a cross-check and human review |
| Formats | CSV, Excel paste, text | Excel, PDF and Word questionnaires plus attached evidence |
| Rules | 5 HK rules, paraphrased | Full texts maintained by compliance staff; SFC, ISO/IEC 42001, ISO 27001 |
| Data | Stays in the browser | Bank-hosted or private HK cloud, integrated with vendor-risk systems |

## Notes

Harbour Bank and all suppliers are fictional. Built from scratch during the BUHack 2.0 hacking window (from 10:00, 13 Nov 2026). MIT licence.
