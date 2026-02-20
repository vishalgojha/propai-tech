import { resolveDmPolicy } from "./whatsapp/inbound/access-control.js";

export type RuntimeConfig = {
  databaseUrl?: string;
  whatsappDmPolicy: ReturnType<typeof resolveDmPolicy>;
  whatsappAllowFrom: string[];
  agentApiKey?: string;
  agentAllowedRoles: string[];
};

export function loadRuntimeConfigOrThrow(): RuntimeConfig {
  const config: RuntimeConfig = {
    databaseUrl: process.env.DATABASE_URL || undefined,
    whatsappDmPolicy: resolveDmPolicy(process.env.WHATSAPP_DM_POLICY),
    whatsappAllowFrom: parseAllowFromEnv(process.env.WHATSAPP_ALLOW_FROM),
    agentApiKey: process.env.AGENT_API_KEY || undefined,
    agentAllowedRoles: (process.env.AGENT_ALLOWED_ROLES || "realtor_admin,ops")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  };

  if (config.whatsappDmPolicy === "pairing" && !config.databaseUrl) {
    throw new Error(
      "WHATSAPP_DM_POLICY=pairing requires DATABASE_URL for persistent pairing approvals."
    );
  }

  return config;
}

function parseAllowFromEnv(raw: string | undefined): string[] {
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
