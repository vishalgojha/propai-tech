import type { LeadInput, PropertyMatch } from "../types.js";

export type ToolName =
  | "post_to_99acres"
  | "match_property_to_buyer"
  | "send_whatsapp_followup"
  | "schedule_site_visit"
  | "generate_performance_report";

export type ChatRequest = {
  message: string;
  lead?: LeadInput;
  recipient?: string;
  dryRun?: boolean;
  model?: string;
};

export type PlannedToolCall = {
  tool: ToolName;
  reason: string;
};

export type ToolExecutionRecord = {
  tool: ToolName;
  ok: boolean;
  summary: string;
  data?: unknown;
};

export type ChatResponse = {
  assistantMessage: string;
  plan: PlannedToolCall[];
  toolResults: ToolExecutionRecord[];
  suggestedNextPrompts: string[];
};

export type PropertyPostDraft = {
  title: string;
  city: string;
  locality: string;
  propertyType: "apartment" | "villa" | "plot" | "commercial";
  transaction: "buy" | "rent";
  bedrooms?: number;
  areaSqft?: number;
  priceInr?: number;
  amenities: string[];
};

export type PostedListing = {
  id: string;
  portal: "99acres";
  status: "active";
  createdAtIso: string;
  draft: PropertyPostDraft;
};

export type ScheduledVisit = {
  id: string;
  leadName: string;
  locality: string;
  whenIso: string;
};

export type MatchResultPayload = {
  lead: LeadInput;
  matches: PropertyMatch[];
};
