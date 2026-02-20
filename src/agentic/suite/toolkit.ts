import { FollowUpAgent } from "../agents/follow-up-agent.js";
import { LeadIntakeAgent } from "../agents/lead-intake-agent.js";
import { PropertyMatchAgent } from "../agents/property-match-agent.js";
import { WacliTool } from "../tools/wacli-tool.js";
import { detectBedrooms, detectBudget, detectCity, detectLocality, detectPropertyType, detectTransaction, formatInr } from "../utils/parse.js";
import { INDIAN_PROPERTIES } from "../data/indian-properties.js";
import { getSuiteStore } from "./store.js";
import { getPropaiLiveAdapter } from "./propai-live-bridge.js";
import type {
  ChatRequest,
  MatchResultPayload,
  PropertyPostDraft,
  ToolExecutionRecord
} from "./types.js";

const intake = new LeadIntakeAgent();
const matcher = new PropertyMatchAgent();
const followUp = new FollowUpAgent();
const store = getSuiteStore();
const propaiLiveAdapter = getPropaiLiveAdapter();

export async function runPostTo99Acres(input: ChatRequest): Promise<ToolExecutionRecord> {
  const draft = extractPropertyDraft(input.message);
  const publish = await propaiLiveAdapter.publishTo99Acres({
    draft,
    dryRun: input.dryRun
  });

  if (!publish.ok) {
    return {
      tool: "post_to_99acres",
      ok: false,
      summary: publish.summary,
      data: { publish }
    };
  }

  const record = await store.createListing(draft);

  return {
    tool: "post_to_99acres",
    ok: true,
    summary: `Posted "${draft.title}" to 99acres as listing ${record.id}. (${publish.status})`,
    data: {
      record,
      publish
    }
  };
}

export async function runMatchPropertyToBuyer(input: ChatRequest): Promise<ToolExecutionRecord> {
  const lead = input.lead || {
    message: input.message,
    name: "Prospect",
    preferredLanguage: "hinglish"
  };
  const qualification = intake.qualify(lead);
  const matches = matcher.shortlist(qualification.requirement, 3);
  const payload: MatchResultPayload = { lead, matches };

  return {
    tool: "match_property_to_buyer",
    ok: matches.length > 0,
    summary:
      matches.length > 0
        ? `Shortlisted ${matches.length} properties. Top option: ${matches[0].property.title} (${formatInr(matches[0].property.priceInr)}).`
        : "No strong property matches found. Need tighter city/locality/budget details.",
    data: payload
  };
}

export async function runSendWhatsappFollowup(input: ChatRequest): Promise<ToolExecutionRecord> {
  const lead = input.lead || {
    message: input.message,
    name: "Prospect",
    preferredLanguage: "hinglish"
  };

  const qualification = intake.qualify(lead);
  const matches = matcher.shortlist(qualification.requirement, 3);
  const composed = followUp.compose(lead, qualification.requirement, matches);

  if (!input.recipient) {
    return {
      tool: "send_whatsapp_followup",
      ok: true,
      summary: "Drafted WhatsApp follow-up message. Recipient missing, so message was not sent.",
      data: { message: composed.draftMessage, nextActions: composed.nextActions }
    };
  }

  const wacli = new WacliTool({ dryRun: input.dryRun });
  const send = await wacli.sendText(input.recipient, composed.draftMessage);

  return {
    tool: "send_whatsapp_followup",
    ok: send.ok,
    summary: send.ok
      ? `WhatsApp follow-up sent to ${input.recipient}.`
      : `WhatsApp follow-up failed for ${input.recipient}.`,
    data: {
      message: composed.draftMessage,
      command: send.command,
      stdout: send.stdout,
      stderr: send.stderr
    }
  };
}

export async function runScheduleSiteVisit(input: ChatRequest): Promise<ToolExecutionRecord> {
  const leadName = input.lead?.name || "Prospect";
  const locality = detectLocality(input.message) || input.lead?.city || "preferred locality";
  const whenIso = detectVisitDate(input.message);

  const visit = await store.createVisit({
    leadName,
    locality,
    whenIso
  });

  return {
    tool: "schedule_site_visit",
    ok: true,
    summary: `Site visit ${visit.id} scheduled for ${leadName} in ${locality} at ${visit.whenIso}.`,
    data: visit
  };
}

export async function runGeneratePerformanceReport(): Promise<ToolExecutionRecord> {
  const listings = await store.getListings();
  const visits = await store.getVisits();
  const activeListings = listings.filter((item) => item.status === "active").length;

  const byLocality = listings.reduce<Record<string, number>>((acc, item) => {
    acc[item.draft.locality] = (acc[item.draft.locality] || 0) + 1;
    return acc;
  }, {});

  return {
    tool: "generate_performance_report",
    ok: true,
    summary: `Performance snapshot: ${activeListings} active 99acres listings, ${visits.length} scheduled site visits.`,
    data: {
      timestampIso: new Date().toISOString(),
      activeListings,
      totalListings: listings.length,
      scheduledVisits: visits.length,
      listingsByLocality: byLocality
    }
  };
}

function extractPropertyDraft(message: string): PropertyPostDraft {
  const city = detectCity(message) || "pune";
  const locality = detectLocality(message) || "wakad";
  const propertyType = detectPropertyType(message) || "apartment";
  const transaction = detectTransaction(message);
  const bedrooms = detectBedrooms(message);
  const budget = detectBudget(message);
  const parsedPrice = budget.max || budget.min;
  const priceInr = parsedPrice && parsedPrice >= 500000 ? parsedPrice : undefined;

  const seed = INDIAN_PROPERTIES.find((property) => property.city === city && property.locality === locality);
  const areaSqft = seed?.areaSqft;
  const amenities = seed?.amenities || ["gated community", "security", "parking"];
  const bhkText = bedrooms ? `${bedrooms} BHK ` : "";
  const title = `${bhkText}${capitalize(propertyType)} in ${capitalize(locality)}`.trim();

  return {
    title,
    city,
    locality,
    propertyType,
    transaction,
    bedrooms,
    areaSqft,
    priceInr,
    amenities
  };
}

function detectVisitDate(message: string): string {
  const lower = message.toLowerCase();
  const now = new Date();

  if (/\btomorrow\b/.test(lower)) {
    now.setDate(now.getDate() + 1);
    return now.toISOString();
  }

  const inDays = lower.match(/\bin\s+(\d+)\s+days?\b/);
  if (inDays) {
    now.setDate(now.getDate() + Number(inDays[1]));
    return now.toISOString();
  }

  now.setDate(now.getDate() + 2);
  return now.toISOString();
}

function capitalize(value: string): string {
  if (!value) return value;
  return value[0].toUpperCase() + value.slice(1);
}
