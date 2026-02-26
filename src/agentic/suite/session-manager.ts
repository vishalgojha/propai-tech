import { EventEmitter } from "node:events";
import { generateAssistantText } from "../../llm/chat.js";
import { evaluateGuardrails } from "./guardrails.js";
import {
  answerGuidedFlowProgress,
  createGuidedFlowProgress,
  toGuidedFlowState
} from "./guided-flows.js";
import { planToolCalls } from "./planner.js";
import { getToolPolicy, isExternalActionTool, requiresToolApproval } from "./tool-policy.js";
import { getSuiteStore } from "./store.js";
import { getSuiteSessionStore } from "./session-store.js";
import { runSkillPipeline } from "../skills/pipeline.js";
import {
  runAdsLeadQualification,
  runGeneratePerformanceReport,
  runGroupRequirementMatchScan,
  runMatchPropertyToBuyer,
  runPostToMagicBricks,
  runPostTo99Acres,
  runScheduleSiteVisit,
  runSendWhatsappFollowup
} from "./toolkit.js";
import type {
  AgentSessionSnapshot,
  AgentSessionTurnResponse,
  AutonomyLevel,
  ChatRequest,
  GuidedFlowId,
  GuidedFlowProgress,
  GuidedFlowState,
  PendingToolAction,
  PendingToolActionView,
  PlannedToolCall,
  SessionExecutionRecord,
  SessionMessage,
  ToolExecutionRecord,
  ToolName
} from "./types.js";

type AgentSessionRecord = {
  id: string;
  createdAtIso: string;
  updatedAtIso: string;
  turns: number;
  pendingActions: PendingToolAction[];
  guidedFlow: GuidedFlowProgress | null;
  transcript: SessionMessage[];
};

type SessionStartInput = {
  sessionId?: string;
};

type GuidedStartInput = {
  flowId: GuidedFlowId;
};

type GuidedAnswerInput = {
  stepId: string;
  answer: unknown;
};

type ApproveInput = {
  actionId?: string;
  all?: boolean;
};

type RejectInput = {
  actionId?: string;
  all?: boolean;
};

type SessionApproveResult = {
  executed: SessionExecutionRecord[];
  pendingActions: PendingToolActionView[];
};

type SessionRejectResult = {
  removedActionIds: string[];
  pendingActions: PendingToolActionView[];
};

const SUGGESTED_PROMPTS_WITH_PLAN = [
  "Approve the queued site visit action",
  "Approve publish action for the top listing",
  "Reject unsafe actions and continue with lead qualification"
];

const SUGGESTED_PROMPTS_NO_PLAN = [
  "Scan WhatsApp broker groups for new requirements and map matching inventory",
  "Qualify this ads lead and suggest next action",
  "Generate performance report for current listings"
];

export class RealtorSuiteSessionManager {
  private readonly sessions = new Map<string, AgentSessionRecord>();
  private readonly store = getSuiteStore();
  private readonly sessionStore = getSuiteSessionStore();
  private readonly events = new EventEmitter();

  async start(input: SessionStartInput = {}): Promise<AgentSessionSnapshot> {
    const id = normalizeSessionId(input.sessionId) || createSessionId();
    let session = await this.getRecord(id);
    if (!session) {
      const nowIso = new Date().toISOString();
      session = {
        id,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
        turns: 0,
        pendingActions: [],
        guidedFlow: null,
        transcript: []
      };
      await this.saveRecord(session);
      return toSnapshot(session);
    }

    session.updatedAtIso = new Date().toISOString();
    await this.saveRecord(session);
    return toSnapshot(session);
  }

  async get(sessionId: string): Promise<AgentSessionSnapshot | null> {
    const id = normalizeSessionId(sessionId);
    const session = await this.getRecord(id);
    if (!session) return null;
    return toSnapshot(session);
  }

  async list(): Promise<AgentSessionSnapshot[]> {
    const sessions = await this.sessionStore.list(100);
    for (const session of sessions) {
      this.sessions.set(session.id, session);
    }

    return sessions
      .sort((a, b) => Date.parse(b.updatedAtIso) - Date.parse(a.updatedAtIso))
      .map((session) => toSnapshot(session));
  }

  async startGuidedFlow(
    sessionId: string,
    input: GuidedStartInput
  ): Promise<{ session: AgentSessionSnapshot; guidedFlow: GuidedFlowState }> {
    const session = await this.requireSession(sessionId);
    session.guidedFlow = createGuidedFlowProgress(input.flowId);
    appendTranscript(session, "system", `Started guided flow: ${input.flowId}.`);
    await this.saveRecord(session);

    return {
      session: toSnapshot(session),
      guidedFlow: toGuidedFlowState(session.guidedFlow, session.id)
    };
  }

  async getGuidedFlow(
    sessionId: string
  ): Promise<{ session: AgentSessionSnapshot; guidedFlow: GuidedFlowState | null }> {
    const session = await this.requireSession(sessionId);
    return {
      session: toSnapshot(session),
      guidedFlow: session.guidedFlow ? toGuidedFlowState(session.guidedFlow, session.id) : null
    };
  }

  async answerGuidedFlow(
    sessionId: string,
    input: GuidedAnswerInput
  ): Promise<{ session: AgentSessionSnapshot; guidedFlow: GuidedFlowState }> {
    const session = await this.requireSession(sessionId);
    if (!session.guidedFlow) {
      throw new Error("guided_flow_not_started");
    }

    const answerResult = answerGuidedFlowProgress(session.guidedFlow, input.stepId, input.answer);
    if (!answerResult.ok) {
      throw new Error(answerResult.error);
    }

    session.guidedFlow = answerResult.progress;
    if (session.guidedFlow.status === "completed") {
      appendTranscript(session, "system", `Completed guided flow: ${session.guidedFlow.flowId}.`);
    }

    await this.saveRecord(session);
    return {
      session: toSnapshot(session),
      guidedFlow: toGuidedFlowState(session.guidedFlow, session.id)
    };
  }

  onSessionUpdate(
    sessionId: string,
    listener: (snapshot: AgentSessionSnapshot) => void
  ): () => void {
    const key = normalizeSessionId(sessionId);
    const eventName = sessionEventName(key);
    const wrapped = (snapshot: AgentSessionSnapshot) => listener(snapshot);
    this.events.on(eventName, wrapped);
    return () => {
      this.events.off(eventName, wrapped);
    };
  }

  async handleMessage(
    sessionId: string,
    input: ChatRequest,
    autonomy: AutonomyLevel
  ): Promise<{ session: AgentSessionSnapshot; response: AgentSessionTurnResponse }> {
    const session = await this.requireSession(sessionId);
    appendTranscript(session, "user", input.message);
    session.turns += 1;

    const guardrail = evaluateGuardrails(input);
    if (!guardrail.allow) {
      const assistantMessage = guardrail.reason || "Request blocked by policy guardrails.";
      appendTranscript(session, "assistant", assistantMessage);
      await this.saveRecord(session);
      return {
        session: toSnapshot(session),
        response: {
          assistantMessage,
          note: "Guardrail blocked execution.",
          plan: [],
          toolResults: [],
          queuedActions: [],
          blockedTools: [],
          pendingActions: toPendingViews(session.pendingActions),
          suggestedNextPrompts: [
            "Qualify this new ads lead for budget, location, and urgency",
            "Scan broker group requirement and suggest top 3 matching properties",
            "Draft a compliant follow-up message for a warm lead"
          ]
        }
      };
    }

    const skillsPipeline = runSkillPipeline({
      message: input.message,
      lead: input.lead,
      recipient: input.recipient
    });

    const plan = planToolCalls(input.message);
    if (plan.length === 0) {
      const note = "No tool plan triggered.";
      const assistantMessage = await buildAssistantMessage(input, plan, [], note);
      appendTranscript(session, "assistant", assistantMessage);
      await this.saveRecord(session);
      return {
        session: toSnapshot(session),
        response: {
          assistantMessage,
          note,
          plan,
          toolResults: [],
          queuedActions: [],
          blockedTools: [],
          pendingActions: toPendingViews(session.pendingActions),
          suggestedNextPrompts: SUGGESTED_PROMPTS_NO_PLAN,
          skillsPipeline
        }
      };
    }

    if (session.guidedFlow && session.guidedFlow.status === "active") {
      const guidedState = toGuidedFlowState(session.guidedFlow, session.id);
      const blockedTools = plan.map((step) => step.tool);
      const toolResults: ToolExecutionRecord[] = plan.map((step) => ({
        tool: step.tool,
        ok: false,
        risk: getToolPolicy(step.tool).risk,
        summary: `Blocked: complete guided step '${guidedState.currentStepId || "next"}' before execution.`
      }));

      const note = `Guided flow active. Complete step ${guidedState.currentStepId || "next"} first.`;
      const assistantMessage = `Guided flow "${guidedState.flowLabel}" is still in progress. ${guidedState.currentPrompt || "Complete the next step and retry."}`;
      appendTranscript(session, "assistant", assistantMessage);
      await this.saveRecord(session);
      return {
        session: toSnapshot(session),
        response: {
          assistantMessage,
          note,
          plan,
          toolResults,
          queuedActions: [],
          blockedTools,
          pendingActions: toPendingViews(session.pendingActions),
          suggestedNextPrompts: [
            "Run guided answer with the current step id",
            "Check guided flow state and progress",
            "Execute generated request after guided flow completion"
          ],
          skillsPipeline
        }
      };
    }

    const queuedActions: PendingToolActionView[] = [];
    const blockedTools: ToolName[] = [];
    const toolResults: ToolExecutionRecord[] = [];

    if (autonomy === 0) {
      const note = "Autonomy L0 suggest-only: tools were planned but not executed.";
      const assistantMessage = await buildAssistantMessage(input, plan, toolResults, note);
      appendTranscript(session, "assistant", assistantMessage);
      await this.saveRecord(session);
      return {
        session: toSnapshot(session),
        response: {
          assistantMessage,
          note,
          plan,
          toolResults,
          queuedActions,
          blockedTools,
          pendingActions: toPendingViews(session.pendingActions),
          suggestedNextPrompts: SUGGESTED_PROMPTS_WITH_PLAN,
          skillsPipeline
        }
      };
    }

    for (const step of plan) {
      const policy = getToolPolicy(step.tool);
      if (isExternalActionTool(step.tool, input) && autonomy < 2) {
        blockedTools.push(step.tool);
        toolResults.push({
          tool: step.tool,
          ok: false,
          risk: policy.risk,
          summary: `Blocked: ${policy.risk}-risk external action requires autonomy 2.`
        });
        continue;
      }

      if (requiresToolApproval(step.tool, input)) {
        const queued = queueAction(session, step, input);
        queuedActions.push(toPendingView(queued));
        toolResults.push({
          tool: step.tool,
          risk: policy.risk,
          ok: true,
          summary: `Queued for approval as ${queued.id} (${policy.risk} risk).`
        });
        continue;
      }

      const result = await executeStep(step, input);
      const normalizedResult = { ...result, risk: getToolPolicy(step.tool).risk };
      toolResults.push(normalizedResult);
      await this.store.addAgentAction({
        step,
        result: normalizedResult,
        request: input
      });
    }

    const note =
      queuedActions.length > 0
        ? "Some actions are queued for approval."
        : blockedTools.length > 0
          ? "Some actions were blocked by autonomy settings."
          : "Plan executed.";

    const assistantMessage = await buildAssistantMessage(input, plan, toolResults, note);
    appendTranscript(session, "assistant", assistantMessage);
    await this.saveRecord(session);

    return {
      session: toSnapshot(session),
      response: {
        assistantMessage,
        note,
        plan,
        toolResults,
        queuedActions,
        blockedTools,
        pendingActions: toPendingViews(session.pendingActions),
        suggestedNextPrompts: SUGGESTED_PROMPTS_WITH_PLAN,
        skillsPipeline
      }
    };
  }

  async approve(sessionId: string, input: ApproveInput = {}): Promise<{
    session: AgentSessionSnapshot;
    execution: SessionApproveResult;
  }> {
    const session = await this.requireSession(sessionId);
    const selected = selectPendingActions(session.pendingActions, input);
    if (selected.length === 0) {
      return {
        session: toSnapshot(session),
        execution: {
          executed: [],
          pendingActions: toPendingViews(session.pendingActions)
        }
      };
    }

    const executed: SessionExecutionRecord[] = [];
    for (const action of selected) {
      const result = await executeStep(action.step, action.request);
      const normalizedResult = { ...result, risk: getToolPolicy(action.step.tool).risk };
      await this.store.addAgentAction({
        step: action.step,
        result: normalizedResult,
        request: action.request
      });
      executed.push({
        actionId: action.id,
        tool: action.step.tool,
        ok: normalizedResult.ok,
        summary: normalizedResult.summary
      });
      session.pendingActions = session.pendingActions.filter((item) => item.id !== action.id);
    }

    appendTranscript(
      session,
      "system",
      executed.length === 1
        ? `Approved action ${executed[0].actionId}.`
        : `Approved ${executed.length} queued actions.`
    );
    await this.saveRecord(session);

    return {
      session: toSnapshot(session),
      execution: {
        executed,
        pendingActions: toPendingViews(session.pendingActions)
      }
    };
  }

  async reject(sessionId: string, input: RejectInput = {}): Promise<{
    session: AgentSessionSnapshot;
    rejection: SessionRejectResult;
  }> {
    const session = await this.requireSession(sessionId);
    const selected = selectPendingActions(session.pendingActions, input);
    const ids = new Set(selected.map((item) => item.id));
    session.pendingActions = session.pendingActions.filter((item) => !ids.has(item.id));

    if (selected.length > 0) {
      appendTranscript(
        session,
        "system",
        selected.length === 1
          ? `Rejected action ${selected[0].id}.`
          : `Rejected ${selected.length} queued actions.`
      );
    }
    await this.saveRecord(session);

    return {
      session: toSnapshot(session),
      rejection: {
        removedActionIds: [...ids],
        pendingActions: toPendingViews(session.pendingActions)
      }
    };
  }

  private async requireSession(sessionId: string): Promise<AgentSessionRecord> {
    const id = normalizeSessionId(sessionId);
    if (!id) {
      throw new Error("session_not_found");
    }
    const session = await this.getRecord(id);
    if (!session) {
      throw new Error("session_not_found");
    }
    return session;
  }

  private async getRecord(id: string): Promise<AgentSessionRecord | null> {
    if (!id) return null;

    const cached = this.sessions.get(id);
    if (cached) return cached;

    const stored = await this.sessionStore.get(id);
    if (!stored) return null;
    this.sessions.set(stored.id, stored);
    return stored;
  }

  private async saveRecord(session: AgentSessionRecord): Promise<void> {
    session.updatedAtIso = new Date().toISOString();
    this.sessions.set(session.id, session);
    await this.sessionStore.upsert(session);
    this.emitSessionUpdate(session);
  }

  private emitSessionUpdate(session: AgentSessionRecord): void {
    const eventName = sessionEventName(session.id);
    this.events.emit(eventName, toSnapshot(session));
  }
}

let singleton: RealtorSuiteSessionManager | null = null;

export function getSuiteSessionManager(): RealtorSuiteSessionManager {
  if (singleton) return singleton;
  singleton = new RealtorSuiteSessionManager();
  return singleton;
}

async function executeStep(step: PlannedToolCall, input: ChatRequest): Promise<ToolExecutionRecord> {
  switch (step.tool) {
    case "post_to_99acres":
      return runPostTo99Acres(input);
    case "post_to_magicbricks":
      return runPostToMagicBricks(input);
    case "match_property_to_buyer":
      return runMatchPropertyToBuyer(input);
    case "group_requirement_match_scan":
      return runGroupRequirementMatchScan(input);
    case "ads_lead_qualification":
      return runAdsLeadQualification(input);
    case "send_whatsapp_followup":
      return runSendWhatsappFollowup(input);
    case "schedule_site_visit":
      return runScheduleSiteVisit(input);
    case "generate_performance_report":
      return runGeneratePerformanceReport();
    default:
      return {
        tool: step.tool,
        ok: false,
        summary: "Tool is not implemented."
      };
  }
}

async function buildAssistantMessage(
  input: ChatRequest,
  plan: PlannedToolCall[],
  results: ToolExecutionRecord[],
  note: string
): Promise<string> {
  const llm = await generateAssistantText(
    [
      {
        role: "system",
        content:
          "You are a concise and compliant realtor ops copilot. Summarize planned, blocked, queued, and executed actions clearly. End with one practical next step. Max 80 words."
      },
      {
        role: "user",
        content: JSON.stringify({
          request: input.message,
          note,
          plan,
          results: results.map((item) => ({ tool: item.tool, ok: item.ok, summary: item.summary }))
        })
      }
    ],
    {
      model: input.model,
      temperature: 0.2
    }
  );

  if (llm.text) return llm.text;
  return "LLM unavailable. No fallback replies are enabled. Configure OpenRouter/Ollama and retry.";
}

function selectPendingActions(
  pendingActions: PendingToolAction[],
  input: ApproveInput | RejectInput
): PendingToolAction[] {
  if (pendingActions.length === 0) return [];
  if (input.all) return [...pendingActions];
  if (input.actionId) {
    const found = pendingActions.find((item) => item.id === String(input.actionId));
    return found ? [found] : [];
  }
  return [pendingActions[0]];
}

function appendTranscript(
  session: AgentSessionRecord,
  role: SessionMessage["role"],
  content: string
) {
  session.transcript.push({
    role,
    content,
    timestampIso: new Date().toISOString()
  });
  if (session.transcript.length > 60) {
    session.transcript = session.transcript.slice(-60);
  }
}

function queueAction(
  session: AgentSessionRecord,
  step: PlannedToolCall,
  request: ChatRequest
): PendingToolAction {
  const queued: PendingToolAction = {
    id: createActionId(),
    step,
    request: { ...request },
    createdAtIso: new Date().toISOString()
  };
  session.pendingActions.push(queued);
  return queued;
}

function toSnapshot(session: AgentSessionRecord): AgentSessionSnapshot {
  return {
    id: session.id,
    createdAtIso: session.createdAtIso,
    updatedAtIso: session.updatedAtIso,
    turns: session.turns,
    pendingActions: toPendingViews(session.pendingActions),
    guidedFlow: session.guidedFlow ? toGuidedFlowState(session.guidedFlow, session.id) : null,
    transcript: [...session.transcript]
  };
}

function toPendingViews(actions: PendingToolAction[]): PendingToolActionView[] {
  return actions.map((action) => toPendingView(action));
}

function toPendingView(action: PendingToolAction): PendingToolActionView {
  return {
    id: action.id,
    tool: action.step.tool,
    reason: action.step.reason,
    requestMessage: action.request.message,
    createdAtIso: action.createdAtIso,
    risk: getToolPolicy(action.step.tool).risk
  };
}

function normalizeSessionId(value: string | undefined): string {
  return String(value || "").trim();
}

function createSessionId(): string {
  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createActionId(): string {
  return `act-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sessionEventName(sessionId: string): string {
  return `session:${sessionId}`;
}
