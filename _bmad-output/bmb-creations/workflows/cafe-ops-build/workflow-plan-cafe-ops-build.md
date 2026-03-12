---
stepsCompleted: ['step-01-discovery', 'step-02-classification', 'step-03-requirements', 'step-04-tools', 'step-05-plan-review']
created: 2026-03-04
status: APPROVED_FOR_DESIGN
approvedDate: 2026-03-05
---

# Workflow Creation Plan

## Discovery Notes

**User's Vision:**
A streamlined BMAD workflow that guides the user and Claude Code through building a Café Operations Management Web Application — from PRD validation through Design & Architecture, MVP scoping, and sprint-based implementation to a fully deployed app. The workflow skips Analysis (PRD already exists) and merges Planning + Solutioning into a single Design & Architecture phase, then loops through feature sprints per PRD phase.

**Who It's For:**
The user (Base) working collaboratively with Claude Code as the development partner. BMAD agents (Mary, John, Sally, Winston, Bob, Amelia) facilitate each phase.

**What It Produces:**
A fully developed café management web app featuring: Action Feed (dashboard + checklists), Inventory Management (slider-based), Wastage/Complementary Tracker (with comp budgeting), Operations (Suppliers + Recipes), and Authentication with Manager/Staff roles.

**Key Insights:**
- PRD already exists and is comprehensive — workflow skips Analysis phase, starts at PRD validation
- UX spec replaced by component library + screen layout notes during architecture (leaner for internal tool)
- Tech stack is open — architecture step uses recommend-then-override pattern
- Two user roles: Manager and Staff with defined permissions
- MVP-first approach across 3 development phases outlined in the PRD
- Workflow mirrors PRD's 3-phase structure with repeating Plan → Build → Deploy cycles
- Planning and Solutioning merged into a single "Design & Architecture" phase
- Implementation uses shared-foundations-first, then feature-by-feature vertical slices

## Classification Decisions

**Workflow Name:** cafe-ops-build
**Target Path:** {project-root}/_bmad/custom/src/workflows/cafe-ops-build/

**4 Key Decisions:**
1. **Document Output:** true — produces deliverables at each phase (architecture.md, epics.md, sprint-status.yaml, stories, code)
2. **Module Affiliation:** Standalone — custom workflow for this café project
3. **Session Type:** Continuable — multi-session, massive scope spanning full BMAD lifecycle
4. **Lifecycle Support:** Create-only — get the create flow right first, add edit/validate later

**Structure Implications:**
- Needs `steps-c/` directory (create-only, can add steps-e/ and steps-v/ later)
- Needs `step-01-init.md` with continuation detection and `step-01b-continue.md` for resuming
- Needs `stepsCompleted` tracking in output frontmatter
- Shared `data/` folder (ready for future tri-modal expansion)
- Free-form document output template with progressive content appending

**Dual-Output Tracking (from ADR review):**
- BMAD deliverables (PRD, UX spec, architecture, epics, stories) tracked via `stepsCompleted` in frontmatter
- Codebase output tracked separately — workflow orchestrates code generation but does not track individual files in `stepsCompleted`
- This separation keeps the workflow clean and avoids conflating document progress with code progress

**Pre-mortem Preventions (applied):**

1. **Minimum Viable Planning Gate:**
   - Cap pre-implementation phases. After architecture + first epic are defined, begin coding immediately
   - Remaining docs can be refined in parallel with development, not as blockers
   - Workflow should enforce: "You have enough to start building. Let's code."

2. **Decisions Log for Context Recovery:**
   - Each step must append a "Key Decisions" summary to the plan document
   - The continuation step (`step-01b-continue.md`) must load the full decisions log on resume, not just check `stepsCompleted`
   - Decisions log captures: tech stack choices, architectural patterns, scope decisions, naming conventions

3. **MVP Scoping Step:**
   - Add a dedicated step before implementation that forces explicit feature cuts
   - The workflow must ask: "What are you willing to NOT build in Phase 1?"
   - Define a hard MVP boundary that the implementation steps enforce

4. **Recommend-then-Override Pattern:**
   - Architecture step presents a recommended tech stack with rationale
   - User accepts or overrides specific choices — not open-ended "what should we use?"
   - Timebox the decision to prevent analysis paralysis

5. **Deployment Steps:**
   - Add deployment planning during the architecture phase (hosting, CI/CD, environment strategy)
   - Add deployment execution at the end of each sprint/epic
   - No "works on localhost only" — deployment is a first-class workflow concern

**What-If Alternatives (applied):**

1. **Skip Analysis Phase:**
   - PRD already covers discovery, brainstorming, and product brief
   - Workflow starts at PRD validation instead of redoing analysis
   - Saves 1-2 sessions of redundant work

2. **Merge Planning + Solutioning → "Design & Architecture" Phase:**
   - PRD validation, screen layouts, architecture, and epics in one phase
   - Reduces context switches — UX and architecture inform each other
   - One person + AI doesn't need the phase boundary

3. **Feature-by-Feature Build (with shared foundations first):**
   - Architecture step establishes shared foundations: DB schema, auth, component library, API patterns
   - Then each feature is a vertical slice: Dashboard → Inventory → Wastage → Suppliers → Recipes
   - Working features visible faster, natural progress milestones

4. **Mirror PRD's 3-Phase Structure:**
   - Workflow loops: Design & Architecture → Build → Deploy per phase
   - Phase 1 (MVP): Dashboard, Inventory, Wastage, Suppliers, Recipes
   - Phase 2: Alerts, automation, reminders
   - Phase 3: Analytics, multi-location, POS
   - Natural stopping points and clear "done" states

5. **Skip Full UX Spec → Component Library + Screen Notes:**
   - Choose a component library (e.g., shadcn/ui) during architecture
   - Add lightweight screen layout notes instead of a full UX spec
   - PRD already describes what each screen needs — that's sufficient for an internal tool

**Agent Round Table Insights (applied):**

1. **Mary — User Journey Validation:**
   - PRD validation step must include: "Walk me through a manager's first 10 minutes with this app"
   - Expose gaps between features described and actual user experience
   - Validate the HOW, not just the WHAT

2. **John — Distinct Sub-Steps + Epic Granularity:**
   - Within merged Design & Architecture phase, maintain clear sub-steps with handoffs:
     a. PRD Validation ("are we building the right thing?")
     b. Screen Layouts ("what goes where?")
     c. Architecture ("how do we build it?")
     d. Epic Planning ("what are the work units?")
   - Force epic granularity — e.g., Dashboard = 2 epics (layout/nav + dynamic widgets), not 1

3. **Sally — 3 Screen Layout Questions:**
   - Per screen during architecture, answer:
     a. What data is displayed?
     b. What actions can the user take?
     c. What's the primary vs. secondary information hierarchy?
   - Minimal effort (5 min per screen), prevents days of rework

4. **Winston — Pre-Seeded Tech Stack Recommendation:**
   - Next.js (full-stack, frontend + API routes — no separate backend needed)
   - PostgreSQL (relational, matches PRD's data model)
   - Tailwind + shadcn/ui (fast, consistent, great for internal tools)
   - NextAuth.js (simple role-based auth for Manager/Staff)
   - Prisma (type-safe ORM, excellent DX with PostgreSQL)
   - Vercel (natural Next.js deployment target)
   - Monorepo, full-stack, single deployment

5. **Bob — Definition of Done + Sprint Structure:**
   - Each feature story includes Definition of Done:
     a. Acceptance criteria met (from PRD)
     b. Works on desktop and mobile
     c. Auth/permissions enforced per role
     d. Data persists correctly
   - Sprint structure for Phase 1 MVP:
     - Sprint 0: Shared foundations
     - Sprint 1: Dashboard + Auth (need both to test anything)
     - Sprint 2: Inventory + Wastage
     - Sprint 3: Suppliers + Recipes

6. **Amelia — Sprint 0 Shared Foundations:**
   - Before any feature work, Sprint 0 produces:
     a. Prisma schema with all tables from PRD
     b. Seed data for testing
     c. Auth system with Manager/Staff roles working
     d. Base layout with bottom navigation (desktop) + hamburger menu (mobile)
   - After Sprint 0, features become true vertical slices

**First Principles Refinements (applied):**

1. **Multi-session memory is the core problem:**
   - The workflow + decisions log is the solution — not just step tracking
   - Every step appends key decisions to plan doc for context recovery

2. **Step discipline prevents skipping:**
   - Keep step-file architecture even with fewer steps
   - The discipline of clear entry/exit criteria per step is the real value

3. **Sprint 0 should be fast:**
   - Mark Sprint 0 as single-session, lightweight
   - Prisma schema from PRD is near-instant with Claude Code
   - Auth + base layout are known patterns — don't over-engineer

4. **PRD guides, doesn't dictate:**
   - PRD validation step explicitly allows overrides
   - Principle: "Override where architectural reality demands"
   - Example: bottom nav on desktop may be challenged during screen layouts

5. **Deployment should be automatic, not ceremonial:**
   - Set up Vercel deployment once during Sprint 0
   - Auto-deploy on push to main — no separate deploy steps per sprint
   - Remove "Deploy Phase 1/2/3" as separate workflow steps

6. **Offline-first deferred — standard architecture for MVP:**
   - Offline-first moved to Phase 2 to reduce architecture complexity
   - MVP uses standard Next.js + Vercel (online-required)
   - Design Principle #8 replaced: "Offline-First" (deferred to Phase 2) → "Fast by Default" (page loads <2s, no spinners, instant feedback on every tap)

**Revised Workflow Shape:**

```
Phase 1 (MVP):
  Init/Continue → PRD Validation (+ user journey check, PRD guides not dictates, add comp budget permissions)
  → Design & Architecture:
      a. Screen layouts (3 questions per screen — NOTE: Action Feed density needs careful layout)
      b. Tech stack (recommend-then-override)
      c. Architecture doc
      d. Epic planning (forced granularity)
  → MVP Scoping (explicit feature cuts)
  → Sprint 0: Shared Foundations — SINGLE SESSION
      (schema, seed, auth, layout, Vercel deploy setup — auto-deploys from here on)
  → Sprint 1: Action Feed + Daily Checklists [Story → Dev → Review per feature]
  → Sprint 2: Inventory (slider + template count + connected ops) [Story → Dev → Review]
  → Sprint 3: Wastage/Comp (logging + comp tracking + budgeting + auto-deduct) [Story → Dev → Review]
  → Sprint 4: Operations (Suppliers + Recipes + cost per serving) [Story → Dev → Review]
  → Phase 1 Retrospective

Phase 2 (repeat cycle):
  Design & Architecture (Phase 2 features) → Epic Planning → Sprints → Retro

Phase 3 (repeat cycle):
  Design & Architecture (Phase 3 features) → Epic Planning → Sprints → Retro
```

**Self-Consistency Validation (applied):**
- Design Principle #8 replaced: Offline-First → "Fast by Default" (page loads <2s, no spinners, instant tap feedback)
- Sprint structure updated: 3 sprints → 4 sprints (cleaner scope per sprint)
- Action Feed UX density flagged for architecture step (checklists + alerts + tasks on one screen)
- Comp budget permissions noted for PRD validation step (new feature not in original permission table)
- All pre-mortem preventions verified intact
- No major contradictions found

## Requirements

**Flow Structure:**
- Pattern: Hybrid — linear through Design & Architecture, looping for sprints (Story → Dev → Review), repeating cycle across PRD phases (Phase 1 → 2 → 3)
- Phases: Init/Continue → PRD Validation → Design & Architecture → MVP Scoping → Sprint 0 → Sprints 1-3 → Retrospective (repeating per phase)
- Estimated steps: ~12 step files for Phase 1, plus continuation and sprint loop steps

**User Interaction:**
- Style: Mixed — collaborative when deciding, prescriptive when building, intent-based when designing
- Decision points: PRD validation overrides, screen layout choices, tech stack accept/override, MVP scope cuts, epic granularity, code review approval
- Checkpoint frequency: After each Design & Architecture sub-step, after each feature in sprint loop

**Inputs Required:**
- Required: PRD document, brainstorming session results (design principles + MVP additions + priorities)
- Optional: Reference apps for design inspiration, brand guidelines/color preferences, real café operational data for seed data
- Prerequisites: Node.js/npm installed, GitHub account + repo, Vercel account, PostgreSQL (local or cloud — decided during architecture)

**Tech Stack Recommendation (for architecture step — recommend-then-override):**
- Next.js (full-stack — frontend + API routes, no separate backend needed)
- PostgreSQL (relational, matches PRD data model)
- Prisma (type-safe ORM, excellent DX)
- Tailwind CSS + shadcn/ui (fast, consistent, great for internal tools)
- NextAuth.js (simple role-based auth for Manager/Staff)
- Vercel (natural Next.js deployment, auto-deploy on push)
- Monorepo, full-stack, single deployment target

**Output Specifications:**
- Type: Document (BMAD deliverables) + Code (web application)
- Format: Free-form — each phase appends deliverables progressively
- Deliverables: PRD validation notes, screen layout specs, architecture doc, epics, sprint status, stories, code, retrospective
- Frequency: Continuous across sessions with dual-output tracking (deliverables via stepsCompleted, code tracked separately)

**Success Criteria:**
- Phase 1 MVP: Working app on Vercel with all 4 screens (Action Feed, Inventory, Wastage/Comp, Operations)
- Features: Daily Checklists (time-aware, role-aware), comp tracking + budgeting, slider inventory, actionable alerts, auth (Manager/Staff), push notifications, badge notifications
- UX: Notion minimalism, Card → Tap → Confirm pattern, badge notifications, filter/sort everywhere
- Process: Decisions log enables smooth session resumption, no scope creep, Sprint 0 in single session, each sprint produces deployed code
- Quality: Matches 9 design principles from brainstorming, passes Definition of Done per feature (acceptance criteria, responsive, auth enforced, data persists)

**Instruction Style:**
- Overall: Mixed
- Collaborative steps: PRD validation, screen layouts, MVP scoping, epic planning, code review
- Prescriptive steps: Sprint 0 foundations, story creation, code generation
- Intent-based steps: Architecture decisions, tech stack selection

**Persona Gap Fixes (from Focus Group):**

1. **User Management:** Settings/Profile panel accessible via gear icon on Action Feed. Manager sees: Add Staff, Staff List, Reset Passwords. Slide-out panel, not a 5th screen.

2. **Comp Approval Flow:** Staff comps freely within weekly budget. At 80% budget = yellow warning. At 100% = manager approval required. No per-drink approval during rush hour.

3. **Recipe Editing:** Manager edits recipes directly, no version history. When ingredient costs change via supplier module, recipe cost per serving auto-updates. Versioning deferred to Phase 2.

4. ~~**Delivery Receiving:** Removed. Staff updates inventory via slider when deliveries arrive.~~

5. **Time-Aware Checklists:** Auto-selects by time of day. Before 10am = Opening, 10am-4pm = Mid-Day, After 4pm = Closing. Manager customizes time boundaries. Staff sees right checklist automatically.

6. **Push Notifications:** Staff gets: assigned tasks, checklist reminders at shift start, comp budget warnings. Manager gets: low stock, high wastage, missed checklists. Configurable triggers.

**MVP Scope Cuts (from Persona Round 2):**

- **Offline-first → Phase 2.** Removes significant architecture complexity. Standard Next.js + Vercel approach.
- **Delivery receiving flow → Removed.** Staff updates inventory via slider. No special flow needed.
- **Recipe versioning → Removed.** Manager edits directly. Versioning deferred to Phase 2.

**Final MVP Feature Set:**

Core:
- 4-screen architecture (Action Feed, Inventory, Wastage/Comp, Operations)
- Auth (Manager/Staff) with user management panel (gear icon)
- Daily Checklists (time-aware, role-aware, accountability trail)
- Complementary tracking + comp budgeting (80%/100% thresholds)

Interaction:
- Slider inventory + template daily count (exception-based)
- Actionable alerts with one-tap resolution
- Card → Tap → Confirm universal pattern
- Badge notifications on nav icons (in-app only, no push)

UX:
- Notion-style minimalism + filter/sort everywhere
- Connected operations (wastage auto-deducts inventory, recipe cost auto-updates from supplier prices)

Deferred to Phase 2:
- Push notifications (replace with in-app badges for MVP)
- Weekly operations summary
- Offline-first architecture
- Recipe versioning
- Recipe auto-deduction from inventory (POS integration)
- Supplier auto-ordering
- Monthly trend comparisons
- Training mode for recipes

**Comparative Analysis Scoring (applied):**
- Tier 1 (must-build, 17+): Checklists, Comp Tracking, 4-Screen Arch, Actionable Alerts, Slider Inventory, Template Count, Card→Tap→Confirm
- Tier 2 (should-build, 14-16): Connected Ops, Comp Thresholds, Notion Minimalism, Time-Aware Checklists, Auth, Badge Notifications, Cost Per Serving
- Push Notifications scored 9/20 — deferred due to low feasibility (service workers, browser compat) and low differentiation
- Weekly Ops Summary scored 12/20 — deferred to Phase 2
- Filter/Sort kept — it's a UX pattern, not a separate feature

## Tools Configuration

**Core BMAD Tools:**
- **Advanced Elicitation:** Included — optional menu at end of each major phase as quality gate. Especially valuable after Architecture and MVP Scoping.
- **Party Mode:** Optional — available but not in default flow. Useful for PRD Validation and Epic Planning if user wants multi-persona debate.
- **Brainstorming:** Optional — available for future phases. Hint: trigger during Sprint 1 if Action Feed density problem needs micro-brainstorm on how checklists + alerts + tasks coexist.

**LLM Features:**
- **Web-Browsing:** Included — tech stack research (Phase 3b), library docs and troubleshooting during dev (Phase 6). Also covers API docs lookup (replaces Context7).
- **File I/O:** Included — essential everywhere (read PRD, write architecture docs, create code, update sprint status)
- **Sub-Agents:** Included — delegating research, focused code generation, and parallel test runs during Sprint Loop (Phase 6). Absorbs Sub-Processes use case.
- ~~**Sub-Processes:**~~ Removed — merged into Sub-Agents to avoid overlap.

**Memory:**
- Type: Continuable
- Tracking: stepsCompleted array, lastStep, step-01b-continue.md for resuming
- Decisions log: Each phase appends key decisions to plan doc (tech stack, scope, architecture, naming conventions). This IS the session-to-session context — no separate sidecar file needed. Single source of truth prevents drift.

**External Integrations:**
- **PostgreSQL MCP:** Direct database connectivity for schema setup and query debugging. NOT a workflow prerequisite — only required from Sprint 0 onwards. Phases 1-5 work without it.
- ~~**Context7 MCP:**~~ Removed — web browsing covers official docs for Next.js, Prisma, NextAuth, shadcn/ui. Standard stack is well-indexed.

**Installation Requirements:**
- PostgreSQL MCP (@modelcontextprotocol/server-postgres) — requires install before Sprint 0
- No other installs needed

**Sprint 0 Additions (from War Room):**
- ESLint + Prettier configuration as part of Sprint 0 foundations — enforce consistent code style from day one
- Add wireframe format guidance to Phase 3a (screen layouts) — ASCII wireframes or structured descriptions, not just text

**Workflow Step Notes (from War Room):**
- Sprint 1 step should include brainstorming trigger hint for Action Feed density problem
- Phase 3a should specify wireframe output format for screen layouts

## Pre-Design Architecture (from Advanced Elicitation Round)

**Step File Structure (final):**

```
cafe-ops-build/
├── workflow.md                    # Main workflow entry point
├── data/
│   ├── prd.md                     # PRD copied here during init
│   ├── brainstorming-results.md   # Brainstorming session copied here during init
│   ├── architecture-template.md   # Template for architecture doc output
│   ├── epic-template.md           # Template with acceptance criteria per feature
│   ├── story-template.md          # Template for feature stories (feeds Definition of Done)
│   └── sprint-status-template.yaml # Template for sprint tracking
├── steps-c/
│   ├── step-01-init.md            # Welcome, prerequisites check, file setup, load PRD + brainstorming
│   ├── step-01b-continue.md       # Load decisions log + parse sprint-status.yaml for mid-sprint resume
│   ├── step-02-prd-validation.md  # Validate PRD, user journeys, overrides → outputs validated-prd.md
│   ├── step-03a-screen-layouts.md # 3 questions × 4 screens, ASCII wireframes
│   ├── step-03b-tech-stack.md     # Recommend-then-override, Winston's stack
│   ├── step-03c-architecture.md   # DB schema, API patterns, deployment → architecture.md
│   ├── step-03d-epic-planning.md  # Forced granularity, 4 sprints, acceptance criteria per epic
│   ├── step-04-mvp-scoping.md     # Present features, force cuts, lock MVP boundary
│   ├── step-05-sprint-zero.md     # Prescriptive: exact CLI commands, schema, auth, layout, deploy, smoke test gate
│   ├── step-06a-story.md          # Create story from epic (collaborative)
│   ├── step-06b-dev.md            # Claude Code builds feature (prescriptive) + troubleshooting guidance
│   ├── step-06c-review.md         # User verifies, Definition of Done checklist (checkpoint)
│   ├── step-06d-sprint-complete.md # Sprint checkpoint, update sprint-status.yaml, advance or loop
│   └── step-07-retrospective.md   # Review, lessons learned, option: Continue to Phase 2 or mark complete
```

**Step File Design Decisions:**
- step-03 split into 4 sub-files (03a-03d) — each is a distinct thinking mode
- step-06 split into 4 sub-files (06a-06d) — most-executed part, each sub-step has different instructions
- data/ folder holds shared templates preventing drift between steps
- PRD copied to data/prd.md during init — single reference point for all steps
- step-02 outputs validated-prd.md — future steps reference validated version, not original
- sprint-status.yaml tracks: current sprint, current feature, features completed/remaining, blockers
- step-01b parses sprint-status.yaml for mid-sprint resume capability
- step-05 ends with smoke test gate (deploy, verify auth, verify dashboard renders)
- step-06b includes troubleshooting guidance for build failures, test failures, deployment breaks
- step-07 offers: Continue to Phase 2 or mark workflow as "Phase 1 Complete"

**Total Step Files:** 15 (including continue step)
**Data Files:** 6 templates/resources
