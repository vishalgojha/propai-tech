import type { PostedListing, ScheduledVisit } from "./types.js";
import type { ListingPortal } from "./types.js";

type Counters = {
  listing: number;
  visit: number;
};

const counters: Counters = {
  listing: 1,
  visit: 1
};

const listings: PostedListing[] = [];
const visits: ScheduledVisit[] = [];

export function createListingId(): string {
  const next = counters.listing++;
  return formatListingId(next, "99acres");
}

export function createListingIdForPortal(portal: ListingPortal): string {
  const next = counters.listing++;
  return formatListingId(next, portal);
}

export function createVisitId(): string {
  const next = counters.visit++;
  return `VISIT-${String(next).padStart(4, "0")}`;
}

export function addListing(listing: PostedListing): void {
  listings.push(listing);
}

export function addVisit(visit: ScheduledVisit): void {
  visits.push(visit);
}

export function getListings(): PostedListing[] {
  return [...listings];
}

export function getVisits(): ScheduledVisit[] {
  return [...visits];
}

function formatListingId(value: number, portal: ListingPortal): string {
  const prefix = portal === "magicbricks" ? "MB" : "A99";
  return `${prefix}-${String(value).padStart(5, "0")}`;
}
