// index.js — astig-gateway on Railway (CommonJS)

const express = require("express");
const bodyParser = require("body-parser");

// ---------- FETCH SETUP (Node 16/18 safe) ----------

// Use built-in fetch if available (Node 18+). Otherwise, lazy-load node-fetch.
let fetchFn = global.fetch;
if (!fetchFn) {
  fetchFn = (...args) =>
    import("node-fetch").then(({ default: f }) => f(...args));
}

// ---------- ENV ----------

// OpenAI key (for now this is the main council brain)
// Later we’ll fan out to Claude / Gemini / Groq via the same pattern.
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Optional: other model providers for future council expansion
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// n8n tool URLs (for big_ingest / image_ingest / rag_query / jobs_builder)
const N8N_BIG_INGEST_URL = process.env.N8N_BIG_INGEST_URL;
const N8N_IMAGE_INGEST_URL = process.env.N8N_IMAGE_INGEST_URL;
const N8N_RAG_QUERY_URL = process.env.N8N_RAG_QUERY_URL;
const N8N_JOBS_BUILDER_URL = process.env.N8N_JOBS_BUILDER_URL;

// Basic sanity checks (don’t crash on boot, just warn)
if (!OPENAI_API_KEY) {
  console.warn(
    "[astig-gateway] OPENAI_API_KEY not set – council will fail until this is configured."
  );
}

if (!N8N_BIG_INGEST_URL) console.warn("[astig-gateway] N8N_BIG_INGEST_URL not set");
if (!N8N_IMAGE_INGEST_URL) console.warn("[astig-gateway] N8N_IMAGE_INGEST_URL not set");
if (!N8N_RAG_QUERY_URL) console.warn("[astig-gateway] N8N_RAG_QUERY_URL not set");
if (!N8N_JOBS_BUILDER_URL) console.warn("[astig-gateway] N8N_JOBS_BUILDER_URL not set");

// ---------- APP BOOT ----------

const app = express();
app.use(bodyParser.json({ limit: "20mb" }));

// Simple CORS so you can hit this from dev tools if needed.
// Supabase Edge → gateway doesn’t care about CORS, but Hoppscotch/Postman might.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

// ---------- HELPERS ----------

async function callOpenAI(messages) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not set");
  }

  const body = {
    // Pick any model you prefer here
    model: "gpt-4.1-mini",
    messages,
    temperature: 0.5,
  };

  const resp = await fetchFn("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `openai_error: ${resp.status} ${resp.statusText} – ${text}`
    );
  }

  const json = await resp.json();
  const reply =
    json.choices?.[0]?.message?.content ||
    "AERIS replied but no content was returned.";

  return reply;
}

// ---------- ROUTES ----------

// Health check (used in browser & uptime monitors)
app.get("/healthz", (req, res) => {
  res.json({
    ok: true,
    service: "astig_gateway",
    time: new Date().toISOString(),
  });
});

// Founder council endpoint — this is what Supabase smart-api calls
app.post("/council", async (req, res) => {
  try {
    const message = req.body && req.body.message;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        ok: false,
        error: "bad_request",
        message: "Request body must include a 'message' string.",
      });
    }

    console.log("[council] incoming message:", message);

    const messages = [
      {
        role: "system",
        content:
          "You are AERIS, the sovereign founder council for astig.systems. " +
          "You answer as a concise, high-signal mentor/advisor. " +
          "Prefer clear steps over long essays. Use Markdown.",
      },
      { role: "user", content: message },
    ];

    const reply = await callOpenAI(messages);

    console.log("[council] reply length:", reply.length);

    return res.json({
      ok: true,
      reply,
    });
  } catch (err) {
    console.error("[council] error:", err);
    return res.status(500).json({
      ok: false,
      error: "gateway_error",
      message: err?.message || "Unknown gateway error",
    });
  }
});

// (stubs for future wiring – not used by the chat yet, but here for later)
app.post("/big-ingest", async (req, res) => {
  if (!N8N_BIG_INGEST_URL) {
    return res.status(501).json({
      ok: false,
      error: "not_configured",
      message: "N8N_BIG_INGEST_URL not configured",
    });
  }
  // TODO: proxy to n8n big ingest workflow
  return res.status(501).json({
    ok: false,
    error: "not_implemented",
    message: "big-ingest proxy not implemented yet",
  });
});

app.post("/image-ingest", async (req, res) => {
  if (!N8N_IMAGE_INGEST_URL) {
    return res.status(501).json({
      ok: false,
      error: "not_configured",
      message: "N8N_IMAGE_INGEST_URL not configured",
    });
  }
  // TODO: proxy to n8n image ingest workflow
  return res.status(501).json({
    ok: false,
    error: "not_implemented",
    message: "image-ingest proxy not implemented yet",
  });
});

app.post("/rag-query", async (req, res) => {
  if (!N8N_RAG_QUERY_URL) {
    return res.status(501).json({
      ok: false,
      error: "not_configured",
      message: "N8N_RAG_QUERY_URL not configured",
    });
  }
  // TODO: proxy to n8n rag query workflow
  return res.status(501).json({
    ok: false,
    error: "not_implemented",
    message: "rag-query proxy not implemented yet",
  });
});

app.post("/jobs-builder", async (req, res) => {
  if (!N8N_JOBS_BUILDER_URL) {
    return res.status(501).json({
      ok: false,
      error: "not_configured",
      message: "N8N_JOBS_BUILDER_URL not configured",
    });
  }
  // TODO: proxy to n8n jobs builder workflow
  return res.status(501).json({
    ok: false,
    error: "not_implemented",
    message: "jobs-builder proxy not implemented yet",
  });
});

// ---------- START SERVER ----------

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`[astig-gateway] Listening on port ${port}`);
});
