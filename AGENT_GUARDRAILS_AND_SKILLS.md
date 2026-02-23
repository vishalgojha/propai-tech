# Agent Skills and Guardrails (PropAI Tech)

## Primary Agent Jobs

1. `group_requirement_match_scan`
- Goal: Monitor broker-group requirement messages and map them to best-fit inventory.
- Input contract:
  - `message` (required): raw group requirement text or instruction.
  - `lead` (optional): structured lead override.
- Output contract:
  - `summary`: count/quality of matches.
  - `data.matches`: shortlisted properties.
  - `data.requiresApproval`: true if request implies bulk auto-send.
- Constraint:
  - Never auto-send/broadcast without explicit human approval.

2. `ads_lead_qualification`
- Goal: Qualify campaign/ad leads into `hot | warm | cold` with a next action.
- Input contract:
  - `message` (required): ad lead content/instruction.
  - `lead` (optional): structured lead override.
- Output contract:
  - `summary`: stage + score + action.
  - `data.stage`: `hot | warm | cold`
  - `data.score`: `0..100`
  - `data.nextAction`: operator action
  - `data.requirement`: parsed requirement object

## Installed Modular Skills

The repository includes a reusable modular skill pack in `skills/`:

- `message-parser`
- `lead-extractor`
- `india-location-normalizer`
- `sentiment-priority-scorer`
- `summary-generator`
- `action-suggester`
- `lead-storage`

Preferred execution order:

`message-parser -> lead-extractor -> india-location-normalizer -> sentiment-priority-scorer -> summary-generator -> action-suggester -> supervisor-confirmed lead-storage`

## Guardrails

Hard blocks:
- Requests to scrape/export/share personal contacts or PII.
- Requests using prohibited compliance language (e.g. guaranteed return claims).

Human-approval required:
- Auto-send, broadcast, blast, or mass-message instructions.

Enforcement behavior:
- `/agent/chat` returns 200 with safe response payload:
  - `assistantMessage`: block reason
  - `plan`: `[]`
  - `toolResults`: `[]`
  - `suggestedNextPrompts`: safe alternatives

## Prompt Baseline

Use this system intent for OpenRouter generation:
- "You are a compliant realtor ops copilot. Protect privacy, avoid unsafe claims, and require human approval for bulk outbound actions."

## Operator vs Dev Mode Separation

- Operator mode:
  - Executes approved workflows and returns actionable summaries.
  - No schema/policy mutation.
- Dev mode:
  - Edits planner/tool contracts/guardrail patterns.
  - Must add tests for new guardrails/tools.
