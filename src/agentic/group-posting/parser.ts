import {
  detectBedrooms,
  detectCity,
  detectLocality,
  detectPropertyType,
  detectTransaction
} from "../utils/parse.js";
import type { GroupPostKind, GroupPostPriority } from "./types.js";

export function inferGroupPostKind(content: string): GroupPostKind {
  const lower = content.toLowerCase();
  if (
    /\b(requirement|need|needed|looking for|seeking|buyer|tenant)\b/.test(lower) &&
    !/\b(new listing|for sale|available for sale|available for rent)\b/.test(lower)
  ) {
    return "requirement";
  }
  return "listing";
}

export function inferGroupPostPriority(content: string): GroupPostPriority {
  const lower = content.toLowerCase();
  if (/\b(urgent|immediate|asap|today only|closing soon)\b/.test(lower)) {
    return "high";
  }
  return "normal";
}

export function inferGroupPostTags(content: string): string[] {
  const tags: string[] = [];
  const city = detectCity(content);
  const locality = detectLocality(content);
  const bedrooms = detectBedrooms(content);
  const propertyType = detectPropertyType(content);
  const transaction = detectTransaction(content);

  if (city) tags.push(city);
  if (locality) tags.push(locality.replace(/\s+/g, "_"));
  if (propertyType) tags.push(propertyType);
  if (transaction) tags.push(transaction);
  if (bedrooms) tags.push(`${bedrooms}bhk`);

  return uniqueTags(tags);
}

export function renderGroupPostMessage(input: {
  kind: GroupPostKind;
  content: string;
  brokerName?: string;
  tags?: string[];
}): string {
  const header = input.kind === "listing" ? "Listing Update" : "Requirement Update";
  const lines = [header, input.content.trim()];
  if (input.brokerName) {
    lines.push(`Shared by: ${input.brokerName}`);
  }
  const tags = uniqueTags(input.tags || []);
  if (tags.length > 0) {
    lines.push(`Tags: ${tags.map((tag) => `#${tag}`).join(" ")}`);
  }
  return lines.join("\n");
}

function uniqueTags(tags: string[]): string[] {
  return Array.from(
    new Set(
      tags
        .map((tag) => String(tag || "").trim().toLowerCase())
        .filter((tag) => /^[a-z0-9_]{2,40}$/.test(tag))
    )
  );
}
