type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

type OpenRouterConfig = {
  apiKey?: string;
  baseUrl: string;
  defaultModel: string;
  appName?: string;
  appUrl?: string;
  timeoutMs: number;
};

function config(): OpenRouterConfig {
  return {
    apiKey: process.env.OPENROUTER_API_KEY || undefined,
    baseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    defaultModel: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
    appName: process.env.OPENROUTER_APP_NAME || "PropAI Live",
    appUrl: process.env.OPENROUTER_APP_URL || "https://propai.live",
    timeoutMs: Number(process.env.OPENROUTER_TIMEOUT_MS || 30000)
  };
}

export function isOpenRouterEnabled(): boolean {
  return Boolean(config().apiKey);
}

export async function generateOpenRouterText(
  messages: OpenRouterMessage[],
  options: ChatOptions = {}
): Promise<string | null> {
  const cfg = config();
  if (!cfg.apiKey) return null;

  const body: Record<string, unknown> = {
    model: options.model || cfg.defaultModel,
    messages,
    temperature: options.temperature ?? 0.2
  };
  if (options.maxTokens) {
    body.max_tokens = options.maxTokens;
  }

  const payload = await callOpenRouter(body, cfg);
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    const text = content
      .map((item: any) => (typeof item?.text === "string" ? item.text : ""))
      .join("")
      .trim();
    return text || null;
  }
  return null;
}

export async function generateOpenRouterJson<T>(
  messages: OpenRouterMessage[],
  options: ChatOptions = {}
): Promise<T | null> {
  const cfg = config();
  if (!cfg.apiKey) return null;

  const body = {
    model: options.model || cfg.defaultModel,
    messages,
    temperature: options.temperature ?? 0.1,
    response_format: {
      type: "json_object"
    }
  };

  const payload = await callOpenRouter(body, cfg);
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    return null;
  }
  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function callOpenRouter(body: unknown, cfg: OpenRouterConfig): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const response = await fetch(`${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": cfg.appUrl || "",
        "X-Title": cfg.appName || "PropAI Live"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenRouter request failed (${response.status}): ${text}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}
