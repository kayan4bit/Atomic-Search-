// Website Summarizer — fetches full website content, extracts the main
// body, and generates an AI summary using OpenRouter. Results are cached
// for 24 hours. Supports streaming, multiple languages, and length options.
//
// This is a server-side module — it never exposes user data to OpenRouter.
// The URL being summarised is sent to OpenRouter as part of the prompt
// context, but no user-identifying information (IP, cookies, UA) is included.

import { parseHTML } from "linkedom";
import { privateFetch, stripTags } from "./util.js";
import { isSafeUrl } from "./safeurl.js";
import { isNsfwUrl, isNsfwText } from "./nsfw.js";
import { cacheGet, cacheSet } from "./storage.js";

const OPENROUTER_API_KEY = typeof process !== "undefined" ? process.env.OPENROUTER_API_KEY : null;
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const OPENROUTER_MODEL = (typeof process !== "undefined" && process.env.OPENROUTER_MODEL)
  || "mistralai/mistral-7b-instruct:free";

const SUMMARY_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 400_000;
const MAX_CONTENT_CHARS = 6000; // chars sent to AI

// ── Content extraction ────────────────────────────────────────────────────────
// Extracts the main readable content from an HTML page, removing boilerplate
// (nav, footer, ads, sidebars). Returns structured content object.
function extractPageContent(html, url) {
  const { document } = parseHTML(html);

  // Extract metadata
  const title = stripTags(document.querySelector("title")?.textContent || "").trim();
  const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute("content") || "";
  const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute("content") || "";
  const ogDesc = document.querySelector('meta[property="og:description"]')?.getAttribute("content") || "";
  const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute("content") || "";
  const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute("href") || url;
  const lang = document.documentElement?.getAttribute("lang") || "en";

  // Extract author and date
  const author =
    document.querySelector('meta[name="author"]')?.getAttribute("content") ||
    document.querySelector('[rel="author"]')?.textContent ||
    document.querySelector(".author, .byline, [itemprop='author']")?.textContent || "";

  const publishDate =
    document.querySelector('meta[property="article:published_time"]')?.getAttribute("content") ||
    document.querySelector("time[datetime]")?.getAttribute("datetime") ||
    document.querySelector('[itemprop="datePublished"]')?.getAttribute("content") || "";

  // Remove boilerplate elements
  const boilerplateSelectors = [
    "nav", "footer", "header", "aside", ".nav", ".footer", ".sidebar",
    ".menu", ".ad", ".advertisement", ".cookie-banner", ".popup",
    ".newsletter", ".social-share", ".related-posts", ".comments",
    "script", "style", "noscript", "iframe", "form",
    '[role="navigation"]', '[role="banner"]', '[role="complementary"]',
  ];
  for (const sel of boilerplateSelectors) {
    try { document.querySelectorAll(sel).forEach((el) => el.remove()); } catch { /* ignore */ }
  }

  // Find main content area
  const mainEl =
    document.querySelector("main") ||
    document.querySelector("article") ||
    document.querySelector('[role="main"]') ||
    document.querySelector(".content, #content, .post, .article, .entry-content, .post-content") ||
    document.querySelector(".main, #main") ||
    document.body;

  // Extract text from content area
  const contentNodes = mainEl
    ? [...mainEl.querySelectorAll("p, h1, h2, h3, h4, h5, li, blockquote, td, th, figcaption")]
    : [...document.querySelectorAll("p, h1, h2, h3, li")];

  const rawText = contentNodes
    .slice(0, 200)
    .map((n) => {
      const tag = n.tagName?.toLowerCase() || "p";
      const text = stripTags(n.textContent || "").trim();
      if (!text) return "";
      if (tag.match(/^h[1-6]$/)) return `\n## ${text}\n`;
      if (tag === "li") return `• ${text}`;
      return text;
    })
    .filter(Boolean)
    .join("\n");

  // Extract images
  const images = [];
  try {
    const imgEls = document.querySelectorAll("img[src]");
    for (const img of imgEls) {
      if (images.length >= 5) break;
      const src = img.getAttribute("src") || "";
      const alt = img.getAttribute("alt") || "";
      if (!src || src.startsWith("data:")) continue;
      try {
        const abs = new URL(src, url).toString();
        images.push({ src: abs, alt });
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  // Word count and reading time
  const wordCount = rawText.split(/\s+/).filter(Boolean).length;
  const readingTimeMin = Math.max(1, Math.ceil(wordCount / 200));

  return {
    title: ogTitle || title,
    description: ogDesc || metaDesc,
    image: ogImage,
    canonical,
    lang,
    author: author.trim(),
    publishDate,
    text: rawText.slice(0, MAX_CONTENT_CHARS),
    wordCount,
    readingTimeMin,
    images,
  };
}

// ── Language detection (lightweight) ─────────────────────────────────────────
// Detects language from common word patterns. Returns ISO 639-1 code.
const LANG_PATTERNS = {
  es: /\b(el|la|los|las|un|una|de|en|que|es|por|con|para|como|pero|más|este|esta)\b/gi,
  fr: /\b(le|la|les|un|une|de|en|que|est|pour|avec|dans|sur|par|mais|plus|ce|cette)\b/gi,
  de: /\b(der|die|das|ein|eine|von|in|zu|mit|auf|für|ist|sind|und|oder|aber|nicht)\b/gi,
  pt: /\b(o|a|os|as|um|uma|de|em|que|é|por|com|para|como|mas|mais|este|esta)\b/gi,
  it: /\b(il|la|i|le|un|una|di|in|che|è|per|con|da|su|ma|più|questo|questa)\b/gi,
  nl: /\b(de|het|een|van|in|op|te|met|voor|is|zijn|maar|ook|niet|dit|dat)\b/gi,
  ru: /[а-яё]{3,}/gi,
  zh: /[\u4e00-\u9fff]{2,}/g,
  ja: /[\u3040-\u309f\u30a0-\u30ff]{2,}/g,
  ar: /[\u0600-\u06ff]{3,}/g,
};

export function detectLanguage(text) {
  if (!text) return "en";
  const sample = text.slice(0, 2000);
  let bestLang = "en";
  let bestCount = 0;
  for (const [lang, pattern] of Object.entries(LANG_PATTERNS)) {
    const matches = (sample.match(pattern) || []).length;
    if (matches > bestCount) {
      bestCount = matches;
      bestLang = lang;
    }
  }
  return bestLang;
}

// ── AI summary generation ─────────────────────────────────────────────────────
// Calls OpenRouter to generate a summary of the extracted content.
// Returns null if OpenRouter is not configured or the call fails.
async function generateAiSummary(content, opts = {}) {
  if (!OPENROUTER_API_KEY) return null;

  const length = opts.length || "medium"; // short / medium / long
  const lang = opts.lang || content.lang || "en";

  const lengthInstructions = {
    short: "Write a 1-2 sentence summary.",
    medium: "Write a 3-4 sentence summary covering the main points.",
    long: "Write a comprehensive 5-7 sentence summary covering all key points.",
  };

  const langInstruction = lang !== "en"
    ? `Respond in ${lang} language.`
    : "Respond in English.";

  const systemPrompt =
    `You are a helpful assistant that summarises web page content. ` +
    `${lengthInstructions[length] || lengthInstructions.medium} ` +
    `Be factual, neutral, and concise. Do not include opinions or speculation. ` +
    `${langInstruction}`;

  const userPrompt =
    `Title: ${content.title}\n` +
    `Description: ${content.description}\n\n` +
    `Content:\n${content.text.slice(0, 4000)}`;

  const maxTokens = length === "short" ? 100 : length === "long" ? 400 : 200;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
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
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Key points extraction ─────────────────────────────────────────────────────
// Extracts key bullet points from content using AI or heuristics.
async function extractKeyPoints(content, opts = {}) {
  if (!OPENROUTER_API_KEY) {
    // Heuristic fallback: extract sentences with key signal words
    const sentences = content.text.split(/[.!?]+/).filter((s) => s.trim().length > 30);
    const keySignals = /important|key|main|primary|essential|critical|significant|note|remember|conclusion/i;
    const keyPoints = sentences
      .filter((s) => keySignals.test(s))
      .slice(0, 5)
      .map((s) => s.trim());
    if (keyPoints.length) return keyPoints;
    // Fall back to first N sentences
    return sentences.slice(0, 5).map((s) => s.trim());
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
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
          {
            role: "system",
            content: "Extract 3-5 key points from the content. Return ONLY a JSON array of strings, each being a concise key point. No explanation.",
          },
          {
            role: "user",
            content: `Title: ${content.title}\n\nContent:\n${content.text.slice(0, 3000)}`,
          },
        ],
        max_tokens: 300,
        temperature: 0.2,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim() || "";
    const arr = JSON.parse(text);
    if (Array.isArray(arr)) return arr.slice(0, 5).filter((s) => typeof s === "string");
    return [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// ── Sentiment analysis (lightweight) ─────────────────────────────────────────
const POSITIVE_WORDS = new Set(["good", "great", "excellent", "amazing", "best", "love", "perfect", "wonderful", "fantastic", "outstanding", "helpful", "useful", "recommend", "positive", "success", "win", "benefit", "improve", "easy", "fast"]);
const NEGATIVE_WORDS = new Set(["bad", "terrible", "awful", "worst", "hate", "broken", "fail", "error", "problem", "issue", "slow", "difficult", "hard", "confusing", "useless", "negative", "poor", "wrong", "bug", "crash"]);

export function analyzeSentiment(text) {
  const words = (text || "").toLowerCase().split(/\W+/).filter(Boolean);
  let pos = 0, neg = 0;
  for (const w of words) {
    if (POSITIVE_WORDS.has(w)) pos++;
    if (NEGATIVE_WORDS.has(w)) neg++;
  }
  const total = pos + neg;
  if (!total) return { sentiment: "neutral", score: 0, positive: 0, negative: 0 };
  const score = (pos - neg) / total;
  const sentiment = score > 0.2 ? "positive" : score < -0.2 ? "negative" : "neutral";
  return { sentiment, score: Math.round(score * 100) / 100, positive: pos, negative: neg };
}

// ── Entity recognition (lightweight) ─────────────────────────────────────────
// Extracts named entities using capitalization patterns and common patterns.
export function extractEntities(text) {
  const entities = { people: [], organizations: [], places: [], technologies: [] };

  // Technology patterns
  const techPattern = /\b(JavaScript|TypeScript|Python|Rust|Go|Java|C\+\+|React|Vue|Angular|Node\.js|Docker|Kubernetes|AWS|Azure|GCP|Linux|macOS|Windows|iOS|Android|SQL|NoSQL|MongoDB|PostgreSQL|Redis|GraphQL|REST|API|HTTP|HTTPS|JSON|XML|HTML|CSS|Git|GitHub|npm|pip|cargo)\b/g;
  const techMatches = text.match(techPattern) || [];
  entities.technologies = [...new Set(techMatches)].slice(0, 10);

  // Capitalized word sequences (potential proper nouns)
  const properNounPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
  const properNouns = [];
  let match;
  while ((match = properNounPattern.exec(text)) !== null) {
    const noun = match[1];
    if (noun.length > 2 && !entities.technologies.includes(noun)) {
      properNouns.push(noun);
    }
  }

  // Simple heuristic classification
  const placeIndicators = /\b(city|country|state|region|continent|ocean|river|mountain|island)\b/i;
  const orgIndicators = /\b(Inc\.|Corp\.|Ltd\.|LLC|Company|Organization|Institute|University|College|Foundation|Association)\b/;

  for (const noun of [...new Set(properNouns)].slice(0, 20)) {
    if (orgIndicators.test(noun)) entities.organizations.push(noun);
    else if (placeIndicators.test(text.slice(text.indexOf(noun) - 50, text.indexOf(noun) + 50))) entities.places.push(noun);
    else entities.people.push(noun);
  }

  // Trim to reasonable sizes
  entities.people = entities.people.slice(0, 5);
  entities.organizations = entities.organizations.slice(0, 5);
  entities.places = entities.places.slice(0, 5);

  return entities;
}

// ── Main summarize function ───────────────────────────────────────────────────
// Fetches a URL, extracts content, and generates an AI summary.
// Returns a rich summary object or null on failure.
export async function summarizeWebsite(url, opts = {}) {
  if (!url || !isSafeUrl(url) || isNsfwUrl(url)) return null;

  const cacheKey = `websummary:${url}:${opts.length || "medium"}`;
  const cached = await cacheGet(cacheKey).catch(() => null);
  if (cached) return { ...cached, cached: true };

  // Fetch the page
  let html;
  try {
    const res = await privateFetch(url, {
      timeout: FETCH_TIMEOUT_MS,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AtomicSearch/1.0; +https://atomic-search.com)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html")) return null;
    html = (await res.text()).slice(0, MAX_HTML_BYTES);
  } catch {
    return null;
  }

  // Extract content
  const content = extractPageContent(html, url);
  if (!content.text || content.text.length < 100) return null;
  if (isNsfwText(content.title, content.text)) return null;

  // Detect language
  const detectedLang = detectLanguage(content.text);
  content.lang = content.lang || detectedLang;

  // Generate AI summary and key points in parallel
  const [aiSummary, keyPoints] = await Promise.all([
    generateAiSummary(content, opts).catch(() => null),
    extractKeyPoints(content, opts).catch(() => []),
  ]);

  // Heuristic summary fallback
  const heuristicSummary = content.description ||
    content.text.split(/[.!?]+/).filter((s) => s.trim().length > 40).slice(0, 3).join(". ").trim() + ".";

  // Sentiment and entities
  const sentiment = analyzeSentiment(content.text);
  const entities = extractEntities(content.text);

  const result = {
    url,
    title: content.title,
    description: content.description,
    image: content.image,
    canonical: content.canonical,
    lang: content.lang,
    author: content.author,
    publishDate: content.publishDate,
    summary: aiSummary || heuristicSummary,
    aiSummary: !!aiSummary,
    keyPoints,
    images: content.images,
    wordCount: content.wordCount,
    readingTimeMin: content.readingTimeMin,
    sentiment,
    entities,
    generatedAt: new Date().toISOString(),
  };

  await cacheSet(cacheKey, result, SUMMARY_CACHE_TTL_MS).catch(() => {});
  return result;
}

// ── Streaming summary ─────────────────────────────────────────────────────────
// Returns an async generator that yields summary chunks as they arrive.
// Requires OpenRouter to be configured.
export async function* streamSummary(url, opts = {}) {
  if (!OPENROUTER_API_KEY || !url || !isSafeUrl(url)) {
    yield { type: "error", message: "AI not configured or URL invalid" };
    return;
  }

  // Fetch and extract content first
  let content;
  try {
    const res = await privateFetch(url, {
      timeout: FETCH_TIMEOUT_MS,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AtomicSearch/1.0)" },
    });
    if (!res.ok) { yield { type: "error", message: `HTTP ${res.status}` }; return; }
    const html = (await res.text()).slice(0, MAX_HTML_BYTES);
    content = extractPageContent(html, url);
  } catch (err) {
    yield { type: "error", message: err?.message || "fetch failed" };
    return;
  }

  yield { type: "metadata", data: {
    title: content.title,
    description: content.description,
    wordCount: content.wordCount,
    readingTimeMin: content.readingTimeMin,
    lang: content.lang,
  }};

  // Stream the AI summary
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
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
          { role: "system", content: "Summarise this web page content in 3-4 sentences. Be factual and concise." },
          { role: "user", content: `Title: ${content.title}\n\nContent:\n${content.text.slice(0, 3000)}` },
        ],
        max_tokens: 250,
        temperature: 0.3,
        stream: true,
      }),
    });

    if (!res.ok) { yield { type: "error", message: `AI API error ${res.status}` }; return; }

    const reader = res.body?.getReader();
    if (!reader) { yield { type: "error", message: "No response body" }; return; }

    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") { yield { type: "done" }; return; }
        try {
          const parsed = JSON.parse(data);
          const chunk = parsed?.choices?.[0]?.delta?.content;
          if (chunk) yield { type: "chunk", text: chunk };
        } catch { /* ignore */ }
      }
    }
    yield { type: "done" };
  } catch (err) {
    yield { type: "error", message: err?.message || "stream failed" };
  } finally {
    clearTimeout(timer);
  }
}

// ── Batch summarization ───────────────────────────────────────────────────────
// Summarizes multiple URLs in parallel (up to 5 at a time).
export async function summarizeMultiple(urls, opts = {}) {
  if (!Array.isArray(urls) || !urls.length) return [];
  const batches = [];
  for (let i = 0; i < urls.length; i += 5) {
    batches.push(urls.slice(i, i + 5));
  }
  const results = [];
  for (const batch of batches) {
    const batchResults = await Promise.allSettled(
      batch.map((url) => summarizeWebsite(url, opts))
    );
    for (const r of batchResults) {
      results.push(r.status === "fulfilled" ? r.value : null);
    }
  }
  return results;
}
