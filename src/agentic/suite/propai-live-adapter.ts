import type { PropertyPostDraft } from "./types.js";

export type PropaiLivePublishRequest = {
  draft: PropertyPostDraft;
  dryRun?: boolean;
};

export type PropaiLivePublishResult = {
  ok: boolean;
  status: "posted" | "simulated" | "failed";
  summary: string;
  externalListingId?: string;
  raw?: unknown;
};

export interface PropaiLiveAdapter {
  publishTo99Acres(input: PropaiLivePublishRequest): Promise<PropaiLivePublishResult>;
}
