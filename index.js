// index.js – astig-gateway on Railway (CommonJS)

const express = require("express");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");

// ==== ENV ====================================================================

// For now: OpenAI is the council engine.
// Later: plug in Anthropic, Gemini, Grok, local NUC, etc.
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// n8n tool URLs
const N8N_BIG_INGEST_URL = process.env.N8N_BIG_INGEST_URL;
const N8N_IMAGE_INGEST_URL = process.env.N8N_IMAGE_INGEST_URL;
const N8N_RAG_QUERY_URL = process.env.N8N_RAG_QUERY_URL;
const N8N_JOBS_BUILDER_URL = process.env.N8N_JOBS_BUILDER_URL;

// Sanity checks – warn, don't crash
if (!OPENAI_API_KEY) {
  console.warn(
    "[astig-gateway] OPENAI_API_KEY not set – council will fall back to a placeholder.",
  );
}
if (!N8N_BIG_INGEST_URL)
  console.warn("[astig-gateway] N8N_BIG_INGEST_URL not set");
if (!N8N_IMAGE_INGEST_URL)
  console.warn("[astig-gateway] N8N_IMAGE_INGEST_URL not set");
if (!N8N_RAG_QUERY_URL)
  console.warn("[astig-gateway] N8N_RAG_QUERY_URL not set");
if (!N8N_JOBS_BUILDER_URL)
  console.warn("[astig-gateway] N8N_JOBS_BUILDER_URL not set");

// ==== APP ====================================================================

const app = express();
app.use(bodyParser.json({ limit: "20mb" }));

// CORS for Supabase / Vercel
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization",
  );
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// ==== Helpers =================================================================

// Council-style call using OpenAI now.
// Later we swap this to a real multi-model council, but the contract stays.
async function runCouncil(message, meta = {}) {
  if (!OPENAI_API_KEY) {
    return {
      reply:
        "[AERIS council placeholder] OPENAI_API_KEY not set. " +
        "Set it on Railway to enable real council answers.",
      council: null,
      meta,
    };
  }

  const systemPrompt = `
You are AERIS, the founder's council of AI advisors for astig.systems.

Internally, imagine you are four different specialists debating:

1) Architect – cares about systems, infra, and technical tradeoffs.
2) Operator – cares about reliability, jobs, incidents, and on-call.
3) CFO – cares about unit economics, cash flow, and risk.
4) Skeptic – points out hidden risks, hype, and unknowns.

Have an internal debate, then output ONLY the final, clear answer.
List trade-offs, highlight disagreements, and end with a concrete recommendation.
`.trim();

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      console.error("[astig-gateway] OpenAI error", resp.status, data);
      return {
        reply:
          "AERIS council tried to answer but the model call failed. " +
          "Check astig-gateway logs for details.",
        council: { error: data, status: resp.status },
        meta,
      };
    }

    const reply =
      data?.choices?.[0]?.message?.content ??
      "[AERIS council returned no content]";

    return {
      reply,
      council: {
        model: data.model,
        usage: data.usage,
      },
      meta,
    };
  } catch (err) {
    console.error("[astig-gateway] OpenAI exception", err);
    return {
      reply:
        "AERIS council encountered an exception while answering. " +
        "Check astig-gateway logs.",
      council: { exception: String(err) },
      meta,
    };
  }
}

// Generic helper to call an n8n webhook
async function callN8n(url, payload, label) {
  if (!url) {
    return {
      ok: false,
      data: { error: `${label} URL not configured on gateway` },
    };
  }

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    return { ok: resp.ok, data, status: resp.status };
  } catch (err) {
    console.error(`[astig-gateway] n8n ${label} exception`, err);
    return {
      ok: false,
      data: { error: String(err) },
    };
  }
}

// ==== ROUTES ==================================================================

// Health check
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "astig-gateway",
    time: new Date().toISOString(),
  });
});

// Main AERIS relay – this is what Supabase smart-api calls
app.post("/aeris/relay", async (req, res) => {
  const { message, tool, meta, actor, source } = req.body || {};

  console.log("[astig-gateway] /aeris/relay", {
    tool: tool || "council",
    actor,
    source,
  });

  try {
    // Tool routing
    if (tool === "big_ingest") {
      const result = await callN8n(
        N8N_BIG_INGEST_URL,
        { message, meta, actor, source },
        "big_ingest",
      );
      return res.status(result.ok ? 200 : 500).json({
        reply: result.ok
          ? "Big ingest request handed to the engine."
          : "Big ingest failed on the engine.",
        tool: "big_ingest",
        engine: result.data,
      });
    }

    if (tool === "image_ingest") {
      const result = await callN8n(
        N8N_IMAGE_INGEST_URL,
        { message, meta, actor, source },
        "image_ingest",
      );
      return res.status(result.ok ? 200 : 500).json({
        reply: result.ok
          ? "Image / video ingest handed to the engine."
          : "Image / video ingest failed on the engine.",
        tool: "image_ingest",
        engine: result.data,
      });
    }

    if (tool === "rag_query") {
      const result = await callN8n(
        N8N_RAG_QUERY_URL,
        { message, meta, actor, source },
        "rag_query",
      );
      return res.status(result.ok ? 200 : 500).json({
        reply: result.ok
          ? "RAG query executed by the engine."
          : "RAG query failed on the engine.",
        tool: "rag_query",
        engine: result.data,
      });
    }

    if (tool === "jobs_builder") {
      const result = await callN8n(
        N8N_JOBS_BUILDER_URL,
        { message, meta, actor, source },
        "jobs_builder",
      );
      return res.status(result.ok ? 200 : 500).json({
        reply: result.ok
          ? "Jobs builder request sent to the engine."
          : "Jobs builder failed on the engine.",
        tool: "jobs_builder",
        engine: result.data,
      });
    }

    // Default: council chat
    const councilResult = await runCouncil(message || "", {
      actor,
      source,
      meta,
    });

    return res.json(councilResult);
  } catch (err) {
    console.error("[astig-gateway] /aeris/relay exception", err);
    return res.status(500).json({
      error: "astig-gateway internal error",
      details: String(err),
    });
  }
});

// ==== START ===================================================================

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`astig-gateway listening on port ${PORT}`);
});
