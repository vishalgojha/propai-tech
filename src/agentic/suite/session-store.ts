import { Pool } from "pg";
import { sanitizeGuidedFlowProgress } from "./guided-flows.js";
import type { GuidedFlowProgress, PendingToolAction, SessionMessage } from "./types.js";

export type AgentSessionStoreRecord = {
  id: string;
  createdAtIso: string;
  updatedAtIso: string;
  turns: number;
  pendingActions: PendingToolAction[];
  guidedFlow: GuidedFlowProgress | null;
  transcript: SessionMessage[];
};

export interface SuiteSessionStore {
  get(id: string): Promise<AgentSessionStoreRecord | null>;
  list(limit?: number): Promise<AgentSessionStoreRecord[]>;
  upsert(record: AgentSessionStoreRecord): Promise<void>;
}

class InMemorySuiteSessionStore implements SuiteSessionStore {
  private readonly sessions = new Map<string, AgentSessionStoreRecord>();

  async get(id: string): Promise<AgentSessionStoreRecord | null> {
    const found = this.sessions.get(id);
    return found ? cloneRecord(found) : null;
  }

  async list(limit = 100): Promise<AgentSessionStoreRecord[]> {
    return [...this.sessions.values()]
      .sort((a, b) => Date.parse(b.updatedAtIso) - Date.parse(a.updatedAtIso))
      .slice(0, Math.max(1, limit))
      .map((item) => cloneRecord(item));
  }

  async upsert(record: AgentSessionStoreRecord): Promise<void> {
    this.sessions.set(record.id, cloneRecord(record));
  }
}

class PostgresSuiteSessionStore implements SuiteSessionStore {
  private readonly pool: Pool;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl
    });
  }

  async get(id: string): Promise<AgentSessionStoreRecord | null> {
    await this.ensureInitialized();
    const result = await this.pool.query<{
      id: string;
      created_at: Date;
      updated_at: Date;
      turns: number;
      pending_actions: unknown;
      guided_flow: unknown;
      transcript: unknown;
    }>(
      `SELECT id, created_at, updated_at, turns, pending_actions, guided_flow, transcript
       FROM agent_sessions
       WHERE id = $1`,
      [id]
    );

    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      createdAtIso: row.created_at.toISOString(),
      updatedAtIso: row.updated_at.toISOString(),
      turns: row.turns,
      pendingActions: parsePendingActions(row.pending_actions),
      guidedFlow: parseGuidedFlow(row.guided_flow),
      transcript: parseTranscript(row.transcript)
    };
  }

  async list(limit = 100): Promise<AgentSessionStoreRecord[]> {
    await this.ensureInitialized();
    const safeLimit = Math.max(1, Math.min(500, limit));
    const result = await this.pool.query<{
      id: string;
      created_at: Date;
      updated_at: Date;
      turns: number;
      pending_actions: unknown;
      guided_flow: unknown;
      transcript: unknown;
    }>(
      `SELECT id, created_at, updated_at, turns, pending_actions, guided_flow, transcript
       FROM agent_sessions
       ORDER BY updated_at DESC
       LIMIT $1`,
      [safeLimit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      createdAtIso: row.created_at.toISOString(),
      updatedAtIso: row.updated_at.toISOString(),
      turns: row.turns,
      pendingActions: parsePendingActions(row.pending_actions),
      guidedFlow: parseGuidedFlow(row.guided_flow),
      transcript: parseTranscript(row.transcript)
    }));
  }

  async upsert(record: AgentSessionStoreRecord): Promise<void> {
    await this.ensureInitialized();
    await this.pool.query(
      `INSERT INTO agent_sessions (
        id,
        created_at,
        updated_at,
        turns,
        pending_actions,
        guided_flow,
        transcript
      ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb)
      ON CONFLICT (id) DO UPDATE
      SET
        updated_at = EXCLUDED.updated_at,
        turns = EXCLUDED.turns,
        pending_actions = EXCLUDED.pending_actions,
        guided_flow = EXCLUDED.guided_flow,
        transcript = EXCLUDED.transcript`,
      [
        record.id,
        record.createdAtIso,
        record.updatedAtIso,
        record.turns,
        JSON.stringify(record.pendingActions),
        JSON.stringify(record.guidedFlow),
        JSON.stringify(record.transcript)
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
      CREATE TABLE IF NOT EXISTS agent_sessions (
        id TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        turns INTEGER NOT NULL DEFAULT 0,
        pending_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
        guided_flow JSONB NULL,
        transcript JSONB NOT NULL DEFAULT '[]'::jsonb
      )
    `);

    await this.pool.query(`
      ALTER TABLE agent_sessions
      ADD COLUMN IF NOT EXISTS guided_flow JSONB NULL
    `);

    this.initialized = true;
  }
}

let singletonStore: SuiteSessionStore | null = null;

export function getSuiteSessionStore(): SuiteSessionStore {
  if (singletonStore) return singletonStore;

  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (databaseUrl) {
    singletonStore = new PostgresSuiteSessionStore(databaseUrl);
    return singletonStore;
  }

  singletonStore = new InMemorySuiteSessionStore();
  return singletonStore;
}

function cloneRecord(record: AgentSessionStoreRecord): AgentSessionStoreRecord {
  return {
    id: record.id,
    createdAtIso: record.createdAtIso,
    updatedAtIso: record.updatedAtIso,
    turns: record.turns,
    pendingActions: JSON.parse(JSON.stringify(record.pendingActions)) as PendingToolAction[],
    guidedFlow: record.guidedFlow ? (JSON.parse(JSON.stringify(record.guidedFlow)) as GuidedFlowProgress) : null,
    transcript: JSON.parse(JSON.stringify(record.transcript)) as SessionMessage[]
  };
}

function parsePendingActions(value: unknown): PendingToolAction[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => item as PendingToolAction);
}

function parseTranscript(value: unknown): SessionMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => item as SessionMessage);
}

function parseGuidedFlow(value: unknown): GuidedFlowProgress | null {
  return sanitizeGuidedFlowProgress(value);
}
