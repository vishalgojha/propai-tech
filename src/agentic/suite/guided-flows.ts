import { planToolCalls } from "./planner.js";
import type {
  AutonomyLevel,
  ChatRequest,
  GuidedAnswerValue,
  GuidedFlowId,
  GuidedFlowProgress,
  GuidedFlowState,
  GuidedStepOption,
  GuidedStepKind
} from "./types.js";

type GuidedStepDefinition = {
  id: string;
  label: string;
  prompt: string;
  kind: GuidedStepKind;
  required: boolean;
  placeholder?: string;
  options?: GuidedStepOption[];
};

type GuidedFlowDefinition = {
  id: GuidedFlowId;
  label: string;
  steps: GuidedStepDefinition[];
};

type NormalizeAnswerResult =
  | { ok: true; value?: GuidedAnswerValue }
  | { ok: false; error: string };

const FLOW_DEFINITIONS: Record<GuidedFlowId, GuidedFlowDefinition> = {
  publish_listing: {
    id: "publish_listing",
    label: "Publish Listing",
    steps: [
      {
        id: "title",
        label: "Listing title",
        prompt: "What is the listing title?",
        kind: "text",
        required: true,
        placeholder: "3BHK Sea Facing in Bandra West"
      },
      {
        id: "city",
        label: "City",
        prompt: "Which city is this property in?",
        kind: "text",
        required: true,
        placeholder: "Mumbai"
      },
      {
        id: "locality",
        label: "Locality",
        prompt: "Which locality or neighborhood?",
        kind: "text",
        required: true,
        placeholder: "Bandra West"
      },
      {
        id: "propertyType",
        label: "Property type",
        prompt: "What type of property is this?",
        kind: "single_select",
        required: true,
        options: [
          { value: "apartment", label: "Apartment" },
          { value: "villa", label: "Villa" },
          { value: "plot", label: "Plot" },
          { value: "commercial", label: "Commercial" }
        ]
      },
      {
        id: "transaction",
        label: "Transaction",
        prompt: "Is this for sale or rent?",
        kind: "single_select",
        required: true,
        options: [
          { value: "buy", label: "Sale" },
          { value: "rent", label: "Rent" }
        ]
      },
      {
        id: "bedrooms",
        label: "Bedrooms",
        prompt: "How many bedrooms? (optional for plot/commercial)",
        kind: "number",
        required: false,
        placeholder: "3"
      },
      {
        id: "priceInr",
        label: "Price (INR)",
        prompt: "What is the asking price in INR?",
        kind: "number",
        required: true,
        placeholder: "28500000"
      },
      {
        id: "portals",
        label: "Portals",
        prompt: "Where should we publish?",
        kind: "single_select",
        required: true,
        options: [
          { value: "99acres", label: "99acres" },
          { value: "magicbricks", label: "MagicBricks" },
          { value: "both", label: "Both portals" }
        ]
      }
    ]
  }
};

export function parseGuidedFlowId(value: unknown): GuidedFlowId | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "publish_listing" || normalized === "publish-listing") {
    return "publish_listing";
  }
  return null;
}

export function createGuidedFlowProgress(
  flowId: GuidedFlowId,
  nowIso = new Date().toISOString()
): GuidedFlowProgress {
  const definition = FLOW_DEFINITIONS[flowId];
  return {
    flowId,
    status: "active",
    startedAtIso: nowIso,
    updatedAtIso: nowIso,
    currentStepIndex: definition.steps.length === 0 ? 0 : 0,
    answers: {}
  };
}

export function answerGuidedFlowProgress(
  progress: GuidedFlowProgress,
  stepId: string,
  answer: unknown,
  nowIso = new Date().toISOString()
): { ok: true; progress: GuidedFlowProgress } | { ok: false; error: string } {
  const definition = FLOW_DEFINITIONS[progress.flowId];
  if (!definition) {
    return { ok: false, error: "guided_flow_not_supported" };
  }
  if (progress.status !== "active") {
    return { ok: false, error: "guided_flow_not_active" };
  }

  const currentStep = definition.steps[progress.currentStepIndex];
  if (!currentStep) {
    return { ok: false, error: "guided_flow_invalid_state" };
  }
  if (currentStep.id !== stepId) {
    return {
      ok: false,
      error: `guided_step_mismatch: expected_step=${currentStep.id}`
    };
  }

  const normalized = normalizeGuidedAnswer(currentStep, answer);
  if (!normalized.ok) {
    return {
      ok: false,
      error: `guided_answer_invalid: ${normalized.error}`
    };
  }

  const answers = { ...progress.answers };
  if (normalized.value === undefined) {
    delete answers[currentStep.id];
  } else {
    answers[currentStep.id] = normalized.value;
  }

  const nextStepIndex = progress.currentStepIndex + 1;
  if (nextStepIndex >= definition.steps.length) {
    return {
      ok: true,
      progress: {
        ...progress,
        answers,
        status: "completed",
        currentStepIndex: definition.steps.length,
        completedAtIso: nowIso,
        updatedAtIso: nowIso
      }
    };
  }

  return {
    ok: true,
    progress: {
      ...progress,
      answers,
      currentStepIndex: nextStepIndex,
      updatedAtIso: nowIso
    }
  };
}

export function toGuidedFlowState(progress: GuidedFlowProgress, sessionId: string): GuidedFlowState {
  const definition = FLOW_DEFINITIONS[progress.flowId];
  const totalSteps = definition.steps.length;
  const activeIndex =
    progress.status === "active"
      ? clamp(progress.currentStepIndex, 0, Math.max(0, totalSteps - 1))
      : totalSteps;

  const currentStep = progress.status === "active" ? definition.steps[activeIndex] : undefined;
  const progressPercent =
    progress.status === "completed"
      ? 100
      : totalSteps === 0
        ? 100
        : Math.round((activeIndex / totalSteps) * 100);

  const answers = { ...progress.answers };

  return {
    flowId: progress.flowId,
    flowLabel: definition.label,
    status: progress.status,
    startedAtIso: progress.startedAtIso,
    updatedAtIso: progress.updatedAtIso,
    completedAtIso: progress.completedAtIso,
    progressPercent,
    currentStepId: currentStep?.id,
    currentPrompt: currentStep?.prompt,
    steps: definition.steps.map((step, index) => {
      const answered = Object.prototype.hasOwnProperty.call(answers, step.id);
      return {
        id: step.id,
        label: step.label,
        prompt: step.prompt,
        kind: step.kind,
        required: step.required,
        placeholder: step.placeholder,
        options: step.options ? [...step.options] : undefined,
        answered,
        answer: answered ? answers[step.id] : undefined,
        isCurrent: progress.status === "active" && activeIndex === index,
        order: index + 1
      };
    }),
    answers,
    completion:
      progress.status === "completed"
        ? buildGuidedFlowCompletion(progress.flowId, answers, sessionId)
        : undefined
  };
}

export function sanitizeGuidedFlowProgress(input: unknown): GuidedFlowProgress | null {
  if (!isRecord(input)) return null;

  const flowId = parseGuidedFlowId(input.flowId);
  if (!flowId) return null;

  const definition = FLOW_DEFINITIONS[flowId];
  const status = input.status === "completed" ? "completed" : input.status === "active" ? "active" : null;
  if (!status) return null;

  const nowIso = new Date().toISOString();
  const startedAtIso = parseIso(input.startedAtIso, nowIso);
  const updatedAtIso = parseIso(input.updatedAtIso, startedAtIso);
  const completedAtIso =
    status === "completed" ? parseIso(input.completedAtIso, updatedAtIso) : undefined;

  const answers = sanitizeAnswers(definition.steps, input.answers);
  const maxIndex = definition.steps.length;
  const parsedIndex = parseInteger(input.currentStepIndex, status === "completed" ? maxIndex : 0);
  const currentStepIndex =
    status === "completed"
      ? maxIndex
      : clamp(parsedIndex, 0, Math.max(0, maxIndex - 1));

  return {
    flowId,
    status,
    startedAtIso,
    updatedAtIso,
    completedAtIso,
    currentStepIndex,
    answers
  };
}

function buildGuidedFlowCompletion(
  flowId: GuidedFlowId,
  answers: Record<string, GuidedAnswerValue>,
  sessionId: string
) {
  const message = buildGuidedMessage(flowId, answers);
  const request: ChatRequest = {
    message,
    dryRun: true
  };
  const autonomy: AutonomyLevel = 2;

  return {
    generatedMessage: message,
    request,
    recommendedPlan: planToolCalls(message),
    suggestedExecution: {
      method: "POST" as const,
      endpoint: `/agent/session/${encodeURIComponent(sessionId)}/message`,
      payload: {
        ...request,
        autonomy
      }
    }
  };
}

function buildGuidedMessage(flowId: GuidedFlowId, answers: Record<string, GuidedAnswerValue>): string {
  if (flowId !== "publish_listing") {
    return "Run the planned guided workflow actions.";
  }

  const title = readStringAnswer(answers, "title", "Property listing");
  const city = readStringAnswer(answers, "city", "Mumbai");
  const locality = readStringAnswer(answers, "locality", city);
  const propertyType = readStringAnswer(answers, "propertyType", "apartment");
  const transaction = readStringAnswer(answers, "transaction", "buy");
  const portals = readStringAnswer(answers, "portals", "99acres");
  const bedrooms = readNumberAnswer(answers, "bedrooms");
  const priceInr = readNumberAnswer(answers, "priceInr");

  const propertyTypeLabel = mapPropertyTypeLabel(propertyType);
  const bedroomsPrefix =
    typeof bedrooms === "number" && bedrooms > 0 ? `${Math.trunc(bedrooms)} BHK ` : "";
  const transactionLabel = transaction === "rent" ? "rent" : "sale";
  const portalLabel =
    portals === "both"
      ? "99acres and MagicBricks"
      : portals === "magicbricks"
        ? "MagicBricks"
        : "99acres";
  const priceLabel =
    typeof priceInr === "number" ? `INR ${formatInr(priceInr)}` : "price on request";

  return `Post my ${bedroomsPrefix}${propertyTypeLabel} listing "${title}" in ${locality}, ${city} for ${transactionLabel} at ${priceLabel} on ${portalLabel}.`;
}

function normalizeGuidedAnswer(step: GuidedStepDefinition, input: unknown): NormalizeAnswerResult {
  const value = unwrapAnswerValue(input);

  if (step.kind === "text") {
    if (typeof value !== "string") {
      return { ok: false, error: `${step.id} must be a text value.` };
    }
    const text = value.trim();
    if (!text && step.required) {
      return { ok: false, error: `${step.id} is required.` };
    }
    return { ok: true, value: text || undefined };
  }

  if (step.kind === "number") {
    if ((value === undefined || value === null || String(value).trim() === "") && !step.required) {
      return { ok: true, value: undefined };
    }
    const normalized = toPositiveNumber(value);
    if (normalized === null) {
      return { ok: false, error: `${step.id} must be a valid positive number.` };
    }
    return { ok: true, value: normalized };
  }

  if (step.kind === "single_select") {
    if (typeof value !== "string") {
      return { ok: false, error: `${step.id} must be a text option value.` };
    }
    const selected = value.trim();
    if (!selected && step.required) {
      return { ok: false, error: `${step.id} is required.` };
    }
    if (!selected) {
      return { ok: true, value: undefined };
    }
    const allowed = new Set((step.options || []).map((item) => item.value));
    if (!allowed.has(selected)) {
      return { ok: false, error: `${step.id} must be one of: ${[...allowed].join(", ")}` };
    }
    return { ok: true, value: selected };
  }

  return { ok: false, error: `${step.id} uses unsupported input type.` };
}

function sanitizeAnswers(
  steps: GuidedStepDefinition[],
  rawAnswers: unknown
): Record<string, GuidedAnswerValue> {
  if (!isRecord(rawAnswers)) return {};

  const out: Record<string, GuidedAnswerValue> = {};
  for (const step of steps) {
    if (!Object.prototype.hasOwnProperty.call(rawAnswers, step.id)) continue;
    const rawValue = rawAnswers[step.id];

    if (step.kind === "text") {
      if (typeof rawValue !== "string") continue;
      const text = rawValue.trim();
      if (!text) continue;
      out[step.id] = text;
      continue;
    }

    if (step.kind === "number") {
      const normalized = toPositiveNumber(rawValue);
      if (normalized === null) continue;
      out[step.id] = normalized;
      continue;
    }

    if (step.kind === "single_select") {
      if (typeof rawValue !== "string") continue;
      const selected = rawValue.trim();
      const allowed = new Set((step.options || []).map((item) => item.value));
      if (!allowed.has(selected)) continue;
      out[step.id] = selected;
    }
  }

  return out;
}

function mapPropertyTypeLabel(value: string): string {
  if (value === "villa") return "villa";
  if (value === "plot") return "plot";
  if (value === "commercial") return "commercial property";
  return "apartment";
}

function formatInr(value: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value);
}

function readStringAnswer(
  answers: Record<string, GuidedAnswerValue>,
  key: string,
  fallback: string
): string {
  const value = answers[key];
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function readNumberAnswer(
  answers: Record<string, GuidedAnswerValue>,
  key: string
): number | undefined {
  const value = answers[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toPositiveNumber(input: unknown): number | null {
  const candidate =
    typeof input === "number"
      ? input
      : typeof input === "string"
        ? Number(input.trim().replace(/,/g, ""))
        : Number.NaN;

  if (!Number.isFinite(candidate) || candidate <= 0) return null;
  return candidate;
}

function unwrapAnswerValue(input: unknown): unknown {
  if (!isRecord(input)) return input;
  if (!Object.prototype.hasOwnProperty.call(input, "value")) return input;
  return input.value;
}

function parseIso(input: unknown, fallback: string): string {
  if (typeof input !== "string") return fallback;
  const value = input.trim();
  if (!value || Number.isNaN(Date.parse(value))) return fallback;
  return value;
}

function parseInteger(input: unknown, fallback: number): number {
  const value =
    typeof input === "number" ? input : typeof input === "string" ? Number(input.trim()) : Number.NaN;
  if (!Number.isInteger(value)) return fallback;
  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
