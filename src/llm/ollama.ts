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
let discoveredModel: string | null = null;

function config(): OllamaConfig {
  const modeRaw = String(process.env.OLLAMA_ENABLED || "auto").toLowerCase();
  const mode: OllamaMode =
    modeRaw === "true" || modeRaw === "false" || modeRaw === "auto" ? modeRaw : "auto";

  return {
    baseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
    defaultModel: process.env.OLLAMA_MODEL || "llama3.1:8b",
    timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS || 12000),
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
    const selectedModel = options.model || discoveredModel || cfg.defaultModel;
    let payload: any;
    try {
      payload = await callOllama(buildRequestBody(messages, selectedModel, options), cfg);
    } catch (error) {
      if (isModelNotFoundError(error)) {
        const fallbackModel = await pickFallbackModel(cfg, selectedModel);
        if (!fallbackModel) {
          throw error;
        }
        payload = await callOllama(buildRequestBody(messages, fallbackModel, options), cfg);
        if (!options.model) {
          discoveredModel = fallbackModel;
        }
      } else {
        throw error;
      }
    }

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

export async function getOllamaStatus(): Promise<{
  enabled: boolean;
  baseUrl: string;
  selectedModel: string;
  reachable: boolean;
  availableModels: string[];
}> {
  const cfg = config();
  const selectedModel = discoveredModel || cfg.defaultModel;
  if (!isOllamaEnabled()) {
    return {
      enabled: false,
      baseUrl: cfg.baseUrl,
      selectedModel,
      reachable: false,
      availableModels: []
    };
  }

  try {
    const models = await listModels(cfg);
    availability = { reachable: true, checkedAtMs: Date.now() };
    if (!discoveredModel && models.length > 0 && !models.includes(cfg.defaultModel)) {
      discoveredModel = models[0];
    }
    return {
      enabled: true,
      baseUrl: cfg.baseUrl,
      selectedModel: discoveredModel || cfg.defaultModel,
      reachable: true,
      availableModels: models
    };
  } catch {
    availability = { reachable: false, checkedAtMs: Date.now() };
    return {
      enabled: true,
      baseUrl: cfg.baseUrl,
      selectedModel,
      reachable: false,
      availableModels: []
    };
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

function buildRequestBody(
  messages: OllamaMessage[],
  model: string,
  options: OllamaChatOptions
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
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

  return body;
}

async function pickFallbackModel(cfg: OllamaConfig, currentModel: string): Promise<string | null> {
  const models = await listModels(cfg);
  if (models.length === 0) return null;
  const firstDifferent = models.find((model) => model !== currentModel);
  return firstDifferent || models[0];
}

async function listModels(cfg: OllamaConfig): Promise<string[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const response = await fetch(`${cfg.baseUrl.replace(/\/+$/, "")}/api/tags`, {
      method: "GET",
      signal: controller.signal
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama tags request failed (${response.status}): ${text}`);
    }
    const payload = await response.json();
    const models = Array.isArray(payload?.models) ? payload.models : [];
    return models
      .map((entry: any) => (typeof entry?.name === "string" ? entry.name.trim() : ""))
      .filter((name: string) => Boolean(name));
  } finally {
    clearTimeout(timeout);
  }
}

function isModelNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const text = error.message.toLowerCase();
  return text.includes("model") && (text.includes("not found") || text.includes("does not exist"));
}
