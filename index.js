// index.js — astig-gateway on Railway (CommonJS)

const express = require("express");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");

// ===== ENV =====

// OpenAI key (or your AI gateway key)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini"; // change if you prefer

// (We’re not using these yet, but keeping them for later wiring)
const N8N_BIG_INGEST_URL = process.env.N8N_BIG_INGEST_URL;
const N8N_IMAGE_INGEST_URL = process.env.N8N_IMAGE_INGEST_URL;
const N8N_RAG_QUERY_URL = process.env.N8N_RAG_QUERY_URL;
const N8N_JOBS_BUILDER_URL = process.env.N8N_JOBS_BUILDER_URL;

const PORT = process.env.PORT || 8080;

// Basic sanity checks (don’t crash, just warn)
if (!OPENAI_API_KEY) {
  console.warn(
    "[astig-gateway] OPENAI_API_KEY not set – /council will return 500 until you configure it."
  );
}

if (!N8N_BIG_INGEST_URL) console.warn("[astig-gateway] N8N_BIG_INGEST_URL not set");
if (!N8N_IMAGE_INGEST_URL) console.warn("[astig-gateway] N8N_IMAGE_INGEST_URL not set");
if (!N8N_RAG_QUERY_URL) console.warn("[astig-gateway] N8N_RAG_QUERY_URL not set");
if (!N8N_JOBS_BUILDER_URL) console.warn("[astig-gateway] N8N_JOBS_BUILDER_URL not set");

const app = express();
app.use(bodyParser.json({ limit: "20mb" }));

// ===== Health check =====
app.get("/healthz", (req, res) => {
  res.json({
    ok: true,
    service: "astig_gateway",
    time: new Date().toISOString(),
  });
});

// ===== AERIS council stub (single-model for now) =====
app.post("/council", async (req, res) => {
  try {
    const body = req.body || {};
    const message = body.message;

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        ok: false,
        error: "Body must be JSON with a non-empty `message` string.",
      });
    }

    if (!OPENAI_API_KEY) {
      return res.status(500).json({
        ok: false,
        error: "OPENAI_API_KEY not configured on astig-gateway.",
      });
    }

    // Call OpenAI as a simple “council” stub.
    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content:
              "You are AERIS, the founder's council-of-agents inside astig.systems. " +
              "Be concise and practical. You are advising the creator of astig.systems.",
          },
          {
            role: "user",
            content: message,
          },
        ],
      }),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      console.error(
        "[astig-gateway] OpenAI error:",
        upstream.status,
        upstream.statusText,
        text
      );
      return res.status(502).json({
        ok: false,
        error: "Upstream OpenAI error",
        status: upstream.status,
        body: text,
      });
    }

    const json = await upstream.json();
    const reply =
      json.choices?.[0]?.message?.content ||
      "AERIS responded, but I could not read the reply payload.";

    return res.json({
      ok: true,
      reply,
    });
  } catch (err) {
    console.error("[astig-gateway] /council internal error:", err);
    return res.status(500).json({
      ok: false,
      error: "Internal error in /council",
    });
  }
});

// ===== catch-all =====
app.all("*", (req, res) => {
  res.status(404).json({
    ok: false,
    error: "Not found",
    path: req.path,
  });
});

app.listen(PORT, () => {
  console.log(`[astig-gateway] Listening on port ${PORT}`);
});
