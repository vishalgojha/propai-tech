import { parseMessage } from "./message-parser.js";
import { mapToPropAI } from "../mapping/to-propai.js";
import { sendToPropAI } from "../api/propai-client.js";
import { logger } from "../utils/logger.js";
import { createDedupe } from "../utils/dedupe.js";

const dedupe = createDedupe();

export async function handleIncomingMessage(message: any) {
  const messageId = message?.id || message?.id?._serialized || "unknown";

  if (dedupe.seen(messageId)) {
    logger.info("Duplicate message ignored", { messageId });
    return;
  }

  const rawText = message?.body || "";
  if (!rawText.trim()) return;

  const parsed = await parseMessage(rawText, message);
  const payload = mapToPropAI(parsed, rawText, message);

  await sendToPropAI(payload);

  logger.info("Sent to PropAI", { messageId, intent: parsed.intent });
}
