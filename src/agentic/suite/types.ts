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

export type GuidedFlowId = "publish_listing";

export type GuidedStepKind = "text" | "number" | "single_select";

export type GuidedAnswerValue = string | number | boolean | string[];

export type GuidedStepOption = {
  value: string;
  label: string;
};

export type GuidedFlowStepView = {
  id: string;
  label: string;
  prompt: string;
  kind: GuidedStepKind;
  required: boolean;
  placeholder?: string;
  options?: GuidedStepOption[];
  answered: boolean;
  answer?: GuidedAnswerValue;
  isCurrent: boolean;
  order: number;
};

export type GuidedFlowSuggestedExecution = {
  method: "POST";
  endpoint: string;
  payload: ChatRequest & { autonomy: AutonomyLevel };
};

export type GuidedFlowCompletion = {
  generatedMessage: string;
  request: ChatRequest;
  recommendedPlan: PlannedToolCall[];
  suggestedExecution: GuidedFlowSuggestedExecution;
};

export type GuidedFlowProgress = {
  flowId: GuidedFlowId;
  status: "active" | "completed";
  startedAtIso: string;
  updatedAtIso: string;
  completedAtIso?: string;
  currentStepIndex: number;
  answers: Record<string, GuidedAnswerValue>;
};

export type GuidedFlowState = {
  flowId: GuidedFlowId;
  flowLabel: string;
  status: "active" | "completed";
  startedAtIso: string;
  updatedAtIso: string;
  completedAtIso?: string;
  progressPercent: number;
  currentStepId?: string;
  currentPrompt?: string;
  steps: GuidedFlowStepView[];
  answers: Record<string, GuidedAnswerValue>;
  completion?: GuidedFlowCompletion;
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
  guidedFlow: GuidedFlowState | null;
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
