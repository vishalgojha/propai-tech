import { detectBedrooms, detectBudget, detectLocality } from "../utils/parse.js";
import { generateAssistantText } from "../../llm/chat.js";

export type RealtorIntentLabel =
  | "site_visit"
  | "price_sheet"
  | "loan_help"
  | "callback"
  | "brochure_request"
  | "not_interested"
  | "stop"
  | "general_query";

export type RealtorIntentResult = {
  intent: RealtorIntentLabel;
  confidence: number;
  route: string;
  fields: Record<string, unknown>;
  provider: "heuristic" | "ai" | "heuristic_fallback";
};

const ALLOWED_INTENTS = new Set<RealtorIntentLabel>([
  "site_visit",
  "price_sheet",
  "loan_help",
  "callback",
  "brochure_request",
  "not_interested",
  "stop",
  "general_query"
]);

export async function classifyRealtorIntent(
  text: string,
  options: { useAi?: boolean; model?: string } = {}
): Promise<RealtorIntentResult> {
  const fallback = classifyRealtorIntentHeuristic(text);
  if (!options.useAi) return fallback;

  try {
    const llm = await generateAssistantText(
      [
        {
          role: "system",
          content:
            "Classify inbound WhatsApp replies for Indian real-estate brokers. Return strict JSON only. " +
            "Schema: {intent, confidence, route, fields}. " +
            "intent must be one of: site_visit, price_sheet, loan_help, callback, brochure_request, not_interested, stop, general_query."
        },
        {
          role: "user",
          content: text
        }
      ],
      {
        model: options.model,
        temperature: 0.1
      }
    );
    if (!llm.text) return { ...fallback, provider: "heuristic_fallback" };

    const parsed = parseLooseJson(llm.text);
    const intent = normalizeIntent(parsed.intent, fallback.intent);
    const confidence = normalizeConfidence(parsed.confidence, fallback.confidence);
    const route = typeof parsed.route === "string" && parsed.route.trim() ? parsed.route.trim() : fallback.route;
    const fields =
      parsed.fields && typeof parsed.fields === "object"
        ? (parsed.fields as Record<string, unknown>)
        : fallback.fields;

    return {
      intent,
      confidence,
      route,
      fields,
      provider: "ai"
    };
  } catch {
    return { ...fallback, provider: "heuristic_fallback" };
  }
}

export function classifyRealtorIntentHeuristic(text: string): RealtorIntentResult {
  const input = String(text || "");
  const lower = input.toLowerCase();
  const fields = extractFields(input);

  if (hasAny(lower, [/\bstop\b/, /\bunsubscribe\b/, /\bdnd\b/, /\bdon't message\b/, /\bdo not message\b/])) {
    return {
      intent: "stop",
      confidence: 0.99,
      route: "compliance_optout",
      fields,
      provider: "heuristic"
    };
  }
  if (hasAny(lower, [/\bnot interested\b/, /\bno interest\b/, /\bremove me\b/])) {
    return {
      intent: "not_interested",
      confidence: 0.95,
      route: "cooldown_or_close",
      fields,
      provider: "heuristic"
    };
  }
  if (hasAny(lower, [/\bsite visit\b/, /\bvisit\b/, /\binspection\b/, /\bshow flat\b/, /\bsee property\b/])) {
    return {
      intent: "site_visit",
      confidence: 0.92,
      route: "sales_schedule_visit",
      fields,
      provider: "heuristic"
    };
  }
  if (hasAny(lower, [/\bprice\b/, /\brate\b/, /\bcost\b/, /\bquote\b/, /\bquotation\b/, /\bprice sheet\b/])) {
    return {
      intent: "price_sheet",
      confidence: 0.9,
      route: "sales_send_pricing",
      fields,
      provider: "heuristic"
    };
  }
  if (hasAny(lower, [/\bloan\b/, /\bhome loan\b/, /\bemi\b/, /\bfinance\b/, /\bdown payment\b/])) {
    return {
      intent: "loan_help",
      confidence: 0.88,
      route: "finance_assist",
      fields,
      provider: "heuristic"
    };
  }
  if (hasAny(lower, [/\bcall me\b/, /\bcallback\b/, /\bring me\b/, /\bphone me\b/])) {
    return {
      intent: "callback",
      confidence: 0.86,
      route: "sales_call_queue",
      fields,
      provider: "heuristic"
    };
  }
  if (hasAny(lower, [/\bbrochure\b/, /\bcatalog\b/, /\bfloor plan\b/, /\bdetails\b/, /\binfo\b/])) {
    return {
      intent: "brochure_request",
      confidence: 0.84,
      route: "sales_send_brochure",
      fields,
      provider: "heuristic"
    };
  }
  return {
    intent: "general_query",
    confidence: 0.62,
    route: "agent_assist",
    fields,
    provider: "heuristic"
  };
}

function extractFields(text: string): Record<string, unknown> {
  const bedrooms = detectBedrooms(text);
  const budget = detectBudget(text);
  const locality = detectLocality(text);
  const fields: Record<string, unknown> = {};
  if (typeof bedrooms === "number") fields.bedrooms = bedrooms;
  if (budget.min || budget.max) fields.budgetInr = budget;
  if (locality) fields.locality = locality;
  return fields;
}

function parseLooseJson(text: string): Record<string, unknown> {
  const raw = String(text || "").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const block = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (block?.[1]) {
      return JSON.parse(block[1].trim()) as Record<string, unknown>;
    }
    throw new Error("invalid_json");
  }
}

function normalizeIntent(value: unknown, fallback: RealtorIntentLabel): RealtorIntentLabel {
  const normalized = String(value || "").trim().toLowerCase() as RealtorIntentLabel;
  return ALLOWED_INTENTS.has(normalized) ? normalized : fallback;
}

function normalizeConfidence(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}
