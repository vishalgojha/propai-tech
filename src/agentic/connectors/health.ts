import { Pool } from "pg";
import { WacliTool } from "../tools/wacli-tool.js";
import { OpenClawGatewayClient, type OpenClawGatewayClientOptions } from "../../openclaw/gateway-client.js";
import { getOllamaStatus } from "../../llm/ollama.js";
import { isOpenRouterEnabled } from "../../llm/openrouter.js";
import {
  buildConnectorCredentialPairs,
  buildCredentials,
  listConnectors
} from "./registry.js";
import type {
  ConnectorCheck,
  ConnectorCredentialPair,
  ConnectorHealthItem,
  ConnectorHealthSnapshot,
  ConnectorHealthStatus
} from "./types.js";

export type ConnectorHealthOptions = {
  openclaw?: OpenClawGatewayClientOptions;
};

export async function getConnectorHealthSnapshot(
  options: ConnectorHealthOptions = {}
): Promise<ConnectorHealthSnapshot> {
  const connectors = listConnectors();
  const credentials = buildCredentials();
  const pairs = buildConnectorCredentialPairs(credentials);
  const pairByConnector = new Map(pairs.map((pair) => [pair.connectorId, pair]));

  const [
    openrouterItem,
    ollamaItem,
    wacliItem,
    wppconnectItem,
    propaiLiveItem,
    postgresItem,
    openclawItem
  ] = await Promise.all([
    checkOpenRouter(pairByConnector.get("openrouter")),
    checkOllama(pairByConnector.get("ollama")),
    checkWacli(pairByConnector.get("wacli")),
    checkWppConnect(pairByConnector.get("wppconnect_legacy")),
    checkPropaiLive(pairByConnector.get("propai_live_bridge")),
    checkPostgres(pairByConnector.get("postgres_store")),
    checkOpenClaw(pairByConnector.get("openclaw_gateway"), options.openclaw)
  ]);

  const statusByConnectorId = new Map<string, Omit<ConnectorHealthItem, "connector">>([
    ["openrouter", openrouterItem],
    ["ollama", ollamaItem],
    ["wacli", wacliItem],
    ["wppconnect_legacy", wppconnectItem],
    ["propai_live_bridge", propaiLiveItem],
    ["postgres_store", postgresItem],
    ["openclaw_gateway", openclawItem]
  ]);

  return {
    generatedAtIso: new Date().toISOString(),
    credentials,
    pairs,
    connectors: connectors.map((connector) => {
      const details = statusByConnectorId.get(connector.id);
      if (!details) {
        return {
          connector,
          pair: pairByConnector.get(connector.id) || unknownPair(connector.id),
          status: "unconfigured",
          checks: [
            {
              name: "health",
              ok: false,
              detail: "No health checker mapped for connector."
            }
          ]
        };
      }
      return {
        connector,
        ...details
      };
    })
  };
}

async function checkOpenRouter(
  pair: ConnectorCredentialPair | undefined
): Promise<Omit<ConnectorHealthItem, "connector">> {
  const enabled = isOpenRouterEnabled();
  const checks: ConnectorCheck[] = [
    {
      name: "api_key",
      ok: enabled,
      detail: enabled ? "OPENROUTER_API_KEY configured." : "OPENROUTER_API_KEY missing."
    }
  ];

  return {
    pair: pair || unknownPair("openrouter"),
    status: enabled ? "healthy" : "unconfigured",
    checks
  };
}

async function checkOllama(
  pair: ConnectorCredentialPair | undefined
): Promise<Omit<ConnectorHealthItem, "connector">> {
  const status = await getOllamaStatus();
  const checks: ConnectorCheck[] = [
    {
      name: "enabled",
      ok: status.enabled,
      detail: status.enabled ? "Ollama connector enabled." : "Ollama connector disabled."
    },
    {
      name: "reachable",
      ok: status.reachable,
      detail: status.reachable ? `Reachable at ${status.baseUrl}.` : `Not reachable at ${status.baseUrl}.`
    },
    {
      name: "model",
      ok: status.availableModels.length > 0,
      detail:
        status.availableModels.length > 0
          ? `Available models: ${status.availableModels.join(", ")}`
          : "No local models detected."
    }
  ];

  return {
    pair: pair || unknownPair("ollama"),
    status: aggregateStatus(checks, status.enabled ? "degraded" : "unconfigured"),
    checks
  };
}

async function checkWacli(
  pair: ConnectorCredentialPair | undefined
): Promise<Omit<ConnectorHealthItem, "connector">> {
  const dryRun = process.env.WACLI_DRY_RUN !== "false";
  const wacli = new WacliTool();
  const result = await wacli.doctor();
  const checks: ConnectorCheck[] = [
    {
      name: "doctor",
      ok: result.ok,
      detail: result.ok ? result.stdout || "Doctor command succeeded." : result.stderr || "Doctor command failed."
    },
    {
      name: "dry_run",
      ok: !dryRun,
      detail: dryRun ? "WACLI_DRY_RUN=true (commands are simulated)." : "Dry run disabled (real execution mode)."
    }
  ];

  return {
    pair: pair || unknownPair("wacli"),
    status: dryRun ? "degraded" : aggregateStatus(checks, "degraded"),
    checks
  };
}

async function checkWppConnect(
  pair: ConnectorCredentialPair | undefined
): Promise<Omit<ConnectorHealthItem, "connector">> {
  const sessionName = process.env.WPP_SESSION_NAME || "";
  const checks: ConnectorCheck[] = [
    {
      name: "session_name",
      ok: sessionName.trim().length > 0,
      detail: sessionName.trim().length > 0 ? `Session: ${sessionName}` : "WPP_SESSION_NAME not configured."
    }
  ];

  return {
    pair: pair || unknownPair("wppconnect_legacy"),
    status: aggregateStatus(checks, "optional"),
    checks
  };
}

async function checkPropaiLive(
  pair: ConnectorCredentialPair | undefined
): Promise<Omit<ConnectorHealthItem, "connector">> {
  const postUrl = String(process.env.PROPAI_LIVE_POST_URL || "").trim();
  const apiKey = String(process.env.PROPAI_LIVE_API_KEY || "").trim();

  const checks: ConnectorCheck[] = [
    {
      name: "post_url",
      ok: postUrl.length > 0,
      detail: postUrl.length > 0 ? `Configured: ${postUrl}` : "PROPAI_LIVE_POST_URL missing."
    },
    {
      name: "api_key",
      ok: apiKey.length > 0,
      detail: apiKey.length > 0 ? "PROPAI_LIVE_API_KEY configured." : "PROPAI_LIVE_API_KEY missing (optional)."
    }
  ];

  return {
    pair: pair || unknownPair("propai_live_bridge"),
    status: postUrl.length > 0 ? "healthy" : "unconfigured",
    checks
  };
}

async function checkPostgres(
  pair: ConnectorCredentialPair | undefined
): Promise<Omit<ConnectorHealthItem, "connector">> {
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) {
    return {
      pair: pair || unknownPair("postgres_store"),
      status: "unconfigured",
      checks: [
        {
          name: "database_url",
          ok: false,
          detail: "DATABASE_URL is not set."
        }
      ]
    };
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 2500,
    idleTimeoutMillis: 2500
  });

  try {
    await pool.query("SELECT 1");
    return {
      pair: pair || unknownPair("postgres_store"),
      status: "healthy",
      checks: [
        {
          name: "connectivity",
          ok: true,
          detail: "Connected and query succeeded."
        }
      ]
    };
  } catch (error) {
    return {
      pair: pair || unknownPair("postgres_store"),
      status: "unhealthy",
      checks: [
        {
          name: "connectivity",
          ok: false,
          detail: error instanceof Error ? error.message : String(error)
        }
      ]
    };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function checkOpenClaw(
  pair: ConnectorCredentialPair | undefined,
  overrides?: OpenClawGatewayClientOptions
): Promise<Omit<ConnectorHealthItem, "connector">> {
  const client = new OpenClawGatewayClient(overrides);
  const result = await client.doctor();

  const checks: ConnectorCheck[] = [
    {
      name: "http",
      ok: result.gateway.http.ok,
      detail: result.gateway.http.ok
        ? `HTTP ${result.gateway.http.status} (${result.gateway.http.latencyMs}ms)`
        : result.gateway.http.error || "HTTP probe failed."
    },
    {
      name: "websocket",
      ok: result.gateway.websocket.ok,
      detail: result.gateway.websocket.ok
        ? `Connected (${result.gateway.websocket.latencyMs}ms)`
        : result.gateway.websocket.error || "WebSocket probe failed."
    }
  ];

  return {
    pair: pair || unknownPair("openclaw_gateway"),
    status: aggregateStatus(checks, "degraded"),
    checks
  };
}

function aggregateStatus(
  checks: ConnectorCheck[],
  fallbackWhenMixed: "healthy" | "degraded" | "unhealthy" | "unconfigured" | "optional"
): ConnectorHealthStatus {
  const okCount = checks.filter((item) => item.ok).length;
  if (okCount === checks.length) return "healthy";
  if (okCount === 0) return fallbackWhenMixed === "optional" ? "unconfigured" : "unhealthy";
  if (fallbackWhenMixed === "unconfigured") return "unconfigured";
  return "degraded";
}

function unknownPair(connectorId: string): ConnectorCredentialPair {
  return {
    id: `pair-${connectorId}`,
    connectorId,
    credentialIds: [],
    status: "not_required"
  };
}
