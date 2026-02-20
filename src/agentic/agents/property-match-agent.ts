import { INDIAN_PROPERTIES } from "../data/indian-properties.js";
import type { LeadRequirement, PropertyListing, PropertyMatch } from "../types.js";

export class PropertyMatchAgent {
  shortlist(requirement: LeadRequirement, limit = 3): PropertyMatch[] {
    const matches = INDIAN_PROPERTIES.map((property) => scoreProperty(property, requirement))
      .filter((item) => item.fitScore >= 35)
      .sort((a, b) => b.fitScore - a.fitScore);

    return matches.slice(0, limit);
  }
}

function scoreProperty(property: PropertyListing, req: LeadRequirement): PropertyMatch {
  let score = 0;
  const reasons: string[] = [];

  if (!req.city || property.city === req.city) {
    score += 25;
    if (req.city) reasons.push("City match");
  } else {
    score -= 40;
  }

  if (req.locality && property.locality === req.locality) {
    score += 20;
    reasons.push("Locality match");
  }

  if (!req.propertyType || property.propertyType === req.propertyType) {
    score += 15;
    if (req.propertyType) reasons.push("Property type match");
  } else {
    score -= 15;
  }

  if (property.transaction === req.transaction) {
    score += 15;
    reasons.push("Transaction type match");
  } else {
    score -= 20;
  }

  const budgetScore = budgetFitScore(property.priceInr, req.minBudgetInr, req.maxBudgetInr);
  score += budgetScore;
  if (budgetScore >= 15) reasons.push("Strong budget fit");
  else if (budgetScore >= 8) reasons.push("Reasonable budget fit");

  if (typeof req.bedrooms === "number" && typeof property.bedrooms === "number") {
    const gap = Math.abs(property.bedrooms - req.bedrooms);
    if (gap === 0) {
      score += 10;
      reasons.push("Bedroom count match");
    } else if (gap === 1) {
      score += 4;
    } else {
      score -= 8;
    }
  }

  if (typeof req.areaMinSqft === "number") {
    if (property.areaSqft >= req.areaMinSqft) score += 5;
    else score -= 5;
  }

  return {
    property,
    fitScore: clamp(score, 0, 100),
    reasons
  };
}

function budgetFitScore(price: number, minBudget?: number, maxBudget?: number): number {
  if (!minBudget && !maxBudget) return 8;

  if (minBudget && maxBudget) {
    if (price >= minBudget && price <= maxBudget) return 20;
    const center = (minBudget + maxBudget) / 2;
    const percentDelta = Math.abs(price - center) / center;
    if (percentDelta <= 0.1) return 12;
    if (percentDelta <= 0.2) return 7;
    return -10;
  }

  if (maxBudget) {
    if (price <= maxBudget) return 18;
    const overflow = (price - maxBudget) / maxBudget;
    if (overflow <= 0.1) return 8;
    return -8;
  }

  if (minBudget) {
    if (price >= minBudget) return 14;
    const shortfall = (minBudget - price) / minBudget;
    if (shortfall <= 0.1) return 6;
    return -6;
  }

  return 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
