// OpenRouter AI client — optional enhancement layer for Atomic Search.
// Requires OPENROUTER_API_KEY environment variable. All calls are
// server-side only; no user-identifying data is ever sent to OpenRouter.
// Falls back gracefully when the key is absent or the API is unavailable.

const OPENROUTER_API_KEY = typeof process !== "undefined" ? process.env.OPENROUTER_API_KEY : null;
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
// Default model — cheap, fast, good at summarisation. Override with
// OPENROUTER_MODEL env var if you want a different model.
const OPENROUTER_MODEL = (typeof process !== "undefined" && process.env.OPENROUTER_MODEL)
  || "mistralai/mistral-7b-instruct:free";

// In-memory LRU cache for AI responses. Keyed by a hash of the prompt.
// Capped at 200 entries (~few MB). TTL: 30 minutes.
const AI_CACHE = new Map();
const AI_CACHE_CAP = 200;
const AI_CACHE_TTL_MS = 30 * 60 * 1000;

function aiCacheGet(key) {
  const entry = AI_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { AI_CACHE.delete(key); return null; }
  // LRU: move to end.
  AI_CACHE.delete(key);
  AI_CACHE.set(key, entry);
  return entry.value;
}

function aiCacheSet(key, value) {
  if (AI_CACHE.size >= AI_CACHE_CAP) {
    const oldest = AI_CACHE.keys().next().value;
    if (oldest !== undefined) AI_CACHE.delete(oldest);
  }
  AI_CACHE.set(key, { value, expiresAt: Date.now() + AI_CACHE_TTL_MS });
}

function cacheKey(prompt) {
  // Simple FNV-1a hash — no crypto dep needed.
  let h = 0x811c9dc5;
  for (let i = 0; i < prompt.length; i++) {
    h ^= prompt.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16);
}

// Check if OpenRouter is configured and available.
export function isOpenRouterAvailable() {
  return !!(OPENROUTER_API_KEY && typeof fetch !== "undefined");
}

// Core completion call. Returns the assistant message text or null on failure.
// Bounded to 8 seconds so it never blocks a search response.
async function complete(systemPrompt, userPrompt, { maxTokens = 256, timeoutMs = 8000 } = {}) {
  if (!isOpenRouterAvailable()) return null;
  const key = cacheKey(systemPrompt + "\n" + userPrompt);
  const cached = aiCacheGet(key);
  if (cached !== null) return cached;

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
        model: OPENROUTER_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.3,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim() || null;
    if (text) aiCacheSet(key, text);
    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

// Expand a short query into a richer set of search terms. Returns an array
// of up to 4 alternative phrasings, or an empty array on failure.
export async function expandQuery(query) {
  if (!query || query.length < 3) return [];
  const text = await complete(
    "You are a search query expansion assistant. Given a user query, return up to 4 alternative search phrasings that would help find relevant results. Return ONLY a JSON array of strings, no explanation.",
    `Query: ${query.slice(0, 200)}`
  );
  if (!text) return [];
  try {
    const arr = JSON.parse(text);
    if (Array.isArray(arr)) return arr.slice(0, 4).filter((s) => typeof s === "string" && s.length > 2);
  } catch { /* ignore */ }
  return [];
}

// Summarise the top search results into a concise answer paragraph.
// Returns a string or null. Used as an AI-enhanced synthesis fallback.
export async function summariseResults(query, results) {
  if (!query || !results?.length) return null;
  const snippets = results
    .slice(0, 5)
    .map((r, i) => `[${i + 1}] ${r.title || ""}: ${(r.snippet || r.text || "").slice(0, 200)}`)
    .join("\n");
  return complete(
    "You are a helpful search assistant. Given a query and search result snippets, write a concise 2-3 sentence answer. Be factual and neutral. Do not mention the sources by number.",
    `Query: ${query.slice(0, 200)}\n\nSnippets:\n${snippets}`,
    { maxTokens: 180 }
  );
}

// Generate a "Did you mean" suggestion using AI when the heuristic fails.
// Returns a string or null.
export async function aiDidYouMean(query) {
  if (!query || query.length < 4) return null;
  const text = await complete(
    "You are a spell-checker for search queries. If the query has a likely typo or misspelling, return ONLY the corrected query as a plain string. If the query looks correct, return the word NULL.",
    `Query: ${query.slice(0, 200)}`,
    { maxTokens: 60 }
  );
  if (!text || text.trim().toUpperCase() === "NULL") return null;
  const suggestion = text.trim().replace(/^["']|["']$/g, "");
  if (suggestion.toLowerCase() === query.toLowerCase()) return null;
  return suggestion;
}

// Enhance atomic synthesis: given the extractive summary and top results,
// produce a more coherent, readable answer. Returns a string or null.
export async function enhanceSynthesis(query, extractiveSummary, results) {
  if (!query || !extractiveSummary) return null;
  const context = results
    .slice(0, 3)
    .map((r) => (r.snippet || r.text || "").slice(0, 150))
    .join(" ");
  return complete(
    "You are a search result synthesiser. Rewrite the provided summary to be clearer and more informative. Keep it under 3 sentences. Be factual.",
    `Query: ${query.slice(0, 200)}\nDraft summary: ${extractiveSummary.slice(0, 400)}\nContext: ${context.slice(0, 400)}`,
    { maxTokens: 200 }
  );
}

// Classify query intent more precisely than the heuristic in app.js.
// Returns one of: tutorial, comparison, definition, install, debug, general.
export async function classifyIntent(query) {
  if (!query) return "general";
  const text = await complete(
    "Classify the search query intent into exactly one of these categories: tutorial, comparison, definition, install, debug, general. Return ONLY the category word.",
    `Query: ${query.slice(0, 200)}`,
    { maxTokens: 10 }
  );
  const valid = ["tutorial", "comparison", "definition", "install", "debug", "general"];
  const result = (text || "").trim().toLowerCase();
  return valid.includes(result) ? result : "general";
}
