// index.js – astig-gateway on Railway (CommonJS)

const express = require("express");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");

// ==== ENV ====

// OpenAI key (or your AI gateway key)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// n8n tool URLs
const N8N_BIG_INGEST_URL = process.env.N8N_BIG_INGEST_URL;
const N8N_IMAGE_INGEST_URL = process.env.N8N_IMAGE_INGEST_URL;
const N8N_RAG_QUERY_URL = process.env.N8N_RAG_QUERY_URL;
const N8N_JOBS_BUILDER_URL = process.env.N8N_JOBS_BUILDER_URL;

// Basic sanity checks (don’t crash, just warn)
if (!OPENAI_API_KEY) {
  console.warn("[astig-gateway] OPENAI_API_KEY not set – council will fail.");
}
if (!N8N_BIG_INGEST_URL) console.warn("[astig-gateway] N8N_BIG_INGEST_URL not set");
if (!N8N_IMAGE_INGEST_URL) console.warn("[astig-gateway] N8N_IMAGE_INGEST_URL not set");
if (!N8N_RAG_QUERY_URL) console.warn("[astig-gateway] N8N_RAG_QUERY_URL not set");
if (!N8N_JOBS_BUILDER_URL) console.warn("[astig-gateway] N8N_JOBS_BUILDER_URL not set");

const app = express();
app.use(bodyParser.json({ limit: "20mb" }));

// ====== Helper: call OpenAI (can later be swapped for provider-agnostic gateway) ======

async function callOpenAIChat(systemPrompt, userMessage) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.4,
    }),
  });

  const json = await res.json();
  if (!res.ok) {
    console.error("OpenAI error", res.status, json);
    throw new Error(`OpenAI error: ${res.status}`);
  }

  const text =
    json.choices?.[0]?.message?.content ??
    JSON.stringify(json);

  return { text, raw: json };
}

// ====== AERIS COUNCIL ======

/**
 * POST /aeris/council
 * Body: { message, actor_id, thread_id? }
 */
app.post("/aeris/council", async (req, res) => {
  const { message, actor_id, thread_id } = req.body || {};

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Missing message" });
  }

  try {
    // Four “seats” – later each can be a distinct provider / NUC model
    const lanes = [
      {
        id: "systems_architect",
        system:
          "You are the Systems Architect for astig.systems. Focus on sovereignty, infra, risk and long-term robustness.",
      },
      {
        id: "product_operator",
        system:
          "You are the Product & PLM Operator for astig.systems. Focus on PLM core module, UX, and shipping Product 1.",
      },
      {
        id: "finance_speed",
        system:
          "You are the Finance & Speed Operator. Focus on shipping quickly, cash flow, and ruthless prioritization.",
      },
      {
        id: "founder_mentor",
        system:
          "You are the Founder Mentor. Talk to the founder honestly, highlight tradeoffs, protect their energy.",
      },
    ];

    // Round 1 – each lane writes an answer
    const lanePromises = lanes.map(async (lane) => {
      const answer = await callOpenAIChat(
        `${lane.system} Always answer concisely and concretely.`,
        message,
      );
      return {
        id: lane.id,
        answer: answer.text,
      };
    });

    const laneAnswers = await Promise.all(lanePromises);

    // Round 2 – debate
    const debatePrompt = [
      "You are the AERIS Council facilitator for astig.systems.",
      "Four advisors have given opinions to the founder. Each has an id and an answer.",
      "Your job:",
      "1) Summarize where they agree and disagree.",
      "2) Point out any clear mistakes or blind spots.",
      "3) Suggest what tradeoffs the founder should consider.",
      "",
      "Answers:",
      ...laneAnswers.map(
        (lane) => `- ${lane.id}: """${lane.answer}"""`,
      ),
      "",
      `Founder's question: """${message}"""`,
    ].join("\n");

    const debate = await callOpenAIChat(
      "You are the neutral, critical debate moderator.",
      debatePrompt,
    );

    // Round 3 – judge & final synthesis
    const judgePrompt = [
      "You are AERIS, the final judge for astig.systems.",
      "You have seen multiple advisor answers and a debate summary.",
      "Give the founder:",
      "- A single, clear recommendation.",
      "- The reasoning in plain language.",
      "- Concrete next 1–3 steps they can take today.",
      "",
      "Advisor answers:",
      ...laneAnswers.map(
        (lane) => `- ${lane.id}: """${lane.answer}"""`,
      ),
      "",
      `Debate summary: """${debate.text}"""`,
      "",
      `Founder's question: """${message}"""`,
    ].join("\n");

    const final = await callOpenAIChat(
      "You are AERIS, the founder's sovereign copilot. Be decisive, honest, and practical.",
      judgePrompt,
    );

    const reply = final.text;

    return res.json({
      reply,
      council_trace: {
        actor_id,
        thread_id,
        lanes: laneAnswers,
        debate: debate.text,
        // raw can be stored in fw_ai_runs if you want – omitted from API reply for now
      },
    });
  } catch (err) {
    console.error("Council error", err);
    return res.status(500).json({
      error: "Council error",
      message: String(err),
    });
  }
});

// ====== TOOL ROUTES (n8n) ======

async function forwardToN8N(url, body) {
  if (!url) {
    throw new Error("Tool URL not configured");
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("n8n tool error", url, res.status, json);
    throw new Error(`n8n error: ${res.status}`);
  }
  return json;
}

// Big ingest: text, URLs, file metadata, etc.
app.post("/aeris/big-ingest", async (req, res) => {
  try {
    const result = await forwardToN8N(N8N_BIG_INGEST_URL, req.body || {});
    res.json(result);
  } catch (err) {
    console.error("big-ingest error", err);
    res.status(500).json({ error: "big_ingest_failed", message: String(err) });
  }
});

// Image / screenshot ingest
app.post("/aeris/image-ingest", async (req, res) => {
  try {
    const result = await forwardToN8N(N8N_IMAGE_INGEST_URL, req.body || {});
    res.json(result);
  } catch (err) {
    console.error("image-ingest error", err);
    res.status(500).json({ error: "image_ingest_failed", message: String(err) });
  }
});

// RAG query
app.post("/aeris/rag-query", async (req, res) => {
  try {
    const result = await forwardToN8N(N8N_RAG_QUERY_URL, req.body || {});
    // Expect n8n to return { reply: "..." } or similar
    res.json(result);
  } catch (err) {
    console.error("rag-query error", err);
    res.status(500).json({ error: "rag_query_failed", message: String(err) });
  }
});

// Jobs builder (for later – wiring Product 1 workflows)
app.post("/aeris/jobs-builder", async (req, res) => {
  try {
    const result = await forwardToN8N(N8N_JOBS_BUILDER_URL, req.body || {});
    res.json(result);
  } catch (err) {
    console.error("jobs-builder error", err);
    res.status(500).json({ error: "jobs_builder_failed", message: String(err) });
  }
});

// ====== START SERVER ======

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`astig-gateway listening on port ${PORT}`);
});
