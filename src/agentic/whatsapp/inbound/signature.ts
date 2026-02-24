import { createHmac, timingSafeEqual } from "node:crypto";

type VerifyHubSignatureInput = {
  appSecret?: string;
  rawBody: Buffer;
  signatureHeader?: string | string[];
};

export type VerifyHubSignatureResult =
  | { ok: true; skipped?: boolean }
  | { ok: false; reason: string };

export function verifyHubSignature256(input: VerifyHubSignatureInput): VerifyHubSignatureResult {
  const appSecret = String(input.appSecret || "").trim();
  if (!appSecret) {
    return { ok: true, skipped: true };
  }

  const signatureHeader = normalizeSignatureHeader(input.signatureHeader);
  const prefix = "sha256=";
  if (!signatureHeader || !signatureHeader.startsWith(prefix)) {
    return { ok: false, reason: "missing_sha256_prefix" };
  }

  const provided = signatureHeader.slice(prefix.length).trim().toLowerCase();
  if (!isHex(provided)) {
    return { ok: false, reason: "invalid_signature_hex" };
  }

  const digest = createHmac("sha256", appSecret)
    .update(input.rawBody)
    .digest("hex")
    .toLowerCase();

  const ok = timingSafeHexEquals(digest, provided);
  if (!ok) {
    return { ok: false, reason: "signature_mismatch" };
  }

  return { ok: true };
}

function normalizeSignatureHeader(header: string | string[] | undefined): string {
  if (!header) return "";
  if (Array.isArray(header)) {
    return String(header[0] || "");
  }
  return String(header);
}

function isHex(value: string): boolean {
  if (!value || value.length % 2 !== 0) return false;
  return /^[a-f0-9]+$/i.test(value);
}

function timingSafeHexEquals(aHex: string, bHex: string): boolean {
  if (!isHex(aHex) || !isHex(bHex)) return false;
  if (aHex.length !== bHex.length) return false;
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
