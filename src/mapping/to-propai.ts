import type { ParsedMessage, PropAIPayload } from "../types/index.js";

export function mapToPropAI(parsed: ParsedMessage, rawText: string, message: any): PropAIPayload {
  const ts = message?.t ? new Date(message.t * 1000).toISOString() : new Date().toISOString();

  return {
    source: "whatsapp",
    intent: parsed.intent,
    message: rawText,
    timestamp: ts,
    whatsapp_message_id: message?.id || message?.id?._serialized,
    phone: message?.from,
    data: {
      schema_version: 1,
      listing: parsed.listing,
      requirement: parsed.requirement,
      extracted: parsed.data || {},
      confidence: parsed.confidence
    }
  };
}
