import type { LeadInput, LeadQualification, LeadRequirement } from "../types.js";
import {
  detectAreaMin,
  detectBedrooms,
  detectBudget,
  detectCity,
  detectLocality,
  detectPropertyType,
  detectTransaction,
  detectUrgency
} from "../utils/parse.js";

export class LeadIntakeAgent {
  qualify(lead: LeadInput): LeadQualification {
    const text = lead.message || "";
    const budget = detectBudget(text);

    const requirement: LeadRequirement = {
      transaction: detectTransaction(text),
      city: lead.city?.toLowerCase() || detectCity(text),
      locality: detectLocality(text),
      propertyType: detectPropertyType(text),
      minBudgetInr: budget.min,
      maxBudgetInr: budget.max,
      bedrooms: detectBedrooms(text),
      areaMinSqft: detectAreaMin(text),
      urgency: detectUrgency(text),
      confidence: 0,
      missingFields: []
    };

    requirement.missingFields = missingFields(requirement);
    requirement.confidence = confidenceScore(requirement);

    const summary = buildSummary(lead, requirement);

    return {
      leadSummary: summary,
      requirement
    };
  }
}

function missingFields(req: LeadRequirement): string[] {
  const fields: string[] = [];
  if (!req.city) fields.push("city");
  if (!req.propertyType) fields.push("propertyType");
  if (!req.minBudgetInr && !req.maxBudgetInr) fields.push("budget");
  if (!req.bedrooms && req.propertyType !== "commercial" && req.propertyType !== "plot") fields.push("bedrooms");
  return fields;
}

function confidenceScore(req: LeadRequirement): number {
  let score = 35;
  if (req.city) score += 20;
  if (req.locality) score += 10;
  if (req.propertyType) score += 15;
  if (req.minBudgetInr || req.maxBudgetInr) score += 10;
  if (req.bedrooms || req.propertyType === "commercial" || req.propertyType === "plot") score += 10;
  if (req.urgency !== "low") score += 5;
  return Math.min(100, score);
}

function buildSummary(lead: LeadInput, req: LeadRequirement): string {
  const name = lead.name || "Prospect";
  const bits = [
    `${name} is looking to ${req.transaction}`,
    req.propertyType ? `a ${req.propertyType}` : "a property",
    req.locality ? `in ${req.locality}` : req.city ? `in ${req.city}` : "in an unspecified city"
  ];

  if (req.minBudgetInr || req.maxBudgetInr) {
    bits.push(`with budget constraints captured`);
  }
  if (req.bedrooms) {
    bits.push(`${req.bedrooms} BHK preference detected`);
  }
  bits.push(`urgency: ${req.urgency}`);
  return bits.join(", ");
}
