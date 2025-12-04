// index.js — astig-gateway on Railway (CommonJS)

const express = require("express");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");

// ─────────────────────────────────────────────────────────────
// ENV
// ─────────────────────────────────────────────────────────────

// Primary provider keys (more providers later)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";

// n8n tool URLs (for later wiring from the UI icons)
const N8N_BIG_INGEST_URL = process.env.N8N_BIG_INGEST_URL || "";
const N8N_IMAGE_INGEST_URL = process.env.N8N_IMAGE_INGEST_URL || "";
const N8N_RAG_QUERY_URL = process.env.N8N_RAG_QUERY_URL || "";
const N8N_JOBS_BUILDER_URL = process.env.N8N_JOBS_BUILDER_URL || "";

// Basic sanity logs (don’t crash app if missing)
if (!OPENAI_API_KEY) {
  console.warn("[astig-gateway] OPENAI_API_KEY not set – council will fall back to stub.");
}
if (!N8N_BIG_INGEST_URL) console.warn("[astig-gateway] N8N_BIG_INGEST_URL not set");
if (!N8N_IMAGE_INGEST_URL) console.warn("[astig-gateway] N8N_IMAGE_INGEST_URL not set");
if (!N8N_RAG_QUERY_URL) console.warn("[astig-gateway] N8N_RAG_QUERY_URL not set");
if (!N8N_JOBS_BUILDER_URL) console.warn("[astig-gateway] N8N_JOBS_BUILDER_URL not set");

// ─────────────────────────────────────────────────────────────
// EXPRESS APP
// ─────────────────────────────────────────────────────────────

const app = express();
app.use(bodyParser.json({ limit: "20mb" }));

// Simple CORS so Supabase Edge functions can call this
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

// NOTE: v0 council = single OpenAI model.
// We’ll upgrade this into a multi-model council (OpenAI + Groq + others)
// once the basic plumbing is stable.
async function callOpenAIChat(question) {
  if (!OPENAI_API_KEY) {
    return "[AERIS council] OPENAI_API_KEY missing; this is a stub reply.";
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini", // can be changed later
      messages: [
        {
          role: "system",
          content:
            "You are AERIS, the sovereign founder council for astig.systems. " +
            "Answer clearly, concisely, and with an operator mindset.",
        },
        {
          role: "user",
          content: question,
        },
      ],
      temperature: 0.5,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `OpenAI error ${response.status}: ${text.slice(0, 500)}`
    );
  }

  const json = await response.json();
  const choice = json.choices && json.choices[0];
  const content = choice && choice.message && choice.message.content;
  return (content || "").trim();
}

// ─────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────

// Health check (for Railway / future monitors)
app.get("/healthz", (_req, res) => {
  res.json({ ok: true, service: "astig-gateway", time: new Date().toISOString() });
});

// AERIS founder council v0
app.post("/council", async (req, res) => {
  try {
    const { message } = req.body || {};

    if (!message || typeof message !== "string") {
      return res
        .status(400)
        .json({ error: "bad_request", detail: "Field `message` (string) is required." });
    }

    console.log("[astig-gateway] /council called with:", message.slice(0, 120));

    const reply = await callOpenAIChat(message);

    return res.json({
      ok: true,
      reply,
      provider: "openai",
      model: "gpt-4.1-mini",
      // later: include council breakdown, votes, etc.
    });
  } catch (err) {
    console.error("[astig-gateway] /council error:", err);
    return res.status(500).json({
      error: "gateway_error",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

// Big ingest → n8n (stub v0; UI not hitting this yet)
app.post("/big-ingest", async (req, res) => {
  if (!N8N_BIG_INGEST_URL) {
    return res
      .status(500)
      .json({ error: "config_error", detail: "N8N_BIG_INGEST_URL not configured." });
  }
  try {
    const upstream = await fetch(N8N_BIG_INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body || {}),
    });
    const text = await upstream.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error("[astig-gateway] /big-ingest error:", err);
    return res.status(500).json({ error: "gateway_error", detail: String(err) });
  }
});

// RAG query → n8n (stub)
app.post("/rag-query", async (req, res) => {
  if (!N8N_RAG_QUERY_URL) {
    return res
      .status(500)
      .json({ error: "config_error", detail: "N8N_RAG_QUERY_URL not configured." });
  }
  try {
    const upstream = await fetch(N8N_RAG_QUERY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body || {}),
    });
    const text = await upstream.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error("[astig-gateway] /rag-query error:", err);
    return res.status(500).json({ error: "gateway_error", detail: String(err) });
  }
});

// Image ingest → n8n (stub)
app.post("/image-ingest", async (req, res) => {
  if (!N8N_IMAGE_INGEST_URL) {
    return res
      .status(500)
      .json({ error: "config_error", detail: "N8N_IMAGE_INGEST_URL not configured." });
  }
  try {
    const upstream = await fetch(N8N_IMAGE_INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body || {}),
    });
    const text = await upstream.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error("[astig-gateway] /image-ingest error:", err);
    return res.status(500).json({ error: "gateway_error", detail: String(err) });
  }
});

// Jobs builder → n8n (stub)
app.post("/jobs-builder", async (req, res) => {
  if (!N8N_JOBS_BUILDER_URL) {
    return res
      .status(500)
      .json({ error: "config_error", detail: "N8N_JOBS_BUILDER_URL not configured." });
  }
  try {
    const upstream = await fetch(N8N_JOBS_BUILDER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body || {}),
    });
    const text = await upstream.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
    return res.status(upstream.status).json(json);
  } catch (err) {
    console.error("[astig-gateway] /jobs-builder error:", err);
    return res.status(500).json({ error: "gateway_error", detail: String(err) });
  }
});

// ─────────────────────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`[astig-gateway] Listening on port ${PORT}`);
});
