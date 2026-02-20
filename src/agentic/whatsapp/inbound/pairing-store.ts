import { Pool } from "pg";

type PairingRequestResult = {
  code: string;
  alreadyPaired: boolean;
};

type PairingApproveResult = {
  ok: boolean;
  phoneE164?: string;
};

export interface PairingStore {
  isPaired(phoneE164: string): Promise<boolean>;
  requestPairing(input: { phoneE164: string; sourceJid: string }): Promise<PairingRequestResult>;
  approveByCode(code: string): Promise<PairingApproveResult>;
}

class InMemoryPairingStore implements PairingStore {
  private readonly paired = new Set<string>();
  private readonly pendingByPhone = new Map<string, string>();
  private readonly phoneByCode = new Map<string, string>();

  async isPaired(phoneE164: string): Promise<boolean> {
    return this.paired.has(phoneE164);
  }

  async requestPairing(input: { phoneE164: string }): Promise<PairingRequestResult> {
    if (this.paired.has(input.phoneE164)) {
      return { code: "", alreadyPaired: true };
    }
    const existing = this.pendingByPhone.get(input.phoneE164);
    if (existing) {
      return { code: existing, alreadyPaired: false };
    }
    const code = generatePairingCode();
    this.pendingByPhone.set(input.phoneE164, code);
    this.phoneByCode.set(code, input.phoneE164);
    return { code, alreadyPaired: false };
  }

  async approveByCode(code: string): Promise<PairingApproveResult> {
    const phone = this.phoneByCode.get(code);
    if (!phone) {
      return { ok: false };
    }
    this.paired.add(phone);
    this.phoneByCode.delete(code);
    this.pendingByPhone.delete(phone);
    return { ok: true, phoneE164: phone };
  }
}

class PostgresPairingStore implements PairingStore {
  private readonly pool: Pool;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async isPaired(phoneE164: string): Promise<boolean> {
    await this.ensureInitialized();
    const result = await this.pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM whatsapp_pairings WHERE phone_e164 = $1 AND status = 'approved'
      ) AS exists`,
      [phoneE164]
    );
    return Boolean(result.rows[0]?.exists);
  }

  async requestPairing(input: { phoneE164: string; sourceJid: string }): Promise<PairingRequestResult> {
    await this.ensureInitialized();

    const approved = await this.isPaired(input.phoneE164);
    if (approved) {
      return { code: "", alreadyPaired: true };
    }

    const pending = await this.pool.query<{ pairing_code: string }>(
      `SELECT pairing_code
       FROM whatsapp_pairings
       WHERE phone_e164 = $1 AND status = 'pending'
       ORDER BY id DESC
       LIMIT 1`,
      [input.phoneE164]
    );
    if (pending.rows[0]?.pairing_code) {
      return { code: pending.rows[0].pairing_code, alreadyPaired: false };
    }

    const code = generatePairingCode();
    await this.pool.query(
      `INSERT INTO whatsapp_pairings (phone_e164, source_jid, pairing_code, status)
       VALUES ($1, $2, $3, 'pending')`,
      [input.phoneE164, input.sourceJid, code]
    );
    return { code, alreadyPaired: false };
  }

  async approveByCode(code: string): Promise<PairingApproveResult> {
    await this.ensureInitialized();
    const result = await this.pool.query<{ phone_e164: string }>(
      `UPDATE whatsapp_pairings
       SET status = 'approved', approved_at = NOW()
       WHERE pairing_code = $1 AND status = 'pending'
       RETURNING phone_e164`,
      [code]
    );
    const phone = result.rows[0]?.phone_e164;
    if (!phone) {
      return { ok: false };
    }
    return { ok: true, phoneE164: phone };
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
      CREATE TABLE IF NOT EXISTS whatsapp_pairings (
        id BIGSERIAL PRIMARY KEY,
        phone_e164 TEXT NOT NULL,
        source_jid TEXT NOT NULL,
        pairing_code TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        approved_at TIMESTAMPTZ NULL
      )
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_whatsapp_pairings_phone_status
      ON whatsapp_pairings (phone_e164, status)
    `);
    this.initialized = true;
  }
}

let singleton: PairingStore | null = null;

export function getPairingStore(): PairingStore {
  if (singleton) return singleton;
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    singleton = new PostgresPairingStore(databaseUrl);
    return singleton;
  }
  singleton = new InMemoryPairingStore();
  return singleton;
}

function generatePairingCode(): string {
  return String(Math.floor(Math.random() * 900000) + 100000);
}
