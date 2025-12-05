// index.js
//
// astig-gateway on Railway
// Receives POSTs from Supabase smart-api and forwards to n8n.
// Endpoints:
//   POST /council      -> N8N_WEBHOOK_URL
//   POST /big_ingest   -> N8N_BIG_INGEST_URL
//   POST /image_ingest -> N8N_IMAGE_INGEST_URL
//   POST /rag_query    -> N8N_RAG_QUERY_URL
//
// This gateway NEVER returns 4xx/5xx to the caller; all responses are 200
// with a JSON payload describing what happened. That keeps the UI + Supabase
// happy and lets the chat always show a message.

const http = require("http");

const PORT = process.env.PORT || 3000;

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || "";
const N8N_BIG_INGEST_URL = process.env.N8N_BIG_INGEST_URL || "";
const N8N_IMAGE_INGEST_URL = process.env.N8N_IMAGE_INGEST_URL || "";
const N8N_RAG_QUERY_URL = process.env.N8N_RAG_QUERY_URL || "";

// These are used ONLY outbound (gateway -> n8n), not inbound auth
const N8N_WEBHOOK_SECRET_HEADER = process.env.N8N_WEBHOOK_SECRET_HEADER || "";
const N8N_WEBHOOK_SECRET_VALUE = process.env.N8N_WEBHOOK_SECRET_VALUE || "";

// Helper: read JSON body safely
function readJson(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      // basic guard against absurdly large bodies
      if (data.length > 5 * 1024 * 1024) {
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        console.error("[gateway] JSON parse error:", err);
        resolve({});
      }
    });
    req.on("error", (err) => {
      console.error("[gateway] request stream error:", err);
      resolve({});
    });
  });
}

// Helper: call n8n and normalize the result
async function callN8n(url, body) {
  if (!url) {
    return {
      ok: false,
      reply: "Gateway is not configured for this endpoint (missing URL).",
      gateway_status: undefined,
      gateway_payload: null,
    };
  }

  const headers = {
    "Content-Type": "application/json",
  };

  if (N8N_WEBHOOK_SECRET_HEADER && N8N_WEBHOOK_SECRET_VALUE) {
    headers[N8N_WEBHOOK_SECRET_HEADER] = N8N_WEBHOOK_SECRET_VALUE;
  }

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body || {}),
    });

    const text = await resp.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }

    let reply;

    if (
      payload &&
      typeof payload === "object" &&
      typeof payload.reply === "string"
    ) {
      reply = payload.reply;
    } else if (
      payload &&
      typeof payload === "object" &&
      typeof payload.message === "string"
    ) {
      reply = payload.message;
    } else if (
      payload &&
      typeof payload === "object" &&
      typeof payload.content === "string"
    ) {
      reply = payload.content;
    } else if (typeof payload === "string") {
      reply = payload;
    } else {
      reply =
        resp.ok
          ? "AERIS responded, but the payload format was not recognized."
          : `Gateway error ${resp.status}`;
    }

    return {
      ok: resp.ok,
      reply,
      gateway_status: resp.status,
      gateway_payload: payload,
    };
  } catch (err) {
    console.error("[gateway] fetch to n8n failed:", err);
    return {
      ok: false,
      reply: `Gateway fetch failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
      gateway_status: undefined,
      gateway_payload: null,
    };
  }
}

const server = http.createServer(async (req, res) => {
  const { method } = req;
  const url = new URL(req.url || "/", "http://localhost");

  // Simple healthcheck
  if (method === "GET" && url.pathname === "/health") {
    const body = JSON.stringify({
      ok: true,
      status: "healthy",
      service: "astig-gateway",
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(body);
    return;
  }

  // We accept any method and normalize everything to a POST-style flow
  const body = await readJson(req);

  let targetUrl;
  switch (url.pathname) {
    case "/council":
      targetUrl = N8N_WEBHOOK_URL;
      break;
    case "/big_ingest":
      targetUrl = N8N_BIG_INGEST_URL;
      break;
    case "/image_ingest":
      targetUrl = N8N_IMAGE_INGEST_URL;
      break;
    case "/rag_query":
      targetUrl = N8N_RAG_QUERY_URL;
      break;
    default:
      // Unknown route – still return 200, but mark not-ok
      const unknown = {
        ok: false,
        reply: `Unknown gateway path: ${url.pathname}`,
        gateway_status: 404,
        gateway_payload: null,
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(unknown));
      return;
  }

  const result = await callN8n(targetUrl, body);

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(result));
});

server.listen(PORT, () => {
  console.log(`[gateway] astig-gateway listening on port ${PORT}`);
});
