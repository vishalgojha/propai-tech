export type ConnectorCapability =
  | "llm_inference"
  | "chat_transport"
  | "message_search"
  | "listing_publish"
  | "persistence"
  | "gateway_probe"
  | "inbound_listener";

export type Connector = {
  id: string;
  name: string;
  provider: string;
  domain: "llm" | "transport" | "persistence" | "publishing" | "ops";
  capabilities: ConnectorCapability[];
  description: string;
};

export type Credential = {
  id: string;
  name: string;
  envVar: string;
  present: boolean;
  source: "env" | "none";
  redactedValue?: string;
};

export type ConnectorCredentialPairStatus =
  | "connected"
  | "missing_credentials"
  | "not_required"
  | "optional";

export type ConnectorCredentialPair = {
  id: string;
  connectorId: string;
  credentialIds: string[];
  status: ConnectorCredentialPairStatus;
  note?: string;
};

export type ConnectorCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

export type ConnectorHealthStatus = "healthy" | "degraded" | "unhealthy" | "unconfigured";

export type ConnectorHealthItem = {
  connector: Connector;
  pair: ConnectorCredentialPair;
  status: ConnectorHealthStatus;
  checks: ConnectorCheck[];
};

export type ConnectorHealthSnapshot = {
  generatedAtIso: string;
  credentials: Credential[];
  pairs: ConnectorCredentialPair[];
  connectors: ConnectorHealthItem[];
};
