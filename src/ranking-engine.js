// Enhanced Ranking Engine — extends the base ranking.js with additional
// signals: PageRank-like authority propagation, semantic similarity,
// query expansion, result diversification, and personalization hooks.
//
// All signals are pure functions returning values in [0, 1] so the final
// score is a transparent weighted sum. This file is additive — it imports
// from ranking.js and layers on top without replacing it.

import {
  WEIGHTS as BASE_WEIGHTS,
  buildQueryContext,
  bm25Score,
  titleMatchScore,
  authorityScore,
  structureScore,
  agreementScore,
  rrfNormalised,
  proximityScore,
  parkedDemote,
  combineScore,
  stripTitleBrand,
  tokenise,
  freshnessScore,
  domainReputationScore,
  snippetQualityScore,
} from "./ranking.js";

// ── Extended weight set ───────────────────────────────────────────────────────
// Adds freshness, domain reputation, snippet quality, and semantic signals
// on top of the base weights. Weights are normalised to sum to 1.
export const EXTENDED_WEIGHTS = Object.freeze({
  bm25:            0.28,
  titleMatch:      0.22,
  agreement:       0.07,
  authority:       0.12,
  rrf:             0.04,
  structure:       0.05,
  proximity:       0.07,
  freshness:       0.05,
  domainRep:       0.04,
  snippetQuality:  0.03,
  semantic:        0.03,
});

// ── TF-IDF corpus statistics ──────────────────────────────────────────────────
// We maintain a lightweight in-memory IDF table built from result titles
// seen in this session. This gives us real IDF weights without a fixed
// vocabulary or external corpus.
const idfTable = new Map();
let idfDocCount = 0;

export function updateIdf(results) {
  if (!Array.isArray(results) || !results.length) return;
  idfDocCount += results.length;
  for (const r of results) {
    const tokens = tokenise((r.title || "") + " " + (r.snippet || r.text || ""));
    const seen = new Set(tokens);
    for (const tok of seen) {
      idfTable.set(tok, (idfTable.get(tok) || 0) + 1);
    }
  }
  // Cap table size to avoid unbounded growth
  if (idfTable.size > 50_000) {
    const entries = [...idfTable.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30_000);
    idfTable.clear();
    for (const [k, v] of entries) idfTable.set(k, v);
  }
}

function idfWeight(token) {
  if (!idfDocCount) return 1;
  const df = idfTable.get(token) || 1;
  return Math.log((idfDocCount + 1) / (df + 1)) + 1;
}

// ── Semantic similarity (lightweight) ────────────────────────────────────────
// Without embeddings we approximate semantic similarity using:
//   1. Synonym expansion (from ranking.js SYNONYMS table)
//   2. Jaccard similarity on token sets
//   3. Co-occurrence of query tokens in the same sentence
export function semanticScore(item, ctx) {
  const title = stripTitleBrand((item.title || "").toLowerCase());
  const snippet = (item.snippet || item.text || "").toLowerCase();
  const combined = title + " " + snippet;
  const docTokens = new Set(tokenise(combined));
  const queryTokens = new Set(ctx.tokens);

  // Jaccard similarity: |intersection| / |union|
  let intersection = 0;
  for (const t of queryTokens) {
    if (docTokens.has(t)) intersection++;
  }
  const union = queryTokens.size + docTokens.size - intersection;
  const jaccard = union > 0 ? intersection / union : 0;

  // Sentence co-occurrence: do all query tokens appear in the same sentence?
  const sentences = combined.split(/[.!?]+/);
  let maxCoOccurrence = 0;
  for (const sent of sentences) {
    let hits = 0;
    for (const t of ctx.tokens) {
      if (sent.includes(t)) hits++;
    }
    const ratio = ctx.tokens.length > 0 ? hits / ctx.tokens.length : 0;
    if (ratio > maxCoOccurrence) maxCoOccurrence = ratio;
  }

  return clamp01(jaccard * 0.6 + maxCoOccurrence * 0.4);
}

// ── PageRank-like authority propagation ───────────────────────────────────────
// We don't have a real link graph, so we approximate PageRank using:
//   1. Domain tier (from POPULAR_HOSTS in aggregator.js, passed as `tier`)
//   2. Number of engines that returned this result (agreement signal)
//   3. URL depth (shallow = more authoritative)
//   4. TLD reputation (.edu, .gov, .org)
export function pageRankScore(item) {
  const url = item.url || "";
  let score = 0;

  // Domain tier from aggregator
  const tier = Number(item.tier || item.popularHostTier || 0);
  score += authorityScore(tier) * 0.4;

  // Agreement across engines
  const nEngines = (item.engines || []).length || 1;
  score += agreementScore(nEngines) * 0.3;

  // URL depth (shallower = more authoritative)
  try {
    const u = new URL(url);
    const depth = u.pathname.split("/").filter(Boolean).length;
    score += Math.max(0, 1 - depth * 0.15) * 0.2;
  } catch { /* ignore */ }

  // TLD reputation
  try {
    const host = new URL(url).hostname.toLowerCase();
    score += domainReputationScore(host) * 0.1;
  } catch { /* ignore */ }

  return clamp01(score);
}

// ── Freshness scoring ─────────────────────────────────────────────────────────
// Wraps the base freshnessScore with additional signals:
//   - Publication date in URL (e.g. /2024/01/15/)
//   - "Updated" or "Published" in snippet
export function enhancedFreshnessScore(item) {
  const base = freshnessScore(item.indexed_at || item.indexedAt || 0);

  // Check for date patterns in URL
  const url = item.url || "";
  const yearMatch = url.match(/\/(20\d{2})\//);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    const currentYear = new Date().getFullYear();
    const age = currentYear - year;
    if (age === 0) return clamp01(base + 0.15);
    if (age === 1) return clamp01(base + 0.08);
    if (age >= 5) return clamp01(base - 0.1);
  }

  // Check for freshness signals in snippet
  const snippet = (item.snippet || item.text || "").toLowerCase();
  if (/updated|published|posted|written/.test(snippet)) {
    return clamp01(base + 0.05);
  }

  return base;
}

// ── Query expansion ───────────────────────────────────────────────────────────
// Generates alternative query phrasings using synonym expansion and
// common intent patterns. Returns an array of expanded query strings.
const INTENT_EXPANSIONS = {
  tutorial: ["how to", "guide", "step by step", "learn", "getting started"],
  comparison: ["vs", "versus", "compare", "difference between", "which is better"],
  definition: ["what is", "definition", "meaning", "explained"],
  install: ["how to install", "setup", "configure", "getting started"],
  debug: ["fix", "solution", "error", "troubleshoot", "not working"],
};

export function expandQueryLocally(query) {
  if (!query || query.length < 2) return [];
  const tokens = tokenise(query);
  const expansions = new Set();

  // Add synonym expansions
  const SYNONYMS = {
    docs: "documentation", js: "javascript", ts: "typescript",
    py: "python", rs: "rust", go: "golang", k8s: "kubernetes",
    postgres: "postgresql", gh: "github", so: "stackoverflow",
    api: "interface", ui: "interface", ux: "experience",
    ml: "machine learning", ai: "artificial intelligence",
    db: "database", os: "operating system", cli: "command line",
  };

  for (const tok of tokens) {
    const syn = SYNONYMS[tok];
    if (syn) {
      expansions.add(query.replace(new RegExp(`\\b${tok}\\b`, "gi"), syn));
    }
  }

  // Add intent-based expansions
  const lower = query.toLowerCase();
  for (const [intent, phrases] of Object.entries(INTENT_EXPANSIONS)) {
    for (const phrase of phrases) {
      if (lower.includes(phrase)) {
        expansions.add(`${query} ${intent}`);
        break;
      }
    }
  }

  return [...expansions].slice(0, 4);
}

// ── Result diversification ────────────────────────────────────────────────────
// Groups results by topic cluster and ensures diversity across clusters.
// Uses token overlap to detect near-duplicate results.
export function diversifyResults(results, opts = {}) {
  const maxPerCluster = opts.maxPerCluster || 2;
  const similarityThreshold = opts.similarityThreshold || 0.7;

  const clusters = [];
  const assigned = new Set();

  for (let i = 0; i < results.length; i++) {
    if (assigned.has(i)) continue;
    const cluster = [i];
    assigned.add(i);

    const tokensI = new Set(tokenise((results[i].title || "") + " " + (results[i].snippet || "")));

    for (let j = i + 1; j < results.length; j++) {
      if (assigned.has(j)) continue;
      const tokensJ = new Set(tokenise((results[j].title || "") + " " + (results[j].snippet || "")));

      // Jaccard similarity
      let inter = 0;
      for (const t of tokensI) if (tokensJ.has(t)) inter++;
      const union = tokensI.size + tokensJ.size - inter;
      const sim = union > 0 ? inter / union : 0;

      if (sim >= similarityThreshold) {
        cluster.push(j);
        assigned.add(j);
      }
    }
    clusters.push(cluster);
  }

  // Take up to maxPerCluster from each cluster, in score order
  const output = [];
  const clusterQueues = clusters.map((c) => [...c]);

  let round = 0;
  while (output.length < results.length && round < maxPerCluster) {
    for (const queue of clusterQueues) {
      if (round < queue.length) {
        output.push(results[queue[round]]);
      }
    }
    round++;
  }

  return output;
}

// ── User engagement signals ───────────────────────────────────────────────────
// Lightweight click-through rate estimation based on position and domain.
// In a real system this would use actual CTR data; here we use priors.
export function engagementScore(item, position) {
  // Position prior: top results get more clicks (log-normal distribution)
  const positionScore = position <= 0 ? 1 : Math.max(0, 1 - Math.log(position + 1) / Math.log(20));

  // Domain familiarity: well-known domains get higher CTR
  const host = (item.host || "").toLowerCase().replace(/^www\./, "");
  const knownDomains = new Set([
    "wikipedia.org", "github.com", "stackoverflow.com", "mozilla.org",
    "python.org", "nodejs.org", "npmjs.com", "docs.python.org",
    "developer.mozilla.org", "medium.com", "dev.to", "reddit.com",
  ]);
  const domainBonus = knownDomains.has(host) ? 0.2 : 0;

  return clamp01(positionScore * 0.8 + domainBonus);
}

// ── Reading time estimation ───────────────────────────────────────────────────
// Returns estimated reading time in minutes based on word count.
export function estimateReadingTime(text) {
  const words = (text || "").split(/\s+/).filter(Boolean).length;
  const wpm = 200; // average reading speed
  const minutes = Math.ceil(words / wpm);
  return Math.max(1, minutes);
}

// ── Content quality score ─────────────────────────────────────────────────────
// Combines multiple quality signals into a single 0..1 score.
export function contentQualityScore(item) {
  const snippet = item.snippet || item.text || "";
  const title = item.title || "";

  let score = 0;

  // Snippet quality (from base ranking.js)
  score += snippetQualityScore(snippet) * 0.3;

  // Title quality: not too short, not too long
  const titleWords = title.split(/\s+/).filter(Boolean).length;
  if (titleWords >= 3 && titleWords <= 15) score += 0.2;
  else if (titleWords >= 1) score += 0.1;

  // Content length: longer is generally better (up to a point)
  const textLen = snippet.length;
  if (textLen >= 200) score += 0.2;
  if (textLen >= 500) score += 0.1;
  if (textLen >= 1000) score += 0.1;

  // No excessive punctuation (spam signal)
  const punctRatio = (snippet.match(/[!?]{2,}/g) || []).length / Math.max(1, snippet.length / 100);
  if (punctRatio < 0.5) score += 0.1;

  return clamp01(score);
}

// ── Combined enhanced score ───────────────────────────────────────────────────
// Computes the full enhanced score for a result item given a query context.
// Drops in as a replacement for combineScore() in aggregator.js.
export function enhancedScore(item, ctx, opts = {}) {
  const position = opts.position || 0;
  const rrfMax = opts.rrfMax || 1;

  const signals = {
    bm25:           bm25Score(item, ctx),
    titleMatch:     titleMatchScore(item, ctx),
    agreement:      agreementScore((item.engines || []).length || 1),
    authority:      authorityScore(item.tier || item.popularHostTier || 0),
    rrf:            rrfNormalised(item.rrfScore || 0, rrfMax),
    structure:      structureScore(item.url || "", ctx),
    proximity:      proximityScore(item, ctx),
    freshness:      enhancedFreshnessScore(item),
    domainRep:      domainReputationScore((item.host || "").toLowerCase()),
    snippetQuality: snippetQualityScore(item.snippet || item.text || ""),
    semantic:       semanticScore(item, ctx),
  };

  // Apply parked-domain penalty
  const parkedPenalty = parkedDemote(item.host || "");

  let total = 0;
  for (const [k, w] of Object.entries(EXTENDED_WEIGHTS)) {
    total += w * clamp01(signals[k] || 0);
  }

  return clamp01(total - parkedPenalty);
}

// ── Keyword extraction ────────────────────────────────────────────────────────
// Extracts the most important keywords from a text using TF-IDF weights.
export function extractKeywords(text, topN = 10) {
  const tokens = tokenise(text);
  const STOPWORDS = new Set([
    "the", "a", "an", "of", "is", "are", "to", "in", "on", "for", "and", "or",
    "it", "be", "was", "were", "by", "at", "as", "this", "that", "with", "from",
    "what", "who", "why", "how", "do", "does", "did", "has", "have", "had",
    "will", "would", "could", "should", "may", "might", "can", "not", "no",
  ]);

  const freq = new Map();
  for (const tok of tokens) {
    if (tok.length < 3 || STOPWORDS.has(tok)) continue;
    freq.set(tok, (freq.get(tok) || 0) + 1);
  }

  // Weight by TF-IDF
  const scored = [...freq.entries()].map(([tok, tf]) => ({
    token: tok,
    score: tf * idfWeight(tok),
  }));

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((e) => e.token);
}

// ── Related searches ──────────────────────────────────────────────────────────
// Generates related search suggestions from query + result titles.
export function buildRelatedSearches(query, results, limit = 8) {
  if (!query || query.length < 2) return [];
  const base = query.trim();
  const out = new Set();

  // Intent-based suffixes
  const SUFFIXES = ["tutorial", "explained", "examples", "vs", "documentation",
    "open source", "github", "wikipedia", "alternative", "review", "how to use"];
  for (const suf of SUFFIXES) {
    if (out.size >= limit) break;
    if (!base.toLowerCase().includes(suf)) out.add(`${base} ${suf}`);
  }

  // Mine tokens from top result titles
  const STOPWORDS = new Set(["the", "a", "an", "of", "is", "are", "to", "in", "on", "for", "and", "or"]);
  const seenTok = new Set(tokenise(base));
  const tokFreq = new Map();
  for (const r of (results || []).slice(0, 10)) {
    const words = tokenise(r?.title || "");
    for (const w of words) {
      if (w.length < 4 || STOPWORDS.has(w) || seenTok.has(w)) continue;
      tokFreq.set(w, (tokFreq.get(w) || 0) + 1);
    }
  }
  const topTok = [...tokFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  for (const [w] of topTok) {
    if (out.size >= limit) break;
    out.add(`${base} ${w}`);
  }

  return [...out].slice(0, limit);
}

// ── Utility ───────────────────────────────────────────────────────────────────
function clamp01(x) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

// Re-export base ranking functions for convenience
export {
  buildQueryContext,
  bm25Score,
  titleMatchScore,
  authorityScore,
  structureScore,
  agreementScore,
  rrfNormalised,
  proximityScore,
  parkedDemote,
  combineScore,
  stripTitleBrand,
  tokenise,
  freshnessScore,
  domainReputationScore,
  snippetQualityScore,
  BASE_WEIGHTS,
};
