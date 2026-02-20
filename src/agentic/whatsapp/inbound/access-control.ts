import type { InboundEnvelope, WhatsAppDmPolicy } from "../types.js";
import { getPairingStore } from "./pairing-store.js";

export type AccessControlResult = {
  allowed: boolean;
  reason?: string;
  pairingReplyText?: string;
};

const pairingStore = getPairingStore();

export async function checkInboundAccess(params: {
  inbound: InboundEnvelope;
  dmPolicy: WhatsAppDmPolicy;
  allowFrom: string[];
}): Promise<AccessControlResult> {
  const { inbound, dmPolicy, allowFrom } = params;

  if (inbound.isFromMe) {
    return { allowed: false, reason: "ignore_self_message" };
  }

  if (inbound.isGroup) {
    return { allowed: false, reason: "group_messages_disabled" };
  }

  if (dmPolicy === "disabled") {
    return { allowed: false, reason: "dm_policy_disabled" };
  }

  if (dmPolicy === "open") {
    return { allowed: true };
  }

  const sender = inbound.fromE164;
  if (sender && (await pairingStore.isPaired(sender))) {
    return { allowed: true };
  }

  const allowed = sender ? allowFrom.includes(sender) : false;
  if (allowed) {
    return { allowed: true };
  }

  if (dmPolicy === "pairing") {
    if (!sender) {
      return {
        allowed: false,
        reason: "pairing_missing_e164",
        pairingReplyText: "Could not read your phone number. Please contact admin."
      };
    }
    const request = await pairingStore.requestPairing({
      phoneE164: sender,
      sourceJid: inbound.fromJid
    });
    if (request.alreadyPaired) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: "pairing_required",
      pairingReplyText: `Pairing required. Share this code with your admin: ${request.code}`
    };
  }

  return { allowed: false, reason: "sender_not_allowlisted" };
}

export function resolveDmPolicy(raw: string | undefined): WhatsAppDmPolicy {
  const value = String(raw || "allowlist").trim().toLowerCase();
  if (value === "pairing" || value === "allowlist" || value === "open" || value === "disabled") {
    return value;
  }
  return "allowlist";
}

export function parseAllowFrom(raw: string | undefined): string[] {
  const input = String(raw || "").trim();
  if (!input) return [];
  return Array.from(
    new Set(
      input
        .split(",")
        .map((item) => normalizeE164(item))
        .filter((item): item is string => Boolean(item))
    )
  );
}

function normalizeE164(value: string): string | null {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}
