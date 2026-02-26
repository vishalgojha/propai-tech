type XaiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

type XaiConfig = {
  apiKey?: string;
  baseUrl: string;
  defaultModel: string;
  timeoutMs: number;
};

function config(): XaiConfig {
  return {
    apiKey: process.env.XAI_API_KEY || undefined,
    baseUrl: process.env.XAI_BASE_URL || "https://api.x.ai/v1",
    defaultModel: process.env.XAI_MODEL || "grok-2-latest",
    timeoutMs: Number(process.env.XAI_TIMEOUT_MS || 30000)
  };
}

export function isXaiEnabled(): boolean {
  return Boolean(config().apiKey);
}

export async function generateXaiText(
  messages: XaiMessage[],
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

  const payload = await callXai(body, cfg);
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

async function callXai(body: unknown, cfg: XaiConfig): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const response = await fetch(`${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`xAI request failed (${response.status}): ${text}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}
