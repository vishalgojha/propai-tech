import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, relative as pathRelative, sep as pathSep, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RealtorOrchestrator } from "./agents/orchestrator.js";
import type { LeadInput } from "./types.js";
import { INDIAN_PROPERTIES } from "./data/indian-properties.js";
import { FRONTEND_CSS, FRONTEND_HTML, FRONTEND_JS } from "./frontend.js";
import { loadRuntimeConfigOrThrow, type RuntimeConfig } from "./runtime-config.js";
import { RealtorSuiteAgentEngine } from "./suite/engine.js";
import type { AgentSessionSnapshot, AutonomyLevel, ChatRequest } from "./suite/types.js";
import { getPairingStore } from "./whatsapp/inbound/pairing-store.js";
import { verifyHubSignature256 } from "./whatsapp/inbound/signature.js";
import { getConnectorHealthSnapshot } from "./connectors/health.js";
import { createRateLimiter, type RateLimiter } from "./http-rate-limit.js";
import { redactPhone } from "./utils/redact.js";
import { getSuiteSessionManager } from "./suite/session-manager.js";
import { createSuiteExecutionQueue } from "./suite/execution-queue.js";
import { createGroupPostingService, type GroupPostingService } from "./group-posting/service.js";

const orchestrator = new RealtorOrchestrator();
const suiteEngine = new RealtorSuiteAgentEngine();
const pairingStore = getPairingStore();
const suiteSessionManager = getSuiteSessionManager();
const CURRENT_FILE_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT_FROM_MODULE = resolve(CURRENT_FILE_DIR, "..", "..");
const REACT_APP_DIST_CANDIDATES = Array.from(
  new Set([resolve(process.cwd(), "web", "dist"), resolve(PROJECT_ROOT_FROM_MODULE, "web", "dist")])
);
const SESSION_EVENT_TOKEN_TTL_MS = 10 * 60 * 1000;
const sessionEventTokens = new Map<string, {
  sessionId: string;
  role?: string;
  expiresAtMs: number;
}>();

type AgentRunRequest = {
  lead: LeadInput;
  sendWhatsApp?: boolean;
  recipient?: string;
};

class PayloadTooLargeError extends Error {
  readonly maxBytes: number;

  constructor(maxBytes: number) {
    super("payload_too_large");
    this.maxBytes = maxBytes;
  }
}

export function startAgenticServer(port = Number(process.env.PORT || 8080)) {
  const runtimeConfig = loadRuntimeConfigOrThrow();
  const executionQueue = createSuiteExecutionQueue(suiteSessionManager);
  const groupPostingService = createGroupPostingService({
    databaseUrl: runtimeConfig.databaseUrl,
    enabled: runtimeConfig.groupPostingEnabled,
    intervalMs: runtimeConfig.groupPostingIntervalMs,
    batchSize: runtimeConfig.groupPostingBatchSize,
    processingLeaseMs: runtimeConfig.groupPostingProcessingLeaseMs,
    defaultTargets: runtimeConfig.groupPostingDefaultTargets,
    schedulerDryRun: runtimeConfig.groupPostingSchedulerDryRun
  });
  groupPostingService.start();
  const rateLimiter = createRateLimiter({
    windowMs: runtimeConfig.agentRateLimitWindowMs,
    max: runtimeConfig.agentRateLimitMax
  });
  const server = createServer(async (req, res) => {
    try {
      await route(req, res, runtimeConfig, rateLimiter, executionQueue, groupPostingService);
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        sendJson(res, 413, {
          ok: false,
          error: "payload_too_large",
          maxBytes: error.maxBytes
        });
        return;
      }
      const message = error instanceof Error ? error.message : "Internal server error";
      sendJson(res, 500, { ok: false, error: message });
    }
  });

  server.on("close", () => {
    groupPostingService.stop();
  });

  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`PropAI Tech Agentic App running on http://localhost:${port}`);
    void logFrontendMode();
  });

  return server;
}

async function route(
  req: IncomingMessage,
  res: ServerResponse,
  runtimeConfig: RuntimeConfig,
  rateLimiter: RateLimiter,
  executionQueue: ReturnType<typeof createSuiteExecutionQueue>,
  groupPostingService: GroupPostingService
) {
  const method = req.method || "GET";
  const requestUrl = new URL(req.url || "/", "http://localhost");
  const path = requestUrl.pathname;
  const parseRequestJson = <T>() => parseJson<T>(req, runtimeConfig.agentMaxBodyBytes);
  const parseRequestRawBody = () => parseRawBody(req, runtimeConfig.agentMaxBodyBytes);
  applyCors(res);

  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (shouldApplyRateLimit(method, path)) {
    const decision = rateLimiter.check(req, `${method}:${path}`);
    res.setHeader("X-RateLimit-Limit", String(decision.limit));
    res.setHeader("X-RateLimit-Remaining", String(decision.remaining));
    res.setHeader("X-RateLimit-Reset", String(decision.resetSeconds));

    if (!decision.allowed) {
      sendJson(res, 429, {
        ok: false,
        error: "rate_limit_exceeded",
        retryAfterSeconds: decision.retryAfterSeconds
      });
      return;
    }
  }

  if (method === "GET" && path === "/") {
    res.writeHead(302, { Location: "/app" });
    res.end();
    return;
  }

  if (method === "GET" && (path === "/app" || path === "/app/" || path.startsWith("/app/"))) {
    const servedReactApp = await tryServeReactApp(path, res);
    if (servedReactApp) {
      return;
    }

    if (path === "/app" || path === "/app/") {
      sendHtml(res, 200, FRONTEND_HTML);
      return;
    }

    sendJson(res, 404, { ok: false, error: "Route not found" });
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

  if (method === "GET" && path === "/whatsapp/webhook") {
    const verifyToken = runtimeConfig.whatsappWebhookVerifyToken;
    if (!verifyToken) {
      sendJson(res, 404, {
        ok: false,
        error: "webhook_not_configured",
        detail: "Set WHATSAPP_WEBHOOK_VERIFY_TOKEN to enable webhook verification."
      });
      return;
    }

    const mode = requestUrl.searchParams.get("hub.mode");
    const token = requestUrl.searchParams.get("hub.verify_token");
    const challenge = requestUrl.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === verifyToken && challenge) {
      sendText(res, 200, challenge);
      return;
    }

    sendJson(res, 403, { ok: false, error: "webhook_verification_failed" });
    return;
  }

  if (method === "POST" && path === "/whatsapp/webhook") {
    const rawBody = await parseRequestRawBody();
    const signature = verifyHubSignature256({
      appSecret: runtimeConfig.whatsappWebhookAppSecret,
      rawBody,
      signatureHeader: req.headers["x-hub-signature-256"]
    });
    if (!signature.ok) {
      sendJson(res, 401, {
        ok: false,
        error: "invalid_webhook_signature",
        reason: signature.reason
      });
      return;
    }

    let payload: unknown = {};
    if (rawBody.length > 0) {
      try {
        payload = JSON.parse(rawBody.toString("utf8")) as unknown;
      } catch {
        sendJson(res, 400, { ok: false, error: "invalid_json" });
        return;
      }
    }

    sendJson(res, 200, {
      ok: true,
      result: {
        accepted: true,
        summary: summarizeWebhookPayload(payload)
      }
    });
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

  if (method === "GET" && path === "/group-posting/status") {
    const auth = authorizeAdminAction(req, runtimeConfig);
    if (!auth.ok) {
      sendJson(res, auth.status, { ok: false, error: auth.error });
      return;
    }

    const status = await groupPostingService.getStatus();
    sendJson(res, 200, { ok: true, result: status });
    return;
  }

  if (method === "GET" && path === "/ops/queue/status") {
    const auth = authorizeAgentChat(req, runtimeConfig);
    if (!auth.ok) {
      sendJson(res, auth.status, { ok: false, error: auth.error });
      return;
    }

    const status = executionQueue.getRuntimeStatus();
    sendJson(res, 200, { ok: true, result: status });
    return;
  }

  if (method === "GET" && path === "/group-posting/queue") {
    const auth = authorizeAdminAction(req, runtimeConfig);
    if (!auth.ok) {
      sendJson(res, auth.status, { ok: false, error: auth.error });
      return;
    }

    const statusParam = getOptionalQueryParam(requestUrl, "status");
    if (statusParam && !isValidGroupPostingStatus(statusParam)) {
      sendJson(res, 400, { ok: false, error: "status must be queued, processing, sent, or failed." });
      return;
    }

    const limitParam = getOptionalQueryParam(requestUrl, "limit");
    const limit = limitParam ? Number(limitParam) : undefined;
    if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0)) {
      sendJson(res, 400, { ok: false, error: "limit must be a positive number when provided." });
      return;
    }

    const items = await groupPostingService.listQueue({
      status: statusParam as "queued" | "processing" | "sent" | "failed" | undefined,
      limit: limit === undefined ? undefined : Math.floor(limit)
    });
    sendJson(res, 200, { ok: true, result: { items } });
    return;
  }

  if (method === "POST" && path === "/agent/run") {
    const auth = authorizeAgentChat(req, runtimeConfig);
    if (!auth.ok) {
      sendJson(res, auth.status, { ok: false, error: auth.error });
      return;
    }

    const body = await parseRequestJson<AgentRunRequest>();
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

    const body = await parseRequestJson<unknown>();
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
    const auth = authorizeAgentChat(req, runtimeConfig);
    if (!auth.ok) {
      sendJson(res, auth.status, { ok: false, error: auth.error });
      return;
    }

    const body = await parseRequestJson<{ to?: string; message?: string }>();
    if (!body?.to || !body?.message) {
      sendJson(res, 400, { ok: false, error: "to and message are required" });
      return;
    }
    const result = await orchestrator.sendManualMessage(body.to, body.message);
    sendJson(res, result.ok ? 200 : 500, { ok: result.ok, result });
    return;
  }

  if (method === "POST" && path === "/wacli/search") {
    const auth = authorizeAgentChat(req, runtimeConfig);
    if (!auth.ok) {
      sendJson(res, auth.status, { ok: false, error: auth.error });
      return;
    }

    const body = await parseRequestJson<{ query?: string; chat?: string; limit?: number }>();
    if (!body?.query) {
      sendJson(res, 400, { ok: false, error: "query is required" });
      return;
    }
    const result = await orchestrator.searchMessages(body.query, body.chat, body.limit ?? 20);
    sendJson(res, result.ok ? 200 : 500, { ok: result.ok, result });
    return;
  }

  if (method === "POST" && path === "/wacli/chats") {
    const auth = authorizeAgentChat(req, runtimeConfig);
    if (!auth.ok) {
      sendJson(res, auth.status, { ok: false, error: auth.error });
      return;
    }

    const body = await parseRequestJson<{ query?: string; limit?: number }>();
    const result = await orchestrator.listChats(body?.query, body?.limit ?? 20);
    sendJson(res, result.ok ? 200 : 500, { ok: result.ok, result });
    return;
  }

  if (method === "POST" && path === "/wacli/doctor") {
    const auth = authorizeAgentChat(req, runtimeConfig);
    if (!auth.ok) {
      sendJson(res, auth.status, { ok: false, error: auth.error });
      return;
    }

    const result = await orchestrator.doctor();
    sendJson(res, result.ok ? 200 : 500, { ok: result.ok, result });
    return;
  }

  if (method === "POST" && path === "/group-posting/intake") {
    const auth = authorizeAdminAction(req, runtimeConfig);
    if (!auth.ok) {
      sendJson(res, auth.status, { ok: false, error: auth.error });
      return;
    }

    const body = await parseRequestJson<{
      content?: string;
      kind?: string;
      priority?: string;
      brokerName?: string;
      brokerContact?: string;
      tags?: string[];
      targets?: string[];
      scheduleMode?: string;
      firstPostAtIso?: string;
      repeatCount?: number;
      source?: string;
      sourceRef?: string;
      idempotencyKey?: string;
    }>();

    if (typeof body?.content !== "string" || body.content.trim().length === 0) {
      sendJson(res, 400, { ok: false, error: "content is required and must be a non-empty string." });
      return;
    }
    if (body.kind !== undefined && !["listing", "requirement"].includes(body.kind)) {
      sendJson(res, 400, { ok: false, error: "kind must be listing or requirement when provided." });
      return;
    }
    if (body.priority !== undefined && !["normal", "high"].includes(body.priority)) {
      sendJson(res, 400, { ok: false, error: "priority must be normal or high when provided." });
      return;
    }
    if (body.scheduleMode !== undefined && !["once", "daily", "weekly"].includes(body.scheduleMode)) {
      sendJson(res, 400, { ok: false, error: "scheduleMode must be once, daily, or weekly when provided." });
      return;
    }
    if (body.source !== undefined && !["api", "chat", "whatsapp"].includes(body.source)) {
      sendJson(res, 400, { ok: false, error: "source must be api, chat, or whatsapp when provided." });
      return;
    }
    if (body.targets !== undefined && !Array.isArray(body.targets)) {
      sendJson(res, 400, { ok: false, error: "targets must be an array of strings when provided." });
      return;
    }
    if (body.tags !== undefined && !Array.isArray(body.tags)) {
      sendJson(res, 400, { ok: false, error: "tags must be an array of strings when provided." });
      return;
    }
    if (Array.isArray(body.targets) && body.targets.some((item) => typeof item !== "string")) {
      sendJson(res, 400, { ok: false, error: "targets must contain only strings." });
      return;
    }
    if (Array.isArray(body.tags) && body.tags.some((item) => typeof item !== "string")) {
      sendJson(res, 400, { ok: false, error: "tags must contain only strings." });
      return;
    }
    if (body.repeatCount !== undefined) {
      const repeatCount = Number(body.repeatCount);
      if (!Number.isFinite(repeatCount) || repeatCount <= 0) {
        sendJson(res, 400, { ok: false, error: "repeatCount must be a positive number when provided." });
        return;
      }
    }
    if (body.idempotencyKey !== undefined && typeof body.idempotencyKey !== "string") {
      sendJson(res, 400, { ok: false, error: "idempotencyKey must be a string when provided." });
      return;
    }

    try {
      const item = await groupPostingService.intake({
        content: body.content,
        kind: body.kind as "listing" | "requirement" | undefined,
        priority: body.priority as "normal" | "high" | undefined,
        brokerName: body.brokerName,
        brokerContact: body.brokerContact,
        tags: body.tags,
        targets: body.targets,
        scheduleMode: body.scheduleMode as "once" | "daily" | "weekly" | undefined,
        firstPostAtIso: body.firstPostAtIso,
        repeatCount: body.repeatCount,
        source: body.source as "api" | "chat" | "whatsapp" | undefined,
        sourceRef: body.sourceRef,
        idempotencyKey: body.idempotencyKey
      });
      sendJson(res, 200, { ok: true, result: { item } });
    } catch (error) {
      if (error instanceof Error && error.message === "content_required") {
        sendJson(res, 400, { ok: false, error: "content is required and must be a non-empty string." });
        return;
      }
      throw error;
    }
    return;
  }

  if (method === "POST" && path === "/group-posting/dispatch") {
    const auth = authorizeAdminAction(req, runtimeConfig);
    if (!auth.ok) {
      sendJson(res, auth.status, { ok: false, error: auth.error });
      return;
    }

    const body = await parseRequestJson<{
      limit?: number;
      dryRun?: boolean;
      nowIso?: string;
    }>();

    if (body.limit !== undefined) {
      const limit = Number(body.limit);
      if (!Number.isFinite(limit) || limit <= 0) {
        sendJson(res, 400, { ok: false, error: "limit must be a positive number when provided." });
        return;
      }
    }
    if (body.dryRun !== undefined && typeof body.dryRun !== "boolean") {
      sendJson(res, 400, { ok: false, error: "dryRun must be a boolean when provided." });
      return;
    }
    if (body.nowIso !== undefined && Number.isNaN(Date.parse(String(body.nowIso)))) {
      sendJson(res, 400, { ok: false, error: "nowIso must be a valid ISO timestamp when provided." });
      return;
    }

    const dispatch = await groupPostingService.runDue({
      trigger: "manual",
      limit: body.limit === undefined ? undefined : Math.floor(Number(body.limit)),
      dryRun: body.dryRun,
      nowIso: body.nowIso
    });
    sendJson(res, 200, { ok: true, result: dispatch });
    return;
  }

  if (method === "POST" && path.startsWith("/group-posting/")) {
    const requeueMatch = path.match(/^\/group-posting\/([^/]+)\/requeue$/);
    if (requeueMatch) {
      const auth = authorizeAdminAction(req, runtimeConfig);
      if (!auth.ok) {
        sendJson(res, auth.status, { ok: false, error: auth.error });
        return;
      }
      const itemId = decodeURIComponent(requeueMatch[1]);
      const body = await parseRequestJson<{ nextPostAtIso?: string }>();
      if (body.nextPostAtIso !== undefined && Number.isNaN(Date.parse(String(body.nextPostAtIso)))) {
        sendJson(res, 400, { ok: false, error: "nextPostAtIso must be a valid ISO timestamp when provided." });
        return;
      }

      const item = await groupPostingService.requeue(itemId, body.nextPostAtIso);
      if (!item) {
        sendJson(res, 404, { ok: false, error: "group_post_item_not_found" });
        return;
      }
      sendJson(res, 200, { ok: true, result: { item } });
      return;
    }
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
    const body = await parseRequestJson<{ code?: string }>();
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
        phoneMasked: redactPhone(approval.phoneE164 || "")
      }
    });
    return;
  }

  if (method === "GET" && path === "/agent/sessions") {
    const auth = authorizeAgentChat(req, runtimeConfig);
    if (!auth.ok) {
      sendJson(res, auth.status, { ok: false, error: auth.error });
      return;
    }

    const sessions = await suiteSessionManager.list();
    sendJson(res, 200, { ok: true, result: { sessions } });
    return;
  }

  if (method === "POST" && path === "/agent/session/start") {
    const auth = authorizeAgentChat(req, runtimeConfig);
    if (!auth.ok) {
      sendJson(res, auth.status, { ok: false, error: auth.error });
      return;
    }

    const body = await parseRequestJson<{ sessionId?: string }>();
    const session = await suiteSessionManager.start({
      sessionId: typeof body?.sessionId === "string" ? body.sessionId : undefined
    });
    sendJson(res, 200, { ok: true, result: { session } });
    return;
  }

  if (method === "GET" && path.startsWith("/agent/session/")) {
    const eventMatch = path.match(/^\/agent\/session\/([^/]+)\/events$/);
    if (eventMatch) {
      if (requestUrl.searchParams.has("apiKey") || requestUrl.searchParams.has("role")) {
        sendJson(res, 400, {
          ok: false,
          error: "Query credential parameters are not allowed for event streams. Use event token flow."
        });
        return;
      }

      const sessionId = decodeURIComponent(eventMatch[1]);
      const eventToken = getOptionalQueryParam(requestUrl, "token");
      const auth = authorizeAgentChatForEventStream(req, runtimeConfig, sessionId, eventToken);
      if (!auth.ok) {
        sendJson(res, auth.status, { ok: false, error: auth.error });
        return;
      }

      const session = await suiteSessionManager.get(sessionId);
      if (!session) {
        sendJson(res, 404, { ok: false, error: "session_not_found" });
        return;
      }

      sendSessionEventStream(req, res, sessionId, session);
      return;
    }

    const auth = authorizeAgentChat(req, runtimeConfig);
    if (!auth.ok) {
      sendJson(res, auth.status, { ok: false, error: auth.error });
      return;
    }

    const match = path.match(/^\/agent\/session\/([^/]+)$/);
    if (match) {
      const sessionId = decodeURIComponent(match[1]);
      const session = await suiteSessionManager.get(sessionId);
      if (!session) {
        sendJson(res, 404, { ok: false, error: "session_not_found" });
        return;
      }
      sendJson(res, 200, { ok: true, result: { session } });
      return;
    }
  }

  if (method === "POST" && path.startsWith("/agent/session/")) {
    const auth = authorizeAgentChat(req, runtimeConfig);
    if (!auth.ok) {
      sendJson(res, auth.status, { ok: false, error: auth.error });
      return;
    }

    const tokenMatch = path.match(/^\/agent\/session\/([^/]+)\/events\/token$/);
    if (tokenMatch) {
      const sessionId = decodeURIComponent(tokenMatch[1]);
      const session = await suiteSessionManager.get(sessionId);
      if (!session) {
        sendJson(res, 404, { ok: false, error: "session_not_found" });
        return;
      }

      const issued = issueSessionEventToken(sessionId, getSingleHeader(req, "x-agent-role"));
      sendJson(res, 200, {
        ok: true,
        result: {
          sessionId,
          token: issued.token,
          expiresAtIso: issued.expiresAtIso
        }
      });
      return;
    }

    const messageMatch = path.match(/^\/agent\/session\/([^/]+)\/message$/);
    if (messageMatch) {
      const sessionId = decodeURIComponent(messageMatch[1]);
      const body = await parseRequestJson<unknown>();
      const validated = validateChatRequest(body);
      if (!validated.ok) {
        sendJson(res, 400, { ok: false, error: validated.error });
        return;
      }

      const payload = body as Record<string, unknown>;
      const autonomyValidation = validateAutonomyLevel(payload.autonomy);
      if (!autonomyValidation.ok) {
        sendJson(res, 400, { ok: false, error: autonomyValidation.error });
        return;
      }

      try {
        const result = await suiteSessionManager.handleMessage(
          sessionId,
          validated.value,
          autonomyValidation.value
        );
        sendJson(res, 200, { ok: true, result });
      } catch (error) {
        if (error instanceof Error && error.message === "session_not_found") {
          sendJson(res, 404, { ok: false, error: "session_not_found" });
          return;
        }
        throw error;
      }
      return;
    }

    const approveMatch = path.match(/^\/agent\/session\/([^/]+)\/approve$/);
    if (approveMatch) {
      const sessionId = decodeURIComponent(approveMatch[1]);
      const body = await parseRequestJson<{ actionId?: string; all?: boolean }>();
      if (body?.actionId !== undefined && typeof body.actionId !== "string") {
        sendJson(res, 400, { ok: false, error: "actionId must be a string when provided." });
        return;
      }
      if (body?.all !== undefined && typeof body.all !== "boolean") {
        sendJson(res, 400, { ok: false, error: "all must be a boolean when provided." });
        return;
      }

      try {
        const execution = await executionQueue.executeApprove({
          sessionId,
          actionId: body?.actionId,
          all: body?.all
        });
        sendJson(res, 200, { ok: true, result: execution.result, queue: execution.queue });
      } catch (error) {
        if (error instanceof Error && error.message === "session_not_found") {
          sendJson(res, 404, { ok: false, error: "session_not_found" });
          return;
        }
        throw error;
      }
      return;
    }

    const rejectMatch = path.match(/^\/agent\/session\/([^/]+)\/reject$/);
    if (rejectMatch) {
      const sessionId = decodeURIComponent(rejectMatch[1]);
      const body = await parseRequestJson<{ actionId?: string; all?: boolean }>();
      if (body?.actionId !== undefined && typeof body.actionId !== "string") {
        sendJson(res, 400, { ok: false, error: "actionId must be a string when provided." });
        return;
      }
      if (body?.all !== undefined && typeof body.all !== "boolean") {
        sendJson(res, 400, { ok: false, error: "all must be a boolean when provided." });
        return;
      }

      try {
        const result = await suiteSessionManager.reject(sessionId, {
          actionId: body?.actionId,
          all: body?.all
        });
        sendJson(res, 200, { ok: true, result });
      } catch (error) {
        if (error instanceof Error && error.message === "session_not_found") {
          sendJson(res, 404, { ok: false, error: "session_not_found" });
          return;
        }
        throw error;
      }
      return;
    }
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

function sendText(res: ServerResponse, status: number, text: string) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8"
  });
  res.end(text);
}

async function tryServeReactApp(path: string, res: ServerResponse): Promise<boolean> {
  const reactAppLocation = await resolveReactAppLocation();
  if (!reactAppLocation) {
    return false;
  }
  const { distDir, indexFile } = reactAppLocation;

  const relativePath = normalizeReactAssetPath(path);
  if (relativePath === null) {
    return false;
  }

  const shouldServeIndex = relativePath === "index.html";
  const candidate = resolve(distDir, relativePath || "index.html");
  if (!isWithinDirectory(distDir, candidate)) {
    return false;
  }

  if (!shouldServeIndex && (await isFile(candidate))) {
    await sendFile(res, candidate);
    return true;
  }

  if (!shouldServeIndex && relativePath.includes(".")) {
    sendJson(res, 404, { ok: false, error: "Route not found" });
    return true;
  }

  await sendFile(res, indexFile);
  return true;
}

async function resolveReactAppLocation(): Promise<{
  distDir: string;
  indexFile: string;
} | null> {
  for (const distDir of REACT_APP_DIST_CANDIDATES) {
    const indexFile = resolve(distDir, "index.html");
    if (await isFile(indexFile)) {
      return { distDir, indexFile };
    }
  }
  return null;
}

async function logFrontendMode(): Promise<void> {
  const reactAppLocation = await resolveReactAppLocation();
  if (reactAppLocation) {
    // eslint-disable-next-line no-console
    console.log(`[ui] Serving React app from ${reactAppLocation.distDir}`);
    return;
  }
  // eslint-disable-next-line no-console
  console.warn("[ui] web/dist not found. Serving embedded fallback UI (/app.js and /app.css).");
}

function normalizeReactAssetPath(path: string): string | null {
  if (path === "/app" || path === "/app/") {
    return "index.html";
  }
  if (!path.startsWith("/app/")) {
    return null;
  }
  const raw = decodeURIComponent(path.slice("/app/".length));
  const normalized = raw.replace(/^\/+/, "");
  if (!normalized || normalized === ".") {
    return "index.html";
  }
  if (normalized.includes("\0")) {
    return null;
  }
  return normalized;
}

async function sendFile(res: ServerResponse, filePath: string): Promise<void> {
  const content = await readFile(filePath);
  const contentType = contentTypeForPath(filePath);
  res.writeHead(200, {
    "Content-Type": contentType
  });
  res.end(content);
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    const row = await stat(filePath);
    return row.isFile();
  } catch {
    return false;
  }
}

function isWithinDirectory(basePath: string, targetPath: string): boolean {
  const fromBase = pathRelative(resolve(basePath), resolve(targetPath));
  if (!fromBase) return true;
  if (fromBase.startsWith("..")) return false;
  if (fromBase.includes(`..${pathSep}`)) return false;
  if (/^[a-zA-Z]:/.test(fromBase)) return false;
  return true;
}

function contentTypeForPath(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
    case ".mjs":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".ico":
      return "image/x-icon";
    case ".webp":
      return "image/webp";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    case ".map":
      return "application/json; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function sendSessionEventStream(
  req: IncomingMessage,
  res: ServerResponse,
  sessionId: string,
  initialSession: AgentSessionSnapshot
) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  writeSseEvent(res, "session_snapshot", { session: initialSession });

  const unsubscribe = suiteSessionManager.onSessionUpdate(sessionId, (snapshot) => {
    if (res.writableEnded) return;
    writeSseEvent(res, "session_snapshot", { session: snapshot });
  });

  const heartbeat = setInterval(() => {
    if (res.writableEnded) return;
    res.write(": keep-alive\n\n");
  }, 20_000);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    unsubscribe();
  };

  req.on("aborted", close);
  req.on("close", close);
  res.on("close", close);
  res.on("finish", close);
}

function writeSseEvent(res: ServerResponse, event: string, payload: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function applyCors(res: ServerResponse) {
  const origin = process.env.CORS_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-agent-api-key,x-agent-role");
}

function shouldApplyRateLimit(method: string, path: string): boolean {
  if (method !== "POST") return false;
  if (
    /^\/agent\/session\/[^/]+\/(message|approve|reject|events\/token)$/.test(path) ||
    /^\/group-posting\/[^/]+\/requeue$/.test(path)
  ) {
    return true;
  }
  return [
    "/agent/run",
    "/agent/chat",
    "/agent/session/start",
    "/wacli/send",
    "/wacli/search",
    "/wacli/chats",
    "/wacli/doctor",
    "/group-posting/intake",
    "/group-posting/dispatch",
    "/whatsapp/pairing/approve"
  ].includes(path);
}

async function parseJson<T>(req: IncomingMessage, maxBytes: number): Promise<T> {
  const raw = await parseRawBody(req, maxBytes);
  if (raw.length === 0) return {} as T;
  return JSON.parse(raw.toString("utf8")) as T;
}

async function parseRawBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const payload = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += payload.length;
    if (totalBytes > maxBytes) {
      throw new PayloadTooLargeError(maxBytes);
    }
    chunks.push(payload);
  }
  return Buffer.concat(chunks);
}

type AgentChatAuthResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

function authorizeAgentChat(req: IncomingMessage, runtimeConfig: RuntimeConfig): AgentChatAuthResult {
  return authorizeAgentChatWithValues(
    runtimeConfig,
    getSingleHeader(req, "x-agent-api-key"),
    getSingleHeader(req, "x-agent-role")
  );
}

function authorizeAgentChatForEventStream(
  req: IncomingMessage,
  runtimeConfig: RuntimeConfig,
  sessionId: string,
  eventToken: string | undefined
): AgentChatAuthResult {
  const headerAuth = authorizeAgentChatWithValues(
    runtimeConfig,
    getSingleHeader(req, "x-agent-api-key"),
    getSingleHeader(req, "x-agent-role")
  );
  if (headerAuth.ok) return headerAuth;

  if (eventToken && validateSessionEventToken(sessionId, eventToken)) {
    return { ok: true };
  }

  return headerAuth;
}

function authorizeAgentChatWithValues(
  runtimeConfig: RuntimeConfig,
  providedApiKey: string | undefined,
  providedRole: string | undefined
): AgentChatAuthResult {
  const configuredKey = runtimeConfig.agentApiKey;
  const headerKey = providedApiKey;

  if (configuredKey && headerKey !== configuredKey) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized: invalid or missing x-agent-api-key."
    };
  }

  const allowedRoles = runtimeConfig.agentAllowedRoles;
  const headerRole = providedRole;
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
  if (!configuredKey) {
    return {
      ok: false,
      status: 503,
      error: "Admin actions are disabled until AGENT_API_KEY is configured."
    };
  }
  const headerKey = getSingleHeader(req, "x-agent-api-key");
  if (headerKey !== configuredKey) {
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

function getOptionalQueryParam(requestUrl: URL, key: string): string | undefined {
  const raw = requestUrl.searchParams.get(key);
  if (!raw) return undefined;
  const value = raw.trim();
  return value.length > 0 ? value : undefined;
}

function issueSessionEventToken(sessionId: string, role?: string): {
  token: string;
  expiresAtIso: string;
} {
  pruneExpiredSessionEventTokens();
  const token = randomBytes(24).toString("base64url");
  const expiresAtMs = Date.now() + SESSION_EVENT_TOKEN_TTL_MS;
  sessionEventTokens.set(token, {
    sessionId,
    role,
    expiresAtMs
  });
  return {
    token,
    expiresAtIso: new Date(expiresAtMs).toISOString()
  };
}

function validateSessionEventToken(sessionId: string, token: string): boolean {
  pruneExpiredSessionEventTokens();
  const candidate = String(token || "").trim();
  if (!candidate) return false;

  let matchedToken: string | null = null;
  for (const existing of sessionEventTokens.keys()) {
    if (safeTokenEquals(existing, candidate)) {
      matchedToken = existing;
      break;
    }
  }

  if (!matchedToken) return false;
  const record = sessionEventTokens.get(matchedToken);
  if (!record) return false;
  if (record.sessionId !== sessionId) return false;
  if (record.expiresAtMs <= Date.now()) {
    sessionEventTokens.delete(matchedToken);
    return false;
  }
  return true;
}

function pruneExpiredSessionEventTokens(): void {
  const now = Date.now();
  for (const [token, row] of sessionEventTokens.entries()) {
    if (row.expiresAtMs <= now) {
      sessionEventTokens.delete(token);
    }
  }
}

function safeTokenEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function isValidGroupPostingStatus(value: string): boolean {
  return ["queued", "processing", "sent", "failed"].includes(value);
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

type AutonomyValidationResult =
  | { ok: true; value: AutonomyLevel }
  | { ok: false; error: string };

function validateAutonomyLevel(value: unknown): AutonomyValidationResult {
  if (value === undefined) {
    return { ok: true, value: 1 };
  }

  if (value === 0 || value === 1 || value === 2) {
    return { ok: true, value };
  }

  return {
    ok: false,
    error: "autonomy must be 0, 1, or 2 when provided."
  };
}

function summarizeWebhookPayload(payload: unknown): {
  entries: number;
  changes: number;
  messages: number;
  statuses: number;
} {
  if (!payload || typeof payload !== "object") {
    return { entries: 0, changes: 0, messages: 0, statuses: 0 };
  }

  const root = payload as { entry?: unknown[] };
  const entries = Array.isArray(root.entry) ? root.entry : [];
  let changes = 0;
  let messages = 0;
  let statuses = 0;

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as { changes?: unknown[] };
    const changeList = Array.isArray(row.changes) ? row.changes : [];
    changes += changeList.length;
    for (const change of changeList) {
      if (!change || typeof change !== "object") continue;
      const value = (change as { value?: unknown }).value;
      if (!value || typeof value !== "object") continue;
      const valueRecord = value as { messages?: unknown[]; statuses?: unknown[] };
      messages += Array.isArray(valueRecord.messages) ? valueRecord.messages.length : 0;
      statuses += Array.isArray(valueRecord.statuses) ? valueRecord.statuses.length : 0;
    }
  }

  return {
    entries: entries.length,
    changes,
    messages,
    statuses
  };
}
