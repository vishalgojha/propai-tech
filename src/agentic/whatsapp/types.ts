export type WhatsAppDmPolicy = "pairing" | "allowlist" | "open" | "disabled";

export type MinimalWppMessage = {
  id?: string | { _serialized?: string };
  body?: string;
  from?: string;
  to?: string;
  fromMe?: boolean;
  isGroupMsg?: boolean;
};

export type InboundEnvelope = {
  messageId: string;
  body: string;
  fromJid: string;
  fromE164: string | null;
  isFromMe: boolean;
  isGroup: boolean;
};
