import { FollowUpAgent } from "./follow-up-agent.js";
import { LeadIntakeAgent } from "./lead-intake-agent.js";
import { PropertyMatchAgent } from "./property-match-agent.js";
import { WacliTool } from "../tools/wacli-tool.js";
import type { LeadInput, OrchestratorResult } from "../types.js";

type RunOptions = {
  sendWhatsApp?: boolean;
  recipient?: string;
};

export class RealtorOrchestrator {
  private readonly intake = new LeadIntakeAgent();
  private readonly matcher = new PropertyMatchAgent();
  private readonly followUp = new FollowUpAgent();
  private readonly wacli = new WacliTool();

  async run(lead: LeadInput, options: RunOptions = {}): Promise<OrchestratorResult> {
    const qualification = this.intake.qualify(lead);
    const matches = this.matcher.shortlist(qualification.requirement, 3);
    const followUp = this.followUp.compose(lead, qualification.requirement, matches);

    const result: OrchestratorResult = {
      qualification,
      matches,
      followUp
    };

    if (options.sendWhatsApp && options.recipient) {
      const sendResult = await this.wacli.sendText(options.recipient, followUp.draftMessage);
      result.whatsappAction = {
        sent: sendResult.ok,
        command: sendResult.command,
        output: sendResult.stdout || undefined,
        error: sendResult.stderr || undefined
      };
    }

    return result;
  }

  async sendManualMessage(to: string, message: string) {
    return this.wacli.sendText(to, message);
  }

  async doctor() {
    return this.wacli.doctor();
  }

  async searchMessages(query: string, chat?: string, limit = 20) {
    return this.wacli.searchMessages(query, chat, limit);
  }

  async listChats(query?: string, limit = 20) {
    return this.wacli.listChats(query, limit);
  }
}
