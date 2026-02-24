import {
  RESALE_NURTURE_BUCKETS,
  RESALE_SYSTEM_PROMPT,
  RESALE_TEMPLATES,
  type ResaleNurtureBucket,
  type ResaleNurtureStep,
  type ResaleTemplate,
  type ResaleTemplateLanguage
} from "../data/resale-assets.js";
import type { PreferredLanguage } from "../types.js";

export type ResaleFollowupPlaybook = {
  language: ResaleTemplateLanguage;
  template: ResaleTemplate;
  renderedMessage: string;
  templateParams: string[];
  nurtureBucket: ResaleNurtureBucket;
  nurtureSteps: ResaleNurtureStep[];
  systemPrompt: string;
};

type BuildResaleFollowupPlaybookInput = {
  message: string;
  preferredLanguage?: PreferredLanguage;
  leadName?: string;
  localityOrCity?: string;
  bedrooms?: number;
  leadAgeDays?: number;
};

export function buildResaleFollowupPlaybook(
  input: BuildResaleFollowupPlaybookInput
): ResaleFollowupPlaybook {
  const language = detectLanguage(input.message, input.preferredLanguage);
  const ageDays = normalizeLeadAgeDays(input.leadAgeDays, input.message);
  const bucket = selectBucket(ageDays);
  const templateName = selectTemplateName({
    message: input.message,
    language,
    ageDays
  });
  const template = findTemplate(templateName, language);
  const templateParams = buildTemplateParams({
    leadName: input.leadName,
    localityOrCity: input.localityOrCity,
    bedrooms: input.bedrooms
  });
  const renderedMessage = renderTemplateBody(template.body, templateParams);
  const nurtureSteps = bucket.steps.map((step) => ({
    ...step,
    templateName: withLanguageSuffix(step.templateName, language),
    language
  }));

  return {
    language,
    template,
    renderedMessage,
    templateParams,
    nurtureBucket: bucket,
    nurtureSteps,
    systemPrompt: RESALE_SYSTEM_PROMPT
  };
}

function detectLanguage(message: string, preferredLanguage?: PreferredLanguage): ResaleTemplateLanguage {
  if (preferredLanguage === "en") return "en";
  if (preferredLanguage === "hi" || preferredLanguage === "hinglish") return "hi";
  if (/[\u0900-\u097F]/.test(message)) return "hi";
  return "en";
}

function normalizeLeadAgeDays(explicit: number | undefined, message: string): number | undefined {
  if (typeof explicit === "number" && Number.isFinite(explicit) && explicit >= 0) {
    return Math.floor(explicit);
  }
  const lower = message.toLowerCase();
  if (/(stale|old lead|30\+|30\s*days?|one month|month old)/.test(lower)) return 31;
  if (/\b(7\s*days?|two weeks|3 weeks|warm lead|warm)\b/.test(lower)) return 14;
  if (/\b(new lead|fresh lead|today|recent)\b/.test(lower)) return 2;
  return undefined;
}

function selectBucket(leadAgeDays: number | undefined): ResaleNurtureBucket {
  if (typeof leadAgeDays === "number") {
    if (leadAgeDays <= 6) return getBucket("recent_0_6");
    if (leadAgeDays <= 30) return getBucket("warm_7_30");
    return getBucket("older_30_plus");
  }
  return getBucket("recent_0_6");
}

function getBucket(id: ResaleNurtureBucket["id"]): ResaleNurtureBucket {
  const found = RESALE_NURTURE_BUCKETS.find((item) => item.id === id);
  if (found) return found;
  return RESALE_NURTURE_BUCKETS[0];
}

function selectTemplateName(input: {
  message: string;
  language: ResaleTemplateLanguage;
  ageDays: number | undefined;
}): string {
  const lower = input.message.toLowerCase();
  const suffix = input.language;

  if (/\b(brochure)\b/.test(lower)) return `resale_post_brochure_nudge_${suffix}`;
  if (/\b(site visit|visit|reschedule)\b/.test(lower)) return `resale_site_visit_confirm_${suffix}`;
  if (/\b(loan|emi|eligibility)\b/.test(lower)) return `resale_loan_assist_${suffix}`;
  if ((input.ageDays || 0) > 30 || /\b(reopen|stale|old lead|no response)\b/.test(lower)) {
    return `resale_reopen_30plus_${suffix}`;
  }
  if ((input.ageDays || 0) >= 7) return `resale_day1_followup_${suffix}`;
  return `resale_day1_followup_${suffix}`;
}

function findTemplate(name: string, language: ResaleTemplateLanguage): ResaleTemplate {
  const pool = RESALE_TEMPLATES[language];
  const found = pool.find((item) => item.name === name);
  if (found) return found;
  return pool[0];
}

function buildTemplateParams(input: {
  leadName?: string;
  localityOrCity?: string;
  bedrooms?: number;
}): string[] {
  const name = normalizeTemplateValue(input.leadName, "there");
  const location = normalizeTemplateValue(input.localityOrCity, "your area");
  const bhk = input.bedrooms ? `${input.bedrooms} BHK` : "resale options";
  const visitDate = "this weekend";
  const locationPin = "shared on request";
  return [name, location, bhk, visitDate, locationPin];
}

function normalizeTemplateValue(value: string | undefined, fallback: string): string {
  const text = String(value || "").trim();
  return text.length > 0 ? text : fallback;
}

function renderTemplateBody(body: string, params: string[]): string {
  return body.replace(/{{\s*(\d+)\s*}}/g, (_full, idxRaw: string) => {
    const idx = Number(idxRaw) - 1;
    if (!Number.isInteger(idx) || idx < 0 || idx >= params.length) return "";
    return params[idx];
  });
}

function withLanguageSuffix(templateName: string, language: ResaleTemplateLanguage): string {
  if (templateName.endsWith("_en") || templateName.endsWith("_hi")) {
    return templateName.replace(/_(en|hi)$/, `_${language}`);
  }
  return `${templateName}_${language}`;
}
