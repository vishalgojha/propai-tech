import { planToolCalls } from "./planner.js";
import {
  runAdsLeadQualification,
  runGeneratePerformanceReport,
  runGroupRequirementMatchScan,
  runMatchPropertyToBuyer,
  runPostTo99Acres,
  runScheduleSiteVisit,
  runSendWhatsappFollowup
} from "./toolkit.js";
import { generateAssistantText } from "../../llm/chat.js";
import { evaluateGuardrails } from "./guardrails.js";
import { getSuiteStore } from "./store.js";
import type { ChatRequest, ChatResponse, PlannedToolCall, ToolExecutionRecord } from "./types.js";

export class RealtorSuiteAgentEngine {
  private readonly store = getSuiteStore();

  async chat(input: ChatRequest): Promise<ChatResponse> {
    const guardrail = evaluateGuardrails(input);
    if (!guardrail.allow) {
      return {
        assistantMessage: guardrail.reason || "Request blocked by policy guardrails.",
        plan: [],
        toolResults: [],
        suggestedNextPrompts: [
          "Qualify this new ads lead for budget, location, and urgency",
          "Scan broker group requirement and suggest top 3 matching properties",
          "Draft a compliant follow-up message for a warm lead"
        ]
      };
    }

    const plan = planToolCalls(input.message);
    if (plan.length === 0) {
      return {
        assistantMessage:
          "I can run group requirement scans, ads lead qualification, listing publish, property matching, WhatsApp follow-up, site visit scheduling, and performance reports.",
        plan: [],
        toolResults: [],
        suggestedNextPrompts: [
          "Scan WhatsApp broker groups for new requirements and map matching inventory",
          "Qualify this ads lead and suggest next action",
          "Post my 3 BHK in Wakad to 99acres",
          "Match properties for a 2 BHK buyer in Whitefield under 1.2 cr",
          "Send WhatsApp follow-up to my new lead"
        ]
      };
    }

    const results: ToolExecutionRecord[] = [];
    for (const step of plan) {
      const result = await executeStep(step, input);
      results.push(result);
      await this.store.addAgentAction({
        step,
        result,
        request: input
      });
    }

    return {
      assistantMessage: await buildAssistantMessage(input, plan, results),
      plan,
      toolResults: results,
      suggestedNextPrompts: [
        "Scan WhatsApp broker groups for new requirements and map matching inventory",
        "Qualify this ads lead and suggest next action",
        "Generate performance report for current listings",
        "Schedule site visit tomorrow for this lead in Wakad",
        "Send follow-up WhatsApp to +919999999999"
      ]
    };
  }
}

async function executeStep(step: PlannedToolCall, input: ChatRequest): Promise<ToolExecutionRecord> {
  switch (step.tool) {
    case "post_to_99acres":
      return runPostTo99Acres(input);
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
  results: ToolExecutionRecord[]
): Promise<string> {
  const llm = await generateAssistantText(
    [
      {
        role: "system",
        content:
          "You are a concise and compliant realtor ops copilot. Never encourage PII sharing, scraping, or guaranteed-return claims. Summarize executed tools and failures, then suggest one clear next action. Max 70 words."
      },
      {
        role: "user",
        content: JSON.stringify({
          request: input.message,
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

  if (llm.text) {
    return llm.text;
  }

  const ran = plan.map((step) => step.tool).join(", ");
  const failed = results.filter((item) => !item.ok);
  if (failed.length === 0) {
    return `Executed ${plan.length} tool(s): ${ran}.`;
  }
  return `Executed ${plan.length} tool(s) with ${failed.length} failure(s): ${ran}.`;
}
