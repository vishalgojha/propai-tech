import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { LeadInput } from "../types.js";
import {
  detectBedrooms,
  detectBudget,
  detectCity,
  detectLocality,
  detectPropertyType,
  detectTransaction,
  detectUrgency
} from "../utils/parse.js";

export type SkillDatasetMode = "broker_group" | "buyer_inquiry" | "mixed";
export type SkillRecordType = "inventory_listing" | "buyer_requirement";
export type SkillPriorityBucket = "P1" | "P2" | "P3";
export type SkillUrgency = "high" | "medium" | "low";

export type SkillParsedMessage = {
  timestamp: string;
  sender: string;
  content: string;
};

export type SkillExtractedLead = {
  lead_id: string;
  dataset_mode: SkillDatasetMode;
  name: string;
  phone: string;
  record_type: SkillRecordType;
  property_type?: string;
  budget?: number;
  deal_type: "sale" | "rent" | "lease" | "outright" | "unknown";
  asset_class: "residential" | "commercial" | "mixed" | "pg" | "unknown";
  price_basis: "total" | "per_sqft" | "monthly_rent" | "deposit" | "unknown";
  area_sqft?: number;
  area_basis: "carpet" | "rera_carpet" | "builtup" | "unknown";
  location_hint?: string;
  raw_text: string;
  source: string;
  created_at: string;
  urgency: SkillUrgency;
};

export type SkillNormalizedLocation = {
  lead_id: string;
  city: "Mumbai" | "Pune" | "Unknown";
  locality_canonical: string;
  micro_market: string;
  matched_alias: string;
  confidence: number;
  unresolved_flag: boolean;
  resolution_method: "exact_alias" | "normalized_alias" | "fuzzy_alias" | "unresolved";
};

export type SkillScoredLead = {
  lead_id: string;
  dataset_mode: SkillDatasetMode;
  record_type: SkillRecordType;
  sentiment_label: "positive" | "neutral" | "negative";
  sentiment_score: number;
  intent_score: number;
  recency_score: number;
  urgency_score: number;
  priority_score: number;
  priority_bucket: SkillPriorityBucket;
  evidence: string[];
};

export type SkillSummary = {
  new_leads_count: number;
  dataset_mode: SkillDatasetMode;
  trends: string[];
  record_type_breakdown: {
    inventory_listing: number;
    buyer_requirement: number;
  };
  priority_breakdown: {
    P1: number;
    P2: number;
    P3: number;
  };
  urgency_breakdown: {
    high: number;
    medium: number;
    low: number;
  };
  top_localities: Array<{
    locality: string;
    count: number;
  }>;
};

export type SkillActionSuggestion = {
  action_type: "call" | "email" | "visit";
  lead_id: string;
  description: string;
};

export type SkillLeadStorageResult = {
  status: "success" | "failure";
  stored_ids: string[];
  error_message?: string;
};

export type SkillPipelineResult = {
  dataset_mode: SkillDatasetMode;
  message_parser: SkillParsedMessage[];
  lead_extractor: SkillExtractedLead[];
  india_location_normalizer: {
    normalized_locations: SkillNormalizedLocation[];
  };
  sentiment_priority_scorer: {
    scored_leads: SkillScoredLead[];
  };
  summary_generator: {
    summary: SkillSummary;
  };
  action_suggester: SkillActionSuggestion[];
  lead_storage: SkillLeadStorageResult;
};

export type SkillPipelineInput = {
  message: string;
  lead?: LeadInput;
  recipient?: string;
  datasetMode?: SkillDatasetMode;
  confirmationToken?: string;
};

type LocationAliasEntry = {
  canonical: string;
  micro_market: string;
  aliases: string[];
};

type LocationCityEntry = {
  city_aliases: string[];
  localities: LocationAliasEntry[];
};

type AliasCatalog = {
  cities: Record<string, LocationCityEntry>;
};

let aliasCatalogCache: AliasCatalog | null = null;

export function runSkillPipeline(input: SkillPipelineInput): SkillPipelineResult {
  if (!isSkillPipelineEnabled()) {
    return emptySkillPipeline(input.datasetMode || "broker_group");
  }

  const datasetMode = input.datasetMode || "broker_group";
  const parsedMessages = runMessageParser(input.message, input.lead);
  const leads = runLeadExtractor(parsedMessages, input, datasetMode);
  const normalizedLocations = runLocationNormalizer(leads);
  const scored = runSentimentPriorityScorer(leads, normalizedLocations, datasetMode);
  const summary = runSummaryGenerator(leads, normalizedLocations, scored, datasetMode);
  const actions = runActionSuggester(scored);
  const storage = runLeadStorage(leads, input.confirmationToken);

  return {
    dataset_mode: datasetMode,
    message_parser: parsedMessages,
    lead_extractor: leads,
    india_location_normalizer: {
      normalized_locations: normalizedLocations
    },
    sentiment_priority_scorer: {
      scored_leads: scored
    },
    summary_generator: {
      summary
    },
    action_suggester: actions,
    lead_storage: storage
  };
}

function isSkillPipelineEnabled(): boolean {
  const raw = String(process.env.SKILLS_PIPELINE_ENABLED || "true").trim().toLowerCase();
  if (!raw) return true;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return true;
}

function emptySkillPipeline(datasetMode: SkillDatasetMode): SkillPipelineResult {
  return {
    dataset_mode: datasetMode,
    message_parser: [],
    lead_extractor: [],
    india_location_normalizer: {
      normalized_locations: []
    },
    sentiment_priority_scorer: {
      scored_leads: []
    },
    summary_generator: {
      summary: zeroSummary(datasetMode)
    },
    action_suggester: [],
    lead_storage: {
      status: "failure",
      stored_ids: [],
      error_message: "skills_pipeline_disabled"
    }
  };
}

function runMessageParser(message: string, lead?: LeadInput): SkillParsedMessage[] {
  const content = String(message || "").trim();
  if (!content) return [];
  return [
    {
      timestamp: new Date().toISOString(),
      sender: normalizeSenderName(lead),
      content
    }
  ];
}

function runLeadExtractor(
  parsedMessages: SkillParsedMessage[],
  input: SkillPipelineInput,
  datasetMode: SkillDatasetMode
): SkillExtractedLead[] {
  const rows: SkillExtractedLead[] = [];
  for (let index = 0; index < parsedMessages.length; index += 1) {
    const row = parsedMessages[index];
    if (!looksLikeRealEstateSignal(row.content)) {
      continue;
    }

    const budget = detectBudget(row.content);
    const budgetValue = chooseBudgetValue(budget.min, budget.max);
    const propertyType = detectPropertyType(row.content);
    const urgency = detectUrgency(row.content);
    const bedrooms = detectBedrooms(row.content);
    const dealType = mapDealType(detectTransaction(row.content));
    const recordType = detectRecordType(row.content);
    const phone = extractPhone(row.content) || normalizePhone(input.recipient) || "unknown";
    const areaSqft = detectAreaSqft(row.content);
    const name = input.lead?.name || extractName(row.content) || row.sender || "Unknown";
    const city = detectCity(row.content);
    const locality = detectLocality(row.content);
    const leadId = buildLeadId(row.content, row.timestamp, index);

    rows.push({
      lead_id: leadId,
      dataset_mode: datasetMode,
      name,
      phone,
      record_type: recordType,
      property_type: propertyType,
      budget: budgetValue,
      deal_type: dealType,
      asset_class: propertyType === "commercial" ? "commercial" : "residential",
      price_basis: detectPriceBasis(row.content, dealType),
      area_sqft: areaSqft,
      area_basis: bedrooms ? "builtup" : "unknown",
      location_hint: locality || city,
      raw_text: row.content,
      source: "whatsapp",
      created_at: row.timestamp,
      urgency
    });
  }
  return dedupeLeads(rows);
}

function runLocationNormalizer(leads: SkillExtractedLead[]): SkillNormalizedLocation[] {
  const catalog = getAliasCatalog();
  return leads.map((lead) => normalizeLeadLocation(lead, catalog));
}

function runSentimentPriorityScorer(
  leads: SkillExtractedLead[],
  normalizedLocations: SkillNormalizedLocation[],
  datasetMode: SkillDatasetMode
): SkillScoredLead[] {
  const locationByLead = new Map<string, SkillNormalizedLocation>();
  for (const row of normalizedLocations) {
    locationByLead.set(row.lead_id, row);
  }

  return leads.map((lead) => {
    const sentimentScore = computeSentimentScore(lead.raw_text);
    const sentimentLabel = sentimentScore >= 0.2 ? "positive" : sentimentScore <= -0.2 ? "negative" : "neutral";
    const highActionCue = hasHighActionCue(lead.raw_text);
    const budgetCue = typeof lead.budget === "number" && lead.budget > 0;
    const intentLift = lead.record_type === "buyer_requirement" ? 0.1 : 0;
    const intentScore = clamp01(
      (lead.record_type === "buyer_requirement" ? 0.62 : 0.45) +
        intentLift +
        (highActionCue ? 0.18 : 0) +
        (budgetCue ? 0.08 : 0)
    );
    const recencyScore = computeRecencyScore(lead.created_at);
    const urgencyScore = mapUrgencyScore(lead.urgency);
    const sentimentRisk = Math.max(0, -sentimentScore);
    const priorityScore = clamp(
      100 * (0.4 * urgencyScore + 0.3 * intentScore + 0.2 * recencyScore + 0.1 * sentimentRisk),
      0,
      100
    );
    const bucket = toPriorityBucket(priorityScore);
    const location = locationByLead.get(lead.lead_id);

    const evidence: string[] = [
      `record_type:${lead.record_type}`,
      `urgency:${lead.urgency}`,
      `intent:${intentScore.toFixed(2)}`
    ];
    if (highActionCue) evidence.push("cue:high_action");
    if (budgetCue) evidence.push("cue:budget_present");
    if (location && !location.unresolved_flag) evidence.push(`locality:${location.locality_canonical}`);

    return {
      lead_id: lead.lead_id,
      dataset_mode: datasetMode,
      record_type: lead.record_type,
      sentiment_label: sentimentLabel,
      sentiment_score: round(sentimentScore, 3),
      intent_score: round(intentScore, 3),
      recency_score: round(recencyScore, 3),
      urgency_score: round(urgencyScore, 3),
      priority_score: round(priorityScore, 2),
      priority_bucket: bucket,
      evidence
    };
  });
}

function runSummaryGenerator(
  leads: SkillExtractedLead[],
  normalizedLocations: SkillNormalizedLocation[],
  scored: SkillScoredLead[],
  datasetMode: SkillDatasetMode
): SkillSummary {
  if (leads.length === 0) {
    return zeroSummary(datasetMode);
  }

  const recordTypeBreakdown = {
    inventory_listing: leads.filter((item) => item.record_type === "inventory_listing").length,
    buyer_requirement: leads.filter((item) => item.record_type === "buyer_requirement").length
  };

  const priorityBreakdown = {
    P1: scored.filter((item) => item.priority_bucket === "P1").length,
    P2: scored.filter((item) => item.priority_bucket === "P2").length,
    P3: scored.filter((item) => item.priority_bucket === "P3").length
  };

  const urgencyBreakdown = {
    high: leads.filter((item) => item.urgency === "high").length,
    medium: leads.filter((item) => item.urgency === "medium").length,
    low: leads.filter((item) => item.urgency === "low").length
  };

  const localityCount = new Map<string, number>();
  for (const location of normalizedLocations) {
    if (location.unresolved_flag) continue;
    localityCount.set(location.locality_canonical, (localityCount.get(location.locality_canonical) || 0) + 1);
  }
  const topLocalities = [...localityCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([locality, count]) => ({ locality, count }));

  const trends: string[] = [];
  if (priorityBreakdown.P1 > 0) trends.push(`${priorityBreakdown.P1} high-priority leads require immediate follow-up.`);
  if (recordTypeBreakdown.buyer_requirement > recordTypeBreakdown.inventory_listing) {
    trends.push("Buyer demand signals are higher than inventory posts.");
  }
  if (topLocalities.length > 0) {
    trends.push(`Top locality activity: ${topLocalities[0].locality}.`);
  }
  if (trends.length === 0) {
    trends.push("Lead flow is stable with no urgent hotspots.");
  }

  return {
    new_leads_count: leads.length,
    dataset_mode: datasetMode,
    trends,
    record_type_breakdown: recordTypeBreakdown,
    priority_breakdown: priorityBreakdown,
    urgency_breakdown: urgencyBreakdown,
    top_localities: topLocalities
  };
}

function runActionSuggester(scored: SkillScoredLead[]): SkillActionSuggestion[] {
  return [...scored]
    .sort((a, b) => b.priority_score - a.priority_score)
    .slice(0, 10)
    .map((lead) => {
      if (lead.priority_bucket === "P1") {
        return {
          action_type: "call",
          lead_id: lead.lead_id,
          description: "Call immediately, confirm budget and visit readiness."
        };
      }
      if (lead.priority_bucket === "P2") {
        return {
          action_type: "visit",
          lead_id: lead.lead_id,
          description: "Propose two site-visit slots within 48 hours."
        };
      }
      return {
        action_type: "email",
        lead_id: lead.lead_id,
        description: "Send structured summary and request missing preference details."
      };
    });
}

function runLeadStorage(leads: SkillExtractedLead[], confirmationToken?: string): SkillLeadStorageResult {
  if (!confirmationToken || confirmationToken.trim().length === 0) {
    return {
      status: "failure",
      stored_ids: [],
      error_message: "confirmation_token_required"
    };
  }

  return {
    status: "success",
    stored_ids: leads.map((lead) => lead.lead_id)
  };
}

function normalizeSenderName(lead?: LeadInput): string {
  const value = String(lead?.name || "").trim();
  if (value) return value;
  return "Unknown";
}

function looksLikeRealEstateSignal(text: string): boolean {
  return /\b(bhk|flat|apartment|villa|plot|office|commercial|rent|sale|buy|lease|property|listing|requirement|budget|sq ?ft)\b/i.test(
    text
  );
}

function extractPhone(text: string): string | undefined {
  const matches = text.match(/\+?\d[\d\s()-]{7,}\d/g);
  if (!matches) return undefined;
  for (const candidate of matches) {
    const normalized = normalizePhone(candidate);
    if (normalized) return normalized;
  }
  return undefined;
}

function normalizePhone(value: string | undefined): string | undefined {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 8 || digits.length > 15) return undefined;
  return `+${digits}`;
}

function extractName(text: string): string | undefined {
  const match = text.match(/\b(?:i am|this is|myself)\s+([a-z][a-z ]{1,40})\b/i);
  if (!match) return undefined;
  return titleCase(match[1]);
}

function chooseBudgetValue(minBudget?: number, maxBudget?: number): number | undefined {
  if (typeof minBudget === "number" && typeof maxBudget === "number") {
    return Math.round((minBudget + maxBudget) / 2);
  }
  if (typeof maxBudget === "number") return Math.round(maxBudget);
  if (typeof minBudget === "number") return Math.round(minBudget);
  return undefined;
}

function detectAreaSqft(text: string): number | undefined {
  const match = text.toLowerCase().match(/(\d{3,5})\s*(sq ?ft|sqft|sft|ft)\b/);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function detectRecordType(text: string): SkillRecordType {
  const lower = text.toLowerCase();
  if (/\b(required|requirement|looking for|need|want|buyer|chahiye)\b/.test(lower)) {
    return "buyer_requirement";
  }
  if (/\b(available|listing|for sale|resale|owner|inventory|rent out)\b/.test(lower)) {
    return "inventory_listing";
  }
  return "buyer_requirement";
}

function mapDealType(transaction: "buy" | "rent"): "sale" | "rent" | "lease" | "outright" | "unknown" {
  return transaction === "rent" ? "rent" : "sale";
}

function detectPriceBasis(text: string, dealType: string): "total" | "per_sqft" | "monthly_rent" | "deposit" | "unknown" {
  const lower = text.toLowerCase();
  if (/\b(psf|per\s*sq\.?\s*ft|per\s*sqft)\b/.test(lower)) {
    return "per_sqft";
  }
  if (dealType === "rent" || /\bper month|monthly|pm\b/.test(lower)) {
    return "monthly_rent";
  }
  if (/\bdeposit\b/.test(lower)) {
    return "deposit";
  }
  if (/\b(cr|crore|lakh|lac|inr|rs)\b/.test(lower)) {
    return "total";
  }
  return "unknown";
}

function buildLeadId(text: string, timestamp: string, index: number): string {
  const key = `${text}|${timestamp}|${index}`;
  const digest = createHash("sha1").update(key).digest("hex").slice(0, 12);
  return `lead_${digest}`;
}

function dedupeLeads(leads: SkillExtractedLead[]): SkillExtractedLead[] {
  const seen = new Set<string>();
  const out: SkillExtractedLead[] = [];
  for (const lead of leads) {
    const key = `${lead.phone}|${lead.record_type}|${normalizeForMatch(lead.raw_text)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(lead);
  }
  return out;
}

function getAliasCatalog(): AliasCatalog {
  if (aliasCatalogCache) return aliasCatalogCache;
  const fallback: AliasCatalog = {
    cities: {}
  };

  try {
    const path = resolve(
      process.cwd(),
      "skills",
      "india-location-normalizer",
      "references",
      "india-location-aliases-v1.json"
    );
    const payload = JSON.parse(readFileSync(path, "utf8")) as {
      cities?: Record<string, LocationCityEntry>;
    };
    aliasCatalogCache = {
      cities: payload.cities || {}
    };
    return aliasCatalogCache;
  } catch {
    aliasCatalogCache = fallback;
    return aliasCatalogCache;
  }
}

function normalizeLeadLocation(lead: SkillExtractedLead, catalog: AliasCatalog): SkillNormalizedLocation {
  const locationText = String(lead.location_hint || lead.raw_text || "").trim();
  const textLower = locationText.toLowerCase();
  const textNormalized = normalizeForMatch(locationText);

  const matches: Array<{
    city: "Mumbai" | "Pune";
    locality: string;
    microMarket: string;
    matchedAlias: string;
    method: "exact_alias" | "normalized_alias";
    confidence: number;
  }> = [];

  for (const [cityName, cityRow] of Object.entries(catalog.cities)) {
    const cityCanonical = toCanonicalCity(cityName);
    if (cityCanonical === "Unknown") continue;

    for (const locality of cityRow.localities || []) {
      for (const alias of locality.aliases || []) {
        const aliasLower = alias.toLowerCase();
        if (containsAlias(textLower, aliasLower)) {
          matches.push({
            city: cityCanonical,
            locality: locality.canonical,
            microMarket: locality.micro_market,
            matchedAlias: alias,
            method: "exact_alias",
            confidence: 0.96
          });
          continue;
        }
        const aliasNormalized = normalizeForMatch(alias);
        if (aliasNormalized && textNormalized.includes(aliasNormalized)) {
          matches.push({
            city: cityCanonical,
            locality: locality.canonical,
            microMarket: locality.micro_market,
            matchedAlias: alias,
            method: "normalized_alias",
            confidence: 0.85
          });
        }
      }
    }
  }

  const ranked = matches.sort((a, b) => {
    const conf = b.confidence - a.confidence;
    if (conf !== 0) return conf;
    return b.matchedAlias.length - a.matchedAlias.length;
  });

  if (ranked.length > 0) {
    const top = ranked[0];
    const second = ranked[1];
    const ambiguous =
      Boolean(second) &&
      second.confidence === top.confidence &&
      second.locality !== top.locality;
    return {
      lead_id: lead.lead_id,
      city: top.city,
      locality_canonical: top.locality,
      micro_market: top.microMarket,
      matched_alias: top.matchedAlias,
      confidence: ambiguous ? 0.7 : top.confidence,
      unresolved_flag: ambiguous,
      resolution_method: ambiguous ? "unresolved" : top.method
    };
  }

  const fallbackCity = toCanonicalCityFromSignal(locationText);
  const fallbackAlias = String(lead.location_hint || "unknown");
  return {
    lead_id: lead.lead_id,
    city: fallbackCity,
    locality_canonical: fallbackAlias || "unknown",
    micro_market: "Unknown",
    matched_alias: fallbackAlias || "unknown",
    confidence: fallbackCity === "Unknown" ? 0 : 0.45,
    unresolved_flag: true,
    resolution_method: "unresolved"
  };
}

function containsAlias(textLower: string, aliasLower: string): boolean {
  if (!aliasLower) return false;
  const escaped = escapeRegex(aliasLower);
  const pattern = new RegExp(`(^|\\b)${escaped}(\\b|$)`);
  return pattern.test(textLower);
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function toCanonicalCity(value: string): "Mumbai" | "Pune" | "Unknown" {
  const normalized = normalizeForMatch(value);
  if (normalized === "mumbai") return "Mumbai";
  if (normalized === "pune") return "Pune";
  return "Unknown";
}

function toCanonicalCityFromSignal(text: string): "Mumbai" | "Pune" | "Unknown" {
  const city = detectCity(text);
  if (city === "mumbai") return "Mumbai";
  if (city === "pune") return "Pune";
  return "Unknown";
}

function computeSentimentScore(text: string): number {
  const lower = text.toLowerCase();
  let score = 0;
  if (/\b(thanks|great|good|interested|please|ready)\b/.test(lower)) score += 0.3;
  if (/\b(urgent|immediate|asap)\b/.test(lower)) score -= 0.1;
  if (/\b(bad|worst|angry|complaint|fraud|scam|fake)\b/.test(lower)) score -= 0.6;
  return clamp(score, -1, 1);
}

function hasHighActionCue(text: string): boolean {
  return /\b(immediately|keys?\s+at\s+office|one day notice|possession|inspection|site visit|call now)\b/i.test(
    text
  );
}

function computeRecencyScore(createdAtIso: string): number {
  const createdMs = Date.parse(createdAtIso);
  if (!Number.isFinite(createdMs)) return 0.4;
  const ageHours = Math.max(0, (Date.now() - createdMs) / (1000 * 60 * 60));
  if (ageHours <= 1) return 1;
  if (ageHours <= 6) return 0.9;
  if (ageHours <= 24) return 0.75;
  if (ageHours <= 72) return 0.55;
  return 0.3;
}

function mapUrgencyScore(urgency: SkillUrgency): number {
  if (urgency === "high") return 1;
  if (urgency === "medium") return 0.6;
  return 0.3;
}

function toPriorityBucket(score: number): SkillPriorityBucket {
  if (score >= 75) return "P1";
  if (score >= 50) return "P2";
  return "P3";
}

function titleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function zeroSummary(datasetMode: SkillDatasetMode): SkillSummary {
  return {
    new_leads_count: 0,
    dataset_mode: datasetMode,
    trends: ["No lead candidates detected in this request."],
    record_type_breakdown: {
      inventory_listing: 0,
      buyer_requirement: 0
    },
    priority_breakdown: {
      P1: 0,
      P2: 0,
      P3: 0
    },
    urgency_breakdown: {
      high: 0,
      medium: 0,
      low: 0
    },
    top_localities: []
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function round(value: number, precision: number): number {
  const base = 10 ** precision;
  return Math.round(value * base) / base;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
