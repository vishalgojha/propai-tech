import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseTerminalThemeId, type TerminalThemeId } from "./theme-pack.js";
import type { PreferredLanguage } from "../agentic/types.js";

export type OperatorMode = "guided" | "expert";
type AutonomyLevel = 0 | 1 | 2;

export type TerminalUserPrefs = {
  version: 1;
  operatorMode?: OperatorMode;
  theme?: TerminalThemeId;
  autonomy?: AutonomyLevel;
  dryRun?: boolean;
  recipient?: string;
  model?: string;
  leadDefaults?: {
    name?: string;
    phone?: string;
    city?: string;
    preferredLanguage?: PreferredLanguage;
  };
};

const PREFS_PATH = join(homedir(), ".propai-terminal.json");

export function getTerminalPrefsPath(): string {
  return PREFS_PATH;
}

export async function loadTerminalUserPrefs(): Promise<TerminalUserPrefs | null> {
  try {
    const raw = await readFile(PREFS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return sanitizePrefs(parsed);
  } catch {
    return null;
  }
}

export async function saveTerminalUserPrefs(input: TerminalUserPrefs): Promise<void> {
  const payload = sanitizePrefs(input);
  await writeFile(PREFS_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function sanitizePrefs(input: unknown): TerminalUserPrefs {
  const source = isObject(input) ? input : {};
  const leadRaw = isObject(source.leadDefaults) ? source.leadDefaults : {};
  const theme = typeof source.theme === "string" ? parseTerminalThemeId(source.theme) : undefined;

  return {
    version: 1,
    operatorMode: parseOperatorMode(source.operatorMode),
    theme,
    autonomy: parseAutonomy(source.autonomy),
    dryRun: typeof source.dryRun === "boolean" ? source.dryRun : undefined,
    recipient: parseOptionalString(source.recipient),
    model: parseOptionalString(source.model),
    leadDefaults: {
      name: parseOptionalString(leadRaw.name),
      phone: parseOptionalString(leadRaw.phone),
      city: parseOptionalString(leadRaw.city),
      preferredLanguage: parsePreferredLanguage(leadRaw.preferredLanguage)
    }
  };
}

function parseOperatorMode(value: unknown): OperatorMode | undefined {
  if (value === "guided" || value === "expert") return value;
  return undefined;
}

function parseAutonomy(value: unknown): AutonomyLevel | undefined {
  if (value === 0 || value === 1 || value === 2) return value;
  return undefined;
}

function parseOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parsePreferredLanguage(value: unknown): PreferredLanguage | undefined {
  if (value === "en" || value === "hi" || value === "hinglish") {
    return value;
  }
  return undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
