// AI API endpoints — chat, summarization, analysis, etc.
import {
  aiChat,
  summarizeResults,
  summarizeText,
  analyzeScamRisk,
  expandQuery,
  aiDidYouMean,
  enhanceSynthesis,
  factCheck,
  extractEntities,
  analyzeSentiment,
  translateText,
  generateCode,
  explainConcept,
  isOpenRouterAvailable,
} from "./openrouter-ai.js";

export function registerAIRoutes(app) {
  // Chat endpoint
  app.post("/api/ai/chat", async (c) => {
    if (!isOpenRouterAvailable()) {
      return c.json({ error: "AI not configured" }, 503);
    }
    try {
      const { messages } = await c.req.json();
      if (!messages || !Array.isArray(messages)) {
        return c.json({ error: "Invalid messages" }, 400);
      }
      const response = await aiChat(messages);
      if (!response) {
        return c.json({ error: "AI request failed" }, 500);
      }
      return c.json({ response });
    } catch (err) {
      return c.json({ error: err?.message || "Unknown error" }, 500);
    }
  });

  // Summarize results
  app.post("/api/ai/summarize", async (c) => {
    if (!isOpenRouterAvailable()) {
      return c.json({ error: "AI not configured" }, 503);
    }
    try {
      const { results, query } = await c.req.json();
      const summary = await summarizeResults(results, query);
      return c.json({ summary });
    } catch (err) {
      return c.json({ error: err?.message }, 500);
    }
  });

  // Summarize text
  app.post("/api/ai/summarize-text", async (c) => {
    if (!isOpenRouterAvailable()) {
      return c.json({ error: "AI not configured" }, 503);
    }
    try {
      const { text, maxLength } = await c.req.json();
      const summary = await summarizeText(text, { maxLength });
      return c.json({ summary });
    } catch (err) {
      return c.json({ error: err?.message }, 500);
    }
  });

  // Analyze scam risk
  app.post("/api/ai/scam-risk", async (c) => {
    if (!isOpenRouterAvailable()) {
      return c.json({ error: "AI not configured" }, 503);
    }
    try {
      const { text } = await c.req.json();
      const analysis = await analyzeScamRisk(text);
      return c.json(analysis);
    } catch (err) {
      return c.json({ error: err?.message }, 500);
    }
  });

  // Expand query
  app.post("/api/ai/expand-query", async (c) => {
    if (!isOpenRouterAvailable()) {
      return c.json({ error: "AI not configured" }, 503);
    }
    try {
      const { query } = await c.req.json();
      const suggestions = await expandQuery(query);
      return c.json({ suggestions });
    } catch (err) {
      return c.json({ error: err?.message }, 500);
    }
  });

  // Did you mean
  app.post("/api/ai/did-you-mean", async (c) => {
    if (!isOpenRouterAvailable()) {
      return c.json({ error: "AI not configured" }, 503);
    }
    try {
      const { query, results } = await c.req.json();
      const correction = await aiDidYouMean(query, results);
      return c.json({ correction });
    } catch (err) {
      return c.json({ error: err?.message }, 500);
    }
  });

  // Enhance synthesis
  app.post("/api/ai/synthesize", async (c) => {
    if (!isOpenRouterAvailable()) {
      return c.json({ error: "AI not configured" }, 503);
    }
    try {
      const { results, query } = await c.req.json();
      const synthesis = await enhanceSynthesis(results, query);
      return c.json({ synthesis });
    } catch (err) {
      return c.json({ error: err?.message }, 500);
    }
  });

  // Fact check
  app.post("/api/ai/fact-check", async (c) => {
    if (!isOpenRouterAvailable()) {
      return c.json({ error: "AI not configured" }, 503);
    }
    try {
      const { claim, results } = await c.req.json();
      const verdict = await factCheck(claim, results);
      return c.json(verdict);
    } catch (err) {
      return c.json({ error: err?.message }, 500);
    }
  });

  // Extract entities
  app.post("/api/ai/extract-entities", async (c) => {
    if (!isOpenRouterAvailable()) {
      return c.json({ error: "AI not configured" }, 503);
    }
    try {
      const { text } = await c.req.json();
      const entities = await extractEntities(text);
      return c.json({ entities });
    } catch (err) {
      return c.json({ error: err?.message }, 500);
    }
  });

  // Sentiment analysis
  app.post("/api/ai/sentiment", async (c) => {
    if (!isOpenRouterAvailable()) {
      return c.json({ error: "AI not configured" }, 503);
    }
    try {
      const { text } = await c.req.json();
      const sentiment = await analyzeSentiment(text);
      return c.json(sentiment);
    } catch (err) {
      return c.json({ error: err?.message }, 500);
    }
  });

  // Translate
  app.post("/api/ai/translate", async (c) => {
    if (!isOpenRouterAvailable()) {
      return c.json({ error: "AI not configured" }, 503);
    }
    try {
      const { text, targetLang } = await c.req.json();
      const translation = await translateText(text, targetLang);
      return c.json({ translation });
    } catch (err) {
      return c.json({ error: err?.message }, 500);
    }
  });

  // Generate code
  app.post("/api/ai/generate-code", async (c) => {
    if (!isOpenRouterAvailable()) {
      return c.json({ error: "AI not configured" }, 503);
    }
    try {
      const { description, language } = await c.req.json();
      const code = await generateCode(description, language);
      return c.json({ code });
    } catch (err) {
      return c.json({ error: err?.message }, 500);
    }
  });

  // Explain concept
  app.post("/api/ai/explain", async (c) => {
    if (!isOpenRouterAvailable()) {
      return c.json({ error: "AI not configured" }, 503);
    }
    try {
      const { concept } = await c.req.json();
      const explanation = await explainConcept(concept);
      return c.json({ explanation });
    } catch (err) {
      return c.json({ error: err?.message }, 500);
    }
  });

  // Health check
  app.get("/api/ai/health", (c) => {
    return c.json({ available: isOpenRouterAvailable() });
  });
}

