// Lightweight text retrieval: tokeniser, stemmer and Okapi BM25 ranking.
// Runs fully in the browser, so no document ever leaves the user's device.

const STOP = new Set(("a an the and or of to in on for with by at from as is are was were be been being " +
  "it its this that these those we our us you your they their them he she his her i me my do does did " +
  "have has had can could should would will shall may might must each every any all into than then so " +
  "such about over under per via if also which who whom what when where how why").split(" "));

export function stem(w) {
  // Small suffix-stripping stemmer (Porter-inspired) - good enough for policy text.
  if (w.length <= 3) return w;
  const rules = [
    ["isation", "ise"], ["ization", "ize"], ["ational", "ate"], ["fulness", "ful"],
    ["iveness", "ive"], ["ments", "ment"], ["ities", "ity"], ["ingly", ""], ["edly", ""],
    ["ings", ""], ["ing", ""], ["ies", "y"], ["ied", "y"], ["ed", ""], ["es", ""], ["s", ""],
  ];
  for (const [suf, rep] of rules) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) {
      w = w.slice(0, -suf.length) + rep;
      break;
    }
  }
  // Normalise British/American spellings used in HK documents.
  return w.replace(/ise$/, "ize").replace(/yse$/, "yze");
}

export function tokenize(text, { keepStop = false } = {}) {
  return (text.toLowerCase().replace(/red-team/g, "redteam").replace(/red team/g, "redteam")
    .match(/[a-z0-9]+/g) || [])
    .filter(t => keepStop || !STOP.has(t))
    .map(stem);
}

export function splitSentences(text) {
  return text
    .replace(/\r/g, "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.replace(/^[\s\-•*\d.)]+/, "").trim())
    .filter(s => s.length > 12);
}

export class BM25 {
  constructor(docs, { k1 = 1.4, b = 0.75 } = {}) {
    this.k1 = k1; this.b = b;
    this.docs = docs.map(d => tokenize(d));
    this.N = this.docs.length;
    this.avgdl = this.docs.reduce((s, d) => s + d.length, 0) / Math.max(1, this.N);
    this.df = new Map();
    for (const d of this.docs) for (const t of new Set(d)) this.df.set(t, (this.df.get(t) || 0) + 1);
    this.tf = this.docs.map(d => {
      const m = new Map();
      for (const t of d) m.set(t, (m.get(t) || 0) + 1);
      return m;
    });
  }
  idf(t) {
    const n = this.df.get(t) || 0;
    return Math.log(1 + (this.N - n + 0.5) / (n + 0.5));
  }
  score(query, i) {
    const q = Array.isArray(query) ? query : tokenize(query);
    const tf = this.tf[i], dl = this.docs[i].length;
    let s = 0;
    for (const t of new Set(q)) {
      const f = tf.get(t);
      if (!f) continue;
      s += this.idf(t) * (f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + this.b * dl / this.avgdl));
    }
    return s;
  }
  // Returns [{index, score, matched}] sorted by score.
  search(query, topK = 3) {
    const q = tokenize(query);
    const qs = new Set(q);
    const out = [];
    for (let i = 0; i < this.N; i++) {
      const s = this.score(q, i);
      if (s > 0) {
        const matched = [...new Set(this.docs[i].filter(t => qs.has(t)))];
        out.push({ index: i, score: s, matched });
      }
    }
    return out.sort((a, b) => b.score - a.score).slice(0, topK);
  }
}
