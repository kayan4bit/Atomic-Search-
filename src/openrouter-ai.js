// OpenRouter AI integration — chat, summarization, text analysis, and more.
// Gracefully degrades when OPENROUTER_API_KEY is absent.

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const MODEL = "meta-llama/llama-2-70b-chat"; // Fast, capable, cost-effective

export function isOpenRouterAvailable() {
  return !!OPENROUTER_API_KEY;
}

// Chat endpoint — streaming or non-streaming conversation
export async function aiChat(messages, { stream = false, temperature = 0.7, maxTokens = 1024 } = {}) {
  if (!isOpenRouterAvailable()) return null;
  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://atomic-search.app",
        "X-Title": "Atomic Search",
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream,
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error("OpenRouter chat error:", err?.message);
    return null;
  }
}

// Summarize search results or documents
export async function summarizeResults(results, query) {
  if (!isOpenRouterAvailable() || !results?.length) return null;
  const snippets = results.slice(0, 5).map((r) => `${r.title}: ${r.snippet || r.text}`).join("\n\n");
  const prompt = `Summarize these search results for the query "${query}" in 2-3 sentences:\n\n${snippets}`;
  return aiChat([{ role: "user", content: prompt }], { maxTokens: 256 });
}

// Summarize a document or long text
export async function summarizeText(text, { maxLength = 500 } = {}) {
  if (!isOpenRouterAvailable() || !text) return null;
  const prompt = `Summarize this text in ${maxLength} characters or less:\n\n${text.slice(0, 5000)}`;
  return aiChat([{ role: "user", content: prompt }], { maxTokens: 256 });
}

// Detect scam/fraud indicators in text
export async function analyzeScamRisk(text) {
  if (!isOpenRouterAvailable() || !text) return null;
  const prompt = `Analyze this text for scam/fraud indicators. Rate risk as LOW, MEDIUM, or HIGH with brief explanation:\n\n${text.slice(0, 2000)}`;
  const response = await aiChat([{ role: "user", content: prompt }], { maxTokens: 128 });
  if (!response) return null;
  const match = response.match(/(LOW|MEDIUM|HIGH)/i);
  return {
    risk: match ? match[1].toUpperCase() : "UNKNOWN",
    analysis: response,
  };
}

// Generate related search suggestions
export async function expandQuery(query) {
  if (!isOpenRouterAvailable() || !query) return null;
  const prompt = `Generate 5 related search queries for "${query}". Return as JSON array of strings only, no explanation.`;
  const response = await aiChat([{ role: "user", content: prompt }], { maxTokens: 128 });
  if (!response) return null;
  try {
    return JSON.parse(response);
  } catch {
    return response.split("\n").filter(Boolean).slice(0, 5);
  }
}

// "Did you mean" — AI-powered spelling/intent correction
export async function aiDidYouMean(query, results) {
  if (!isOpenRouterAvailable() || !query) return null;
  const topTitles = (results || []).slice(0, 3).map((r) => r.title).join(", ");
  const prompt = `User searched for "${query}". Top results are about: ${topTitles}. Did they misspell or misintend? Suggest ONE correction or return "NO_CORRECTION".`;
  const response = await aiChat([{ role: "user", content: prompt }], { maxTokens: 64 });
  if (!response || response.includes("NO_CORRECTION")) return null;
  return { suggested: response.trim(), original: query };
}

// Enhance result synthesis — combine multiple results into a coherent answer
export async function enhanceSynthesis(results, query) {
  if (!isOpenRouterAvailable() || !results?.length) return null;
  const snippets = results.slice(0, 8).map((r) => `- ${r.title}: ${r.snippet || r.text}`).join("\n");
  const prompt = `Based on these search results, provide a comprehensive answer to "${query}":\n\n${snippets}`;
  return aiChat([{ role: "user", content: prompt }], { maxTokens: 512 });
}

// Fact-check a claim against search results
export async function factCheck(claim, results) {
  if (!isOpenRouterAvailable() || !results?.length) return null;
  const snippets = results.slice(0, 5).map((r) => r.snippet || r.text).join("\n\n");
  const prompt = `Fact-check this claim: "${claim}"\n\nBased on these sources:\n${snippets}\n\nIs it TRUE, FALSE, or UNCLEAR? Explain briefly.`;
  const response = await aiChat([{ role: "user", content: prompt }], { maxTokens: 256 });
  if (!response) return null;
  const match = response.match(/(TRUE|FALSE|UNCLEAR)/i);
  return {
    verdict: match ? match[1].toUpperCase() : "UNCLEAR",
    explanation: response,
  };
}

// Extract key entities (people, places, organizations) from text
export async function extractEntities(text) {
  if (!isOpenRouterAvailable() || !text) return null;
  const prompt = `Extract key entities (people, places, organizations, dates) from this text. Return as JSON object with arrays for each type:\n\n${text.slice(0, 2000)}`;
  const response = await aiChat([{ role: "user", content: prompt }], { maxTokens: 256 });
  if (!response) return null;
  try {
    return JSON.parse(response);
  } catch {
    return { raw: response };
  }
}

// Sentiment analysis
export async function analyzeSentiment(text) {
  if (!isOpenRouterAvailable() || !text) return null;
  const prompt = `Analyze sentiment of this text. Rate as POSITIVE, NEGATIVE, or NEUTRAL with confidence 0-100:\n\n${text.slice(0, 1000)}`;
  const response = await aiChat([{ role: "user", content: prompt }], { maxTokens: 64 });
  if (!response) return null;
  const match = response.match(/(POSITIVE|NEGATIVE|NEUTRAL)/i);
  return {
    sentiment: match ? match[1].toUpperCase() : "NEUTRAL",
    analysis: response,
  };
}

// Translate text (basic)
export async function translateText(text, targetLang) {
  if (!isOpenRouterAvailable() || !text) return null;
  const prompt = `Translate this text to ${targetLang}:\n\n${text.slice(0, 2000)}`;
  return aiChat([{ role: "user", content: prompt }], { maxTokens: 512 });
}

// Generate code snippets
export async function generateCode(description, language = "javascript") {
  if (!isOpenRouterAvailable() || !description) return null;
  const prompt = `Generate a ${language} code snippet for: ${description}. Return only the code, no explanation.`;
  return aiChat([{ role: "user", content: prompt }], { maxTokens: 512 });
}

// Explain a concept
export async function explainConcept(concept) {
  if (!isOpenRouterAvailable() || !concept) return null;
  const prompt = `Explain "${concept}" in simple terms (2-3 sentences).`;
  return aiChat([{ role: "user", content: prompt }], { maxTokens: 256 });
}

