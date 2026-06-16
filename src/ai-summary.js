// AI Summary module for Atomic Search.
// Uses OpenRouter API (mistral-7b-instruct free tier) to summarise top results.
// Gracefully degrades when OPENROUTER_API_KEY is absent.
// Privacy: only titles and snippets are sent — never full URLs or user data.

const OPENROUTER_API_KEY = typeof process !== "undefined" ? process.env.OPENROUTER_API_KEY : null;
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const SUMMARY_MODEL = (typeof process !== "undefined" && process.env.OPENROUTER_MODEL)
  || "mistralai/mistral-7b-instruct:free";

// In-memory cache for summaries. Keyed by query (lowercased). TTL: 1 hour.
const SUMMARY_CACHE = new Map();
const SUMMARY_CACHE_CAP = 300;
const SUMMARY_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function summaryKey(query) {
  // FNV-1a hash for cache key — no crypto dep needed.
  let h = 0x811c9dc5;
  const s = (query || "").toLowerCase().trim();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16);
}

function cacheGet(key) {
  const entry = SUMMARY_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { SUMMARY_CACHE.delete(key); return null; }
  // LRU: move to end.
  SUMMARY_CACHE.delete(key);
  SUMMARY_CACHE.set(key, entry);
  return entry.value;
}

function cacheSet(key, value) {
  if (SUMMARY_CACHE.size >= SUMMARY_CACHE_CAP) {
    const oldest = SUMMARY_CACHE.keys().next().value;
    if (oldest !== undefined) SUMMARY_CACHE.delete(oldest);
  }
  SUMMARY_CACHE.set(key, { value, expiresAt: Date.now() + SUMMARY_CACHE_TTL_MS });
}

/**
 * Check if AI summaries are available (API key configured).
 * @returns {boolean}
 */
export function isAISummaryAvailable() {
  return !!(OPENROUTER_API_KEY && typeof fetch !== "undefined");
}

/**
 * Generate an AI summary for the top search results.
 * Only sends titles and snippets — never full URLs or user-identifying data.
 * Returns a string summary or null on failure.
 *
 * @param {string} query - The search query
 * @param {Array<{title: string, snippet?: string, text?: string}>} results - Top results
 * @param {{ timeoutMs?: number }} opts
 * @returns {Promise<string|null>}
 */
export async function generateAISummary(query, results, { timeoutMs = 8000 } = {}) {
  if (!isAISummaryAvailable()) return null;
  if (!query || !results?.length) return null;

  const key = summaryKey(query);
  const cached = cacheGet(key);
  if (cached !== null) return cached;

  // Build the prompt — only titles and snippets, never URLs (privacy).
  const snippets = results
    .slice(0, 3)
    .map((r, i) => {
      const title = (r.title || "").slice(0, 120);
      const snippet = (r.snippet || r.text || "").slice(0, 200);
      return `[${i + 1}] ${title}${snippet ? ": " + snippet : ""}`;
    })
    .filter(Boolean)
    .join("\n");

  if (!snippets) return null;

  const systemPrompt =
    "You are a helpful search assistant. Given a query and search result snippets, " +
    "write a concise 2-3 sentence answer that directly addresses the query. " +
    "Be factual, neutral, and helpful. Do not mention source numbers or URLs.";

  const userPrompt = `Query: ${query.slice(0, 200)}\n\nTop results:\n${snippets}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://atomic-search.com",
        "X-Title": "Atomic Search",
      },
      body: JSON.stringify({
        model: SUMMARY_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 200,
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      console.warn(`[ai-summary] OpenRouter returned HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim() || null;
    if (text) {
      cacheSet(key, text);
      return text;
    }
    return null;
  } catch (err) {
    if (err?.name !== "AbortError") {
      console.warn("[ai-summary] OpenRouter error:", err?.message || err);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Get cache stats for monitoring.
 * @returns {{ size: number, cap: number }}
 */
export function getSummaryCacheStats() {
  return { size: SUMMARY_CACHE.size, cap: SUMMARY_CACHE_CAP };
}
