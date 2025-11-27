// index.js -> astig-gateway v0

const express = require("express");
const cors = require("cors");

// ESM-compatible node-fetch wrapper for CommonJS
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const app = express();

// Port Railway / local will use
const PORT = process.env.PORT || 3000;

// Env vars (we’ll wire these in Railway later)
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL; // your aeris.relay webhook
const N8N_WEBHOOK_SECRET_HEADER =
  process.env.N8N_WEBHOOK_SECRET_HEADER || "X-Aeris-Secret";
const N8N_WEBHOOK_SECRET_VALUE = process.env.N8N_WEBHOOK_SECRET_VALUE || "";

// Basic middleware
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Simple healthcheck so Vercel / you can verify it’s alive
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "astig-gateway",
    env: process.env.NODE_ENV || "local",
  });
});

// Founder cockpit chat endpoint
app.post("/aeris", async (req, res) => {
  try {
    if (!N8N_WEBHOOK_URL) {
      console.error("N8N_WEBHOOK_URL is not set");
      return res.status(500).json({
        ok: false,
        error: "missing_upstream_url",
      });
    }

    console.log(
      "[astig-gateway] /aeris received payload:",
      JSON.stringify(req.body, null, 2)
    );

    const headers = {
      "Content-Type": "application/json",
    };

    if (N8N_WEBHOOK_SECRET_VALUE) {
      headers[N8N_WEBHOOK_SECRET_HEADER] = N8N_WEBHOOK_SECRET_VALUE;
    }

    const upstream = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(req.body),
    });

    const text = await upstream.text();
    let json;

    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }

    console.log(
      "[astig-gateway] upstream status:",
      upstream.status,
      "body:",
      json
    );

    res.status(upstream.status).json(json);
  } catch (err) {
    console.error("[astig-gateway] error:", err);
    res.status(500).json({
      ok: false,
      error: "gateway_error",
      message: err.message,
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`astig-gateway listening on port ${PORT}`);
});
