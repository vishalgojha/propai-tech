import { Pool } from "pg";
import type { ChatRequest } from "./types.js";
import type {
  ListingPortal,
  PlannedToolCall,
  PostedListing,
  PropertyPostDraft,
  ScheduledVisit,
  ToolExecutionRecord
} from "./types.js";
import type { RealtorCampaign, RealtorConsentRecord, RealtorConsentStatus } from "../realtor-control/types.js";
import { normalizeCampaign, normalizeCampaignStatus } from "../realtor-control/policy.js";
import { normalizeCampaignAudience, normalizePhoneE164 } from "../realtor-control/types.js";

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

type UpsertRealtorConsentInput = {
  phone: string;
  status?: RealtorConsentStatus;
  channel?: string;
  source?: string;
  purpose?: string;
  proofRef?: string;
};

type RevokeRealtorConsentInput = {
  phone: string;
  source?: string;
  reason?: string;
};

type ListRealtorConsentsInput = {
  status?: RealtorConsentStatus;
};

type CreateRealtorCampaignInput = {
  campaign: RealtorCampaign;
};

export interface SuiteStore {
  createListing(draft: PropertyPostDraft, portal: ListingPortal): Promise<PostedListing>;
  createVisit(input: VisitCreateInput): Promise<ScheduledVisit>;
  getListings(): Promise<PostedListing[]>;
  getVisits(): Promise<ScheduledVisit[]>;
  addAgentAction(input: AgentActionInput): Promise<void>;
  upsertRealtorConsent(input: UpsertRealtorConsentInput): Promise<RealtorConsentRecord>;
  revokeRealtorConsent(input: RevokeRealtorConsentInput): Promise<RealtorConsentRecord>;
  getRealtorConsent(phone: string): Promise<RealtorConsentRecord | null>;
  listRealtorConsents(input?: ListRealtorConsentsInput): Promise<RealtorConsentRecord[]>;
  createRealtorCampaign(input: CreateRealtorCampaignInput): Promise<RealtorCampaign>;
  updateRealtorCampaign(campaign: RealtorCampaign): Promise<RealtorCampaign>;
  getRealtorCampaign(id: string): Promise<RealtorCampaign | null>;
  listRealtorCampaigns(): Promise<RealtorCampaign[]>;
}

class InMemorySuiteStore implements SuiteStore {
  private readonly listingCounterByPortal: Record<ListingPortal, number> = {
    "99acres": 1,
    magicbricks: 1
  };
  private visitCounter = 1;
  private readonly listings: PostedListing[] = [];
  private readonly visits: ScheduledVisit[] = [];
  private readonly realtorConsents = new Map<string, RealtorConsentRecord>();
  private readonly realtorCampaigns = new Map<string, RealtorCampaign>();

  async createListing(draft: PropertyPostDraft, portal: ListingPortal): Promise<PostedListing> {
    const id = formatListingId(this.listingCounterByPortal[portal]++, portal);
    const record: PostedListing = {
      id,
      portal,
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

  async upsertRealtorConsent(input: UpsertRealtorConsentInput): Promise<RealtorConsentRecord> {
    const phoneE164 = normalizePhoneE164(input.phone);
    if (!phoneE164) {
      throw new Error("invalid_phone");
    }
    const previous = this.realtorConsents.get(phoneE164);
    const status: RealtorConsentStatus = input.status || "opted_in";
    const next: RealtorConsentRecord = {
      phoneE164,
      status,
      channel: input.channel || previous?.channel || "whatsapp",
      source: input.source || previous?.source || "manual",
      purpose: input.purpose || previous?.purpose || "marketing",
      proofRef: input.proofRef || previous?.proofRef,
      consentedAtIso:
        status === "opted_in"
          ? previous?.consentedAtIso || new Date().toISOString()
          : previous?.consentedAtIso,
      revokedAtIso:
        status === "opted_out"
          ? new Date().toISOString()
          : undefined,
      updatedAtIso: new Date().toISOString()
    };
    this.realtorConsents.set(phoneE164, next);
    return next;
  }

  async revokeRealtorConsent(input: RevokeRealtorConsentInput): Promise<RealtorConsentRecord> {
    return this.upsertRealtorConsent({
      phone: input.phone,
      status: "opted_out",
      source: input.source || "manual",
      purpose: input.reason || "user-request"
    });
  }

  async getRealtorConsent(phone: string): Promise<RealtorConsentRecord | null> {
    const normalized = normalizePhoneE164(phone);
    if (!normalized) return null;
    return this.realtorConsents.get(normalized) || null;
  }

  async listRealtorConsents(input: ListRealtorConsentsInput = {}): Promise<RealtorConsentRecord[]> {
    const all = [...this.realtorConsents.values()].sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
    if (!input.status) return all;
    return all.filter((item) => item.status === input.status);
  }

  async createRealtorCampaign(input: CreateRealtorCampaignInput): Promise<RealtorCampaign> {
    const normalized = normalizeCampaign(input.campaign);
    this.realtorCampaigns.set(normalized.id, normalized);
    return normalized;
  }

  async updateRealtorCampaign(campaign: RealtorCampaign): Promise<RealtorCampaign> {
    const normalized = normalizeCampaign(campaign);
    this.realtorCampaigns.set(normalized.id, normalized);
    return normalized;
  }

  async getRealtorCampaign(id: string): Promise<RealtorCampaign | null> {
    return this.realtorCampaigns.get(String(id)) || null;
  }

  async listRealtorCampaigns(): Promise<RealtorCampaign[]> {
    return [...this.realtorCampaigns.values()].sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
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

  async createListing(draft: PropertyPostDraft, portal: ListingPortal): Promise<PostedListing> {
    await this.ensureInitialized();
    const result = await this.pool.query<{
      id: number;
      created_at: Date;
    }>(
      `INSERT INTO listings (portal, status, draft)
       VALUES ($1, $2, $3::jsonb)
       RETURNING id, created_at`,
      [portal, "active", JSON.stringify(draft)]
    );

    const row = result.rows[0];
    return {
      id: formatListingId(row.id, portal),
      portal,
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
      portal: string;
      status: "active";
      created_at: Date;
      draft: PropertyPostDraft;
    }>(
      `SELECT id, portal, status, created_at, draft
       FROM listings
       ORDER BY id DESC`
    );

    return result.rows.map((row) => {
      const portal = normalizePortal(row.portal);
      return {
        id: formatListingId(row.id, portal),
        portal,
        status: row.status,
        createdAtIso: row.created_at.toISOString(),
        draft: row.draft
      };
    });
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

  async upsertRealtorConsent(input: UpsertRealtorConsentInput): Promise<RealtorConsentRecord> {
    await this.ensureInitialized();
    const phoneE164 = normalizePhoneE164(input.phone);
    if (!phoneE164) {
      throw new Error("invalid_phone");
    }
    const status: RealtorConsentStatus = input.status || "opted_in";
    const nowIso = new Date().toISOString();

    const result = await this.pool.query<{
      phone_e164: string;
      status: RealtorConsentStatus;
      channel: string;
      source: string;
      purpose: string;
      proof_ref: string | null;
      consented_at: Date | null;
      revoked_at: Date | null;
      updated_at: Date;
    }>(
      `INSERT INTO realtor_consents (
        phone_e164,
        status,
        channel,
        source,
        purpose,
        proof_ref,
        consented_at,
        revoked_at,
        updated_at
      ) VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        CASE WHEN $2 = 'opted_in' THEN $7::timestamptz ELSE NULL END,
        CASE WHEN $2 = 'opted_out' THEN $7::timestamptz ELSE NULL END,
        $7::timestamptz
      )
      ON CONFLICT (phone_e164) DO UPDATE SET
        status = EXCLUDED.status,
        channel = COALESCE(NULLIF(EXCLUDED.channel, ''), realtor_consents.channel),
        source = COALESCE(NULLIF(EXCLUDED.source, ''), realtor_consents.source),
        purpose = COALESCE(NULLIF(EXCLUDED.purpose, ''), realtor_consents.purpose),
        proof_ref = COALESCE(EXCLUDED.proof_ref, realtor_consents.proof_ref),
        consented_at = CASE
          WHEN EXCLUDED.status = 'opted_in' THEN COALESCE(realtor_consents.consented_at, EXCLUDED.consented_at)
          ELSE realtor_consents.consented_at
        END,
        revoked_at = CASE
          WHEN EXCLUDED.status = 'opted_out' THEN EXCLUDED.updated_at
          ELSE NULL
        END,
        updated_at = EXCLUDED.updated_at
      RETURNING phone_e164, status, channel, source, purpose, proof_ref, consented_at, revoked_at, updated_at`,
      [
        phoneE164,
        status,
        input.channel || "whatsapp",
        input.source || "manual",
        input.purpose || "marketing",
        input.proofRef || null,
        nowIso
      ]
    );
    return toConsentRecord(result.rows[0]);
  }

  async revokeRealtorConsent(input: RevokeRealtorConsentInput): Promise<RealtorConsentRecord> {
    return this.upsertRealtorConsent({
      phone: input.phone,
      status: "opted_out",
      source: input.source || "manual",
      purpose: input.reason || "user-request"
    });
  }

  async getRealtorConsent(phone: string): Promise<RealtorConsentRecord | null> {
    await this.ensureInitialized();
    const phoneE164 = normalizePhoneE164(phone);
    if (!phoneE164) return null;
    const result = await this.pool.query<{
      phone_e164: string;
      status: RealtorConsentStatus;
      channel: string;
      source: string;
      purpose: string;
      proof_ref: string | null;
      consented_at: Date | null;
      revoked_at: Date | null;
      updated_at: Date;
    }>(
      `SELECT phone_e164, status, channel, source, purpose, proof_ref, consented_at, revoked_at, updated_at
       FROM realtor_consents
       WHERE phone_e164 = $1`,
      [phoneE164]
    );
    if (result.rows.length === 0) return null;
    return toConsentRecord(result.rows[0]);
  }

  async listRealtorConsents(input: ListRealtorConsentsInput = {}): Promise<RealtorConsentRecord[]> {
    await this.ensureInitialized();
    const result = await this.pool.query<{
      phone_e164: string;
      status: RealtorConsentStatus;
      channel: string;
      source: string;
      purpose: string;
      proof_ref: string | null;
      consented_at: Date | null;
      revoked_at: Date | null;
      updated_at: Date;
    }>(
      `SELECT phone_e164, status, channel, source, purpose, proof_ref, consented_at, revoked_at, updated_at
       FROM realtor_consents
       WHERE ($1::text IS NULL OR status = $1)
       ORDER BY updated_at DESC`,
      [input.status || null]
    );
    return result.rows.map((row) => toConsentRecord(row));
  }

  async createRealtorCampaign(input: CreateRealtorCampaignInput): Promise<RealtorCampaign> {
    await this.ensureInitialized();
    const normalized = normalizeCampaign(input.campaign);
    const nowIso = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO realtor_campaigns (id, payload, created_at, updated_at)
       VALUES ($1, $2::jsonb, $3::timestamptz, $3::timestamptz)`,
      [normalized.id, JSON.stringify(normalized), nowIso]
    );
    return normalized;
  }

  async updateRealtorCampaign(campaign: RealtorCampaign): Promise<RealtorCampaign> {
    await this.ensureInitialized();
    const normalized = normalizeCampaign(campaign);
    const nowIso = new Date().toISOString();
    await this.pool.query(
      `UPDATE realtor_campaigns
       SET payload = $2::jsonb,
           updated_at = $3::timestamptz
       WHERE id = $1`,
      [normalized.id, JSON.stringify(normalized), nowIso]
    );
    return normalized;
  }

  async getRealtorCampaign(id: string): Promise<RealtorCampaign | null> {
    await this.ensureInitialized();
    const result = await this.pool.query<{ payload: RealtorCampaign }>(
      `SELECT payload
       FROM realtor_campaigns
       WHERE id = $1`,
      [String(id)]
    );
    if (result.rows.length === 0) return null;
    return normalizeCampaign(result.rows[0].payload);
  }

  async listRealtorCampaigns(): Promise<RealtorCampaign[]> {
    await this.ensureInitialized();
    const result = await this.pool.query<{ payload: RealtorCampaign }>(
      `SELECT payload
       FROM realtor_campaigns
       ORDER BY updated_at DESC`
    );
    return result.rows.map((row) => normalizeCampaign(row.payload));
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

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS realtor_consents (
        phone_e164 TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        channel TEXT NOT NULL,
        source TEXT NOT NULL,
        purpose TEXT NOT NULL,
        proof_ref TEXT NULL,
        consented_at TIMESTAMPTZ NULL,
        revoked_at TIMESTAMPTZ NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS realtor_campaigns (
        id TEXT PRIMARY KEY,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    this.initialized = true;
  }
}

function formatListingId(value: number, portal: ListingPortal): string {
  const prefix = portal === "magicbricks" ? "MB" : "A99";
  return `${prefix}-${String(value).padStart(5, "0")}`;
}

function normalizePortal(value: string): ListingPortal {
  return value.toLowerCase() === "magicbricks" ? "magicbricks" : "99acres";
}

function formatVisitId(value: number): string {
  return `VISIT-${String(value).padStart(4, "0")}`;
}

function toConsentRecord(row: {
  phone_e164: string;
  status: RealtorConsentStatus;
  channel: string;
  source: string;
  purpose: string;
  proof_ref: string | null;
  consented_at: Date | null;
  revoked_at: Date | null;
  updated_at: Date;
}): RealtorConsentRecord {
  return {
    phoneE164: row.phone_e164,
    status: row.status,
    channel: row.channel,
    source: row.source,
    purpose: row.purpose,
    proofRef: row.proof_ref || undefined,
    consentedAtIso: row.consented_at ? row.consented_at.toISOString() : undefined,
    revokedAtIso: row.revoked_at ? row.revoked_at.toISOString() : undefined,
    updatedAtIso: row.updated_at.toISOString()
  };
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
