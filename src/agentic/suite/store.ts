import { Pool } from "pg";
import type { ChatRequest } from "./types.js";
import type { PlannedToolCall, PostedListing, PropertyPostDraft, ScheduledVisit, ToolExecutionRecord } from "./types.js";

type VisitCreateInput = {
  leadName: string;
  locality: string;
  whenIso: string;
};

type AgentActionInput = {
  step: PlannedToolCall;
  result: ToolExecutionRecord;
  request: ChatRequest;
};

export interface SuiteStore {
  createListing(draft: PropertyPostDraft): Promise<PostedListing>;
  createVisit(input: VisitCreateInput): Promise<ScheduledVisit>;
  getListings(): Promise<PostedListing[]>;
  getVisits(): Promise<ScheduledVisit[]>;
  addAgentAction(input: AgentActionInput): Promise<void>;
}

class InMemorySuiteStore implements SuiteStore {
  private listingCounter = 1;
  private visitCounter = 1;
  private readonly listings: PostedListing[] = [];
  private readonly visits: ScheduledVisit[] = [];

  async createListing(draft: PropertyPostDraft): Promise<PostedListing> {
    const id = `A99-${String(this.listingCounter++).padStart(5, "0")}`;
    const record: PostedListing = {
      id,
      portal: "99acres",
      status: "active",
      createdAtIso: new Date().toISOString(),
      draft
    };
    this.listings.push(record);
    return record;
  }

  async createVisit(input: VisitCreateInput): Promise<ScheduledVisit> {
    const id = `VISIT-${String(this.visitCounter++).padStart(4, "0")}`;
    const visit: ScheduledVisit = {
      id,
      leadName: input.leadName,
      locality: input.locality,
      whenIso: input.whenIso
    };
    this.visits.push(visit);
    return visit;
  }

  async getListings(): Promise<PostedListing[]> {
    return [...this.listings];
  }

  async getVisits(): Promise<ScheduledVisit[]> {
    return [...this.visits];
  }

  async addAgentAction(): Promise<void> {
    // no-op in fallback mode
  }
}

class PostgresSuiteStore implements SuiteStore {
  private readonly pool: Pool;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl
    });
  }

  async createListing(draft: PropertyPostDraft): Promise<PostedListing> {
    await this.ensureInitialized();
    const result = await this.pool.query<{
      id: number;
      created_at: Date;
    }>(
      `INSERT INTO listings (portal, status, draft)
       VALUES ($1, $2, $3::jsonb)
       RETURNING id, created_at`,
      ["99acres", "active", JSON.stringify(draft)]
    );

    const row = result.rows[0];
    return {
      id: formatListingId(row.id),
      portal: "99acres",
      status: "active",
      createdAtIso: row.created_at.toISOString(),
      draft
    };
  }

  async createVisit(input: VisitCreateInput): Promise<ScheduledVisit> {
    await this.ensureInitialized();
    const result = await this.pool.query<{ id: number }>(
      `INSERT INTO visits (lead_name, locality, when_iso)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [input.leadName, input.locality, input.whenIso]
    );

    return {
      id: formatVisitId(result.rows[0].id),
      leadName: input.leadName,
      locality: input.locality,
      whenIso: input.whenIso
    };
  }

  async getListings(): Promise<PostedListing[]> {
    await this.ensureInitialized();
    const result = await this.pool.query<{
      id: number;
      portal: "99acres";
      status: "active";
      created_at: Date;
      draft: PropertyPostDraft;
    }>(
      `SELECT id, portal, status, created_at, draft
       FROM listings
       ORDER BY id DESC`
    );

    return result.rows.map((row) => ({
      id: formatListingId(row.id),
      portal: row.portal,
      status: row.status,
      createdAtIso: row.created_at.toISOString(),
      draft: row.draft
    }));
  }

  async getVisits(): Promise<ScheduledVisit[]> {
    await this.ensureInitialized();
    const result = await this.pool.query<{
      id: number;
      lead_name: string;
      locality: string;
      when_iso: string;
    }>(
      `SELECT id, lead_name, locality, when_iso
       FROM visits
       ORDER BY id DESC`
    );

    return result.rows.map((row) => ({
      id: formatVisitId(row.id),
      leadName: row.lead_name,
      locality: row.locality,
      whenIso: row.when_iso
    }));
  }

  async addAgentAction(input: AgentActionInput): Promise<void> {
    await this.ensureInitialized();
    await this.pool.query(
      `INSERT INTO agent_actions (
        tool_name,
        reason,
        ok,
        summary,
        input_message,
        recipient,
        dry_run,
        lead_name,
        result_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [
        input.step.tool,
        input.step.reason,
        input.result.ok,
        input.result.summary,
        input.request.message,
        input.request.recipient || null,
        Boolean(input.request.dryRun),
        input.request.lead?.name || null,
        JSON.stringify(input.result.data ?? null)
      ]
    );
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) {
      await this.initPromise;
      return;
    }
    this.initPromise = this.initialize();
    await this.initPromise;
  }

  private async initialize(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS listings (
        id BIGSERIAL PRIMARY KEY,
        portal TEXT NOT NULL,
        status TEXT NOT NULL,
        draft JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS visits (
        id BIGSERIAL PRIMARY KEY,
        lead_name TEXT NOT NULL,
        locality TEXT NOT NULL,
        when_iso TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS agent_actions (
        id BIGSERIAL PRIMARY KEY,
        tool_name TEXT NOT NULL,
        reason TEXT NOT NULL,
        ok BOOLEAN NOT NULL,
        summary TEXT NOT NULL,
        input_message TEXT NOT NULL,
        recipient TEXT NULL,
        dry_run BOOLEAN NOT NULL DEFAULT FALSE,
        lead_name TEXT NULL,
        result_data JSONB NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    this.initialized = true;
  }
}

function formatListingId(value: number): string {
  return `A99-${String(value).padStart(5, "0")}`;
}

function formatVisitId(value: number): string {
  return `VISIT-${String(value).padStart(4, "0")}`;
}

let singletonStore: SuiteStore | null = null;

export function getSuiteStore(): SuiteStore {
  if (singletonStore) {
    return singletonStore;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    singletonStore = new PostgresSuiteStore(databaseUrl);
    return singletonStore;
  }

  singletonStore = new InMemorySuiteStore();
  return singletonStore;
}
