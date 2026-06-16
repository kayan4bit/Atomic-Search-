// AI Summarizer — fetches full website content, extracts main text,
// and uses OpenRouter to generate real AI summaries with caching.
// Supports multi-language, key points, entities, sentiment, and quotes.

import { privateFetch, stripTags } from "./util.js";
import { parseHTML } from "linkedom";

const OPENROUTER_API_KEY = typeof process !== "undefined" ? process.env.OPENROUTER_API_KEY : null;
const OPENROUTER_BASE    = "https://openrouter.ai/api/v1";
const OPENROUTER_MODEL   = (typeof process !== "undefined" && process.env.OPENROUTER_MODEL)
  || "mistralai/mistral-7b-instruct:free";

// ── 24-hour summary cache ─────────────────────────────────────────────────────
const SUMMARY_CACHE     = new Map();
const SUMMARY_CACHE_CAP = 500;
const SUMMARY_TTL_MS    = 24 * 60 * 60 * 1000; // 24 hours

function cacheGet(key) {
  const e = SUMMARY_CACHE.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) { SUMMARY_CACHE.delete(key); return null; }
  SUMMARY_CACHE.delete(key);
  SUMMARY_CACHE.set(key, e); // LRU refresh
  return e.value;
}

function cacheSet(key, value) {
  if (SUMMARY_CACHE.size >= SUMMARY_CACHE_CAP) {
    const oldest = SUMMARY_CACHE.keys().next().value;
    if (oldest !== undefined) SUMMARY_CACHE.delete(oldest);
  }
  SUMMARY_CACHE.set(key, { value, expiresAt: Date.now() + SUMMARY_TTL_MS });
}

function fnvHash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16);
}

// ── Content extraction ────────────────────────────────────────────────────────
// Removes navigation, ads, footers, sidebars — keeps main article content.
const NOISE_SELECTORS = [
  "nav", "header", "footer", "aside", "script", "style", "noscript",
  ".nav", ".navigation", ".menu", ".sidebar", ".ad", ".ads", ".advertisement",
  ".cookie", ".popup", ".modal", ".banner", ".social", ".share",
  '[role="navigation"]', '[role="banner"]', '[role="complementary"]',
  '[aria-label="advertisement"]',
];

export async function fetchAndExtract(url, { timeoutMs = 8000 } = {}) {
  const cacheKey = "fetch:" + fnvHash(url);
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  try {
    const res = await privateFetch(url, {
      timeout: timeoutMs,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AtomicSearch/1.0; +https://atomic-search.com)",
        "Accept": "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html")) return null;

    const html = (await res.text()).slice(0, 800_000);
    const { document } = parseHTML(html);

    // Remove noise elements.
    for (const sel of NOISE_SELECTORS) {
      try {
        for (const el of document.querySelectorAll(sel)) {
          el.parentNode?.removeChild(el);
        }
      } catch { /* ignore */ }
    }

    const title = stripTags(document.querySelector("title")?.textContent || "").trim();
    const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute("content") || "";
    const lang = document.documentElement?.getAttribute("lang") || "en";

    // Prefer semantic content containers.
    const mainEl =
      document.querySelector("article") ||
      document.querySelector("main") ||
      document.querySelector('[role="main"]') ||
      document.querySelector(".content") ||
      document.querySelector("#content") ||
      document.body;

    const paragraphs = [...(mainEl || document).querySelectorAll("p, h1, h2, h3, h4, blockquote, li")]
      .slice(0, 200)
      .map((n) => stripTags(n.textContent).trim())
      .filter((t) => t.length > 20);

    const fullText = paragraphs.join("\n").slice(0, 8000);

    const result = { url, title, metaDesc, lang, fullText, wordCount: fullText.split(/\s+/).length };
    cacheSet(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

// ── OpenRouter completion ─────────────────────────────────────────────────────
async function complete(system, user, { maxTokens = 300, timeoutMs = 10000 } = {}) {
  if (!OPENROUTER_API_KEY) return null;
  const key = fnvHash(system + "\n" + user);
  const cached = cacheGet(key);
  if (cached) return cached;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://atomic-search.com",
        "X-Title": "Atomic Search",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user",   content: user },
        ],
        max_tokens: maxTokens,
        temperature: 0.3,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim() || null;
    if (text) cacheSet(key, text);
    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Public summarisation API ──────────────────────────────────────────────────

/**
 * Generate a concise AI summary of a URL's content.
 * Returns { summary, keyPoints, entities, sentiment, language, confidence }
 * or null if unavailable.
 */
export async function summariseUrl(url) {
  const cacheKey = "summary:" + fnvHash(url);
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const content = await fetchAndExtract(url);
  if (!content || !content.fullText || content.fullText.length < 100) return null;

  const excerpt = content.fullText.slice(0, 3000);
  const prompt = `Title: ${content.title}\nURL: ${url}\n\nContent:\n${excerpt}`;

  // Run summary, key points, and entities in parallel for speed.
  const [summaryText, keyPointsText, entitiesText, sentimentText] = await Promise.all([
    complete(
      "You are a precise web content summariser. Write a 2-3 sentence factual summary of the page content. Be concise and neutral.",
      prompt,
      { maxTokens: 200 }
    ),
    complete(
      "Extract 3-5 key points from this web page as a JSON array of strings. Return ONLY the JSON array.",
      prompt,
      { maxTokens: 250 }
    ),
    complete(
      "Extract named entities (people, organisations, places, technologies) from this content as a JSON object with keys: people, orgs, places, tech. Return ONLY the JSON object.",
      prompt,
      { maxTokens: 200 }
    ),
    complete(
      "Classify the sentiment of this content as one of: positive, negative, neutral, mixed. Return ONLY the single word.",
      prompt,
      { maxTokens: 10 }
    ),
  ]);

  let keyPoints = [];
  try { keyPoints = JSON.parse(keyPointsText || "[]"); } catch { /* ignore */ }
  if (!Array.isArray(keyPoints)) keyPoints = [];

  let entities = { people: [], orgs: [], places: [], tech: [] };
  try { const e = JSON.parse(entitiesText || "{}"); if (e && typeof e === "object") entities = e; } catch { /* ignore */ }

  const validSentiments = ["positive", "negative", "neutral", "mixed"];
  const sentiment = validSentiments.includes((sentimentText || "").trim().toLowerCase())
    ? sentimentText.trim().toLowerCase()
    : "neutral";

  const result = {
    url,
    title: content.title,
    summary: summaryText || content.metaDesc || null,
    keyPoints: keyPoints.slice(0, 5),
    entities,
    sentiment,
    language: content.lang || "en",
    wordCount: content.wordCount,
    confidence: summaryText ? 0.85 : 0.3,
    generatedAt: new Date().toISOString(),
  };

  cacheSet(cacheKey, result);
  return result;
}

/**
 * Summarise a set of search results using their snippets (no extra fetches).
 * Fast path — uses already-available snippet text.
 */
export async function summariseResults(query, results) {
  if (!query || !results?.length) return null;
  const snippets = results
    .slice(0, 6)
    .map((r, i) => `[${i + 1}] ${r.title || ""}: ${(r.snippet || r.text || "").slice(0, 250)}`)
    .join("\n");
  return complete(
    "You are a helpful search assistant. Given a query and search result snippets, write a concise 2-3 sentence answer grounded in the snippets. Be factual and neutral.",
    `Query: ${query.slice(0, 200)}\n\nSnippets:\n${snippets}`,
    { maxTokens: 200 }
  );
}

/**
 * Extract a quote or key sentence from a URL's content relevant to a query.
 */
export async function extractRelevantQuote(url, query) {
  const content = await fetchAndExtract(url);
  if (!content?.fullText) return null;
  return complete(
    "Extract the single most relevant sentence or short quote from the content that best answers the query. Return ONLY the quote, no explanation.",
    `Query: ${query.slice(0, 200)}\n\nContent:\n${content.fullText.slice(0, 2000)}`,
    { maxTokens: 100 }
  );
}

export function isSummarizerAvailable() {
  return !!OPENROUTER_API_KEY;
}
