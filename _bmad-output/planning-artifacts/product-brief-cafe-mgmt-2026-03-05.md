---
stepsCompleted: [1, 2, 3, 4, 5]
inputDocuments:
  - brainstorming-session-2026-03-05-001.md
  - workflow-plan-cafe-ops-build.md
date: 2026-03-05
author: Base
---

# Product Brief: cafe mgmt

## Executive Summary

Cafe mgmt is a web application that replaces spreadsheets, paper checklists, and memory with a proactive operational assistant for cafe managers and staff. Built around four screens (Action Feed, Inventory, Wastage/Comp, Operations), it connects daily tasks into one system where logging wastage auto-adjusts inventory, checklists structure the workday by time and role, and every cost is visible in dollars. Purpose-built for single-location cafe operators who want to spend less time managing and more time on customers.

---

## Core Vision

### Problem Statement

Cafe managers juggle inventory counts, wastage tracking, supplier communications, staff task delegation, and daily checklists across disconnected methods — paper, spreadsheets, memory, and ad hoc communication. There is no single tool that connects these operations into a coherent daily workflow. The result: managers spend their mornings catching up instead of serving customers, staff start shifts confused about priorities, and owners have no visibility into where money leaks out — through wastage, comps, or inventory shrinkage.

### Problem Impact

- **For managers:** 30-60 minutes daily lost to manual tracking, checking, and coordinating — time stolen from customers and quality
- **For staff:** Shift starts with uncertainty — "what needs doing?" depends on who you can ask, not what the system tells you
- **For owners:** Wastage, complementary drinks, and inventory shrinkage are invisible costs with no dollar visibility until it's too late
- **Across the board:** Daily routines depend on tribal knowledge; when the experienced manager is sick, operations degrade

### Why Existing Solutions Fall Short

Most cafe tools fall into two traps: enterprise POS systems that bury cafe-relevant features under restaurant complexity, or basic spreadsheets that capture data nobody acts on. The fundamental gap isn't tracking — it's the bridge from data to decision. No existing tool combines inventory, wastage, supplier management, daily checklists, and complementary tracking into a system that proactively tells you what to do about what it knows. They record. Cafe mgmt acts.

### Proposed Solution

A four-screen web application — Action Feed, Inventory, Wastage/Comp, and Operations — designed to close the gap between operational data and daily decisions. The Action Feed doesn't just display information — it surfaces prioritized tasks with context, cost impact, and one-tap resolution. Inventory uses slider-based input and template daily counts so managers verify exceptions in under 60 seconds, not audit everything. Wastage and complementary tracking are split with comp budgeting (80%/100% thresholds), translating every entry into dollar impact. Daily checklists (Opening/Mid-Day/Closing) are time-aware, role-aware, and create an accountability trail. Two roles — Manager and Staff — with the app driving the rhythm so managers spend less time managing and more time on customers.

### Key Differentiators

1. **Purpose-built for cafe operators, not restaurants** — lightweight, opinionated, zero training required
2. **Proactive, not passive** — the app tells you what to do next, not just what happened
3. **Connected operations** — wastage auto-deducts inventory, recipe costs auto-update from supplier prices
4. **Complementary tracking with budgeting** — makes invisible costs visible and manageable; no competitor does this
5. **Exception-based management** — predict and verify, don't count and enter

### Why Now

The cafe back-of-house operations problem has always existed, but the economics of building a purpose-built solution never justified it — the market is niche, the problem is "manageable" with spreadsheets, and building connected software required full teams. AI-assisted development changes this equation fundamentally. A single operator can now build and maintain a tool purpose-built for their exact workflow, creating a solution that was previously uneconomical to develop for a small market segment.

### Scope

Cafe mgmt is designed for single-location cafe operations. It is not a POS system, does not handle payments or customer orders, and does not replace accounting software. It owns the back-of-house operational workflow: what needs doing, what's running low, what's being wasted, and who's accountable.

## Target Users

### Primary Users

**Persona 1: Dana — Cafe Manager/Owner**

- **Profile:** 34, owns and operates a single-location specialty coffee cafe. Works 6am-3pm most days. Handles ordering, staffing, finances, and quality control personally.
- **Current Reality:** Mornings start with a mental checklist — check milk levels, review what was wasted yesterday, remember which supplier to call. Uses a notebook for inventory, a spreadsheet for costs, and memory for everything else. By 8am she's already behind.
- **Pain Points:** No single view of what needs attention. Invisible costs from comps and wastage. When she's sick, staff don't know the routine. Spends 30-60 minutes daily on admin instead of customers.
- **Goals:** Know what needs doing the moment she opens the app. See costs in dollars, not abstract quantities. Trust that staff are following the routine without micromanaging.
- **Success Moment:** Opens the app at 5:55am, sees "Opening checklist ready. Oat milk at 30% — order threshold is 25%. Call bean supplier today." Her morning runs itself.

**Persona 2: Jake — Barista/Staff**

- **Profile:** 22, part-time barista across morning and afternoon shifts. Reliable but not deeply invested in operations — wants to do his job well and go home.
- **Current Reality:** Starts each shift asking "what needs doing?" Doesn't know what was wasted on the previous shift, what stock is low, or if a delivery is expected. Logs nothing because there's no easy system.
- **Pain Points:** Shift starts with uncertainty. No clear task list. When he comps a drink for a regular, there's no way to log it without it feeling like surveillance. No structure to the day beyond what the manager verbally assigns.
- **Goals:** Know exactly what to do when he clocks in. Log wastage and comps in under 5 seconds. Feel like the app helps him, not tracks him.
- **Success Moment:** Opens the app at shift start, sees "Mid-Day checklist: 4 items. Comp budget: $12 remaining this week." Taps through his tasks, logs a spilled latte in two taps, moves on.

### Secondary Users

N/A — No additional user types identified. The app serves two roles (Manager and Staff) within the same cafe operation.

### User Journey

**Discovery:** Manager/owner finds or builds the tool to solve their own operational pain — this is a self-serve, internally motivated adoption.

**Onboarding:** Manager sets up the cafe profile — adds ingredients, suppliers, recipes, staff accounts, and customizes checklists. First-use guided tooltips (Phase 1 nice-to-have) reduce setup friction.

**Core Usage — Manager:** Opens app at start of day → Action Feed shows prioritized tasks → works through Opening checklist → checks inventory exceptions → reviews wastage/comp totals → calls suppliers from Operations screen. All before the first customer.

**Core Usage — Staff:** Opens app at shift start → sees role-appropriate checklist → taps through tasks → logs wastage or comps as they happen → sees comp budget remaining. No navigation required beyond Action Feed and Wastage/Comp.

**Success Moment:** End of first week — manager sees the Weekly Operations Summary (Phase 2) and realizes she knows exactly where money went. Staff stopped asking "what should I do?" because the app tells them.

**Long-term:** The app becomes the cafe's operating rhythm. Checklists evolve seasonally. Inventory patterns emerge. Comp budgets get tuned. The manager manages by exception — silence means everything's fine.

## Success Metrics

### User Success — "You'll know it's working when..."

- **The app replaces the notebook.** Dana opens the app first thing, not her spreadsheet or notepad. The app is the single source of operational truth.
- **The app catches what you'd miss.** At least once a week, the app surfaces a problem — low stock, wastage spike, missed checklist — that would have gone unnoticed with the old method.
- **Staff know what to do without asking.** Jake starts his shift, sees his checklist, and gets to work. No questions, no confusion, no verbal delegation needed.
- **Money becomes visible.** Dana can see this week's wastage and comp spending in dollars within 10 seconds of opening the app.
- **The cafe runs without you.** When Dana is sick for a day, operations don't degrade — the app holds the knowledge.

### Business Objectives

- **Cost visibility** — Wastage and comp spending tracked in dollars weekly, enabling informed decisions on budgets, suppliers, and training
- **Operational consistency** — Daily routines encoded in the app, not in one person's head; resilient to staff changes and absences
- **Behavior change** — Comp budgets and wastage visibility drive measurable reduction in uncontrolled costs over time

### Key Performance Indicators

**Three metrics that prove it works:**

| KPI | Target | Why It Matters |
|-----|--------|---------------|
| Wastage + comp dollars/week | Visible and trending stable or down | The single number that captures financial awareness and behavior change |
| Problems surfaced by app | 1+ per week that would have been missed | Proves the app is smarter than a notebook |
| Checklist completion rate | >90% completed on time by correct role | Daily rhythm engine is working; timestamps prove accountability |

**Supporting Indicators:**

- App is primary operational tool (replaces previous methods entirely)
- Manager spends <10 min/day on admin tasks previously taking 30-60 min
- Comp spending stays within weekly budget after budget is set

**Qualitative Health Checks:**

- Staff perception: does the app feel helpful or surveillant? (If staff resent it, adoption fails regardless of metrics)
- Manager confidence: can Dana leave for a day without worrying about operations?

**Metric Surfacing Principle:** Metrics are shown as weekly trends and patterns, not per-incident real-time alerts. Accountability is built through visible patterns, not micromanagement. Timestamps exist for trail purposes, not for minute-by-minute monitoring.

## MVP Scope

### Design Principle

Reliability and feel over feature count. Every interaction must feel responsive and satisfying. A beautiful 3-screen app beats an ugly 4-screen app every time.

### Core Features

**Four-Screen Architecture:**

1. **Action Feed** — Prioritized task cards with strict hardcoded hierarchy: overdue > time-sensitive (checklists) > alerts > informational. Max 5 visible cards before scroll. Card type visual differentiation: checklists get progress bar header, alerts get colored border, onboarding tasks get setup style. Daily checklists (Opening/Mid-Day/Closing) auto-selected by time of day (default, not lock — all three always accessible). Role-aware content for Manager vs Staff. Empty state shows onboarding tasks ("Add your first 5 ingredients", "Create your Opening checklist"). Works standalone in Sprint 1 with just checklists — alerts and supplier reminders activate as modules ship in later sprints. Extensible card architecture from day one (new card types per sprint without refactoring). Auto-dismiss resolved alerts after 24h; completed checklists collapse to "Done" summary.
2. **Inventory** — Slider-based input (custom component — budget dedicated build time) with container profiles. Configurable snap increments per ingredient (manager sets granularity during setup). Template daily count with yesterday's values pre-filled, tap to confirm unchanged items. Confirmation prompt on changes >50% from previous value. Exception-based verification. Filter/sort enabled.
3. **Wastage/Comp** — Two-tab split view: Wasted and Complementary. One-tap logging with quick-log presets (Spilled drink / Expired ingredient / Incorrect order). Automatic inventory deduction with visible confirmation + undo (5-second window, soft-delete). Comp budgeting with weekly limits, configurable reset day (default Monday), and 80%/100% threshold warnings. Filter/sort enabled.
4. **Operations** — Supplier contacts with call logging (tap to call, one-tap outcome: Ordered/No answer/Call back). Recipe log with ingredients and steps.

**Cross-Cutting:**

- **Auth** — Manager and Staff roles with defined permissions. Built in Sprint 0 as infrastructure. User management via settings panel (gear icon on Action Feed). Manager can reset staff passwords directly (no email recovery needed).
- **Connected operations** — Wastage auto-deducts inventory with visible confirmation and undo. Validation guards: no negative inventory, confirmation prompt on large deductions. Inventory + auto-deduct ship together in Sprint 2 (explicit dependency).
- **Actionable alerts** — "Oat milk low — Call supplier? [Yes/Later]" with one-tap resolution.
- **UX pattern** — Card → Tap → Confirm universal interaction. Notion-style minimalism. Filter/sort on Inventory and Wastage/Comp screens (remaining screens get filter/sort in Phase 2).
- **Onboarding** — Three cafe-type quick-start templates (Specialty Coffee / Traditional Cafe / Tea & Light Bites) with 15-20 common ingredients each. Staff onboarding framed as "your shift assistant" not "your manager's tracker." First-class experience, not afterthought.
- **Performance** — Mobile-first. <2s load. 60fps interactions on 3-year-old iPhone.

### MVP Nice-to-Haves

**Quick Adds (minimal effort):**
- Badge notifications on nav icons
- First-use guided tooltips

**Significant Effort (include if time allows):**
- Cost per serving on recipes (activates automatically once supplier prices are entered)
- Predictive pre-fill for inventory based on usage patterns

### Out of Scope for MVP

- **Offline-first architecture** — Deferred to Phase 2. MVP requires internet connection.
- **Push notifications** — Replaced by in-app indicators for MVP.
- **Weekly operations summary** — Phase 2. Dashboard shows current state only.
- **Recipe auto-deduction from inventory** — Requires POS integration. Phase 2+.
- **Supplier auto-ordering** — Phase 2. MVP shows alerts, manager orders manually.
- **Recipe versioning** — Manager edits directly, no history. Phase 2.
- **Monthly trend comparisons** — Phase 2 analytics.
- **Multi-location support** — Phase 3.
- **POS integration** — Phase 3.

### MVP Success Criteria

The MVP succeeds when:

1. **Sprint 1 milestone:** Dana can complete an Opening checklist via the app. Jake can see his shift checklist and tap through items.
2. **Sprint 3 milestone:** Wastage shows in dollars. Comp budget is visible and tracking. Inventory is managed via slider with auto-deduct from wastage working.
3. **2-week post-launch milestone:** Dana + at least 1 staff member use the app daily. Dana identifies at least one cost insight she wouldn't have had otherwise. The app is her primary operational tool.

**Go/no-go for Phase 2:** If the 2-week milestone is met, proceed to Phase 2.

### Sprint Priority / Deferral Order

If time pressure forces cuts, defer in this order (last = cut first):

1. **Sprint 0** (Auth + DB + Layout + Deploy) — NON-NEGOTIABLE
2. **Sprint 1** (Action Feed + Checklists) — NON-NEGOTIABLE
3. **Sprint 2** (Inventory + Wastage/Comp) — NON-NEGOTIABLE (core hypothesis)
4. **Sprint 3** (Operations: Suppliers + Recipes) — DEFERRABLE. App works without this.

**Razor MVP fallback (2 sprints):** Action Feed + Checklists + Wastage/Comp logging with dollar values. Three screens. Still validates: do people use it? Does money visibility change behavior?

**Smoke test principle:** If hardcoded checklists + wastage logging doesn't get daily use in week one, re-evaluate the core hypothesis before building more.

### Sprint Dependency Map

```
AUTH + DB SCHEMA (Sprint 0) ← everything depends on this
  │
  ├── ACTION FEED (Sprint 1) ← standalone with checklists only
  │     ├── Checklists: standalone
  │     ├── Alerts: activate after Sprint 2 (needs inventory data)
  │     └── Supplier reminders: activate after Sprint 3
  │
  ├── INVENTORY (Sprint 2) ← standalone
  │     └── Low stock alerts → feed into Action Feed
  │
  ├── WASTAGE/COMP (Sprint 2) ← ships WITH inventory
  │     ├── Auto-deduct: depends on Inventory
  │     └── Comp threshold warnings → feed into Action Feed
  │
  └── OPERATIONS (Sprint 3) ← standalone, deferrable
        ├── Suppliers: standalone
        └── Recipes: standalone
```

### MVP Risk Mitigations

| Risk | Prevention |
|------|-----------|
| Setup friction kills adoption | 3 cafe-type quick-start templates; onboarding tasks in empty Action Feed |
| Action Feed overwhelm | Strict priority hierarchy; max 5 visible cards; visual card type differentiation |
| Staff see it as surveillance | Frame as "shift assistant"; comp budget visibility is the carrot |
| Connected ops bugs erode trust | Validation guards (no negative inventory); visible confirmation + undo on every auto-action; 5-second undo window |
| Slow on mobile | Mobile-first performance testing; <2s load; 60fps target on 3-year-old iPhone |
| Slider component complexity | Budget dedicated time for custom slider; tap-to-confirm instead of swipe (cross-browser reliable) |
| Fat-finger errors on slider | Confirmation prompt on changes >50% from previous value |
| Wastage data incomplete | Quick-log presets make wastage logging as frictionless as comp logging |
| Checklists too long | Recommend max 8 items; warning on >10; suggest splitting |

### Feature-Level Safeguards

| Feature | Safeguard |
|---------|-----------|
| Action Feed | Auto-dismiss resolved alerts after 24h; completed checklists collapse; hardcoded priority rules (no algorithm) |
| Inventory Slider | Configurable snap increments per ingredient; confirmation on changes >50% from previous value |
| Wastage Logging | Quick-log presets (Spilled/Expired/Incorrect); as frictionless as comp logging |
| Comp Budget | Configurable weekly reset day (default Monday) |
| Checklists | Max 8 items recommended; warning on >10; time-aware is default not lock, all three always accessible |
| Auth | Manager resets staff passwords from settings; no email recovery needed |

### Future Vision

**Phase 2 — From Tool to System:**
The app transforms from something you check into a system that reaches out to you. Push notifications surface urgency before you open the app. Weekly summaries create a reflection habit. Offline-first means the app works everywhere — stockroom, delivery dock, spotty WiFi.

- Push notifications (low stock, missed checklists, wastage spikes)
- Weekly operations summary with visual trends
- Offline-first architecture
- Predictive inventory pre-fill based on usage patterns
- Supplier auto-order suggestions at threshold triggers
- Filter/sort on all remaining screens
- Cost per serving (if not shipped in MVP)

**Phase 3 — From Single Store to Platform:**
The app becomes a platform that connects to external systems and scales across locations. POS integration closes the loop between sales and inventory. Multi-location dashboards give owners a portfolio view.

- POS integration for automatic recipe-based inventory deduction
- Multi-location support with cross-location dashboards
- Monthly trend comparisons and analytics
- Staff training mode for recipes
- Shift handover briefs

**Long-term vision:** The app evolves from operational assistant to operational intelligence — predicting stockouts before they happen, identifying cost patterns across weeks, and eventually becoming the system of record for single-location cafe operations.
