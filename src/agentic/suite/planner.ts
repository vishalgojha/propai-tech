import type { PlannedToolCall, ToolName } from "./types.js";

const TOOL_ORDER: ToolName[] = [
  "group_requirement_match_scan",
  "ads_lead_qualification",
  "match_property_to_buyer",
  "post_to_99acres",
  "post_to_magicbricks",
  "send_whatsapp_followup",
  "schedule_site_visit",
  "generate_performance_report"
];

export function planToolCalls(message: string): PlannedToolCall[] {
  const lower = message.toLowerCase();
  const planned = new Map<ToolName, string>();

  if (/\b(match|shortlist|find)\b/.test(lower) && /\b(property|properties|home|flat|villa)\b/.test(lower)) {
    planned.set("match_property_to_buyer", "User asked to shortlist or match properties.");
  }

  if (
    /\b(whatsapp group|group scan|group monitoring|monitor groups|broker group)\b/.test(lower) &&
    /\b(match|requirement|property|lead)\b/.test(lower)
  ) {
    planned.set(
      "group_requirement_match_scan",
      "User asked to monitor WhatsApp groups and match broker requirements with properties."
    );
  }

  if (/\b(lead qualify|qualification|qualify lead|ads lead|campaign lead)\b/.test(lower)) {
    planned.set("ads_lead_qualification", "User asked to qualify incoming ad leads.");
  }

  if (/\b(post|publish|list)\b/.test(lower) && /\b99acres\b/.test(lower)) {
    planned.set("post_to_99acres", "User asked to publish a listing to 99acres.");
  }

  if (/\b(post|publish|list)\b/.test(lower) && /\bmagic\s*bricks?\b/.test(lower)) {
    planned.set("post_to_magicbricks", "User asked to publish a listing to MagicBricks.");
  }

  if (/\b(whatsapp|follow[\s-]?up|broadcast|nurture)\b/.test(lower)) {
    planned.set("send_whatsapp_followup", "User asked for WhatsApp outreach or follow-up.");
  }

  if (/\b(schedule|book|arrange)\b/.test(lower) && /\b(site visit|visit)\b/.test(lower)) {
    planned.set("schedule_site_visit", "User asked to set up a site visit.");
  }

  if (/\b(report|analytics|roi|performance|summary)\b/.test(lower)) {
    planned.set("generate_performance_report", "User asked for campaign/listing performance.");
  }

  const ordered = TOOL_ORDER.filter((name) => planned.has(name));
  return ordered.map((tool) => ({ tool, reason: planned.get(tool) || "" }));
}
