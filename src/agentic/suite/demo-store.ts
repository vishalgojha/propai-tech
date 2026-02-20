import type { PostedListing, ScheduledVisit } from "./types.js";

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
  return `A99-${String(next).padStart(5, "0")}`;
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
