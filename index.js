// index.js – astig-gateway on Railway (CommonJS)

const express = require("express");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");

// ===== ENV =====

// OpenAI key (for now this is the only model; later we’ll fan out to others via council)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// (We’ll use these later for n8n / ingest / rag; safe to keep around)
const N8N_BIG_INGEST_URL = process.env.N8N_BIG_INGEST_URL;
const N8N_IMAGE_INGEST_URL = process.env.N8N_IMAGE_INGEST_URL;
const N8N_RAG_QUERY_URL = process.env.N8N_RAG_QUERY_URL;
const N8N_JOBS_BUILDER_URL = process.env.N8N_JOBS_BUILDER_URL;

const app = express();
app.use(bodyParser.json({ limit: "20mb" }));

// Basic logging so we can see what’s happening
app.use((req, _res, next) => {
  console.log(
    `[astig-gateway] ${req.method} ${req.url} at ${new Date().toISOString()}`
  );
  next();
});

// ===== Healthcheck (GET /healthz) =====

app.get("/healthz", (_req, res) => {
  res.json({
    ok: true,
    service: "astig_gateway",
    time: new Date().toISOString(),
  });
});

// ===== Helper: call OpenAI (single-model for now) =====

async function callOpenAI(message) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini", // adjust if you prefer a different model
      messages: [
        {
          role: "system",
          content:
            "You are AERIS, the sovereign founder copilot for astig.systems. Be concise, practical, and honest.",
        },
        { role: "user", content: message },
      ],
    }),
  });

  const text = await resp.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    console.error("[astig-gateway] Failed to parse OpenAI response:", text);
    throw new Error("Invalid JSON from OpenAI");
  }

  if (!resp.ok) {
    console.error(
      "[astig-gateway] OpenAI error",
      resp.status,
      JSON.stringify(json)
    );
    throw new Error(
      `OpenAI error ${resp.status}: ${
        json.error?.message || "Unknown error from OpenAI"
      }`
    );
  }

  const reply =
    json.choices?.[0]?.message?.content ??
    "AERIS responded, but no content was found.";

  return reply;
}

// ===== Council v0 – POST /council =====
// For now this is “single model = council v0”. Later we’ll fan out to 4–5 providers.

app.post("/council", async (req, res) => {
  try {
    let body = req.body;

    // Be tolerant of people sending a stringified JSON body
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (_e) {
        return res.status(400).json({
          ok: false,
          error: "invalid_json",
          message:
            "Request body was a string and could not be parsed as JSON.",
        });
      }
    }

    const message = typeof body?.message === "string" ? body.message.trim() : "";

    if (!message) {
      return res.status(400).json({
        ok: false,
        error: "missing_message",
        message: "Expected a JSON body like { \"message\": \"...\" }",
      });
    }

    const reply = await callOpenAI(message);

    return res.json({
      ok: true,
      mode: "council_v0_single_model",
      reply,
    });
  } catch (err) {
    console.error("[astig-gateway] /council error:", err);
    return res.status(500).json({
      ok: false,
      error: "gateway_error",
      message: err.message || "Unknown error in astig-gateway.",
    });
  }
});

// ===== Start server =====

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`[astig-gateway] Listening on port ${PORT}`);
  if (!OPENAI_API_KEY) {
    console.warn(
      "[astig-gateway] WARNING: OPENAI_API_KEY not set – council will fail when called."
    );
  }
});
