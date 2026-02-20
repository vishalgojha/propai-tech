import type { ChatRequest } from "./types.js";

type GuardrailDecision = {
  allow: boolean;
  reason?: string;
};

const HARD_BLOCK_PATTERNS: RegExp[] = [
  /\b(share|export|dump|leak)\b.*\b(contact|phone|number|personal data|pii)\b/,
  /\b(scrape|harvest|collect)\b.*\b(phone|contact|group members?)\b/,
  /\b(guaranteed return|assured return|risk[- ]?free investment)\b/
];

const APPROVAL_ONLY_PATTERNS: RegExp[] = [
  /\b(auto[\s-]?send|auto[\s-]?reply|mass message|blast|broadcast to all)\b/,
  /\b(send\b.*\bto all groups?)\b/
];

export function evaluateGuardrails(input: ChatRequest): GuardrailDecision {
  const message = input.message.toLowerCase();

  for (const pattern of HARD_BLOCK_PATTERNS) {
    if (pattern.test(message)) {
      return {
        allow: false,
        reason:
          "Blocked by guardrail: request attempts prohibited data sharing/scraping or non-compliant claims."
      };
    }
  }

  for (const pattern of APPROVAL_ONLY_PATTERNS) {
    if (pattern.test(message)) {
      return {
        allow: false,
        reason:
          "Blocked by guardrail: bulk or automatic outbound messaging requires explicit human approval."
      };
    }
  }

  return { allow: true };
}
