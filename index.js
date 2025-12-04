// index.js – astig-gateway on Railway

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

// Use global fetch if available (Node 18+), otherwise lazy-load node-fetch
let fetchFn = global.fetch;
if (!fetchFn) {
  fetchFn = (...args) =>
    import("node-fetch").then(({ default: fetch }) => fetch(...args));
}

const app = express();
const PORT = process.env.PORT || 8080;

// ---- ENV VARS ----

const N8N_COUNCIL_URL = process.env.N8N_WEBHOOK_URL; // existing council / main chat
const N8N_BIG_INGEST_URL = process.env.N8N_BIG_INGEST_URL; // big_ingest_v1
const N8N_IMAGE_INGEST_URL = process.env.N8N_IMAGE_INGEST_URL; // image_ingest_v1
const N8N_RAG_QUERY_URL = process.env.N8N_RAG_QUERY_URL; // rag_query_engine

const N8N_WEBHOOK_SECRET_HEADER =
  process.env.N8N_WEBHOOK_SECRET_HEADER || "";
const N8N_WEBHOOK_SECRET_VALUE = process.env.N8N_WEBHOOK_SECRET_VALUE || "";

// ---- MIDDLEWARE ----

app.use(
  cors({
    origin: true,
    credentials: false,
  })
);

app.use(
  bodyParser.json({
    limit: "10mb",
  })
);

app.use((req, _res, next) => {
  console.log(
    `[astig-gateway] ${new Date().toISOString()} ${req.method} ${req.url}`
  );
  next();
});

// ---- HELPERS ----

function validateSecret(req) {
  if (!N8N_WEBHOOK_SECRET_HEADER || !N8N_WEBHOOK_SECRET_VALUE) return true;
  const headerName = N8N_WEBHOOK_SECRET_HEADER.toLowerCase();
  const incoming = req.headers[headerName];
  return incoming === N8N_WEBHOOK_SECRET_VALUE;
}

async function forwardToN8N(url, payload) {
  const res = await fetchFn(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload ?? {}),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    const err = new Error("n8n upstream error");
    err.status = res.status;
    err.payload = json;
    throw err;
  }

  return json;
}

function requireSecret(req, res) {
  if (!validateSecret(req)) {
    res.status(401).json({ ok: false, error: "invalid_secret" });
    return false;
  }
  return true;
}

// ---- ROUTES ----

// Healthcheck
app.get("/healthz", (_req, res) => {
  res.json({
    ok: true,
    service: "astig_gateway",
    time: new Date().toISOString(),
  });
});

// Council / main chat – uses existing N8N_WEBHOOK_URL (council workflow)
app.post("/council", async (req, res) => {
  try {
    if (!requireSecret(req, res)) return;

    if (!N8N_COUNCIL_URL) {
      return res
        .status(500)
        .json({ ok: false, error: "missing_council_url" });
    }

    const payload = req.body || {};
    const result = await forwardToN8N(N8N_COUNCIL_URL, payload);

    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[/council] error", err);
    res.status(err.status || 500).json({
      ok: false,
      error: "gateway_error",
      message: err.message || "council upstream error",
      upstream: err.payload || null,
    });
  }
});

// Big ingest – big_ingest_v1 workflow
app.post("/big_ingest", async (req, res) => {
  try {
    if (!requireSecret(req, res)) return;

    if (!N8N_BIG_INGEST_URL) {
      return res
        .status(500)
        .json({ ok: false, error: "missing_big_ingest_url" });
    }

    const payload = req.body || {};
    const result = await forwardToN8N(N8N_BIG_INGEST_URL, payload);

    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[/big_ingest] error", err);
    res.status(err.status || 500).json({
      ok: false,
      error: "gateway_error",
      message: err.message || "big_ingest upstream error",
      upstream: err.payload || null,
    });
  }
});

// Image ingest – image_ingest_v1 workflow
app.post("/image_ingest", async (req, res) => {
  try {
    if (!requireSecret(req, res)) return;

    if (!N8N_IMAGE_INGEST_URL) {
      return res
        .status(500)
        .json({ ok: false, error: "missing_image_ingest_url" });
    }

    const payload = req.body || {};
    const result = await forwardToN8N(N8N_IMAGE_INGEST_URL, payload);

    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[/image_ingest] error", err);
    res.status(err.status || 500).json({
      ok: false,
      error: "gateway_error",
      message: err.message || "image_ingest upstream error",
      upstream: err.payload || null,
    });
  }
});

// RAG query – rag_query_engine workflow
app.post("/rag_query", async (req, res) => {
  try {
    if (!requireSecret(req, res)) return;

    if (!N8N_RAG_QUERY_URL) {
      return res
        .status(500)
        .json({ ok: false, error: "missing_rag_query_url" });
    }

    const payload = req.body || {};
    const result = await forwardToN8N(N8N_RAG_QUERY_URL, payload);

    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[/rag_query] error", err);
    res.status(err.status || 500).json({
      ok: false,
      error: "gateway_error",
      message: err.message || "rag_query upstream error",
      upstream: err.payload || null,
    });
  }
});

// 404
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "not_found" });
});

// Global error handler
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("[gateway] unhandled error", err);
  res.status(err.status || 500).json({
    ok: false,
    error: "gateway_error",
    message: err.message || "unexpected error",
  });
});

app.listen(PORT, () => {
  console.log(`[astig-gateway] Listening on port ${PORT}`);
});
