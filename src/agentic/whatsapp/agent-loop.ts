import { create } from "@wppconnect-team/wppconnect";
import { createDedupe } from "../../utils/dedupe.js";
import { logger } from "../../utils/logger.js";
import { loadRuntimeConfigOrThrow } from "../runtime-config.js";
import { RealtorSuiteAgentEngine } from "../suite/engine.js";
import { checkInboundAccess } from "./inbound/access-control.js";
import { sendWhatsappText } from "./outbound/send.js";
import type { InboundEnvelope, MinimalWppMessage } from "./types.js";

const dedupe = createDedupe();

export async function startRealtorWhatsappAgent(): Promise<void> {
  const runtimeConfig = loadRuntimeConfigOrThrow();
  const session = process.env.WPP_SESSION_NAME || "real-estate-agent";
  const dmPolicy = runtimeConfig.whatsappDmPolicy;
  const allowFrom = runtimeConfig.whatsappAllowFrom;
  const engine = new RealtorSuiteAgentEngine();

  const client = await create({
    session,
    catchQR: (_base64Qr, asciiQR) => {
      logger.info("Scan QR to log in", { asciiQR });
    },
    statusFind: (statusSession, sessionInfo) => {
      logger.info("WPP status", { statusSession, sessionInfo });
    },
    logQR: true
  });

  client.onMessage(async (message: MinimalWppMessage) => {
    try {
      const inbound = toInboundEnvelope(message);
      if (!inbound || !inbound.body.trim()) {
        return;
      }

      if (dedupe.seen(inbound.messageId)) {
        logger.info("Duplicate message ignored", { messageId: inbound.messageId });
        return;
      }

      const access = await checkInboundAccess({
        inbound,
        dmPolicy,
        allowFrom
      });
      if (!access.allowed) {
        logger.info("Inbound message blocked by policy", {
          messageId: inbound.messageId,
          reason: access.reason,
          from: inbound.fromE164 || inbound.fromJid
        });
        if (access.pairingReplyText) {
          await sendWhatsappText(client, inbound.fromJid, access.pairingReplyText);
        }
        return;
      }

      const result = await engine.chat({
        message: inbound.body,
        recipient: inbound.fromE164 || undefined,
        dryRun: false
      });
      await sendWhatsappText(client, inbound.fromJid, result.assistantMessage);

      logger.info("Processed inbound WhatsApp message", {
        messageId: inbound.messageId,
        from: inbound.fromE164 || inbound.fromJid,
        planLength: result.plan.length
      });
    } catch (error) {
      logger.error("Inbound WhatsApp processing failed", { error: String(error) });
    }
  });

  logger.info("Single-agent WhatsApp helper is ready", {
    dmPolicy,
    allowFromCount: allowFrom.length
  });
}

function toInboundEnvelope(message: MinimalWppMessage): InboundEnvelope | null {
  const fromJid = String(message.from || "").trim();
  if (!fromJid) return null;
  return {
    messageId: extractMessageId(message),
    body: String(message.body || ""),
    fromJid,
    fromE164: jidToE164(fromJid),
    isFromMe: Boolean(message.fromMe),
    isGroup: Boolean(message.isGroupMsg) || fromJid.endsWith("@g.us")
  };
}

function extractMessageId(message: MinimalWppMessage): string {
  const raw = message.id;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (raw && typeof raw === "object") {
    const nested = raw._serialized;
    if (typeof nested === "string" && nested.trim()) return nested.trim();
  }
  return `mid-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function jidToE164(jid: string): string | null {
  const local = jid.split("@")[0] || "";
  const digits = local.replace(/[^\d]/g, "");
  if (!digits || digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}
