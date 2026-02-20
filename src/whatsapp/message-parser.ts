import { callFunction } from "../api/propai-client.js";
import { logger } from "../utils/logger.js";
import type { ParsedMessage } from "../types/index.js";

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
    logger.info("No parse function URLs configured; sending raw message only");
    return base;
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

function minimalMeta(message: any) {
  return {
    from: message?.from,
    to: message?.to,
    timestamp: message?.t,
    id: message?.id || message?.id?._serialized
  };
}
