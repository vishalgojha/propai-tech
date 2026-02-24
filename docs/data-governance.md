# Data Governance Policy

This project processes WhatsApp-derived lead data. The defaults below are mandatory for non-demo usage.

## Data Classification

- `PII`: phone numbers, names, direct contact identifiers.
- `Operational`: approval logs, tool execution metadata, portal publish status.
- `Derived`: extracted lead requirements, match scores, follow-up recommendations.

## Redaction Defaults

- Never return or export raw contact dumps from broker groups.
- Keep connector credential responses redacted by default.
- Avoid logging full phone numbers in app logs; prefer masked form (`+91******1234`) when logging is necessary.
- Block user prompts that ask for scraping/exporting group member contact data.

## Retention Defaults

- Raw message payloads: max 30 days.
- Derived lead objects: max 365 days.
- Approval and tool execution logs: max 180 days.
- Backups containing PII must follow the same retention window and deletion schedule.

## Access Rules

- Operator actions that trigger outbound messaging or publishing require explicit approval.
- Use role-based headers (`x-agent-role`) and API key protection (`x-agent-api-key`) in production.
- Limit database and dashboard access to approved operations users.

## Incident Response

- If PII leakage is suspected: stop outbound automation, rotate keys, and audit logs immediately.
- Record incident timestamp, impacted records, and mitigation steps in the weekly operations report.
