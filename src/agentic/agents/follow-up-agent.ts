import type { FollowUpPlan, LeadInput, LeadRequirement, PropertyMatch } from "../types.js";
import { formatInr } from "../utils/parse.js";

export class FollowUpAgent {
  compose(lead: LeadInput, requirement: LeadRequirement, matches: PropertyMatch[]): FollowUpPlan {
    const preferredLanguage = lead.preferredLanguage || "hinglish";
    const draftMessage =
      preferredLanguage === "en"
        ? buildEnglishMessage(lead, requirement, matches)
        : buildHinglishMessage(lead, requirement, matches);

    const nextActions = [
      "Confirm missing requirement fields before final shortlist.",
      "Lock at least two site visit slots within 48 hours.",
      "Share loan eligibility and estimated EMI options if buyer asks for financing.",
      "Trigger follow-up WhatsApp reminder if no reply in 24 hours."
    ];

    return { draftMessage, nextActions };
  }
}

function buildEnglishMessage(lead: LeadInput, req: LeadRequirement, matches: PropertyMatch[]): string {
  const name = lead.name || "there";
  const lines = [`Hi ${name}, based on your requirement I have shortlisted these options:`];
  matches.forEach((item, index) => {
    lines.push(
      `${index + 1}. ${item.property.title} (${item.property.locality}) - ${formatInr(item.property.priceInr)}`
    );
  });
  if (req.missingFields.length > 0) {
    lines.push(`Please confirm: ${req.missingFields.join(", ")}.`);
  }
  lines.push("Would you like me to schedule a site visit this week?");
  return lines.join("\n");
}

function buildHinglishMessage(lead: LeadInput, req: LeadRequirement, matches: PropertyMatch[]): string {
  const name = lead.name || "Sir/Ma'am";
  const lines = [`Namaste ${name}, aapke requirement ke hisaab se ye options shortlist kiye hain:`];
  matches.forEach((item, index) => {
    lines.push(
      `${index + 1}. ${item.property.title}, ${item.property.locality} - ${formatInr(item.property.priceInr)}`
    );
  });
  if (req.missingFields.length > 0) {
    lines.push(`Final shortlist ke liye please confirm karein: ${req.missingFields.join(", ")}.`);
  }
  lines.push("Kya main is week site visit schedule kar doon?");
  return lines.join("\n");
}
