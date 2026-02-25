import { resolveDmPolicy } from "./whatsapp/inbound/access-control.js";

export type RuntimeConfig = {
  databaseUrl?: string;
  whatsappDmPolicy: ReturnType<typeof resolveDmPolicy>;
  whatsappAllowFrom: string[];
  whatsappWebhookVerifyToken?: string;
  whatsappWebhookAppSecret?: string;
  groupPostingEnabled: boolean;
  groupPostingIntervalMs: number;
  groupPostingBatchSize: number;
  groupPostingProcessingLeaseMs: number;
  groupPostingDefaultTargets: string[];
  groupPostingSchedulerDryRun: boolean;
  groupPostingIntakeEnabled: boolean;
  groupPostingInputChats: string[];
  groupPostingAckInput: boolean;
  agentApiKey?: string;
  agentAllowedRoles: string[];
  agentRateLimitWindowMs: number;
  agentRateLimitMax: number;
  agentMaxBodyBytes: number;
};

export function loadRuntimeConfigOrThrow(): RuntimeConfig {
  const config: RuntimeConfig = {
    databaseUrl: process.env.DATABASE_URL || undefined,
    whatsappDmPolicy: resolveDmPolicy(process.env.WHATSAPP_DM_POLICY),
    whatsappAllowFrom: parseAllowFromEnv(process.env.WHATSAPP_ALLOW_FROM),
    whatsappWebhookVerifyToken: emptyToUndefined(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN),
    whatsappWebhookAppSecret: emptyToUndefined(process.env.WHATSAPP_APP_SECRET),
    groupPostingEnabled: parseBooleanEnv(process.env.GROUP_POSTING_ENABLED, false),
    groupPostingIntervalMs: parsePositiveInt(process.env.GROUP_POSTING_INTERVAL_MS, 15 * 60 * 1000, 10_000),
    groupPostingBatchSize: parsePositiveInt(process.env.GROUP_POSTING_BATCH_SIZE, 10, 1),
    groupPostingProcessingLeaseMs: parsePositiveInt(process.env.GROUP_POSTING_PROCESSING_LEASE_MS, 10 * 60 * 1000, 30_000),
    groupPostingDefaultTargets: parseCsvList(process.env.GROUP_POSTING_DEFAULT_TARGETS),
    groupPostingSchedulerDryRun: parseBooleanEnv(
      process.env.GROUP_POSTING_SCHEDULER_DRY_RUN,
      process.env.WACLI_DRY_RUN !== "false"
    ),
    groupPostingIntakeEnabled: parseBooleanEnv(process.env.GROUP_POSTING_INTAKE_ENABLED, false),
    groupPostingInputChats: parseCsvList(process.env.GROUP_POSTING_INPUT_CHATS),
    groupPostingAckInput: parseBooleanEnv(process.env.GROUP_POSTING_ACK_INPUT, false),
    agentApiKey: process.env.AGENT_API_KEY || undefined,
    agentAllowedRoles: (process.env.AGENT_ALLOWED_ROLES || "realtor_admin,ops")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    agentRateLimitWindowMs: parsePositiveInt(
      process.env.AGENT_RATE_LIMIT_WINDOW_MS,
      60000,
      1000
    ),
    agentRateLimitMax: parsePositiveInt(
      process.env.AGENT_RATE_LIMIT_MAX,
      180,
      1
    ),
    agentMaxBodyBytes: parsePositiveInt(
      process.env.AGENT_MAX_BODY_BYTES,
      1_048_576,
      1_024
    )
  };

  if (config.whatsappDmPolicy === "pairing" && !config.databaseUrl) {
    throw new Error(
      "WHATSAPP_DM_POLICY=pairing requires DATABASE_URL for persistent pairing approvals."
    );
  }

  return config;
}

function parseAllowFromEnv(raw: string | undefined): string[] {
  return parseCsvList(raw, normalizeE164);
}

function normalizeE164(value: string): string | null {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

function parsePositiveInt(raw: string | undefined, fallback: number, min: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.floor(parsed);
  if (normalized < min) return fallback;
  return normalized;
}

function parseBooleanEnv(raw: string | undefined, fallback: boolean): boolean {
  const value = String(raw || "").trim().toLowerCase();
  if (!value) return fallback;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
}

function parseCsvList(
  raw: string | undefined,
  normalizer?: (value: string) => string | null
): string[] {
  const input = String(raw || "").trim();
  if (!input) return [];
  return Array.from(
    new Set(
      input
        .split(",")
        .map((item) => item.trim())
        .map((item) => {
          if (!item) return null;
          return normalizer ? normalizer(item) : item;
        })
        .filter((item): item is string => Boolean(item))
    )
  );
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const text = String(value || "").trim();
  return text.length > 0 ? text : undefined;
}
