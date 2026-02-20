import { callFunction } from "../api/propai-client.js";
import { generateOpenRouterJson, isOpenRouterEnabled } from "../llm/openrouter.js";
import type { ParsedMessage } from "../types/index.js";
import { logger } from "../utils/logger.js";

export async function parseMessage(rawText: string, message: any): Promise<ParsedMessage> {
  const base: ParsedMessage = {
    intent: "unknown",
    data: {},
    source: "whatsapp",
    rawText
  };

  const parsePropertyUrl = process.env.PROPAI_PARSE_PROPERTY_URL || "";
  const parseRequirementUrl = process.env.PROPAI_PARSE_REQUIREMENT_URL || "";

  if (!parsePropertyUrl && !parseRequirementUrl) {
    if (!isOpenRouterEnabled()) {
      logger.info("No parse function URLs configured; sending raw message only");
      return base;
    }

    const llmParsed = await parseWithOpenRouter(rawText, message);
    return llmParsed
      ? {
          ...base,
          ...llmParsed
        }
      : base;
  }

  try {
    if (parsePropertyUrl) {
      const res = await callFunction(parsePropertyUrl, { message: rawText, meta: minimalMeta(message) });
      if (res) {
        const listing = res.listing || res.property || res.data || res;
        return {
          ...base,
          intent: res.intent || "property",
          listing,
          data: res,
          confidence: res.confidence
        };
      }
    }

    if (parseRequirementUrl) {
      const res = await callFunction(parseRequirementUrl, { message: rawText, meta: minimalMeta(message) });
      if (res) {
        const requirement = res.requirement || res.data || res;
        return {
          ...base,
          intent: res.intent || "requirement",
          requirement,
          data: res,
          confidence: res.confidence
        };
      }
    }
  } catch (err) {
    logger.error("Parse function failed", { err });
  }

  return base;
}

async function parseWithOpenRouter(rawText: string, message: any): Promise<Partial<ParsedMessage> | null> {
  try {
    const payload = await generateOpenRouterJson<{
      intent?: string;
      confidence?: number;
      listing?: Record<string, unknown>;
      requirement?: Record<string, unknown>;
      data?: Record<string, unknown>;
    }>([
      {
        role: "system",
        content:
          "Extract Indian real estate WhatsApp lead data. Return only JSON with intent(property|requirement|unknown), confidence(0..1), optional listing, optional requirement, and data."
      },
      {
        role: "user",
        content: JSON.stringify({
          message: rawText,
          meta: minimalMeta(message)
        })
      }
    ]);

    if (!payload) return null;

    return {
      intent: payload.intent || "unknown",
      listing: payload.listing as any,
      requirement: payload.requirement as any,
      confidence: typeof payload.confidence === "number" ? payload.confidence : undefined,
      data: payload.data || payload
    };
  } catch (err) {
    logger.error("OpenRouter parse failed", { err });
    return null;
  }
}

function minimalMeta(message: any) {
  return {
    from: message?.from,
    to: message?.to,
    timestamp: message?.t,
    id: message?.id || message?.id?._serialized
  };
}
