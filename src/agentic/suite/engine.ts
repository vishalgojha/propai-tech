import { planToolCalls } from "./planner.js";
import {
  runGeneratePerformanceReport,
  runMatchPropertyToBuyer,
  runPostTo99Acres,
  runScheduleSiteVisit,
  runSendWhatsappFollowup
} from "./toolkit.js";
import { getSuiteStore } from "./store.js";
import type { ChatRequest, ChatResponse, PlannedToolCall, ToolExecutionRecord } from "./types.js";

export class RealtorSuiteAgentEngine {
  private readonly store = getSuiteStore();

  async chat(input: ChatRequest): Promise<ChatResponse> {
    const plan = planToolCalls(input.message);
    if (plan.length === 0) {
      return {
        assistantMessage:
          "I can run listing publish, property matching, WhatsApp follow-up, site visit scheduling, and performance reports. Ask with one of those intents.",
        plan: [],
        toolResults: [],
        suggestedNextPrompts: [
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
      assistantMessage: buildAssistantMessage(plan, results),
      plan,
      toolResults: results,
      suggestedNextPrompts: [
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

function buildAssistantMessage(plan: PlannedToolCall[], results: ToolExecutionRecord[]): string {
  const ran = plan.map((step) => step.tool).join(", ");
  const failed = results.filter((item) => !item.ok);
  if (failed.length === 0) {
    return `Executed ${plan.length} tool(s): ${ran}.`;
  }
  return `Executed ${plan.length} tool(s) with ${failed.length} failure(s): ${ran}.`;
}
