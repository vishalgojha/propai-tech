import { URL } from "node:url";

export type OpenClawGatewayClientOptions = {
  httpBaseUrl?: string;
  wsUrl?: string;
  timeoutMs?: number;
  apiKey?: string;
};

export type HttpProbeResult = {
  ok: boolean;
  status?: number;
  endpoint?: string;
  latencyMs: number;
  payload?: unknown;
  error?: string;
};

export type WsProbeResult = {
  ok: boolean;
  endpoint: string;
  latencyMs: number;
  error?: string;
};

export type OpenClawDoctorResult = {
  nowIso: string;
  gateway: {
    http: HttpProbeResult;
    websocket: WsProbeResult;
  };
};

const HEALTH_ENDPOINTS = ["/health", "/gateway/health", "/api/health"];

export class OpenClawGatewayClient {
  readonly httpBaseUrl: string;
  readonly wsUrl: string;
  readonly timeoutMs: number;
  readonly apiKey?: string;

  constructor(options: OpenClawGatewayClientOptions = {}) {
    this.httpBaseUrl =
      options.httpBaseUrl ||
      process.env.OPENCLAW_GATEWAY_HTTP_URL ||
      process.env.OPENCLAW_GATEWAY_URL ||
      "http://127.0.0.1:19001";

    this.wsUrl =
      options.wsUrl ||
      process.env.OPENCLAW_GATEWAY_WS_URL ||
      toWsUrl(this.httpBaseUrl);

    this.timeoutMs = options.timeoutMs || Number(process.env.OPENCLAW_GATEWAY_TIMEOUT_MS || 3500);
    this.apiKey = options.apiKey || process.env.OPENCLAW_GATEWAY_API_KEY || undefined;
  }

  async doctor(): Promise<OpenClawDoctorResult> {
    const [http, websocket] = await Promise.all([this.probeHttpHealth(), this.probeWebSocket()]);
    return {
      nowIso: new Date().toISOString(),
      gateway: {
        http,
        websocket
      }
    };
  }

  async probeHttpHealth(): Promise<HttpProbeResult> {
    const startedAt = Date.now();
    let lastError = "";

    for (const path of HEALTH_ENDPOINTS) {
      const endpoint = joinUrl(this.httpBaseUrl, path);
      try {
        const response = await fetchWithTimeout(endpoint, {
          timeoutMs: this.timeoutMs,
          headers: this.apiKey
            ? {
                Authorization: `Bearer ${this.apiKey}`
              }
            : undefined
        });

        const latencyMs = Date.now() - startedAt;
        const payload = await safeJson(response);
        if (response.ok) {
          return {
            ok: true,
            status: response.status,
            endpoint,
            latencyMs,
            payload
          };
        }

        lastError = `HTTP ${response.status}`;
      } catch (error) {
        lastError = formatError(error);
      }
    }

    return {
      ok: false,
      endpoint: joinUrl(this.httpBaseUrl, HEALTH_ENDPOINTS[0]),
      latencyMs: Date.now() - startedAt,
      error: lastError || "HTTP probe failed."
    };
  }

  async probeWebSocket(): Promise<WsProbeResult> {
    const endpoint = this.wsUrl;
    const startedAt = Date.now();
    const WsCtor = getWebSocketCtor();
    if (!WsCtor) {
      return {
        ok: false,
        endpoint,
        latencyMs: Date.now() - startedAt,
        error: "WebSocket runtime unavailable in current Node build."
      };
    }

    return new Promise<WsProbeResult>((resolve) => {
      let settled = false;
      let socket: InstanceType<typeof WsCtor> | null = null;
      const done = (result: WsProbeResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          socket?.close();
        } catch {
          // Ignore close errors from probe socket.
        }
        resolve(result);
      };

      const timer = setTimeout(() => {
        done({
          ok: false,
          endpoint,
          latencyMs: Date.now() - startedAt,
          error: "Connection timed out."
        });
      }, this.timeoutMs);

      try {
        socket = new WsCtor(endpoint);
      } catch (error) {
        done({
          ok: false,
          endpoint,
          latencyMs: Date.now() - startedAt,
          error: formatError(error)
        });
        return;
      }

      socket.onopen = () => {
        done({
          ok: true,
          endpoint,
          latencyMs: Date.now() - startedAt
        });
      };

      socket.onerror = (event: unknown) => {
        done({
          ok: false,
          endpoint,
          latencyMs: Date.now() - startedAt,
          error: formatWsEventError(event)
        });
      };
    });
  }
}

async function fetchWithTimeout(
  url: string,
  options: {
    timeoutMs: number;
    headers?: Record<string, string>;
  }
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    return await fetch(url, {
      method: "GET",
      headers: options.headers,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

function joinUrl(base: string, path: string): string {
  const url = new URL(base.endsWith("/") ? base : `${base}/`);
  url.pathname = path.startsWith("/") ? path : `/${path}`;
  return url.toString().replace(/\/$/, "");
}

function toWsUrl(httpBase: string): string {
  const url = new URL(httpBase);
  if (url.protocol === "https:") {
    url.protocol = "wss:";
  } else {
    url.protocol = "ws:";
  }
  url.pathname = "/";
  return url.toString().replace(/\/$/, "");
}

function getWebSocketCtor():
  | (new (url: string) => {
      onopen: (() => void) | null;
      onerror: ((event: unknown) => void) | null;
      close: () => void;
    })
  | null {
  const maybe = (globalThis as { WebSocket?: unknown }).WebSocket;
  if (typeof maybe !== "function") {
    return null;
  }
  return maybe as new (url: string) => {
    onopen: (() => void) | null;
    onerror: ((event: unknown) => void) | null;
    close: () => void;
  };
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function formatWsEventError(event: unknown): string {
  if (event && typeof event === "object") {
    const maybe = event as Record<string, unknown>;
    const message = maybe.message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  return "WebSocket connection failed.";
}
