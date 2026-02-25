import { planToolCalls } from "./planner.js";
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
import { generateAssistantText } from "../../llm/chat.js";
import { evaluateGuardrails } from "./guardrails.js";
import { getSuiteStore } from "./store.js";
import { runSkillPipeline } from "../skills/pipeline.js";
import type {
  AgentActionEvent,
  ChatRequest,
  ChatResponse,
  PlannedToolCall,
  ToolExecutionRecord
} from "./types.js";

export class RealtorSuiteAgentEngine {
  private readonly store = getSuiteStore();

  async chat(input: ChatRequest): Promise<ChatResponse> {
    const events: AgentActionEvent[] = [];

    const guardrail = evaluateGuardrails(input);
    if (!guardrail.allow) {
      const assistantMessage = guardrail.reason || "Request blocked by policy guardrails.";
      events.push(
        createEvent("guardrail", "blocked", {
          request: input.message,
          reason: assistantMessage
        }),
        createEvent("assistant", "info", { assistantMessage })
      );

      return {
        assistantMessage,
        plan: [],
        toolResults: [],
        events,
        suggestedNextPrompts: [
          "Qualify this new ads lead for budget, location, and urgency",
          "Scan broker group requirement and suggest top 3 matching properties",
          "Draft a compliant follow-up message for a warm lead"
        ]
      };
    }

    const skillsPipeline = runSkillPipeline({
      message: input.message,
      lead: input.lead,
      recipient: input.recipient
    });

    const plan = planToolCalls(input.message);
    if (plan.length === 0) {
      const assistantMessage = await buildAssistantMessage(input, plan, []);
      events.push(
        createEvent("assistant", "info", {
          assistantMessage,
          reason: "No tool plan triggered."
        })
      );

      return {
        assistantMessage,
        plan: [],
        toolResults: [],
        events,
        suggestedNextPrompts: [
          "Scan WhatsApp broker groups for new requirements and map matching inventory",
          "Qualify this ads lead and suggest next action",
          "Post my 3 BHK in Wakad to 99acres",
          "Publish my 2 BHK in Baner to MagicBricks",
          "Match properties for a 2 BHK buyer in Whitefield under 1.2 cr",
          "Send WhatsApp follow-up to my new lead"
        ],
        skillsPipeline
      };
    }

    for (const step of plan) {
      events.push(
        createEvent("plan", "planned", { reason: step.reason }, step.tool)
      );
    }

    const results: ToolExecutionRecord[] = [];
    for (const step of plan) {
      const result = await executeStep(step, input);
      results.push(result);
      events.push(
        createEvent(
          "tool_result",
          result.ok ? "ok" : "failed",
          { summary: result.summary, data: result.data },
          step.tool
        )
      );
      await this.store.addAgentAction({
        step,
        result,
        request: input
      });
    }

    const assistantMessage = await buildAssistantMessage(input, plan, results);
    events.push(createEvent("assistant", "info", { assistantMessage }));

    return {
      assistantMessage,
      plan,
      toolResults: results,
      events,
      suggestedNextPrompts: [
        "Scan WhatsApp broker groups for new requirements and map matching inventory",
        "Qualify this ads lead and suggest next action",
        "Generate performance report for current listings",
        "Schedule site visit tomorrow for this lead in Wakad",
        "Send follow-up WhatsApp to +919999999999"
      ],
      skillsPipeline
    };
  }
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

  return "LLM unavailable. No fallback replies are enabled. Configure OpenRouter/Ollama and retry.";
}

function createEvent(
  type: AgentActionEvent["type"],
  status: AgentActionEvent["status"],
  payload: unknown,
  step?: AgentActionEvent["step"]
): AgentActionEvent {
  return {
    type,
    status,
    timestampIso: new Date().toISOString(),
    step,
    payload
  };
}
