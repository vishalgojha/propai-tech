import type {
  RealtorCampaign,
  RealtorCampaignCategory,
  RealtorCampaignCompliance,
  RealtorCampaignConsentMode,
  RealtorCampaignProgress,
  RealtorCampaignStatus
} from "./types.js";
import { normalizeCampaignAudience } from "./types.js";

export const REALTOR_POLICY_VERSION = "2026-03-01";

type CampaignPreflight = {
  ok: boolean;
  reasons: string[];
  warnings: string[];
  policyVersion: string;
};

type CreateCampaignInput = {
  name: string;
  client: string;
  templateName: string;
  language?: string;
  category?: RealtorCampaignCategory;
  audience?: string[];
  consentMode?: RealtorCampaignConsentMode;
  requireApproval?: boolean;
  reraProjectId?: string;
};

export function normalizeCampaignCategory(value: unknown): RealtorCampaignCategory {
  return String(value || "").trim().toLowerCase() === "utility" ? "utility" : "marketing";
}

export function defaultConsentMode(category: RealtorCampaignCategory): RealtorCampaignConsentMode {
  return category === "marketing" ? "required" : "optional";
}

export function normalizeConsentMode(
  mode: unknown,
  category: RealtorCampaignCategory
): RealtorCampaignConsentMode {
  const normalized = String(mode || "").trim().toLowerCase();
  if (normalized === "required" || normalized === "optional" || normalized === "disabled") {
    return normalized;
  }
  return defaultConsentMode(category);
}

export function normalizeCampaignProgress(progress: Partial<RealtorCampaignProgress> | undefined): RealtorCampaignProgress {
  return {
    processed: Number(progress?.processed || 0),
    sent: Number(progress?.sent || 0),
    failed: Number(progress?.failed || 0),
    optedOut: Number(progress?.optedOut || 0),
    blockedByPolicy: Number(progress?.blockedByPolicy || 0),
    lastIndex: Number(progress?.lastIndex || 0)
  };
}

export function normalizeCampaignCompliance(
  campaign: Pick<RealtorCampaign, "template" | "compliance">
): RealtorCampaignCompliance {
  const category = normalizeCampaignCategory(campaign.template.category);
  const compliance = campaign.compliance || ({} as RealtorCampaignCompliance);
  return {
    policyVersion: REALTOR_POLICY_VERSION,
    vertical: "real_estate_india",
    consentMode: normalizeConsentMode(compliance.consentMode, category),
    requireApproval: compliance.requireApproval ?? category === "marketing",
    approvedBy: compliance.approvedBy || undefined,
    approvedAtIso: compliance.approvedAtIso || undefined,
    approvalNote: compliance.approvalNote || undefined,
    reraProjectId: compliance.reraProjectId || undefined
  };
}

export function normalizeCampaign(campaign: RealtorCampaign): RealtorCampaign {
  const templateCategory = normalizeCampaignCategory(campaign.template.category);
  return {
    ...campaign,
    status: normalizeCampaignStatus(campaign.status),
    template: {
      ...campaign.template,
      category: templateCategory
    },
    compliance: normalizeCampaignCompliance(campaign),
    audience: normalizeCampaignAudience(campaign.audience),
    progress: normalizeCampaignProgress(campaign.progress)
  };
}

export function createCampaignDraft(input: CreateCampaignInput): RealtorCampaign {
  const category = normalizeCampaignCategory(input.category);
  const consentMode = normalizeConsentMode(input.consentMode, category);
  const nowIso = new Date().toISOString();
  return normalizeCampaign({
    id: createCampaignId(),
    name: String(input.name || "").trim(),
    client: String(input.client || "default").trim() || "default",
    createdAtIso: nowIso,
    status: "draft",
    template: {
      name: String(input.templateName || "").trim(),
      language: String(input.language || "en").trim() || "en",
      category
    },
    compliance: {
      policyVersion: REALTOR_POLICY_VERSION,
      vertical: "real_estate_india",
      consentMode,
      requireApproval: input.requireApproval ?? category === "marketing",
      reraProjectId: input.reraProjectId ? String(input.reraProjectId).trim() : undefined
    },
    audience: normalizeCampaignAudience(input.audience),
    progress: normalizeCampaignProgress(undefined)
  });
}

export function evaluateCampaignPreflight(campaign: RealtorCampaign): CampaignPreflight {
  const normalized = normalizeCampaign(campaign);
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (!normalized.template.name) reasons.push("template_missing");
  if (!normalized.audience.length) reasons.push("audience_empty");
  if (normalized.compliance.requireApproval && !normalized.compliance.approvedAtIso) {
    reasons.push("approval_required");
  }
  if (normalized.template.category === "marketing" && !normalized.compliance.reraProjectId) {
    reasons.push("rera_project_id_required");
  }
  if (normalized.template.category === "marketing" && normalized.compliance.consentMode !== "required") {
    warnings.push("marketing_without_required_consent_mode");
  }
  if (normalized.compliance.consentMode === "disabled") {
    warnings.push("consent_checks_disabled");
  }

  return {
    ok: reasons.length === 0,
    reasons,
    warnings,
    policyVersion: REALTOR_POLICY_VERSION
  };
}

export function formatPreflightReason(reason: string): string {
  if (reason === "template_missing") return "Campaign template name is missing.";
  if (reason === "audience_empty") return "Campaign audience is empty.";
  if (reason === "approval_required") return "Campaign requires explicit approval before run.";
  if (reason === "rera_project_id_required") {
    return "Marketing campaign requires reraProjectId for India realtor compliance.";
  }
  return reason;
}

export function markCampaignApproved(
  campaign: RealtorCampaign,
  approvedBy: string,
  approvalNote?: string
): RealtorCampaign {
  const normalized = normalizeCampaign(campaign);
  normalized.compliance.approvedBy = approvedBy;
  normalized.compliance.approvedAtIso = new Date().toISOString();
  normalized.compliance.approvalNote = approvalNote;
  return normalized;
}

export function markPolicyCheck(
  campaign: RealtorCampaign,
  check: CampaignPreflight
): RealtorCampaign {
  const normalized = normalizeCampaign(campaign);
  normalized.lastPolicyCheck = {
    atIso: new Date().toISOString(),
    ok: check.ok,
    reasons: [...check.reasons],
    warnings: [...check.warnings],
    policyVersion: check.policyVersion
  };
  return normalized;
}

export function normalizeCampaignStatus(status: unknown): RealtorCampaignStatus {
  const value = String(status || "").trim().toLowerCase();
  if (value === "scheduled") return "scheduled";
  if (value === "running") return "running";
  if (value === "completed") return "completed";
  if (value === "stopped") return "stopped";
  return "draft";
}

function createCampaignId(): string {
  return `cmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
