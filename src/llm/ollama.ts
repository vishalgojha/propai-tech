type OllamaMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OllamaChatOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

type OllamaMode = "auto" | "true" | "false";

type OllamaConfig = {
  baseUrl: string;
  defaultModel: string;
  timeoutMs: number;
  mode: OllamaMode;
};

type AvailabilityState = {
  reachable: boolean;
  checkedAtMs: number;
};

let availability: AvailabilityState | null = null;

function config(): OllamaConfig {
  const modeRaw = String(process.env.OLLAMA_ENABLED || "auto").toLowerCase();
  const mode: OllamaMode =
    modeRaw === "true" || modeRaw === "false" || modeRaw === "auto" ? modeRaw : "auto";

  return {
    baseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
    defaultModel: process.env.OLLAMA_MODEL || "llama3.1:8b",
    timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS || 2500),
    mode
  };
}

export function isOllamaEnabled(): boolean {
  return config().mode !== "false";
}

export async function generateOllamaText(
  messages: OllamaMessage[],
  options: OllamaChatOptions = {}
): Promise<string | null> {
  const cfg = config();
  if (!shouldAttempt(cfg)) {
    return null;
  }

  try {
    const body: Record<string, unknown> = {
      model: options.model || cfg.defaultModel,
      messages,
      stream: false,
      options: {
        temperature: options.temperature ?? 0.2
      }
    };

    if (options.maxTokens) {
      const opts = body.options as Record<string, unknown>;
      opts.num_predict = options.maxTokens;
    }

    const payload = await callOllama(body, cfg);
    const content = payload?.message?.content;
    if (typeof content === "string" && content.trim()) {
      availability = { reachable: true, checkedAtMs: Date.now() };
      return content.trim();
    }

    availability = { reachable: true, checkedAtMs: Date.now() };
    return null;
  } catch {
    availability = { reachable: false, checkedAtMs: Date.now() };
    return null;
  }
}

function shouldAttempt(cfg: OllamaConfig): boolean {
  if (cfg.mode === "false") return false;
  if (cfg.mode === "true") return true;

  if (!availability) return true;
  if (availability.reachable) return true;
  return Date.now() - availability.checkedAtMs > 60_000;
}

async function callOllama(body: unknown, cfg: OllamaConfig): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const response = await fetch(`${cfg.baseUrl.replace(/\/+$/, "")}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama request failed (${response.status}): ${text}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}
