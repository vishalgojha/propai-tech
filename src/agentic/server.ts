import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { RealtorOrchestrator } from "./agents/orchestrator.js";
import type { LeadInput } from "./types.js";
import { INDIAN_PROPERTIES } from "./data/indian-properties.js";
import { FRONTEND_CSS, FRONTEND_HTML, FRONTEND_JS } from "./frontend.js";
import { loadRuntimeConfigOrThrow, type RuntimeConfig } from "./runtime-config.js";
import { RealtorSuiteAgentEngine } from "./suite/engine.js";
import type { ChatRequest } from "./suite/types.js";
import { getPairingStore } from "./whatsapp/inbound/pairing-store.js";
import { getConnectorHealthSnapshot } from "./connectors/health.js";

const orchestrator = new RealtorOrchestrator();
const suiteEngine = new RealtorSuiteAgentEngine();
const pairingStore = getPairingStore();

type AgentRunRequest = {
  lead: LeadInput;
  sendWhatsApp?: boolean;
  recipient?: string;
};

export function startAgenticServer(port = Number(process.env.PORT || 8080)) {
  const runtimeConfig = loadRuntimeConfigOrThrow();
  const server = createServer(async (req, res) => {
    try {
      await route(req, res, runtimeConfig);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Internal server error";
      sendJson(res, 500, { ok: false, error: message });
    }
  });

  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`PropAI Tech Agentic App running on http://localhost:${port}`);
  });

  return server;
}

async function route(req: IncomingMessage, res: ServerResponse, runtimeConfig: RuntimeConfig) {
  const method = req.method || "GET";
  const path = req.url?.split("?")[0] || "/";
  applyCors(res);

  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (method === "GET" && path === "/") {
    res.writeHead(302, { Location: "/app" });
    res.end();
    return;
  }

  if (method === "GET" && path === "/app") {
    sendHtml(res, 200, FRONTEND_HTML);
    return;
  }

  if (method === "GET" && path === "/app.css") {
    sendCss(res, 200, FRONTEND_CSS);
    return;
  }

  if (method === "GET" && path === "/app.js") {
    sendJs(res, 200, FRONTEND_JS);
    return;
  }

  if (method === "GET" && path === "/health") {
    sendJson(res, 200, { ok: true, service: "indian-realtor-agentic-app" });
    return;
  }

  if (method === "GET" && path === "/properties") {
    sendJson(res, 200, { ok: true, properties: INDIAN_PROPERTIES });
    return;
  }

  if (method === "GET" && path === "/connectors/health") {
    const snapshot = await getConnectorHealthSnapshot();
    sendJson(res, 200, { ok: true, result: snapshot });
    return;
  }

  if (method === "POST" && path === "/agent/run") {
    const body = await parseJson<AgentRunRequest>(req);
    if (!body?.lead?.message) {
      sendJson(res, 400, { ok: false, error: "lead.message is required" });
      return;
    }
    const result = await orchestrator.run(body.lead, {
      sendWhatsApp: body.sendWhatsApp,
      recipient: body.recipient
    });
    sendJson(res, 200, { ok: true, result });
    return;
  }

  if (method === "POST" && path === "/agent/chat") {
    const auth = authorizeAgentChat(req, runtimeConfig);
    if (!auth.ok) {
      sendJson(res, auth.status, { ok: false, error: auth.error });
      return;
    }

    const body = await parseJson<unknown>(req);
    const validated = validateChatRequest(body);
    if (!validated.ok) {
      sendJson(res, 400, { ok: false, error: validated.error });
      return;
    }
    const result = await suiteEngine.chat(validated.value);
    sendJson(res, 200, { ok: true, result });
    return;
  }

  if (method === "POST" && path === "/wacli/send") {
    const body = await parseJson<{ to?: string; message?: string }>(req);
    if (!body?.to || !body?.message) {
      sendJson(res, 400, { ok: false, error: "to and message are required" });
      return;
    }
    const result = await orchestrator.sendManualMessage(body.to, body.message);
    sendJson(res, result.ok ? 200 : 500, { ok: result.ok, result });
    return;
  }

  if (method === "POST" && path === "/wacli/search") {
    const body = await parseJson<{ query?: string; chat?: string; limit?: number }>(req);
    if (!body?.query) {
      sendJson(res, 400, { ok: false, error: "query is required" });
      return;
    }
    const result = await orchestrator.searchMessages(body.query, body.chat, body.limit ?? 20);
    sendJson(res, result.ok ? 200 : 500, { ok: result.ok, result });
    return;
  }

  if (method === "POST" && path === "/wacli/chats") {
    const body = await parseJson<{ query?: string; limit?: number }>(req);
    const result = await orchestrator.listChats(body?.query, body?.limit ?? 20);
    sendJson(res, result.ok ? 200 : 500, { ok: result.ok, result });
    return;
  }

  if (method === "POST" && path === "/wacli/doctor") {
    const result = await orchestrator.doctor();
    sendJson(res, result.ok ? 200 : 500, { ok: result.ok, result });
    return;
  }

  if (method === "POST" && path === "/whatsapp/pairing/approve") {
    if (runtimeConfig.whatsappDmPolicy !== "pairing") {
      sendJson(res, 400, {
        ok: false,
        error: "Pairing approval is only available when WHATSAPP_DM_POLICY=pairing."
      });
      return;
    }

    const auth = authorizeAdminAction(req, runtimeConfig);
    if (!auth.ok) {
      sendJson(res, auth.status, { ok: false, error: auth.error });
      return;
    }
    const body = await parseJson<{ code?: string }>(req);
    const code = String(body?.code || "").trim();
    if (!/^\d{6}$/.test(code)) {
      sendJson(res, 400, { ok: false, error: "code must be a 6-digit string" });
      return;
    }

    const approval = await pairingStore.approveByCode(code);
    if (!approval.ok) {
      sendJson(res, 404, { ok: false, error: "Pairing code not found or already used." });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      result: {
        approved: true,
        phone: approval.phoneE164
      }
    });
    return;
  }

  sendJson(res, 404, { ok: false, error: "Route not found" });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(body, null, 2));
}

function sendHtml(res: ServerResponse, status: number, html: string) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8"
  });
  res.end(html);
}

function sendCss(res: ServerResponse, status: number, css: string) {
  res.writeHead(status, {
    "Content-Type": "text/css; charset=utf-8"
  });
  res.end(css);
}

function sendJs(res: ServerResponse, status: number, js: string) {
  res.writeHead(status, {
    "Content-Type": "application/javascript; charset=utf-8"
  });
  res.end(js);
}

function applyCors(res: ServerResponse) {
  const origin = process.env.CORS_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-agent-api-key,x-agent-role");
}

async function parseJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {} as T;
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

type AgentChatAuthResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

function authorizeAgentChat(req: IncomingMessage, runtimeConfig: RuntimeConfig): AgentChatAuthResult {
  const configuredKey = runtimeConfig.agentApiKey;
  const headerKey = getSingleHeader(req, "x-agent-api-key");

  if (configuredKey && headerKey !== configuredKey) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized: invalid or missing x-agent-api-key."
    };
  }

  const allowedRoles = runtimeConfig.agentAllowedRoles;
  const headerRole = getSingleHeader(req, "x-agent-role");
  if (headerRole && !allowedRoles.includes(headerRole)) {
    return {
      ok: false,
      status: 403,
      error: "Forbidden: x-agent-role is not allowed."
    };
  }

  return { ok: true };
}

function authorizeAdminAction(req: IncomingMessage, runtimeConfig: RuntimeConfig): AgentChatAuthResult {
  const configuredKey = runtimeConfig.agentApiKey;
  const headerKey = getSingleHeader(req, "x-agent-api-key");
  if (configuredKey && headerKey !== configuredKey) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized: invalid or missing x-agent-api-key."
    };
  }

  const allowedRoles = runtimeConfig.agentAllowedRoles;
  const headerRole = getSingleHeader(req, "x-agent-role");
  if (!headerRole || !allowedRoles.includes(headerRole)) {
    return {
      ok: false,
      status: 403,
      error: "Forbidden: admin role required in x-agent-role."
    };
  }

  return { ok: true };
}

function getSingleHeader(req: IncomingMessage, key: string): string | undefined {
  const raw = req.headers[key];
  if (!raw) return undefined;
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

type ChatValidationResult =
  | { ok: true; value: ChatRequest }
  | { ok: false; error: string };

function validateChatRequest(body: unknown): ChatValidationResult {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Payload must be a JSON object." };
  }

  const payload = body as Record<string, unknown>;
  if (typeof payload.message !== "string" || payload.message.trim().length === 0) {
    return { ok: false, error: "message is required and must be a non-empty string." };
  }

  if (payload.recipient !== undefined && typeof payload.recipient !== "string") {
    return { ok: false, error: "recipient must be a string when provided." };
  }

  if (payload.dryRun !== undefined && typeof payload.dryRun !== "boolean") {
    return { ok: false, error: "dryRun must be a boolean when provided." };
  }

  if (payload.model !== undefined && typeof payload.model !== "string") {
    return { ok: false, error: "model must be a string when provided." };
  }

  if (payload.lead !== undefined) {
    if (!payload.lead || typeof payload.lead !== "object") {
      return { ok: false, error: "lead must be an object when provided." };
    }

    const lead = payload.lead as Record<string, unknown>;
    if (lead.message !== undefined && typeof lead.message !== "string") {
      return { ok: false, error: "lead.message must be a string when provided." };
    }
    if (lead.name !== undefined && typeof lead.name !== "string") {
      return { ok: false, error: "lead.name must be a string when provided." };
    }
    if (lead.city !== undefined && typeof lead.city !== "string") {
      return { ok: false, error: "lead.city must be a string when provided." };
    }
    if (lead.preferredLanguage !== undefined && typeof lead.preferredLanguage !== "string") {
      return { ok: false, error: "lead.preferredLanguage must be a string when provided." };
    }
  }

  return { ok: true, value: payload as ChatRequest };
}
