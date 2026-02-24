import "dotenv/config";
import { OpenClawGatewayClient } from "../openclaw/gateway-client.js";
import { getOllamaStatus } from "../llm/ollama.js";
import { isOpenRouterEnabled } from "../llm/openrouter.js";
import { createRequire } from "node:module";
import { getConnectorHealthSnapshot } from "../agentic/connectors/health.js";
import type { ConnectorHealthStatus } from "../agentic/connectors/types.js";

type ParsedFlags = {
  json: boolean;
  httpUrl?: string;
  wsUrl?: string;
  timeoutMs?: number;
  propaiUrl?: string;
};

async function main() {
  const argv = process.argv.slice(2);
  const command = (argv[0] || "help").toLowerCase();
  const args = argv.slice(1);

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "doctor") {
    const flags = parseFlags(args);
    await runDoctor(flags);
    return;
  }

  if (command === "connectors") {
    const maybeSubCommand = args[0] || "";
    const subCommand =
      !maybeSubCommand || maybeSubCommand.startsWith("-") ? "health" : maybeSubCommand.toLowerCase();
    if (subCommand !== "health") {
      // eslint-disable-next-line no-console
      console.error(`Unknown connectors command: ${subCommand}`);
      process.exit(1);
    }
    const flags = parseFlags(
      subCommand === "health" && maybeSubCommand && !maybeSubCommand.startsWith("-")
        ? args.slice(1)
        : args
    );
    await runConnectorHealth(flags);
    return;
  }

  if (command === "chat" || command === "ui" || command === "tui") {
    if (!hasTuiRuntime()) {
      // eslint-disable-next-line no-console
      console.warn(
        [
          "TUI runtime is not installed in this environment.",
          "Falling back to classic terminal mode.",
          "Install later with: npm install vue @vue-termui/core"
        ].join("\n")
      );
      await import("./interactive-terminal.js");
      return;
    }
    await import("./propai-termui.js");
    return;
  }

  if (command === "classic") {
    await import("./interactive-terminal.js");
    return;
  }

  if (command === "version" || command === "--version" || command === "-v") {
    // eslint-disable-next-line no-console
    console.log("propai-tech 0.1.0");
    return;
  }

  // eslint-disable-next-line no-console
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

async function runDoctor(flags: ParsedFlags): Promise<void> {
  const client = new OpenClawGatewayClient({
    httpBaseUrl: flags.httpUrl,
    wsUrl: flags.wsUrl,
    timeoutMs: flags.timeoutMs
  });
  const propaiUrl = flags.propaiUrl || process.env.PROPAI_AGENT_URL || `http://127.0.0.1:${process.env.PORT || 8080}`;

  const [openclaw, propaiHealth, ollama] = await Promise.all([
    client.doctor(),
    probePropAiHealth(propaiUrl, client.timeoutMs),
    getOllamaStatus()
  ]);
  const openrouterEnabled = isOpenRouterEnabled();

  const report = {
    nowIso: new Date().toISOString(),
    config: {
      openclawHttpUrl: client.httpBaseUrl,
      openclawWsUrl: client.wsUrl,
      propaiUrl
    },
    checks: {
      openclaw,
      propai: propaiHealth,
      llm: {
        openrouterEnabled,
        ollama
      }
    },
    suggestions: buildSuggestions({
      openclawHttpOk: openclaw.gateway.http.ok,
      openclawWsOk: openclaw.gateway.websocket.ok,
      propaiOk: propaiHealth.ok,
      openrouterEnabled,
      ollamaEnabled: ollama.enabled && ollama.reachable
    })
  };

  if (flags.json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  printDoctorBanner();
  printCheck("OpenClaw HTTP", openclaw.gateway.http.ok, {
    endpoint: openclaw.gateway.http.endpoint || client.httpBaseUrl,
    detail: openclaw.gateway.http.ok
      ? `status=${openclaw.gateway.http.status}, latency=${openclaw.gateway.http.latencyMs}ms`
      : openclaw.gateway.http.error || "health probe failed"
  });
  printCheck("OpenClaw WS", openclaw.gateway.websocket.ok, {
    endpoint: openclaw.gateway.websocket.endpoint,
    detail: openclaw.gateway.websocket.ok
      ? `latency=${openclaw.gateway.websocket.latencyMs}ms`
      : openclaw.gateway.websocket.error || "websocket probe failed"
  });
  printCheck("PropAI API", propaiHealth.ok, {
    endpoint: propaiHealth.endpoint,
    detail: propaiHealth.ok
      ? `status=${propaiHealth.status}, latency=${propaiHealth.latencyMs}ms`
      : propaiHealth.error || "health probe failed"
  });
  printCheck("OpenRouter", openrouterEnabled, {
    endpoint: "env: OPENROUTER_API_KEY",
    detail: openrouterEnabled ? "configured" : "not configured"
  });
  printCheck("Ollama", ollama.enabled && ollama.reachable, {
    endpoint: ollama.baseUrl,
    detail:
      ollama.enabled && ollama.reachable
        ? `model=${ollama.selectedModel}`
        : `enabled=${ollama.enabled}, reachable=${ollama.reachable}`
  });

  const suggestions = report.suggestions;
  if (suggestions.length > 0) {
    // eslint-disable-next-line no-console
    console.log("\nNext Steps");
    for (const [idx, item] of suggestions.entries()) {
      // eslint-disable-next-line no-console
      console.log(`${idx + 1}. ${item}`);
    }
  }
}

async function runConnectorHealth(flags: ParsedFlags): Promise<void> {
  const snapshot = await getConnectorHealthSnapshot({
    openclaw: {
      httpBaseUrl: flags.httpUrl,
      wsUrl: flags.wsUrl,
      timeoutMs: flags.timeoutMs
    }
  });

  if (flags.json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }

  // eslint-disable-next-line no-console
  console.log("====================================");
  // eslint-disable-next-line no-console
  console.log("PropAI Connectors Health");
  // eslint-disable-next-line no-console
  console.log("====================================");

  for (const item of snapshot.connectors) {
    // eslint-disable-next-line no-console
    console.log(`\n[${statusLabel(item.status)}] ${item.connector.name} (${item.connector.id})`);
    // eslint-disable-next-line no-console
    console.log(`  pair: ${item.pair.status}${item.pair.note ? ` - ${item.pair.note}` : ""}`);
    for (const check of item.checks) {
      // eslint-disable-next-line no-console
      console.log(`  - ${check.name}: ${check.ok ? "ok" : "fail"} | ${check.detail}`);
    }
  }
}

async function probePropAiHealth(baseUrl: string, timeoutMs: number): Promise<{
  ok: boolean;
  endpoint: string;
  status?: number;
  latencyMs: number;
  payload?: unknown;
  error?: string;
}> {
  const endpoint = joinUrl(baseUrl, "/health");
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      signal: controller.signal
    });
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }
    return {
      ok: response.ok,
      endpoint,
      status: response.status,
      latencyMs: Date.now() - startedAt,
      payload,
      error: response.ok ? undefined : `HTTP ${response.status}`
    };
  } catch (error) {
    return {
      ok: false,
      endpoint,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    clearTimeout(timer);
  }
}

function parseFlags(args: string[]): ParsedFlags {
  const flags: ParsedFlags = { json: false };

  for (let idx = 0; idx < args.length; idx += 1) {
    const token = args[idx];

    if (token === "--json") {
      flags.json = true;
      continue;
    }
    if (token === "--http" && args[idx + 1]) {
      flags.httpUrl = args[idx + 1];
      idx += 1;
      continue;
    }
    if (token === "--ws" && args[idx + 1]) {
      flags.wsUrl = args[idx + 1];
      idx += 1;
      continue;
    }
    if (token === "--timeout" && args[idx + 1]) {
      const value = Number(args[idx + 1]);
      if (Number.isFinite(value) && value > 0) {
        flags.timeoutMs = Math.floor(value);
      }
      idx += 1;
      continue;
    }
    if (token === "--propai-url" && args[idx + 1]) {
      flags.propaiUrl = args[idx + 1];
      idx += 1;
      continue;
    }
  }

  return flags;
}

function buildSuggestions(input: {
  openclawHttpOk: boolean;
  openclawWsOk: boolean;
  propaiOk: boolean;
  openrouterEnabled: boolean;
  ollamaEnabled: boolean;
}): string[] {
  const suggestions: string[] = [];

  if (!input.openclawHttpOk) {
    suggestions.push("Start OpenClaw gateway and verify OPENCLAW_GATEWAY_HTTP_URL points to the correct host:port.");
  }
  if (!input.openclawWsOk) {
    suggestions.push("Verify OPENCLAW_GATEWAY_WS_URL and confirm gateway WebSocket is reachable.");
  }
  if (!input.propaiOk) {
    suggestions.push(
      "PropAI API check failed. Start server only if you need web/API mode (`npm run dev` -> http://localhost:8080/app). CLI chat can run without this."
    );
  }
  if (!input.openrouterEnabled && !input.ollamaEnabled) {
    suggestions.push("Configure at least one LLM provider (OpenRouter API key or local Ollama).");
  }

  if (suggestions.length === 0) {
    suggestions.push("All core checks passed. Run `propai chat` for interactive operation.");
  }

  return suggestions;
}

function printDoctorBanner() {
  // eslint-disable-next-line no-console
  console.log("====================================");
  // eslint-disable-next-line no-console
  console.log("PropAI Doctor");
  // eslint-disable-next-line no-console
  console.log("OpenClaw + PropAI runtime diagnostics");
  // eslint-disable-next-line no-console
  console.log("====================================");
}

function printCheck(
  label: string,
  ok: boolean,
  details: {
    endpoint: string;
    detail: string;
  }
) {
  // eslint-disable-next-line no-console
  console.log(`\n[${ok ? "OK" : "FAIL"}] ${label}`);
  // eslint-disable-next-line no-console
  console.log(`  endpoint: ${details.endpoint}`);
  // eslint-disable-next-line no-console
  console.log(`  detail:   ${details.detail}`);
}

function printHelp() {
  // eslint-disable-next-line no-console
  console.log(
    [
      "PropAI CLI",
      "",
      "Usage:",
      "  propai doctor [--json] [--http <url>] [--ws <url>] [--timeout <ms>] [--propai-url <url>]",
      "  propai connectors [health] [--json] [--http <url>] [--ws <url>] [--timeout <ms>]",
      "  propai chat",
      "  propai ui",
      "  propai tui",
      "  propai classic",
      "  propai version",
      "",
      "Notes:",
      "  - `propai chat` is terminal mode.",
      "  - `npm run dev` starts web/API mode at http://localhost:8080/app.",
      "",
      "Examples:",
      "  npm run propai -- doctor",
      "  npm run propai -- doctor --json",
      "  npm run propai -- connectors --json",
      "  npm run propai -- chat"
    ].join("\n")
  );
}

function hasTuiRuntime(): boolean {
  const require = createRequire(import.meta.url);
  try {
    require.resolve("vue");
    require.resolve("@vue-termui/core");
    return true;
  } catch {
    return false;
  }
}

function joinUrl(base: string, path: string): string {
  const url = new URL(base.endsWith("/") ? base : `${base}/`);
  url.pathname = path.startsWith("/") ? path : `/${path}`;
  return url.toString().replace(/\/$/, "");
}

function statusLabel(status: ConnectorHealthStatus): string {
  if (status === "healthy") return "OK";
  if (status === "degraded") return "WARN";
  if (status === "unconfigured") return "UNCONFIGURED";
  return "FAIL";
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
