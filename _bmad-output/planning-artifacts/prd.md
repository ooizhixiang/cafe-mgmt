---
stepsCompleted: [step-01-init, step-02-discovery, step-02b-vision, step-02c-executive-summary, step-03-success, step-04-journeys, step-05-domain-skipped, step-06-innovation, step-07-project-type, step-08-scoping, step-09-functional, step-10-nonfunctional, step-11-polish]
inputDocuments:
  - product-brief-cafe-mgmt-2026-03-05.md
  - brainstorming-session-2026-03-05-001.md
  - workflow-plan-cafe-ops-build.md
workflowType: 'prd'
documentCounts:
  briefs: 1
  research: 0
  brainstorming: 1
  projectDocs: 0
  projectContext: 0
classification:
  projectType: 'Web Application (mobile-first, PWA-ready)'
  domain: 'Small Business Operations Management (Food & Beverage)'
  complexity: medium
  projectContext: greenfield
  usageContext: 'Internal tool first, potential product later'
  financialScope: 'Operational cost tracking only — no financial transactions'
  domainCharacteristics: 'Perishable inventory, shift-based access, physical-digital bridge, cost attribution'
---

# Product Requirements Document - cafe mgmt

**Author:** Base
**Date:** 2026-03-06

## Executive Summary

Cafe mgmt is a mobile-first web application that replaces notebooks, spreadsheets, and memory with a proactive operational assistant for single-location cafe managers and staff. The app answers one question every morning: "What needs doing right now?" — then makes doing it take two taps.

The ultimate outcome is trust. Within a month, the manager (Dana, 34, owner-operator) trusts the app to hold the cafe's operational knowledge. When she's sick, the cafe runs itself — because the system holds the rhythm, not the person. Staff (Jake, 22, barista) start shifts knowing exactly what to do without asking.

Four screens connect daily operations into one loop. Log wasted oat milk — inventory auto-deducts with visible confirmation and undo. Comp a drink for a regular — it counts against a visible weekly budget with 80%/100% threshold warnings. Every operational event carries a dollar value — this is a system-wide architectural principle, not just a display feature.

The manager gets oversight without micromanaging. Staff get clarity without surveillance. The system is adaptable — checklists, ingredients, comp budgets, and time boundaries are all configurable to match each cafe's rhythm.

**MVP ships in 4 sprints:** Sprint 0 (foundations + auth + deploy) → Sprint 1 (Action Feed + Checklists) → Sprint 2 (Inventory + Wastage/Comp) → Sprint 3 (Operations: Suppliers + Recipes).

### Design Principles

1. **Domain Intelligence** — The app knows how cafes work. Auto-selects checklists by time of day. Knows wastage deducts inventory. Knows comps need budgets. Opinionated, not generic.
2. **Proactive** — The app tells you what needs doing. Problems surface ranked by urgency with one-tap resolution. Fundamentally different from tools that wait.
3. **Coherent** — Everything connected. Wastage → inventory. Supplier prices → recipe costs. Checklists → accountability trail. One integrated loop, not separate modules.
4. **In-the-Gap Operations** — Designed for people always doing something else. One-handed, interruptible, glanceable. Target interaction complexity: consumer app level (no training needed). Card → Tap → Confirm.
5. **Exception-Based** — Predict and verify, not count and enter. Template daily counts pre-fill yesterday's values. Manager manages anomalies, not audits.

## Project Classification

| Attribute | Value |
|-----------|-------|
| Project Type | Web Application (mobile-first; PWA-compatible architecture from Sprint 0, PWA features deferred to Phase 2) |
| Domain | Small Business Operations Management (Food & Beverage) |
| Complexity | Medium — connected operations, role-based auth, business rules, time-based logic, custom slider component |
| Project Context | Greenfield |
| Usage Context | Internal tool first, potential product later |
| Financial Scope | Operational cost tracking only — no financial transactions |
| Domain Characteristics | Perishable inventory, shift-based access, physical-digital bridge, cost attribution |

## Success Criteria

### North Star Metric

**Checklist completion rate >90%.** If daily checklists are being completed on time by the right people, the operational rhythm is working. Everything else is supporting evidence.

### What Success Looks Like

Dana opens the app at 5:55am and her morning runs itself — checklists, inventory checks, supplier reminders, all done in under 10 minutes. Jake starts his shift and knows exactly what to do without asking. Wastage and comp spending are visible in dollars for the first time. Within a month, Dana trusts the app enough to take a day off.

### Sprint Gates

| Sprint | Gate | Pass Criteria |
|--------|------|---------------|
| Sprint 1 | Checklist viability | >80% of checklists completed on time during testing. Template includes smart items (links to other modules). |
| Sprint 2 | Core operations | Inventory count <60s. Wastage logging <5s. Auto-deduct correct (capped at available, no negatives). Manager can pin daily-use ingredients to top. |
| Sprint 3 | Full workflow | Dana's full morning workflow completes in under 10 minutes end-to-end. |
| Post-launch (2 weeks) | Adoption | Dana + 1 staff performing at least one meaningful action daily for 14 consecutive days post full MVP deploy. |

### Primary KPIs

| KPI | Target | Measurement |
|-----|--------|-------------|
| Checklist completion rate | >90% on time by correct role | App timestamps (Sprint 1+) |
| Wastage + comp dollars/week | Visible and tracked weekly | App dollar totals (Sprint 2+) |
| Ingredient stockout events | Trending toward zero | Inventory threshold breaches (Sprint 2+) |

### Go/No-Go for Phase 2

If after 2 weeks of full MVP use, Dana's app is her primary operational tool and she can identify at least one cost insight or prevented problem she wouldn't have had otherwise, proceed to Phase 2. If checklists aren't getting daily use by end of week 1, re-evaluate the core hypothesis before building more.

### Technical Constraints

| Constraint | Requirement | Test Method |
|-----------|-------------|-------------|
| Data integrity | All mutations use DB transactions; optimistic UI with server confirmation; error toast + retry on failure | Automated tests |
| Connected ops | Auto-deduct capped at available qty; visible confirmation + 5s undo | Manual + automated tests |
| Auth | Manager: all screens + settings + staff mgmt. Staff: Action Feed + Wastage/Comp + checklists only. | Role-based test matrix |
| PWA-compatible | manifest.json, service worker ready routes, all data server-persisted | Architecture review |
| Deploy | Vercel, auto-deploy on push to main | CI/CD verification |

*Detailed performance, browser, and accessibility requirements in Non-Functional Requirements and Technical Specifications sections.*

## User Journeys

### Journey 1: Dana — The Morning That Runs Itself (Success Path)

**Opening Scene:** It's 5:55am. Dana unlocks the cafe's back door, coffee in hand, phone in the other. Six months ago, this moment meant pulling out a notebook, checking a spreadsheet on her laptop, and trying to remember which supplier she promised to call back. Her stomach used to knot up — *what am I forgetting?*

**Rising Action:** She opens the app. The Action Feed shows three cards: Opening checklist (7 items, 0% complete), an amber alert — "Oat milk at 28%, order threshold is 25%," and a supplier reminder — "Call Bean Co today (last order: 12 days ago)." She taps the checklist. Items appear in order: *Check espresso machine pressure. Restock cups. Verify pastry delivery arrived.* Tap, tap, tap — each item confirmed with a satisfying checkmark. One item links to the inventory screen — she taps through, sees yesterday's counts pre-filled, confirms the unchanged items with single taps, adjusts whole milk down (used more than expected yesterday). The slider snaps to familiar increments. She's back on the checklist in 15 seconds.

**Climax:** She taps the oat milk alert — "Call supplier? [Yes / Later]." She taps Yes, the phone dialer opens with the supplier's number pre-loaded. Two rings, places the order, taps back — "Ordered / No answer / Call back" — she taps Ordered. The alert resolves. Seven minutes have passed since she walked in. The checklist shows 100%. The Action Feed is clean.

**Resolution:** Dana pours herself a second coffee. The first customer won't arrive for 30 minutes. She used to spend that time catching up. Now she spends it on quality — dialing in the espresso, arranging the pastry case. The cafe opens calm, not chaotic. When she checks the app at noon, Jake has completed the Mid-Day checklist without being asked.

**Requirements Revealed:** Action Feed with prioritized cards, time-aware checklist auto-selection, inventory quick-confirm flow, supplier call integration with outcome logging, alert resolution with one-tap actions, checklist completion tracking.

---

### Journey 2: Dana — The Day She Doesn't Show Up (Edge Case / Resilience)

**Opening Scene:** Dana wakes up with a 102 degree fever. She can't go in. Six months ago, this meant 20 minutes of panicked texts to Jake: *"Don't forget to check the milk. Call the bean supplier. The pastry order should arrive by 7. The closing checklist is in the blue notebook on the shelf."* Today, she sends one text: *"I'm sick. The app has everything."*

**Rising Action:** Jake opens the app at 6:15am. He's Staff role — his Action Feed shows the Opening checklist (role-filtered to his items), plus an alert: "Oat milk at 28%." He doesn't see supplier management or settings — that's manager-level. He works through the checklist. One item he's unsure about — *"Verify pastry delivery matches invoice"* — but the checklist item has a note Dana added: *"Count matches printed sheet on clipboard."* He checks. It matches. He taps confirm.

**Climax:** At 10am, Jake accidentally makes a large latte with regular milk instead of oat. He needs to log wastage. He opens Wastage, taps "Spilled drink," selects "Oat Milk Latte — Large," confirms. The app shows: "Oat milk adjusted: 28% → 25%. Now at order threshold." He sees the alert but can't call suppliers — that's Dana's role. The alert persists on Dana's feed for when she's back.

**Resolution:** Dana checks the app from bed at 2pm. She sees: Opening checklist — completed by Jake at 6:42am. Mid-Day checklist — completed at 11:15am. One wastage event logged. Oat milk at threshold. Comp budget: $8 remaining this week. She calls the supplier from the app, places the order. The cafe ran without her. She goes back to sleep.

**Requirements Revealed:** Role-based content filtering, checklist notes/context per item, wastage logging by staff with auto-deduct, role-restricted actions (suppliers = manager only), manager oversight without presence, persistent alerts across roles.

---

### Journey 3: Jake — The Shift That Just Works (Staff Daily Flow)

**Opening Scene:** Jake clocks in at 11am for the afternoon shift. He used to stand around for five minutes waiting for someone to tell him what to do — wipe down tables? Restock? Check something? Now he pulls out his phone while tying his apron.

**Rising Action:** The Action Feed shows: Mid-Day checklist (6 items, 0%), and a comp budget card — "$12 remaining this week." He taps the checklist. *Wipe down tables. Restock to-go cups. Check pastry case — pull anything expiring today.* He finds two stale croissants. He pulls them, opens Wastage, taps "Expired ingredient," selects "Croissant" x 2. The app confirms: "$4.80 wastage logged. Inventory adjusted." Two taps, five seconds, done.

**Climax:** A regular customer — Sarah — comes in looking rough. Jake wants to comp her a coffee. He taps Wastage/Comp, switches to the Comp tab, logs "Flat White — Regular" with reason "Regular customer." The app shows: "$5.50 logged. Budget remaining: $6.50 this week." He knows he's within bounds. No guilt, no guessing, no asking Dana.

**Resolution:** End of shift. Jake's checklist is 100% complete. He logged one wastage event and one comp. Total time spent in the app: under 3 minutes across the whole shift. He never asked Dana a single question. He clocks out knowing he did his job — and the app proves it.

**Requirements Revealed:** Staff-focused Action Feed (simplified), comp budget visibility and tracking, wastage quick-log presets, dollar value display on every event, checklist as shift structure, minimal time-in-app for staff.

---

### Journey 4: Dana — Setting Up the System (Onboarding / Admin)

**Opening Scene:** Dana just signed up. She's staring at an empty app thinking *"Great, another tool I have to set up."* She's tried three apps before — all abandoned after setup took too long.

**Rising Action:** The app asks one question: "What kind of cafe do you run?" Three templates appear: Specialty Coffee / Traditional Cafe / Tea & Light Bites. Dana taps Specialty Coffee. Instantly, the app populates: 18 common ingredients (espresso beans, whole milk, oat milk, vanilla syrup...), three daily checklists (Opening/Mid-Day/Closing) with sensible defaults, and sample supplier placeholders. The Action Feed shows onboarding tasks as cards: *"Review your ingredient list" / "Add your first supplier" / "Invite a staff member."*

**Climax:** Dana edits the ingredient list — removes almond milk (they don't carry it), adds their house-made cold brew concentrate, adjusts the oat milk container from "carton" to "case (6-pack)." She sets snap increments: milk by 10%, beans by 250g bags. She customizes the Opening checklist — adds "Check espresso pressure (should read 9 bar)" and removes "Unlock patio" (no patio). She sets the comp budget: $50/week, reset Monday. Total setup: 12 minutes.

**Resolution:** She taps "Invite Staff," creates Jake's account with Staff role, texts him the login. Tomorrow morning, the system is live. The onboarding cards fade from the Action Feed, replaced by real operational cards. Setup didn't feel like work — it felt like teaching the app how *her* cafe runs.

**Requirements Revealed:** Quick-start templates (3 cafe types), progressive onboarding via Action Feed cards, ingredient customization (container profiles, snap increments), checklist template editing, comp budget configuration (amount + reset day), staff account creation by manager, onboarding-to-operational transition.

## Product Scope & Development Strategy

### MVP — Four Screens, 4 Sprints

**Sprint 0 — Foundations:**
- Auth (Manager/Staff roles, permissions, password reset)
- Database schema (Prisma + PostgreSQL)
- Base layout with navigation
- Vercel deployment with auto-deploy
- ESLint + Prettier
- 3 quick-start cafe templates with smart checklist items (Specialty Coffee / Traditional Cafe / Tea & Light Bites)
- manifest.json + service worker ready route structure

**Sprint 1 — Action Feed + Checklists:**
- Action Feed with extensible card architecture (checklist cards only; alerts activate Sprint 2)
- Card type visual differentiation: checklists = progress bar, alerts = colored border, onboarding = setup style
- Daily Checklists: Opening/Mid-Day/Closing, time-aware auto-selection (default not lock), role-aware, timestamps
- Max 5 visible cards, hardcoded priority hierarchy
- Empty state with onboarding tasks

**Sprint 2 — Inventory + Wastage/Comp (HIGHEST RISK SPRINT):**
- Custom slider component (configurable snap increments, container profiles)
- Template daily count (pre-fill, tap to confirm, pin daily-use ingredients to top)
- Confirmation on >50% change from previous value
- Wastage with quick-log presets (Spilled/Expired/Incorrect)
- Comp tracking with weekly budget (configurable reset day, 80%/100% thresholds)
- Auto-deduct: DB transaction, visible confirmation + 5s undo, capped at available qty
- Filter/sort on Inventory and Wastage/Comp
- Action Feed alerts activate
- **Fallback:** If auto-deduct isn't ready, ship standalone modules; auto-deduct follows as patch

**Sprint 3 — Operations (DEFERRABLE):**
- Supplier contacts with tap-to-call + one-tap outcome logging
- Recipe log with ingredients and steps
- Action Feed supplier reminders activate

### MVP Strategy

**Approach:** Problem-Solving MVP — validate that connected operations and proactive design change daily cafe behavior. Not a feature demo; a working operational tool from day one.

**Resource Requirements:** Solo developer with AI-assisted development. No dedicated designer (Notion-style minimalism with shadcn/ui components). No dedicated QA (automated tests + manager as primary tester). Infrastructure: Vercel free/hobby tier, PostgreSQL (Supabase or Railway free tier).

### Journey Coverage

| Journey | Sprint Coverage | Must-Have? |
|---------|----------------|-----------|
| Dana — Morning Runs Itself | Sprint 0-3 (full coverage) | Yes — this IS the product |
| Dana — Day She Doesn't Show Up | Sprint 1 + Sprint 2 | Yes — proves "cafe runs without you" |
| Jake — Shift That Just Works | Sprint 1 + Sprint 2 | Yes — proves staff adoption |
| Dana — Setting Up the System | Sprint 0 | Yes — without easy setup, nothing else matters |

All four journeys require Sprints 0-2. Sprint 3 enhances Journey 1 but isn't required for core validation.

### Must-Have vs Nice-to-Have

**Must-Have (without these, the product fails):**
- Auth with Manager/Staff roles
- Action Feed with prioritized cards
- Daily checklists (Opening/Mid-Day/Closing) with time-awareness and role filtering
- Inventory with slider input and template daily counts
- Wastage logging with auto-deduct and dollar values
- Comp tracking with weekly budget and thresholds
- Quick-start templates for onboarding
- Vercel deployment

**Nice-to-Have (enhance but not essential):**
- Supplier contacts with tap-to-call (Sprint 3 — deferrable)
- Recipe log (Sprint 3 — deferrable)
- Badge notifications on nav icons
- First-use guided tooltips
- Cost per serving on recipes
- Predictive inventory pre-fill

**Can be manual initially:**
- Supplier communication (phone contacts app)
- Recipe reference (existing notebook/printout)
- Weekly summary (manager reviews app data manually)

### Deferral Order

If time pressure forces cuts, defer in this order (last = cut first):

1. Sprint 0 (Auth + DB + Layout + Deploy) — NON-NEGOTIABLE
2. Sprint 1 (Action Feed + Checklists) — NON-NEGOTIABLE
3. Sprint 2 (Inventory + Wastage/Comp) — NON-NEGOTIABLE (core hypothesis)
4. Sprint 3 (Operations: Suppliers + Recipes) — DEFERRABLE

**Razor MVP fallback (2 sprints):** Action Feed + Checklists + Wastage/Comp logging with dollar values. Three screens. Still validates: do people use it? Does money visibility change behavior?

### Growth Features (Post-MVP — Phase 2)

*From tool to system — the app reaches out to you.*

Push notifications. Weekly operations summary ("Your morning this week"). Offline-first (PWA). Predictive inventory. Supplier auto-order suggestions. Filter/sort on all screens. Recipe versioning.

### Vision (Future — Phase 3)

*From single store to platform.*

POS integration. Multi-location dashboards. Monthly trend analytics. Staff training mode. Shift handover briefs.

### Risk Mitigation

**Technical Risks:**

| Risk | Impact | Mitigation |
|------|--------|------------|
| Custom slider component complexity | Could delay Sprint 2 by days | Budget dedicated time; fallback to number input + increment buttons |
| Auto-deduct wiring bugs | Erodes trust in connected operations | Ship standalone first, wire as patch; visible confirmation + 5s undo on every auto-action |
| Mobile performance on older devices | Core users on 3-year-old phones | Performance budget from Sprint 0; Lighthouse CI gate; minimal bundle |
| Connected ops too complex for MVP | Sprint 2 delays cascade | Fallback: ship standalone modules, wire connections as patch |

**Market Risks:**

| Risk | Impact | Mitigation |
|------|--------|------------|
| Dana doesn't use it daily | Core hypothesis fails | Smoke test: if checklists don't get daily use in week 1, stop building |
| Staff see it as surveillance | Adoption fails regardless of features | Frame as "shift assistant"; comp budget visibility is the carrot, not the stick |
| Setup too complex | Abandonment before first use | Templates pre-fill 80% of setup; onboarding cards guide the rest |
| Niche market too small | No growth path | Internal tool first — validate before considering product |

**Resource Risks:**

| Risk | Impact | Mitigation |
|------|--------|------------|
| Solo developer bottleneck | Delays compound | Strict sprint gates; cut Sprint 3 before compromising Sprint 2 quality |
| Scope creep during build | MVP never ships | Razor MVP fallback defined (3 screens, 2 sprints); no features added during sprint |
| Burnout | Project abandoned | 4 sprint structure with clear gates; celebrate each sprint ship |

## Innovation & Novel Patterns

### Detected Innovation Areas

**1. Category Creation: Purpose-Built Niche Operations**
No accessible tool connects inventory, wastage, comp tracking, checklists, and supplier management into a single operational loop for single-location cafes. Existing solutions are either enterprise POS systems (Toast, Square — optimized for transactions, not operations) or generic tools (spreadsheets, Notion — no connected operations). Cafe mgmt creates a new category: the connected ops assistant for micro food-service businesses.

**2. Consumer-Grade Process Control**
The architecture borrows from industrial process control (connected sensors, alarm hierarchies, exception-based monitoring, shift handover, audit trails) and delivers it through consumer UX patterns (card feeds, tap-to-confirm, sliders, budget widgets). This "consumer SCADA" approach is a genuine design innovation — industrial rigor with zero training required.

**3. Economic Innovation: AI-Viable Niche Software**
This product couldn't exist profitably before AI-assisted development. The market (single-location cafes) is too small for traditional software economics. AI development tools change the build cost equation, making purpose-built niche tools economically viable for the first time.

### Innovation Trajectory

- **MVP (Phase 1):** Connected operations + proactive alerting — "The app tells you what to do"
- **Phase 2:** Predictive operations — "The app knows what will happen"
- **Phase 3:** Platform pattern — Architecture becomes a template for other niche operations (bakeries, flower shops, food trucks)

## Functional Requirements

### User Management & Authentication

- FR1: Manager can create staff accounts with predefined Staff role
- FR2: Manager can reset staff passwords directly from settings
- FR3: Manager can view and manage all staff accounts
- FR4: Users can log in with email and password
- FR5: System restricts screen and action access based on user role (Manager or Staff)
- FR6: Manager can access all screens and settings; Staff can access Action Feed, Checklists, and Wastage/Comp only

### Onboarding & Setup

- FR7: Manager can select from three cafe-type quick-start templates (Specialty Coffee / Traditional Cafe / Tea & Light Bites) during initial setup
- FR8: System pre-populates ingredients, checklists, and supplier placeholders from the selected template
- FR9: System displays onboarding task cards on the Action Feed when setup is incomplete
- FR10: Onboarding cards transition to operational cards as setup tasks are completed
- FR11: System displays a staff-specific orientation message on first login

### Action Feed

- FR12: Users can view a prioritized feed of actionable cards on the home screen
- FR13: System displays cards in strict priority order: overdue > time-sensitive > alerts > informational
- FR14: System limits visible cards to a maximum of 5 before scroll
- FR15: System visually differentiates card types (checklist = progress bar, alert = colored border, onboarding = setup style)
- FR16: System auto-selects the time-appropriate checklist by default (Opening/Mid-Day/Closing)
- FR17: System filters Action Feed content based on user role
- FR18: System auto-dismisses resolved alerts after 24 hours
- FR19: System collapses completed checklists to a "Done" summary
- FR20: System displays navigation indicators (badges or dots) for pending action items

### Checklists

- FR21: Manager can create, edit, and delete checklist templates for Opening, Mid-Day, and Closing periods
- FR22: Manager can assign checklist items to specific roles (Manager, Staff, or Both)
- FR23: Manager can add notes or context to individual checklist items
- FR24: Users can view and complete checklist items assigned to their role
- FR25: System records completion timestamps and completing user for each checklist item
- FR26: Users can access all three checklist periods regardless of time of day
- FR27: System warns when a checklist exceeds 10 items and recommends a maximum of 8
- FR28: Checklist items can link to other modules (e.g., "Check inventory" links to Inventory screen)
- FR29: System resets daily checklists at a configurable time (default: start of Opening period)

### Inventory Management

- FR30: Manager can add, edit, and remove ingredients with name, unit, container profile, and cost per unit
- FR31: Manager can configure snap increments per ingredient for slider input
- FR32: Manager can pin frequently used ingredients to the top of the inventory list
- FR33: Users can update inventory quantities via slider-based input
- FR34: System pre-fills daily inventory counts with previous day's values
- FR35: Users can confirm unchanged items with a single tap
- FR36: System prompts for confirmation when a value changes more than 50% from previous
- FR37: System generates low-stock alerts when inventory reaches configurable thresholds
- FR38: Users can filter and sort the inventory list
- FR39: System handles concurrent inventory edits gracefully (last-write-wins with refresh prompt)

### Wastage Tracking

- FR40: Users can log wastage events with quick-log presets (Spilled / Expired / Incorrect)
- FR41: System automatically deducts wastage quantities from inventory via database transaction
- FR42: System displays visible confirmation of auto-deduct with affected inventory item and new quantity
- FR43: Users can undo a wastage event within a 5-second window (soft-delete)
- FR44: System caps auto-deduct at available quantity (no negative inventory)
- FR45: System displays dollar value for every wastage event
- FR46: Users can filter and sort wastage records
- FR47: Manager can void or correct wastage entries after the undo window
- FR48: System restores inventory quantities when a manager voids a wastage entry

### Complementary Tracking

- FR49: Users can log complementary (comp) events with item, quantity, and reason
- FR50: Manager can set a weekly comp budget amount and configure the reset day
- FR51: System displays remaining comp budget to all users
- FR52: System generates warnings at 80% and 100% of weekly comp budget
- FR53: System displays dollar value for every comp event
- FR54: System resets comp tracking on the configured weekly reset day
- FR55: System allows comp logging when no budget is configured, with a prompt to set one

### Supplier Management (Sprint 3 — Deferrable)

- FR56: Manager can add, edit, and remove supplier contacts with name, phone, and notes
- FR57: Users can initiate a phone call to a supplier directly from the app
- FR58: Users can log call outcomes with one tap (Ordered / No answer / Call back)
- FR59: System generates supplier reminder cards on the Action Feed based on order patterns

### Recipe Management (Sprint 3 — Deferrable)

- FR60: Manager can create, edit, and delete recipes with ingredients and steps
- FR61: System displays recipe ingredient lists with current inventory status

### Connected Operations

- FR62: System attributes a dollar value to every operational event (wastage, comp, inventory change)
- FR63: System propagates wastage events to inventory automatically with transactional integrity
- FR64: System propagates inventory threshold breaches to Action Feed as alert cards
- FR65: System propagates comp budget threshold breaches to Action Feed as warning cards
- FR66: System displays error feedback with retry option when a mutation fails

### Operational Visibility

- FR67: Manager can view checklist completion status and history for all users
- FR68: Manager can view aggregated wastage and comp dollar totals by week
- FR69: Users can view their own activity log for the current day
- FR70: Manager can view a daily operations summary (checklists completed, wastage logged, comp spent)
- FR71: Weekly aggregation periods (wastage/comp totals) align with the configured comp reset day

### Configuration & Settings

- FR72: Manager can access a unified settings screen for all configurations
- FR73: Manager can configure time boundaries for checklist periods (Opening, Mid-Day, Closing)
- FR74: Manager can update ingredient cost per unit, with changes applying to future events

## Non-Functional Requirements

### Performance

| NFR | Requirement | Measurement | Rationale |
|-----|------------|-------------|-----------|
| NFR1 | Page load (first visit) completes in <3s on 4G mobile | Lighthouse mobile preset, mid-tier device | Users open app while walking into cafe — slow load = back to notebook |
| NFR2 | Subsequent page navigation completes in <500ms | Client-side routing measurement | Card → Tap → Confirm pattern requires instant feedback |
| NFR3 | All touch interactions register visual feedback in <100ms | Manual testing on target devices | Tapping without feedback feels broken; users will double-tap |
| NFR4 | All critical interactions (slider drag, card scroll, checklist animations) render at 60fps | Chrome DevTools Performance tab | Janky interactions destroy confidence in input values and feel |
| NFR5 | Action Feed renders with all cards in <200ms | Performance measurement on target device | Morning open must feel instant — this is the first impression every day |
| NFR6 | Initial JavaScript bundle <200KB gzipped | Build analysis (next build) | Keeps load times achievable on 4G; prevents bloat creep |
| NFR7 | Simple database mutations complete in <500ms server-side; compound mutations (auto-deduct chain) complete in <1s | Server-side logging | Optimistic UI masks latency, but server must confirm quickly for undo window |
| NFR8 | System supports 5 concurrent users without performance degradation | Load testing with concurrent sessions | Dana + Jake + additional staff all using app during morning rush |
| NFR9 | Reference test device for performance validation: mid-range Android (4GB RAM, Android 12+) and iPhone 12 | All performance NFRs validated on these devices | Ensures targets are met on actual user hardware, not developer machines |

### Security

| NFR | Requirement | Measurement | Rationale |
|-----|------------|-------------|-----------|
| NFR10 | All data transmitted over HTTPS (TLS 1.2+) | SSL Labs test | Basic transport security — Vercel provides by default |
| NFR11 | Passwords hashed with bcrypt (cost factor 10+) | Code review | Never store plaintext passwords |
| NFR12 | Session tokens expire after 30 days of inactivity | Auth configuration review | Cafe staff shouldn't need to log in every shift, but abandoned sessions expire |
| NFR13 | Role-based access enforced server-side on every API route | Automated test matrix | Client-side role checks are bypassable; server must be the authority |
| NFR14 | No sensitive data in client-side logs or error messages | Code review + browser DevTools | Operational data (costs, inventory levels) shouldn't leak to console |
| NFR15 | Sessions are invalidated immediately when a staff account is deactivated by manager | Automated test | Prevents ex-staff from accessing operational data after account removal |

### Reliability & Data Integrity

| NFR | Requirement | Measurement | Rationale |
|-----|------------|-------------|-----------|
| NFR16 | Application available 99.5% uptime (excludes planned maintenance) | Vercel status + uptime monitor | ~3.6 hours downtime/month max — acceptable for internal tool on free-tier infrastructure |
| NFR17 | All inventory mutations (wastage auto-deduct, manual updates) use database transactions | Code review + automated tests | Partial updates to connected data = broken trust. Atomic or nothing. |
| NFR18 | Failed mutations display user-visible error with retry option within 2s | Manual testing + error simulation | Silent failures are worse than errors — user must know something went wrong |
| NFR19 | Undone actions remain recoverable for at least 24 hours | Automated test | Preserves recovery path beyond the 5s user undo window; manager can void anytime (FR47) |
| NFR20 | No data loss on browser close or navigation during active session | Manual testing (close mid-action) | Cafe staff get interrupted constantly — closing browser mid-checklist shouldn't lose progress |
| NFR21 | Database backups run daily with 7-day retention | Infrastructure configuration | Operational data is the cafe's institutional knowledge — losing it breaks trust permanently |
| NFR22 | System displays a meaningful offline/error state when backend is unreachable (not a blank screen) | Manual testing with network disabled | Cafe environments have spotty WiFi — user needs to know the app is offline, not broken |

### Accessibility

| NFR | Requirement | Measurement | Rationale |
|-----|------------|-------------|-----------|
| NFR23 | Touch targets minimum 44x44px | Design review + automated check | Apple HIG + WCAG 2.1 — essential for one-handed cafe use |
| NFR24 | Color contrast ratio meets WCAG AA (4.5:1 text, 3:1 large text) | Lighthouse accessibility audit | Essential for outdoor/bright cafe lighting conditions |
| NFR25 | Base font size 16px minimum, all sizing in rem units | CSS review | No pinch-to-read required on mobile |
| NFR26 | Animations respect `prefers-reduced-motion` media query | Manual testing with OS setting | Slider and card transitions honor user preferences |

## Technical Specifications

### Project-Type Overview

Mobile-first web application with PWA-compatible architecture. Primarily SPA behavior via Next.js with server-side rendering for initial load performance. Internal operational tool — no SEO requirements, no public-facing pages beyond auth. Optimized for one-handed mobile use during active cafe operations.

### Browser & Device Matrix

| Browser | Minimum Version | Priority | Notes |
|---------|----------------|----------|-------|
| Chrome (Android) | 90+ | Primary | Most staff will use Android |
| Safari (iOS) | 15+ | Primary | Manager's likely device |
| Safari (macOS) | 15+ | Secondary | Manager desktop access |
| Chrome (Desktop) | 90+ | Secondary | Setup and admin tasks |
| Firefox | 100+ | Tertiary | Compatibility only |
| Edge | 90+ | Tertiary | Compatibility only |

**Device targets:** iPhone 12+ equivalent (3-year-old phone baseline), mid-range Android (Samsung Galaxy A series). Touch-first — all interactions must work without hover states.

### Responsive Design Strategy

| Breakpoint | Target | Design Approach |
|-----------|--------|----------------|
| 320-480px | Phone (portrait) | **Primary design target.** All screens optimized here first. Single column. Full-width cards. |
| 481-768px | Phone (landscape) / Small tablet | Adapted layout. No new features exposed. |
| 769-1024px | Tablet | Optional: side-by-side panels for inventory + wastage. Not required for MVP. |
| 1025px+ | Desktop | Functional but not optimized. Settings and admin setup benefit most. |

**Key constraint:** All critical interactions (checklist tap, wastage log, slider adjust) must be completable one-handed on a phone in portrait mode.

### Implementation Considerations

- **Next.js App Router** with server components for data fetching, client components for interactive elements (slider, checklist taps)
- **Service worker** registered from Sprint 0 for PWA manifest compliance; offline caching deferred to Phase 2
- **Optimistic UI** on all mutations (checklist complete, wastage log, inventory update) with server confirmation and error toast + retry
- **No WebSocket/real-time** in MVP — standard fetch with SWR/React Query for data freshness
- **Touch event handling** — no reliance on hover, long-press, or multi-touch; tap and swipe only
- **SEO:** Not applicable. Internal tool behind authentication. robots.txt disallow all.
