import { generateOllamaText, isOllamaEnabled } from "./ollama.js";
import { generateOpenRouterText, isOpenRouterEnabled } from "./openrouter.js";
import { generateXaiText, isXaiEnabled } from "./xai.js";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

export type ChatProvider = "openrouter" | "xai" | "ollama" | "none";

export async function generateAssistantText(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<{ text: string | null; provider: ChatProvider }> {
  if (isOpenRouterEnabled()) {
    try {
      const text = await generateOpenRouterText(messages, options);
      if (text) {
        return { text, provider: "openrouter" };
      }
    } catch {
      // Fall through to local provider.
    }
  }

  if (isXaiEnabled()) {
    try {
      const text = await generateXaiText(messages, options);
      if (text) {
        return { text, provider: "xai" };
      }
    } catch {
      // Fall through to next provider.
    }
  }

  if (isOllamaEnabled()) {
    try {
      const text = await generateOllamaText(messages, options);
      if (text) {
        return { text, provider: "ollama" };
      }
    } catch {
      // Fall through to deterministic fallback.
    }
  }

  return { text: null, provider: "none" };
}
