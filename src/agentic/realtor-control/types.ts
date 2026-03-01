export type RealtorConsentStatus = "opted_in" | "opted_out";

export type RealtorConsentRecord = {
  phoneE164: string;
  status: RealtorConsentStatus;
  channel: string;
  source: string;
  purpose: string;
  proofRef?: string;
  consentedAtIso?: string;
  revokedAtIso?: string;
  updatedAtIso: string;
};

export type RealtorCampaignCategory = "utility" | "marketing";
export type RealtorCampaignConsentMode = "required" | "optional" | "disabled";
export type RealtorCampaignStatus = "draft" | "scheduled" | "running" | "completed" | "stopped";

export type RealtorCampaignTemplate = {
  name: string;
  language: string;
  category: RealtorCampaignCategory;
  params?: string[];
};

export type RealtorCampaignCompliance = {
  policyVersion: string;
  vertical: "real_estate_india";
  consentMode: RealtorCampaignConsentMode;
  requireApproval: boolean;
  approvedBy?: string;
  approvedAtIso?: string;
  approvalNote?: string;
  reraProjectId?: string;
};

export type RealtorCampaignProgress = {
  processed: number;
  sent: number;
  failed: number;
  optedOut: number;
  blockedByPolicy: number;
  lastIndex: number;
};

export type RealtorCampaignPolicyCheck = {
  atIso: string;
  ok: boolean;
  reasons: string[];
  warnings: string[];
  policyVersion: string;
};

export type RealtorCampaign = {
  id: string;
  name: string;
  client: string;
  createdAtIso: string;
  status: RealtorCampaignStatus;
  template: RealtorCampaignTemplate;
  compliance: RealtorCampaignCompliance;
  audience: string[];
  scheduledAtIso?: string;
  progress: RealtorCampaignProgress;
  lastPolicyCheck?: RealtorCampaignPolicyCheck;
  lastRunAtIso?: string;
  stoppedAtIso?: string;
};

export function normalizePhoneE164(input: string): string | null {
  const digits = String(input || "").replace(/[^\d]/g, "");
  if (!digits || digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

export function normalizeCampaignAudience(audience: string[] | undefined): string[] {
  if (!Array.isArray(audience)) return [];
  return Array.from(
    new Set(
      audience
        .map((item) => normalizePhoneE164(String(item || "")))
        .filter((item): item is string => Boolean(item))
    )
  );
}
