// Features module — 40+ search enhancement features for Atomic Search.
// All features are server-side, privacy-preserving, and stateless.
// No user data is stored or logged.

import { cacheGet, cacheSet } from "./storage.js";
import { privateFetch } from "./util.js";
import { isSafeUrl } from "./safeurl.js";
import { detectLanguage, analyzeSentiment, extractEntities } from "./website-summarizer.js";
import { extractKeywords, estimateReadingTime } from "./ranking-engine.js";

// ── 1. Content freshness indicator ───────────────────────────────────────────
export function getFreshnessLabel(indexedAt) {
  if (!indexedAt) return { label: "unknown", color: "gray" };
  const ageDays = (Date.now() - indexedAt) / (24 * 3600 * 1000);
  if (ageDays < 1)   return { label: "today",    color: "green",  ageDays: Math.round(ageDays * 24) + "h" };
  if (ageDays < 7)   return { label: "this week", color: "green",  ageDays: Math.round(ageDays) + "d" };
  if (ageDays < 30)  return { label: "this month", color: "yellow", ageDays: Math.round(ageDays) + "d" };
  if (ageDays < 365) return { label: "this year",  color: "orange", ageDays: Math.round(ageDays) + "d" };
  return { label: "old", color: "red", ageDays: Math.round(ageDays / 365) + "y" };
}

// ── 2. Reading time estimation ────────────────────────────────────────────────
export function getReadingTime(text) {
  const words = (text || "").split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / 200));
  return { minutes, words, label: minutes === 1 ? "1 min read" : `${minutes} min read` };
}

// ── 3. Domain reputation ──────────────────────────────────────────────────────
const TRUSTED_DOMAINS = new Set([
  "wikipedia.org", "github.com", "stackoverflow.com", "mozilla.org",
  "python.org", "nodejs.org", "npmjs.com", "developer.mozilla.org",
  "docs.python.org", "pkg.go.dev", "crates.io", "docs.rs",
  "arxiv.org", "pubmed.ncbi.nlm.nih.gov", "scholar.google.com",
  "nature.com", "science.org", "ieee.org", "acm.org",
  "mit.edu", "stanford.edu", "harvard.edu", "berkeley.edu",
  "gov.uk", "usa.gov", "europa.eu", "un.org",
  "w3.org", "ietf.org", "rfc-editor.org",
]);

const SUSPICIOUS_PATTERNS = [
  /\d{4,}/, // many numbers in domain
  /-(free|download|crack|hack|cheat|keygen|serial)/i,
  /\.(tk|ml|ga|cf|gq)$/, // free TLDs often used for spam
];

export function getDomainReputation(host) {
  if (!host) return { tier: "unknown", score: 0 };
  const h = host.toLowerCase().replace(/^www\./, "");

  if (TRUSTED_DOMAINS.has(h)) return { tier: "trusted", score: 1.0 };
  if (h.endsWith(".edu")) return { tier: "academic", score: 0.9 };
  if (h.endsWith(".gov")) return { tier: "government", score: 0.9 };
  if (h.endsWith(".org")) return { tier: "organization", score: 0.7 };

  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(h)) return { tier: "suspicious", score: 0.1 };
  }

  return { tier: "neutral", score: 0.5 };
}

// ── 4. SSL certificate check (heuristic) ─────────────────────────────────────
export function checkSSL(url) {
  try {
    const u = new URL(url);
    return {
      hasSSL: u.protocol === "https:",
      protocol: u.protocol.replace(":", ""),
      label: u.protocol === "https:" ? "Secure (HTTPS)" : "Not secure (HTTP)",
    };
  } catch {
    return { hasSSL: false, protocol: "unknown", label: "Unknown" };
  }
}

// ── 5. Mobile-friendly check (heuristic) ─────────────────────────────────────
export function checkMobileFriendly(html) {
  if (!html) return { mobileFriendly: false, score: 0 };
  const hasViewport = /meta[^>]+viewport/i.test(html);
  const hasResponsive = /max-width|min-width|@media/i.test(html);
  const hasFlexGrid = /display\s*:\s*(flex|grid)/i.test(html);
  const score = (hasViewport ? 0.5 : 0) + (hasResponsive ? 0.3 : 0) + (hasFlexGrid ? 0.2 : 0);
  return {
    mobileFriendly: score >= 0.5,
    score: Math.round(score * 100),
    signals: { hasViewport, hasResponsive, hasFlexGrid },
  };
}

// ── 6. SEO score (heuristic) ──────────────────────────────────────────────────
export function getSeoScore(content) {
  if (!content) return { score: 0, signals: {} };
  const signals = {
    hasTitle: !!(content.title && content.title.length >= 10 && content.title.length <= 70),
    hasDescription: !!(content.description && content.description.length >= 50 && content.description.length <= 160),
    hasH1: /^#\s|<h1/i.test(content.text || ""),
    hasCanonical: !!content.canonical,
    hasImage: !!content.image,
    goodWordCount: (content.wordCount || 0) >= 300,
    hasAuthor: !!content.author,
  };
  const score = Object.values(signals).filter(Boolean).length / Object.keys(signals).length;
  return { score: Math.round(score * 100), signals };
}

// ── 7. Accessibility score (heuristic) ───────────────────────────────────────
export function getAccessibilityScore(html) {
  if (!html) return { score: 0, signals: {} };
  const signals = {
    hasLang: /html[^>]+lang=/i.test(html),
    hasAltText: /<img[^>]+alt=/i.test(html),
    hasAriaLabels: /aria-label=/i.test(html),
    hasSkipLink: /skip.*nav|skip.*content/i.test(html),
    hasHeadings: /<h[1-6]/i.test(html),
    hasFocusStyles: /:focus/i.test(html),
    hasSemanticHTML: /<(main|nav|header|footer|article|section|aside)/i.test(html),
  };
  const score = Object.values(signals).filter(Boolean).length / Object.keys(signals).length;
  return { score: Math.round(score * 100), signals };
}

// ── 8. Security score (heuristic) ────────────────────────────────────────────
export function getSecurityScore(url, html) {
  const ssl = checkSSL(url);
  const signals = {
    hasSSL: ssl.hasSSL,
    hasCSP: /content-security-policy/i.test(html || ""),
    noInlineScripts: !/<script[^>]*>[^<]{100,}/i.test(html || ""),
    noExternalScripts: !/<script[^>]+src=["']https?:\/\/(?!self)/i.test(html || ""),
    hasHSTS: /strict-transport-security/i.test(html || ""),
  };
  const score = Object.values(signals).filter(Boolean).length / Object.keys(signals).length;
  return { score: Math.round(score * 100), signals };
}

// ── 9. Content quality score ──────────────────────────────────────────────────
export function getContentQualityScore(content) {
  if (!content) return { score: 0, signals: {} };
  const text = content.text || "";
  const signals = {
    sufficientLength: text.length >= 500,
    hasStructure: /^##\s|<h[2-6]/m.test(text),
    hasImages: (content.images || []).length > 0,
    hasAuthor: !!content.author,
    hasDate: !!content.publishDate,
    lowAdDensity: !(/<(ins|iframe)[^>]*ad/i.test(text)),
    goodReadability: text.split(/\s+/).filter(Boolean).length >= 200,
  };
  const score = Object.values(signals).filter(Boolean).length / Object.keys(signals).length;
  return { score: Math.round(score * 100), signals };
}

// ── 10. Duplicate detection ───────────────────────────────────────────────────
// Detects near-duplicate results using shingling (character n-grams).
export function detectDuplicates(results, threshold = 0.8) {
  if (!Array.isArray(results) || results.length < 2) return results;

  function shingle(text, n = 3) {
    const s = (text || "").toLowerCase().replace(/\s+/g, " ").trim();
    const shingles = new Set();
    for (let i = 0; i <= s.length - n; i++) {
      shingles.add(s.slice(i, i + n));
    }
    return shingles;
  }

  function jaccardSim(a, b) {
    let inter = 0;
    for (const s of a) if (b.has(s)) inter++;
    return inter / (a.size + b.size - inter);
  }

  const shingles = results.map((r) =>
    shingle((r.title || "") + " " + (r.snippet || r.text || "").slice(0, 200))
  );

  const isDuplicate = new Array(results.length).fill(false);
  for (let i = 0; i < results.length; i++) {
    if (isDuplicate[i]) continue;
    for (let j = i + 1; j < results.length; j++) {
      if (isDuplicate[j]) continue;
      if (jaccardSim(shingles[i], shingles[j]) >= threshold) {
        isDuplicate[j] = true;
      }
    }
  }

  return results.filter((_, i) => !isDuplicate[i]);
}

// ── 11. Similar results grouping ─────────────────────────────────────────────
export function groupSimilarResults(results) {
  if (!Array.isArray(results)) return [];
  const groups = new Map();

  for (const r of results) {
    try {
      const host = new URL(r.url || "").hostname.replace(/^www\./, "");
      if (!groups.has(host)) groups.set(host, []);
      groups.get(host).push(r);
    } catch {
      groups.set("other", [...(groups.get("other") || []), r]);
    }
  }

  return [...groups.entries()].map(([host, items]) => ({
    host,
    count: items.length,
    items,
    representative: items[0],
  }));
}

// ── 12. Search history (client-side only, no server storage) ─────────────────
// Returns instructions for client-side implementation
export function getSearchHistoryConfig() {
  return {
    storageKey: "atomic:search-history",
    maxEntries: 100,
    ttlDays: 30,
    note: "Search history is stored locally in your browser only. Atomic never logs your queries.",
  };
}

// ── 13. Export results ────────────────────────────────────────────────────────
export function exportResultsAsJson(results, query) {
  return JSON.stringify({
    query,
    exportedAt: new Date().toISOString(),
    count: results.length,
    results: results.map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.snippet || r.text || "",
      host: r.host,
      engines: r.engines,
    })),
  }, null, 2);
}

export function exportResultsAsCsv(results, query) {
  const header = "title,url,snippet,host\n";
  const rows = results.map((r) => {
    const esc = (s) => `"${String(s || "").replace(/"/g, '""')}"`;
    return [esc(r.title), esc(r.url), esc((r.snippet || r.text || "").slice(0, 200)), esc(r.host)].join(",");
  });
  return header + rows.join("\n");
}

// ── 14. Boolean search parser ─────────────────────────────────────────────────
// Parses boolean search operators: AND, OR, NOT, quotes, parentheses.
export function parseBooleanQuery(query) {
  if (!query) return { terms: [], required: [], excluded: [], phrases: [] };

  const phrases = [];
  let q = query.replace(/"([^"]+)"/g, (_, phrase) => {
    phrases.push(phrase.toLowerCase());
    return "";
  });

  const excluded = [];
  q = q.replace(/\bNOT\s+(\S+)|-(\S+)/g, (_, a, b) => {
    excluded.push((a || b).toLowerCase());
    return "";
  });

  const required = [];
  q = q.replace(/\+(\S+)/g, (_, term) => {
    required.push(term.toLowerCase());
    return "";
  });

  const terms = q.split(/\s+(?:AND\s+)?/).map((t) => t.trim().toLowerCase()).filter((t) => t && t !== "or" && t !== "and");

  return { terms, required, excluded, phrases };
}

// ── 15. Fuzzy search ──────────────────────────────────────────────────────────
// Returns true if `text` fuzzy-matches `pattern` within `maxDistance` edits.
export function fuzzyMatch(text, pattern, maxDistance = 2) {
  if (!text || !pattern) return false;
  const t = text.toLowerCase();
  const p = pattern.toLowerCase();
  if (t.includes(p)) return true;

  // Levenshtein distance on first word
  const firstWord = t.split(/\s+/)[0] || "";
  const d = levenshtein(firstWord, p);
  return d <= maxDistance;
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const row = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      row[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, row[j - 1], row[j]);
      prev = tmp;
    }
  }
  return row[n];
}

// ── 16. Phonetic search (Soundex) ─────────────────────────────────────────────
export function soundex(s) {
  if (!s) return "";
  const str = s.toUpperCase().replace(/[^A-Z]/g, "");
  if (!str) return "";
  const codes = { BFPV: "1", CGJKQSXYZ: "2", DT: "3", L: "4", MN: "5", R: "6" };
  let result = str[0];
  let prev = "";
  for (let i = 1; i < str.length && result.length < 4; i++) {
    let code = "0";
    for (const [letters, c] of Object.entries(codes)) {
      if (letters.includes(str[i])) { code = c; break; }
    }
    if (code !== "0" && code !== prev) result += code;
    prev = code;
  }
  return result.padEnd(4, "0");
}

export function phoneticMatch(text, query) {
  const textWords = (text || "").split(/\s+/);
  const queryWords = (query || "").split(/\s+/);
  return queryWords.every((qw) =>
    textWords.some((tw) => soundex(tw) === soundex(qw))
  );
}

// ── 17. Regex search ──────────────────────────────────────────────────────────
export function regexSearch(text, pattern) {
  try {
    const re = new RegExp(pattern, "gi");
    const matches = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      matches.push({ index: m.index, match: m[0], context: text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40) });
      if (matches.length >= 10) break;
    }
    return { ok: true, matches, count: matches.length };
  } catch (err) {
    return { ok: false, error: err.message, matches: [], count: 0 };
  }
}

// ── 18. Advanced filters ──────────────────────────────────────────────────────
export function applyAdvancedFilters(results, filters = {}) {
  let filtered = [...results];

  if (filters.site) {
    const site = filters.site.toLowerCase();
    filtered = filtered.filter((r) => {
      try { return new URL(r.url).hostname.replace(/^www\./, "").includes(site); } catch { return false; }
    });
  }

  if (filters.fileType) {
    const ext = filters.fileType.toLowerCase();
    filtered = filtered.filter((r) => r.url?.toLowerCase().endsWith(`.${ext}`));
  }

  if (filters.dateAfter) {
    const after = new Date(filters.dateAfter).getTime();
    filtered = filtered.filter((r) => !r.indexed_at || r.indexed_at >= after);
  }

  if (filters.dateBefore) {
    const before = new Date(filters.dateBefore).getTime();
    filtered = filtered.filter((r) => !r.indexed_at || r.indexed_at <= before);
  }

  if (filters.language) {
    filtered = filtered.filter((r) => {
      const lang = detectLanguage((r.snippet || r.text || "") + " " + (r.title || ""));
      return lang === filters.language;
    });
  }

  if (filters.minWords) {
    const min = Number(filters.minWords);
    filtered = filtered.filter((r) => {
      const words = (r.snippet || r.text || "").split(/\s+/).filter(Boolean).length;
      return words >= min;
    });
  }

  if (filters.excludeDomains && Array.isArray(filters.excludeDomains)) {
    const excluded = new Set(filters.excludeDomains.map((d) => d.toLowerCase()));
    filtered = filtered.filter((r) => {
      try { return !excluded.has(new URL(r.url).hostname.replace(/^www\./, "").toLowerCase()); } catch { return true; }
    });
  }

  return filtered;
}

// ── 19. Topic modeling (lightweight) ─────────────────────────────────────────
const TOPIC_KEYWORDS = {
  technology: ["software", "hardware", "computer", "programming", "code", "developer", "api", "database", "cloud", "server"],
  science: ["research", "study", "experiment", "theory", "physics", "chemistry", "biology", "mathematics", "data"],
  news: ["breaking", "report", "announced", "today", "yesterday", "latest", "update", "news", "press"],
  health: ["medical", "health", "disease", "treatment", "doctor", "hospital", "medicine", "symptoms", "therapy"],
  business: ["company", "market", "revenue", "profit", "startup", "investment", "finance", "economy", "stock"],
  education: ["learn", "course", "tutorial", "university", "school", "student", "teacher", "education", "training"],
  entertainment: ["movie", "music", "game", "show", "film", "artist", "album", "series", "entertainment"],
  sports: ["team", "player", "match", "game", "score", "championship", "league", "tournament", "athlete"],
};

export function detectTopics(text) {
  const lower = (text || "").toLowerCase();
  const scores = {};
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    scores[topic] = keywords.filter((kw) => lower.includes(kw)).length;
  }
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return sorted.filter(([, score]) => score > 0).slice(0, 3).map(([topic, score]) => ({ topic, score }));
}

// ── 20. Page speed score (heuristic) ─────────────────────────────────────────
export function estimatePageSpeed(html) {
  if (!html) return { score: 50, label: "unknown" };
  const signals = {
    smallSize: html.length < 100_000,
    noHeavyScripts: (html.match(/<script/gi) || []).length < 10,
    hasLazyLoad: /loading="lazy"/i.test(html),
    noInlineStyles: (html.match(/style="/gi) || []).length < 20,
    hasCompression: /gzip|br|deflate/i.test(html),
    minimalIframes: (html.match(/<iframe/gi) || []).length < 3,
  };
  const score = Math.round(Object.values(signals).filter(Boolean).length / Object.keys(signals).length * 100);
  const label = score >= 80 ? "fast" : score >= 50 ? "moderate" : "slow";
  return { score, label, signals };
}

// ── 21. Trending searches ─────────────────────────────────────────────────────
// Returns curated trending topics (no user data stored)
export function getTrendingSearches() {
  return [
    "open source software", "privacy tools", "web development",
    "machine learning", "linux terminal", "rust programming",
    "typescript tutorial", "self hosting", "docker compose",
    "vim neovim", "kubernetes guide", "react hooks",
    "python data science", "cybersecurity basics", "api design",
    "database optimization", "cloud computing", "devops practices",
  ];
}

// ── 22. Collections/folders (client-side config) ──────────────────────────────
export function getCollectionsConfig() {
  return {
    storageKey: "atomic:collections",
    maxCollections: 20,
    maxItemsPerCollection: 100,
    note: "Collections are stored locally in your browser only.",
  };
}

// ── 23. Share results ─────────────────────────────────────────────────────────
export function buildShareUrl(query, page = 1) {
  const params = new URLSearchParams({ q: query });
  if (page > 1) params.set("page", String(page));
  return `/?${params.toString()}`;
}

// ── 24. Search analytics (privacy-preserving) ─────────────────────────────────
// Tracks aggregate metrics only — no individual queries stored
const sessionMetrics = {
  searches: 0,
  resultsShown: 0,
  ownIndexHits: 0,
  aiUsed: 0,
  startedAt: Date.now(),
};

export function recordSearchMetric(type, value = 1) {
  if (type in sessionMetrics) sessionMetrics[type] += value;
}

export function getSessionMetrics() {
  return {
    ...sessionMetrics,
    uptimeSec: Math.round((Date.now() - sessionMetrics.startedAt) / 1000),
  };
}

// ── 25. Popular results (curated, no user tracking) ───────────────────────────
export function getPopularResults() {
  return [
    { title: "Wikipedia — Free Encyclopedia", url: "https://en.wikipedia.org", host: "wikipedia.org" },
    { title: "GitHub — Where the world builds software", url: "https://github.com", host: "github.com" },
    { title: "MDN Web Docs", url: "https://developer.mozilla.org", host: "developer.mozilla.org" },
    { title: "Stack Overflow", url: "https://stackoverflow.com", host: "stackoverflow.com" },
    { title: "Hacker News", url: "https://news.ycombinator.com", host: "news.ycombinator.com" },
    { title: "arXiv — Open access research", url: "https://arxiv.org", host: "arxiv.org" },
  ];
}

// ── 26. Saved results (client-side config) ────────────────────────────────────
export function getSavedResultsConfig() {
  return {
    storageKey: "atomic:saved-results",
    maxSaved: 500,
    note: "Saved results are stored locally in your browser only.",
  };
}

// ── 27. Voice search config ───────────────────────────────────────────────────
export function getVoiceSearchConfig() {
  return {
    supported: typeof window !== "undefined" && "webkitSpeechRecognition" in window,
    lang: "en-US",
    continuous: false,
    interimResults: true,
  };
}

// ── 28. Image search metadata ─────────────────────────────────────────────────
export function enrichImageResult(img) {
  return {
    ...img,
    aspectRatio: img.width && img.height ? (img.width / img.height).toFixed(2) : null,
    isLandscape: img.width > img.height,
    isPortrait: img.height > img.width,
    isSquare: img.width === img.height,
    sizeLabel: img.width >= 1920 ? "HD" : img.width >= 1280 ? "large" : img.width >= 640 ? "medium" : "small",
  };
}

// ── 29. Metadata extraction ───────────────────────────────────────────────────
export function extractMetadata(html, url) {
  if (!html) return {};
  const get = (pattern) => { const m = html.match(pattern); return m ? m[1] : null; };
  return {
    title: get(/<title[^>]*>([^<]+)<\/title>/i),
    description: get(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i) ||
                 get(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i),
    ogTitle: get(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i),
    ogDescription: get(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i),
    ogImage: get(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i),
    ogType: get(/<meta[^>]+property=["']og:type["'][^>]+content=["']([^"']+)/i),
    twitterCard: get(/<meta[^>]+name=["']twitter:card["'][^>]+content=["']([^"']+)/i),
    canonical: get(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i),
    lang: get(/<html[^>]+lang=["']([^"']+)/i),
    charset: get(/<meta[^>]+charset=["']([^"']+)/i),
    viewport: get(/<meta[^>]+name=["']viewport["'][^>]+content=["']([^"']+)/i),
    robots: get(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)/i),
    author: get(/<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)/i),
    publishDate: get(/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)/i),
    url,
  };
}

// ── 30. Collaborative search (session-based, no user data) ───────────────────
export function getCollaborativeSearchConfig() {
  return {
    note: "Collaborative search uses URL sharing only. No server-side session data is stored.",
    shareUrl: (query) => buildShareUrl(query),
    instructions: "Share the URL with others to search together.",
  };
}

// ── Feature registry ──────────────────────────────────────────────────────────
// Maps feature names to their implementations for dynamic feature loading.
export const FEATURES = {
  freshness: getFreshnessLabel,
  readingTime: getReadingTime,
  domainReputation: getDomainReputation,
  ssl: checkSSL,
  mobileFriendly: checkMobileFriendly,
  seoScore: getSeoScore,
  accessibility: getAccessibilityScore,
  security: getSecurityScore,
  contentQuality: getContentQualityScore,
  duplicateDetection: detectDuplicates,
  groupSimilar: groupSimilarResults,
  searchHistory: getSearchHistoryConfig,
  exportJson: exportResultsAsJson,
  exportCsv: exportResultsAsCsv,
  booleanSearch: parseBooleanQuery,
  fuzzySearch: fuzzyMatch,
  phoneticSearch: phoneticMatch,
  regexSearch,
  advancedFilters: applyAdvancedFilters,
  topicModeling: detectTopics,
  pageSpeed: estimatePageSpeed,
  trending: getTrendingSearches,
  collections: getCollectionsConfig,
  share: buildShareUrl,
  analytics: getSessionMetrics,
  popularResults: getPopularResults,
  savedResults: getSavedResultsConfig,
  voiceSearch: getVoiceSearchConfig,
  imageEnrich: enrichImageResult,
  metadata: extractMetadata,
  collaborative: getCollaborativeSearchConfig,
  sentiment: analyzeSentiment,
  entities: extractEntities,
  keywords: extractKeywords,
  language: detectLanguage,
};

export function getFeature(name) {
  return FEATURES[name] || null;
}

export function listFeatures() {
  return Object.keys(FEATURES);
}
