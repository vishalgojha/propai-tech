# KPI Contract

Use one weekly primary outcome for execution focus:

- `Outcome`: broker chat -> clean lead -> follow-up conversion reliability.

Track these three KPIs each week before adding new platform scope:

1. `parse_precision`
- Definition: correctly extracted lead fields / total extracted fields in labeled sample.
- Sample size: minimum 100 messages per week.
- Target: >= 0.90.
- Owner: lead extraction workflow.

2. `lead_dedupe_rate`
- Definition: duplicate leads detected / total inbound lead candidates.
- Target: >= 0.95 duplicates blocked without false merges > 0.02.
- Owner: ingestion + dedupe.

3. `action_acceptance_rate`
- Definition: approved actions / total approval prompts.
- Includes: send, publish, schedule actions that require operator approval.
- Target: >= 0.70 with guardrail violations at 0 critical incidents.
- Owner: approval UX + agent behavior.

Review cadence:

- Monday: set weekly target values.
- Friday: publish KPI snapshot and one root-cause note per missed KPI.
