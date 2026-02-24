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
  return runPostToPortal(input, "99acres");
}

export async function runPostToMagicBricks(input: ChatRequest): Promise<ToolExecutionRecord> {
  return runPostToPortal(input, "magicbricks");
}

async function runPostToPortal(
  input: ChatRequest,
  portal: "99acres" | "magicbricks"
): Promise<ToolExecutionRecord> {
  const tool = portal === "magicbricks" ? "post_to_magicbricks" : "post_to_99acres";
  const draft = extractPropertyDraft(input.message);
  const publish =
    portal === "magicbricks"
      ? await propaiLiveAdapter.publishToMagicBricks({
          draft,
          dryRun: input.dryRun
        })
      : await propaiLiveAdapter.publishTo99Acres({
          draft,
          dryRun: input.dryRun
        });

  if (!publish.ok) {
    return {
      tool,
      ok: false,
      summary: publish.summary,
      data: { publish }
    };
  }

  const record = await store.createListing(draft, portal);

  return {
    tool,
    ok: true,
    summary: `Posted "${draft.title}" to ${portal} as listing ${record.id}. (${publish.status})`,
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

export async function runGroupRequirementMatchScan(input: ChatRequest): Promise<ToolExecutionRecord> {
  const message = input.message.toLowerCase();
  const lead = input.lead || {
    message: input.message,
    name: "Group Lead",
    preferredLanguage: "hinglish"
  };
  const qualification = intake.qualify(lead);
  const matches = matcher.shortlist(qualification.requirement, 5);

  const requiresApproval = /\b(auto[\s-]?send|broadcast|blast|mass message)\b/.test(message);
  const summary =
    matches.length > 0
      ? `Scanned group requirement and found ${matches.length} candidate matches. ${requiresApproval ? "Auto-send requested: blocked pending human approval." : "Ready for broker review."}`
      : "Scanned group requirement but no strong matches found.";

  return {
    tool: "group_requirement_match_scan",
    ok: true,
    summary,
    data: {
      requiresApproval,
      lead,
      matches
    }
  };
}

export async function runAdsLeadQualification(input: ChatRequest): Promise<ToolExecutionRecord> {
  const lead = input.lead || {
    message: input.message,
    name: "Ads Lead",
    preferredLanguage: "hinglish"
  };
  const qualification = intake.qualify(lead);
  const score = Math.max(0, Math.min(100, qualification.requirement.confidence || 50));
  const stage = score >= 75 ? "hot" : score >= 45 ? "warm" : "cold";
  const nextAction =
    stage === "hot"
      ? "Call within 15 minutes and share 2 best-fit properties."
      : stage === "warm"
        ? "Send WhatsApp shortlist and schedule follow-up in 24 hours."
        : "Start nurture sequence and collect missing requirements.";

  return {
    tool: "ads_lead_qualification",
    ok: true,
    summary: `Qualified ads lead as ${stage.toUpperCase()} (${score}/100). ${nextAction}`,
    data: {
      stage,
      score,
      nextAction,
      requirement: qualification.requirement,
      reasons: [
        `Confidence: ${score}/100`,
        "Budget/location clarity and urgency influence score."
      ]
    }
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

  const byPortal = listings.reduce<Record<string, number>>((acc, item) => {
    acc[item.portal] = (acc[item.portal] || 0) + 1;
    return acc;
  }, {});

  const portalSummary = Object.entries(byPortal)
    .map(([portal, count]) => `${count} ${portal}`)
    .join(", ");

  return {
    tool: "generate_performance_report",
    ok: true,
    summary: `Performance snapshot: ${activeListings} active listings (${portalSummary || "no portal data"}), ${visits.length} scheduled site visits.`,
    data: {
      timestampIso: new Date().toISOString(),
      activeListings,
      totalListings: listings.length,
      scheduledVisits: visits.length,
      listingsByLocality: byLocality,
      listingsByPortal: byPortal
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
