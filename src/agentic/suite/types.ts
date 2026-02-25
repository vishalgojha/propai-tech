import type { LeadInput, PropertyMatch } from "../types.js";
import type { SkillPipelineResult } from "../skills/pipeline.js";

export type ToolName =
  | "post_to_99acres"
  | "post_to_magicbricks"
  | "match_property_to_buyer"
  | "group_requirement_match_scan"
  | "ads_lead_qualification"
  | "send_whatsapp_followup"
  | "schedule_site_visit"
  | "generate_performance_report";

export type ToolRisk = "low" | "medium" | "high";

export type ToolActionScope = "read" | "local_write" | "external_write";

export type ToolPolicy = {
  risk: ToolRisk;
  actionScope: ToolActionScope;
  approvalRequiredByDefault: boolean;
};

export type ListingPortal = "99acres" | "magicbricks";

export type ChatRequest = {
  message: string;
  lead?: LeadInput;
  recipient?: string;
  dryRun?: boolean;
  model?: string;
};

export type AutonomyLevel = 0 | 1 | 2;

export type PlannedToolCall = {
  tool: ToolName;
  reason: string;
};

export type ToolExecutionRecord = {
  tool: ToolName;
  ok: boolean;
  summary: string;
  data?: unknown;
  risk?: ToolRisk;
};

export type AgentActionEventType = "guardrail" | "plan" | "tool_result" | "assistant";

export type AgentActionEventStatus = "planned" | "ok" | "failed" | "blocked" | "info";

export type AgentActionEvent = {
  type: AgentActionEventType;
  status: AgentActionEventStatus;
  timestampIso: string;
  step?: ToolName;
  payload: unknown;
};

export type ChatResponse = {
  assistantMessage: string;
  plan: PlannedToolCall[];
  toolResults: ToolExecutionRecord[];
  events: AgentActionEvent[];
  suggestedNextPrompts: string[];
  skillsPipeline?: SkillPipelineResult;
};

export type SessionMessageRole = "user" | "assistant" | "system";

export type SessionMessage = {
  role: SessionMessageRole;
  content: string;
  timestampIso: string;
};

export type PendingToolAction = {
  id: string;
  step: PlannedToolCall;
  request: ChatRequest;
  createdAtIso: string;
};

export type PendingToolActionView = {
  id: string;
  tool: ToolName;
  reason: string;
  requestMessage: string;
  createdAtIso: string;
  risk?: ToolRisk;
};

export type AgentSessionSnapshot = {
  id: string;
  createdAtIso: string;
  updatedAtIso: string;
  turns: number;
  pendingActions: PendingToolActionView[];
  transcript: SessionMessage[];
};

export type AgentSessionTurnResponse = {
  assistantMessage: string;
  note?: string;
  plan: PlannedToolCall[];
  toolResults: ToolExecutionRecord[];
  queuedActions: PendingToolActionView[];
  blockedTools: ToolName[];
  pendingActions: PendingToolActionView[];
  suggestedNextPrompts: string[];
  skillsPipeline?: SkillPipelineResult;
};

export type SessionExecutionRecord = {
  actionId: string;
  tool: ToolName;
  ok: boolean;
  summary: string;
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
  portal: ListingPortal;
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
