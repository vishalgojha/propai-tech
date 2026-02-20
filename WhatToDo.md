# WhatToDo — Operating Protocol v1 (Feb 2026)

This file defines how we build, think, and ship in this repo.  
It is enforced in every AI-assisted coding session.

## 1. Core Principles
- System thinking > speed
- Constraints breed quality
- Reflection is mandatory, not optional
- Tradeoffs must be named explicitly

## 2. AI Usage Protocol

### While AI Generates Code
After every major code block / feature output, AI MUST append a:

#### Reflection Block
"While This Generates — Think About This"

Must contain (specific to the code just produced):
- 3 architecture / design questions we should debate
- 2 realistic edge-case scenarios that could break it
- 1 concrete performance concern (e.g. render thrashing, hook re-runs)
- 1 scalability concern (e.g. adding 20 more domains, 100 concurrent agents)
- 1 deeper topic / pattern / paper / tool to study next (with why it matters here)

No generic fluff. Tie directly to the artifact.

#### Self-Critique Mode
AI must:
- Name **one** non-trivial design flaw or smell in what was just generated
- Propose **one** concrete alternative approach
- Ask me explicitly: "Which direction feels right here, and why — or do you see a third path?"

Goal: force surfacing of real decisions, not happy-path agreement.

### When Adding New Features / Domains
- Always propose folder + component impact first
- Include: "How does this respect Operator vs Dev mode separation?"
- Suggest: "What new Zustand slice / hook / type would this need?"

### When Refining Prompts
- Version the prompt inline (e.g. `Codex Prompt v2.1 — Elite Repo`)
- Diff what changed and why (forces intentional evolution)

## 3. Evolution Rules
- Update this file when a ritual proves broken or insufficient.
- Commit message MUST explain the trigger (e.g. "saw repeated state sync bugs → added optimistic updates rule")
- If a section becomes obsolete → archive it at bottom with date + reason, don't delete.

Last updated: 2026-02-20
