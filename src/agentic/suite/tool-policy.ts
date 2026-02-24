import type { ChatRequest, ToolName, ToolPolicy } from "./types.js";

const BASE_POLICY: Record<ToolName, ToolPolicy> = {
  post_to_99acres: {
    risk: "high",
    actionScope: "external_write",
    approvalRequiredByDefault: true
  },
  post_to_magicbricks: {
    risk: "high",
    actionScope: "external_write",
    approvalRequiredByDefault: true
  },
  match_property_to_buyer: {
    risk: "low",
    actionScope: "read",
    approvalRequiredByDefault: false
  },
  group_requirement_match_scan: {
    risk: "low",
    actionScope: "read",
    approvalRequiredByDefault: false
  },
  ads_lead_qualification: {
    risk: "low",
    actionScope: "read",
    approvalRequiredByDefault: false
  },
  send_whatsapp_followup: {
    risk: "high",
    actionScope: "external_write",
    approvalRequiredByDefault: true
  },
  schedule_site_visit: {
    risk: "medium",
    actionScope: "local_write",
    approvalRequiredByDefault: true
  },
  generate_performance_report: {
    risk: "low",
    actionScope: "read",
    approvalRequiredByDefault: false
  }
};

export function getToolPolicy(tool: ToolName): ToolPolicy {
  return BASE_POLICY[tool];
}

export function isExternalActionTool(tool: ToolName, request: ChatRequest): boolean {
  if (tool === "send_whatsapp_followup") {
    return Boolean(request.recipient);
  }
  return BASE_POLICY[tool].actionScope === "external_write";
}

export function requiresToolApproval(tool: ToolName, request: ChatRequest): boolean {
  const policy = BASE_POLICY[tool];
  if (!policy.approvalRequiredByDefault) return false;
  if (tool === "send_whatsapp_followup" && !request.recipient) {
    return false;
  }
  return true;
}
