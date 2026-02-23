import { generateOllamaText, isOllamaEnabled } from "./ollama.js";
import { generateOpenRouterText, isOpenRouterEnabled } from "./openrouter.js";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

export type ChatProvider = "openrouter" | "ollama" | "none";

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
