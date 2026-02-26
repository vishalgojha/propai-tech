import type { Connector, ConnectorCredentialPair, Credential } from "./types.js";
import { redactSecret } from "../utils/redact.js";

const CONNECTORS: Connector[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    provider: "openrouter.ai",
    domain: "llm",
    capabilities: ["llm_inference"],
    description: "Remote LLM provider for assistant responses."
  },
  {
    id: "xai",
    name: "xAI",
    provider: "x.ai",
    domain: "llm",
    capabilities: ["llm_inference"],
    description: "Direct xAI model provider for Grok responses."
  },
  {
    id: "ollama",
    name: "Ollama",
    provider: "local",
    domain: "llm",
    capabilities: ["llm_inference"],
    description: "Local LLM runtime for offline or fallback chat generation."
  },
  {
    id: "wacli",
    name: "WACLI",
    provider: "openclaw/wacli",
    domain: "transport",
    capabilities: ["chat_transport", "message_search"],
    description: "WhatsApp transport and message operations via CLI."
  },
  {
    id: "wppconnect_legacy",
    name: "WPPConnect Legacy",
    provider: "wppconnect",
    domain: "transport",
    capabilities: ["inbound_listener", "chat_transport"],
    description: "Legacy listener for direct WhatsApp Web sessions."
  },
  {
    id: "propai_live_bridge",
    name: "PropAI Live Bridge",
    provider: "propai.live",
    domain: "publishing",
    capabilities: ["listing_publish"],
    description: "Publishing adapter for 99acres and MagicBricks listing workflows."
  },
  {
    id: "postgres_store",
    name: "PostgreSQL Store",
    provider: "postgres",
    domain: "persistence",
    capabilities: ["persistence"],
    description: "Persistent store for listings, visits, actions, and pairing."
  },
  {
    id: "openclaw_gateway",
    name: "OpenClaw Gateway",
    provider: "openclaw",
    domain: "ops",
    capabilities: ["gateway_probe"],
    description: "Gateway diagnostics and connectivity checks."
  }
];

const CREDENTIAL_DEFS: Array<Pick<Credential, "id" | "name" | "envVar">> = [
  {
    id: "openrouter_api_key",
    name: "OpenRouter API Key",
    envVar: "OPENROUTER_API_KEY"
  },
  {
    id: "xai_api_key",
    name: "xAI API Key",
    envVar: "XAI_API_KEY"
  },
  {
    id: "database_url",
    name: "PostgreSQL URL",
    envVar: "DATABASE_URL"
  },
  {
    id: "propai_live_post_url",
    name: "PropAI Live Post URL",
    envVar: "PROPAI_LIVE_POST_URL"
  },
  {
    id: "propai_live_99acres_post_url",
    name: "PropAI Live 99acres Post URL",
    envVar: "PROPAI_LIVE_99ACRES_POST_URL"
  },
  {
    id: "propai_live_magicbricks_post_url",
    name: "PropAI Live MagicBricks Post URL",
    envVar: "PROPAI_LIVE_MAGICBRICKS_POST_URL"
  },
  {
    id: "propai_live_api_key",
    name: "PropAI Live API Key",
    envVar: "PROPAI_LIVE_API_KEY"
  },
  {
    id: "openclaw_gateway_api_key",
    name: "OpenClaw Gateway API Key",
    envVar: "OPENCLAW_GATEWAY_API_KEY"
  }
];

export function listConnectors(): Connector[] {
  return CONNECTORS.map((item) => ({ ...item, capabilities: [...item.capabilities] }));
}

export function buildCredentials(env: NodeJS.ProcessEnv = process.env): Credential[] {
  return CREDENTIAL_DEFS.map((def) => {
    const raw = env[def.envVar];
    const value = typeof raw === "string" ? raw.trim() : "";
    const present = value.length > 0;
    return {
      ...def,
      present,
      source: present ? "env" : "none",
      redactedValue: present ? redactSecret(value) : undefined
    };
  });
}

export function buildConnectorCredentialPairs(
  credentials: Credential[] = buildCredentials()
): ConnectorCredentialPair[] {
  const has = (credentialId: string) => credentials.some((item) => item.id === credentialId && item.present);
  const hasAnyPropaiLivePostUrl =
    has("propai_live_post_url") ||
    has("propai_live_99acres_post_url") ||
    has("propai_live_magicbricks_post_url");

  return [
    {
      id: "pair-openrouter",
      connectorId: "openrouter",
      credentialIds: ["openrouter_api_key"],
      status: has("openrouter_api_key") ? "connected" : "missing_credentials",
      note: has("openrouter_api_key") ? "API key available." : "Set OPENROUTER_API_KEY."
    },
    {
      id: "pair-xai",
      connectorId: "xai",
      credentialIds: ["xai_api_key"],
      status: has("xai_api_key") ? "connected" : "missing_credentials",
      note: has("xai_api_key") ? "API key available." : "Set XAI_API_KEY."
    },
    {
      id: "pair-ollama",
      connectorId: "ollama",
      credentialIds: [],
      status: "not_required",
      note: "Uses local runtime and model availability."
    },
    {
      id: "pair-wacli",
      connectorId: "wacli",
      credentialIds: [],
      status: "not_required",
      note: "Uses local wacli binary and login state."
    },
    {
      id: "pair-wppconnect",
      connectorId: "wppconnect_legacy",
      credentialIds: [],
      status: "optional",
      note: "Legacy flow uses local session QR pairing."
    },
    {
      id: "pair-propai-live",
      connectorId: "propai_live_bridge",
      credentialIds: [
        "propai_live_post_url",
        "propai_live_99acres_post_url",
        "propai_live_magicbricks_post_url",
        "propai_live_api_key"
      ],
      status: hasAnyPropaiLivePostUrl ? "connected" : "missing_credentials",
      note: hasAnyPropaiLivePostUrl
        ? "Publish endpoint configured."
        : "Set PROPAI_LIVE_POST_URL (or portal-specific URLs) to enable external posting."
    },
    {
      id: "pair-postgres",
      connectorId: "postgres_store",
      credentialIds: ["database_url"],
      status: has("database_url") ? "connected" : "missing_credentials",
      note: has("database_url") ? "Database URL configured." : "Set DATABASE_URL for persistence."
    },
    {
      id: "pair-openclaw",
      connectorId: "openclaw_gateway",
      credentialIds: ["openclaw_gateway_api_key"],
      status: has("openclaw_gateway_api_key") ? "connected" : "optional",
      note: has("openclaw_gateway_api_key")
        ? "Gateway bearer token configured."
        : "Token optional for unprotected local gateway."
    }
  ];
}
