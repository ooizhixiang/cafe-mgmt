---
stepsCompleted: [step-01-validate-prerequisites, step-02-design-epics, step-03-create-stories]
inputDocuments:
  - prd.md
  - architecture.md
  - ux-design-specification.md
---

# cafe mgmt - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for cafe mgmt, decomposing the requirements from the PRD, UX Design, and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: Manager can create staff accounts with predefined Staff role
FR2: Manager can reset staff passwords directly from settings
FR3: Manager can view and manage all staff accounts
FR4: Users can log in with email and password
FR5: System restricts screen and action access based on user role (Manager or Staff)
FR6: Manager can access all screens and settings; Staff can access Action Feed, Checklists, and Wastage/Comp only
FR7: Manager can select from three cafe-type quick-start templates (Specialty Coffee / Traditional Cafe / Tea & Light Bites) during initial setup
FR8: System pre-populates ingredients, checklists, and supplier placeholders from the selected template
FR9: System displays onboarding task cards on the Action Feed when setup is incomplete
FR10: Onboarding cards transition to operational cards as setup tasks are completed
FR11: System displays a staff-specific orientation message on first login
FR12: Users can view a prioritized feed of actionable cards on the home screen
FR13: System displays cards in strict priority order: overdue > time-sensitive > alerts > informational
FR14: System limits visible cards to a maximum of 5 before scroll
FR15: System visually differentiates card types (checklist = progress bar, alert = colored border, onboarding = setup style)
FR16: System auto-selects the time-appropriate checklist by default (Opening/Mid-Day/Closing)
FR17: System filters Action Feed content based on user role
FR18: System auto-dismisses resolved alerts after 24 hours
FR19: System collapses completed checklists to a "Done" summary
FR20: System displays navigation indicators (badges or dots) for pending action items
FR21: Manager can create, edit, and delete checklist templates for Opening, Mid-Day, and Closing periods
FR22: Manager can assign checklist items to specific roles (Manager, Staff, or Both)
FR23: Manager can add notes or context to individual checklist items
FR24: Users can view and complete checklist items assigned to their role
FR25: System records completion timestamps and completing user for each checklist item
FR26: Users can access all three checklist periods regardless of time of day
FR27: System warns when a checklist exceeds 10 items and recommends a maximum of 8
FR28: Checklist items can link to other modules (e.g., "Check inventory" links to Inventory screen)
FR29: System resets daily checklists at a configurable time (default: start of Opening period)
FR30: Manager can add, edit, and remove ingredients with name, unit, container profile, and cost per unit
FR31: Manager can configure snap increments per ingredient for slider input
FR32: Manager can pin frequently used ingredients to the top of the inventory list
FR33: Users can update inventory quantities via slider-based input
FR34: System pre-fills daily inventory counts with previous day's values
FR35: Users can confirm unchanged items with a single tap
FR36: System prompts for confirmation when a value changes more than 50% from previous
FR37: System generates low-stock alerts when inventory reaches configurable thresholds
FR38: Users can filter and sort the inventory list
FR39: System handles concurrent inventory edits gracefully (last-write-wins with refresh prompt)
FR40: Users can log wastage events with quick-log presets (Spilled / Expired / Incorrect)
FR41: System automatically deducts wastage quantities from inventory via database transaction
FR42: System displays visible confirmation of auto-deduct with affected inventory item and new quantity
FR43: Users can undo a wastage event within a 5-second window (soft-delete)
FR44: System caps auto-deduct at available quantity (no negative inventory)
FR45: System displays dollar value for every wastage event
FR46: Users can filter and sort wastage records
FR47: Manager can void or correct wastage entries after the undo window
FR48: System restores inventory quantities when a manager voids a wastage entry
FR49: Users can log complementary (comp) events with item, quantity, and reason
FR50: Manager can set a weekly comp budget amount and configure the reset day
FR51: System displays remaining comp budget to all users
FR52: System generates warnings at 80% and 100% of weekly comp budget
FR53: System displays dollar value for every comp event
FR54: System resets comp tracking on the configured weekly reset day
FR55: System allows comp logging when no budget is configured, with a prompt to set one
FR56: Manager can add, edit, and remove supplier contacts with name, phone, and notes
FR57: Users can initiate a phone call to a supplier directly from the app
FR58: Users can log call outcomes with one tap (Ordered / No answer / Call back)
FR59: System generates supplier reminder cards on the Action Feed based on order patterns
FR60: Manager can create, edit, and delete recipes with ingredients and steps
FR61: System displays recipe ingredient lists with current inventory status
FR62: System attributes a dollar value to every operational event (wastage, comp, inventory change)
FR63: System propagates wastage events to inventory automatically with transactional integrity
FR64: System propagates inventory threshold breaches to Action Feed as alert cards
FR65: System propagates comp budget threshold breaches to Action Feed as warning cards
FR66: System displays error feedback with retry option when a mutation fails
FR67: Manager can view checklist completion status and history for all users
FR68: Manager can view aggregated wastage and comp dollar totals by week
FR69: Users can view their own activity log for the current day
FR70: Manager can view a daily operations summary (checklists completed, wastage logged, comp spent)
FR71: Weekly aggregation periods (wastage/comp totals) align with the configured comp reset day
FR72: Manager can access a unified settings screen for all configurations
FR73: Manager can configure time boundaries for checklist periods (Opening, Mid-Day, Closing)
FR74: Manager can update ingredient cost per unit, with changes applying to future events

### NonFunctional Requirements

NFR1: Page load (first visit) completes in <3s on 4G mobile
NFR2: Subsequent page navigation completes in <500ms
NFR3: All touch interactions register visual feedback in <100ms
NFR4: All critical interactions (slider drag, card scroll, checklist animations) render at 60fps
NFR5: Action Feed renders with all cards in <200ms
NFR6: Initial JavaScript bundle <200KB gzipped
NFR7: Simple database mutations complete in <500ms server-side; compound mutations (auto-deduct chain) complete in <1s
NFR8: System supports 5 concurrent users without performance degradation
NFR9: Reference test device for performance validation: mid-range Android (4GB RAM, Android 12+) and iPhone 12
NFR10: All data transmitted over HTTPS (TLS 1.2+)
NFR11: Passwords hashed with bcrypt (cost factor 10+)
NFR12: Session tokens expire after 30 days of inactivity
NFR13: Role-based access enforced server-side on every API route
NFR14: No sensitive data in client-side logs or error messages
NFR15: Sessions are invalidated immediately when a staff account is deactivated by manager
NFR16: Application available 99.5% uptime (excludes planned maintenance)
NFR17: All inventory mutations (wastage auto-deduct, manual updates) use database transactions
NFR18: Failed mutations display user-visible error with retry option within 2s
NFR19: Undone actions remain recoverable for at least 24 hours
NFR20: No data loss on browser close or navigation during active session
NFR21: Database backups run daily with 7-day retention
NFR22: System displays a meaningful offline/error state when backend is unreachable (not a blank screen)
NFR23: Touch targets minimum 44x44px
NFR24: Color contrast ratio meets WCAG AA (4.5:1 text, 3:1 large text)
NFR25: Base font size 16px minimum, all sizing in rem units
NFR26: Animations respect prefers-reduced-motion media query

### Additional Requirements

**From Architecture:**

- Starter Template: `create-next-app` + `shadcn init` + manual Prisma/Auth setup (impacts Epic 1 Story 1)
- Tech Stack: Next.js 16 App Router, TypeScript strict, React 19.2, Tailwind CSS, shadcn/ui v4
- Database: PostgreSQL via Supabase (free tier), connection via pooler URL with `?pgbouncer=true`
- ORM: Prisma 7.4 with `$transaction` for connected operations
- Auth: Auth.js v5 (next-auth@5) with Credentials provider, database sessions, Prisma adapter
- Prisma singleton via `src/lib/db.ts` using `globalThis.prisma` pattern
- Integer cents for all money storage (`Int` in Prisma, never `Float`)
- Server-generated timestamps only (`@default(now())`)
- `ActionResult<T>` as the single return type for all Server Actions
- `safeMutation` wrapper for optimistic UI + server confirm + error rollback
- Route groups: `(auth)` for login, `(app)` for authenticated screens with shared layout
- Domain isolation: domains never import from each other; only `feed/composer.ts` crosses domains
- Feed composer uses `Promise.allSettled` for per-domain error isolation
- `FeedResponse` type bundles cards + summary to prevent stale data mismatch
- Database indexes required on: ChecklistItem(checklistId), WastageEntry(cafeId, createdAt), CompEntry(cafeId, weekStartDate), Ingredient(cafeId), InventoryCount(ingredientId, countDate)
- Seed data must be idempotent (upsert, not create)
- Login brute force protection: 5 failed attempts → 15-minute lockout
- API route `/api/feed` must call `auth()` and reject if no session
- Never accept `cafeId` or `userId` from client — derive from session
- Vitest for unit/integration testing, Playwright for e2e (when needed)
- SWR for client-side data fetching with revalidation on focus
- Empty service worker for PWA installability (no offline caching in MVP)
- Vercel deployment with auto-deploy on push to main
- Testing co-located next to source files with `.test.ts` suffix
- `error_log` table in Supabase for capturing failed mutations

**From UX Design:**

- Mobile-first design: 320px minimum supported width, 375px primary target
- One-handed thumb-zone interactions: all primary actions within natural thumb arc
- Bottom navigation: 4 tabs (Action Feed, Inventory, Wastage/Comp, Operations)
- Summary bar: fixed display with comp budget + checklist progress
- Card anatomy: 4px colored left border, status icon, title, dollar value, card-type-specific content
- 5 card variants: Checklist, Alert, Onboarding, Completion Summary, All Caught Up
- Checklist items shown directly on cards (no expand/collapse step)
- Custom inventory slider: snap resistance, configurable increments, 60fps on 320px screens, fallback to stepper if not 60fps by Sprint 2 day 3
- Toast queue: multiple stacking toasts with individual 5s timers and visible progress
- Skeleton loading states only (no spinners)
- Offline banner: calm indicator "Offline — showing last synced data"
- Animation: all transitions <200ms, respect prefers-reduced-motion
- Color vocabulary: green=success, amber=warning, red=urgent, blue=info, gray=muted
- Typography: 4-tier scale (XL 28px, LG 20px, MD 16px, SM 13px)
- Hub-and-spoke navigation: Action Feed as hub, other screens as spokes
- "All clear" positive empty state with completion summary
- Staff "flag for review" capability for logged events
- Onboarding via Action Feed cards (template selection + progressive setup tasks)
- Responsive breakpoints: base 320px, SM 375px, MD 428px, LG 768px

### FR Coverage Map

FR1: Epic 1 - Manager creates staff accounts
FR2: Epic 1 - Manager resets staff passwords
FR3: Epic 1 - Manager views/manages staff accounts
FR4: Epic 1 - Users log in with email/password
FR5: Epic 1 - Role-based access restriction
FR6: Epic 1 - Manager/Staff screen access rules
FR7: Epic 1 - Quick-start template selection
FR8: Epic 1 - Template pre-populates data
FR9: Epic 1 - Onboarding cards on Action Feed
FR10: Epic 1 - Onboarding-to-operational card transition
FR11: Epic 1 - Staff orientation on first login
FR12: Epic 2 - Prioritized Action Feed
FR13: Epic 2 - Card priority ordering
FR14: Epic 2 - Max 5 visible cards
FR15: Epic 2 - Card type visual differentiation
FR16: Epic 2 - Time-aware checklist auto-selection
FR17: Epic 2 - Role-based feed filtering
FR18: Epic 2 - Auto-dismiss resolved alerts
FR19: Epic 2 - Collapse completed checklists
FR20: Epic 2 - Navigation badges for pending items
FR21: Epic 2 - Checklist template CRUD
FR22: Epic 2 - Checklist role assignment
FR23: Epic 2 - Checklist item notes/context
FR24: Epic 2 - View/complete assigned checklist items
FR25: Epic 2 - Completion timestamps and user tracking
FR26: Epic 2 - Access all checklist periods
FR27: Epic 2 - Checklist item count warnings
FR28: Epic 2 - Cross-module checklist links
FR29: Epic 2 - Daily checklist reset
FR30: Epic 3 - Ingredient CRUD with cost per unit
FR31: Epic 3 - Snap increment configuration
FR32: Epic 3 - Pin frequently used ingredients
FR33: Epic 3 - Slider-based inventory input
FR34: Epic 3 - Pre-fill daily counts
FR35: Epic 3 - Single-tap confirm unchanged
FR36: Epic 3 - Confirm >50% change
FR37: Epic 3 - Low-stock alert generation
FR38: Epic 3 - Inventory filter/sort
FR39: Epic 3 - Concurrent edit handling
FR40: Epic 3 - Wastage quick-log presets
FR41: Epic 3 - Auto-deduct via transaction
FR42: Epic 3 - Visible auto-deduct confirmation
FR43: Epic 3 - 5-second undo window
FR44: Epic 3 - Auto-deduct capped at available qty
FR45: Epic 3 - Dollar value on wastage events
FR46: Epic 3 - Wastage filter/sort
FR47: Epic 3 - Manager void/correct wastage
FR48: Epic 3 - Inventory restore on void
FR49: Epic 3 - Comp event logging
FR50: Epic 3 - Weekly comp budget configuration
FR51: Epic 3 - Comp budget display
FR52: Epic 3 - Comp budget 80%/100% warnings
FR53: Epic 3 - Dollar value on comp events
FR54: Epic 3 - Weekly comp reset
FR55: Epic 3 - Comp logging without budget
FR56: Epic 4 - Supplier contact CRUD
FR57: Epic 4 - Tap-to-call supplier
FR58: Epic 4 - One-tap call outcome logging
FR59: Epic 4 - Supplier reminder cards on feed
FR60: Epic 4 - Recipe CRUD
FR61: Epic 4 - Recipe ingredient inventory status
FR62: Epic 3 - Dollar attribution on all events
FR63: Epic 3 - Wastage-to-inventory propagation
FR64: Epic 3 - Threshold-to-feed alert propagation
FR65: Epic 3 - Comp budget-to-feed warning propagation
FR66: Epic 1 - Error feedback with retry
FR67: Epic 2 - Checklist completion history (all users)
FR68: Epic 3 - Weekly wastage/comp dollar totals
FR69: Epic 2 - Personal daily activity log
FR70: Epic 2 - Daily operations summary
FR71: Epic 3 - Weekly aggregation aligned to comp reset day
FR72: Epic 1 - Unified settings screen
FR73: Epic 1 - Checklist time boundary configuration
FR74: Epic 3 - Ingredient cost per unit updates

**Testing Requirement:** All Server Actions must have co-located tests (`*.actions.test.ts`). Critical business logic (auto-deduct, budget calculations, threshold checks, feed composition) must have unit tests. This applies to all stories — it is an implicit AC even when not explicitly listed. Dev agents should follow the architecture enforcement guidelines: tests co-located next to source files with `.test.ts` suffix.

**Cross-Cutting NFR: Device Validation (NFR9):** All performance NFRs must be validated on reference test devices: mid-range Android (4GB RAM, Android 12+) and iPhone 12. This applies to ALL epics, not just one — any story with touch interactions, animations, or load time targets must be tested on these devices.

## Epic List

### Epic 1: Foundation, Auth & Cafe Setup
Dana can access the deployed app, log in, select a cafe template, configure time boundaries, and invite Jake. The app is live with onboarding cards guiding remaining setup. The unified settings screen provides a hub for all configuration.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR10, FR11, FR66, FR72, FR73
**NFRs addressed:** NFR10-15 (security), NFR16 (uptime), NFR21 (backups), NFR23-26 (accessibility foundations)

### Epic 2: Action Feed & Daily Checklists
Dana and Jake see what needs doing and work through daily checklists. Manager can see completion history, daily operations summary, and who did what. The "cafe runs without me" promise is validated from the start.
**FRs covered:** FR12, FR13, FR14, FR15, FR16, FR17, FR18, FR19, FR20, FR21, FR22, FR23, FR24, FR25, FR26, FR27, FR28, FR29, FR67, FR69, FR70
**NFRs addressed:** NFR1-6 (performance + bundle size), NFR20 (no data loss on browser close)

### Epic 3: Inventory, Wastage & Comp — Connected Operations
Full operational loop — count inventory, log wastage with auto-deduct, track comps with budget, see dollar values everywhere. Alerts propagate to the feed. Weekly totals visible. All connected operations unified in one epic.
**FRs covered:** FR30, FR31, FR32, FR33, FR34, FR35, FR36, FR37, FR38, FR39, FR40, FR41, FR42, FR43, FR44, FR45, FR46, FR47, FR48, FR49, FR50, FR51, FR52, FR53, FR54, FR55, FR62, FR63, FR64, FR65, FR68, FR71, FR74
**NFRs addressed:** NFR7-8 (mutation speed + concurrency), NFR17 (transactions), NFR18-19 (error recovery + undo), NFR22 (offline state)

### Epic 4: Supplier & Recipe Management (Deferrable)
Manager manages supplier contacts with tap-to-call and one-tap call outcome logging. Recipes show ingredient lists with live inventory status. Supplier reminders appear on the feed.
**FRs covered:** FR56, FR57, FR58, FR59, FR60, FR61
**NFRs addressed:** Cross-cutting NFRs (NFR9 applies to all epics — see note above)

## Epic 1: Foundation, Auth & Cafe Setup

Dana can access the deployed app, log in, select a cafe template, configure time boundaries, and invite Jake. The app is live with onboarding cards guiding remaining setup. The unified settings screen provides a hub for all configuration.

### Story 1.1: Manager Registration, App Shell & Deployment

As a **cafe manager**,
I want to register an account, log in, and access a deployed mobile-first app with role-based navigation,
So that I have a secure, accessible operational tool from day one.

**Acceptance Criteria:**

**Given** no existing account
**When** the manager visits the app and registers with email and password
**Then** a new Manager account is created with a Cafe record, password is hashed with bcrypt (cost 10+), and the manager is logged in
**And** the session is stored in the database with 30-day inactivity expiry
**And** password must be at least 8 characters

**Given** a user attempts to register with an email that already exists
**When** registration is submitted
**Then** a clear error message is shown: "An account with this email already exists"
**And** no duplicate account is created

**Given** a registered manager
**When** they log in with email and password
**Then** they are authenticated and redirected to the Action Feed (default route)
**And** the app shell displays bottom navigation with 4 tabs (Action Feed, Inventory, Wastage/Comp, Operations)

**Given** an authenticated user
**When** they tap "Log out" (accessible from Settings or profile area)
**Then** their session is destroyed server-side and they are redirected to the login screen

**Given** an authenticated manager
**When** they navigate the app
**Then** all screens are accessible (Action Feed, Inventory, Wastage/Comp, Operations, Settings)
**And** role-based access is enforced server-side on every route via middleware

**Given** 5 failed login attempts for the same email
**When** a 6th attempt is made
**Then** the account is locked for 15 minutes with a user-friendly message

**Given** any mutation fails
**When** the error is returned to the client
**Then** a user-visible error message is displayed with a retry option within 2s
**And** the error is logged to the `error_log` table

**Given** the project is initialized
**When** deployed
**Then** the app is live on Vercel with auto-deploy on push to main, connected to Supabase PostgreSQL via pooler URL, with HTTPS, manifest.json, and empty service worker for PWA installability

**Given** this is the foundation story
**When** implementation is complete
**Then** the following architectural artifacts exist and are functional: `src/lib/db.ts` (Prisma singleton), `src/lib/safe-mutation.ts` (ActionResult pattern), `src/lib/format.ts` (formatCents, formatTime), `src/lib/constants.ts`, `src/lib/log-error.ts`, `middleware.ts` (auth + isActive check), route groups `(auth)`/`(app)`, `tailwind.config.ts` with design tokens (color vocabulary, typography scale, touch-target utility class), and base theme configuration per UX spec

**Implementation Notes:**
- Project init: `create-next-app` + `shadcn init` + Prisma + Auth.js v5
- Database: Supabase PostgreSQL with `?pgbouncer=true`
- Creates tables: User, Cafe, Session, ErrorLog
- Establishes: `ActionResult<T>`, `safeMutation`, `src/lib/db.ts` singleton, route groups `(auth)`/`(app)`, `middleware.ts`
- Touch targets 44x44px, 16px base font, WCAG AA contrast from the start
- **Size note:** This is the largest story in the project. A dev agent may split into sub-tasks: (a) project init + deploy + login, (b) error handling + brute force. Both are part of this story's scope.

### Story 1.2: Staff Invitation & Self-Registration

As a **cafe manager**,
I want to invite staff members so they can create their own accounts,
So that staff onboard themselves without me managing their credentials.

**Acceptance Criteria:**

**Given** an authenticated manager
**When** they navigate to Settings and tap "Invite Staff"
**Then** an invite is generated with a unique link/code tied to the manager's cafe with the Staff role
**And** the invite link is displayed with a "Copy Link" button for the manager to share manually (via text, chat, etc.)

**Given** a valid invite link/code
**When** an uninvited user visits the link or enters the code
**Then** they can register with their own email and password
**And** their account is created with Staff role, linked to the manager's cafe

**Given** an expired invite (older than 7 days) or already-used invite
**When** someone attempts to register with it
**Then** a clear error message is shown and registration is blocked

**Given** an authenticated manager on the Settings screen
**When** they view the staff list
**Then** all staff accounts for their cafe are displayed with name, email, and status (active/deactivated)

**Given** a manager viewing a staff account
**When** they tap "Reset Password"
**Then** the staff password is reset and a temporary password or reset link is provided

**Given** a manager deactivates a staff account
**When** the deactivation is confirmed
**Then** the staff member's active sessions are invalidated immediately
**And** the deactivated user cannot log in

**Given** an authenticated staff member
**When** they navigate the app
**Then** they can only access Action Feed, Checklists, and Wastage/Comp
**And** Settings, Operations, and admin functions are hidden and server-blocked

**Implementation Notes:**
- Creates/extends: Invite table with code, cafeId, role, createdAt, usedAt, expiresAt (7-day default)
- No email service in MVP — manager copies link and shares manually
- **Invite registration route** (`/invite/[code]`) must be in the `(auth)` route group alongside login — it is a public route for unauthenticated users. The middleware must allow this path without authentication. The route validates the invite code, then presents a registration form. On successful registration, the user is automatically logged in and redirected to the Action Feed.
- Staff never see Settings or Operations tabs in bottom nav
- NFR15: Immediate session invalidation on deactivation

### Story 1.3: Unified Settings & Checklist Time Boundaries

As a **cafe manager**,
I want a centralized settings screen where I can configure checklist time periods,
So that the app matches my cafe's daily rhythm.

**Acceptance Criteria:**

**Given** an authenticated manager
**When** they tap the Settings tab
**Then** a unified settings screen is displayed with clearly labeled sections in this order: (1) Cafe Settings (timezone, checklist time boundaries), (2) Staff Management (invite, list, deactivate), (3) Checklist Configuration (template management link), (4) Comp Budget (amount, reset day — added in Story 3.8), (5) Ingredient Management (link to inventory settings — added in Story 3.1)
**And** sections not yet available (from later epics) are simply absent, not disabled or greyed out

**Given** a manager on the Settings screen
**When** they configure checklist time boundaries
**Then** they can set start/end times for Opening, Mid-Day, and Closing periods
**And** the boundaries are saved and take effect on the next checklist reset

**Given** time boundaries are not configured
**When** the system needs period boundaries
**Then** sensible defaults are used (Opening: 5am-9am, Mid-Day: 9am-3pm, Closing: 3pm-9pm)

**Given** a manager sets overlapping time boundaries
**When** they attempt to save
**Then** a validation error explains the overlap and prevents saving

**Implementation Notes:**
- Settings screen is the unified hub (FR72)
- Stores timezone per cafe for server-side period logic
- **Settings stored directly on Cafe model** (no separate CafeConfig table): timezone, openingStart, openingEnd, midDayStart, midDayEnd, closingStart, closingEnd. Keeps schema simple for MVP.

### Story 1.4: Quick-Start Cafe Template Selection

As a **cafe manager**,
I want to select a cafe-type template during initial setup so the app is pre-populated with relevant data,
So that setup takes minutes instead of hours.

**Acceptance Criteria:**

**Given** a newly registered manager with no template selected
**When** they complete registration and are authenticated
**Then** they are immediately routed to the template selection screen (no intermediate blank/empty feed state)
**And** they can select from three templates: Specialty Coffee, Traditional Cafe, Tea & Light Bites

**Given** the manager selects a template
**When** the selection is confirmed
**Then** the system populates: ingredients with names/units/container profiles/cost-per-unit, three daily checklists (Opening/Mid-Day/Closing) with sensible default items, and supplier placeholders
**And** the data is created via idempotent upsert operations

**Given** template data is populated
**When** the manager reviews the populated data
**Then** all ingredients, checklists, and suppliers are editable and deletable
**And** the manager can customize the template to match their cafe

**Given** a manager reviewing populated ingredients
**When** they want to customize the list
**Then** they can: edit ingredient names, delete unwanted ingredients, add new ingredients (name and unit only), and reorder the list
**And** advanced ingredient features (cost-per-unit, snap increments, container profiles, categories, pinning, thresholds) are available in Epic 3 Story 3.1

**Given** Story 1.3 has been completed
**When** template checklists are created
**Then** each checklist is assigned to the correct period (Opening/Mid-Day/Closing) using the configured or default time boundaries

**Implementation Notes:**
- Creates tables: Ingredient (with name, unit, cafeId, displayOrder — cost/snap/container/category fields exist in schema but are optional and configured in Story 3.1), ChecklistTemplate, ChecklistTemplateItem, Supplier (as needed)
- Basic ingredient CRUD (add name+unit, edit name, delete, reorder) is included in this story to enable onboarding customization per PRD Journey 4
- Seed data uses `upsert` for idempotency
- All money values stored as integer cents
- Server-generated timestamps only
- **Dependency:** Requires Story 1.3 (time boundaries) to be completed first
- **Template data:** Define seed data in `prisma/seed.ts` — approximately 18 ingredients, 3 checklists (6-8 items each), and 3 supplier placeholders per cafe type. Dev agent should reference PRD Journey 4 for specifics (Specialty Coffee example: espresso beans, whole milk, oat milk, vanilla syrup, etc.)
- **Seed data quality is critical.** The dev agent should create a draft seed data file and present it for review before implementation. Base (product owner) should validate the ingredient lists, checklist items, and supplier placeholders for each cafe type. Seed data test (`prisma/seed.test.ts`) validates all 3 templates produce valid, complete data.

### Story 1.5: Onboarding Cards & Setup Guidance

As a **cafe manager**,
I want to see guided setup tasks on the Action Feed when my cafe isn't fully configured,
So that I know what to do next without reading documentation.

**Acceptance Criteria:**

**Given** a manager who has selected a template but hasn't completed setup
**When** they view the Action Feed
**Then** onboarding cards are displayed based on explicit rules:
- No customized ingredients → "Review your ingredient list"
- No customized checklists → "Customize your checklists"
- No staff invited → "Invite a staff member"
- No comp budget set → "Set your comp budget"
**And** cards use the onboarding visual style (blue border, setup icon)
**And** cards are ordered by setup priority: ingredients → checklists → staff → budget

**Given** an onboarding task is completed
**When** the manager returns to the Action Feed
**Then** the completed onboarding card is removed and replaced by the next setup task or operational cards
**And** completion is triggered by either (a) making a change to the relevant section, OR (b) tapping "Looks good" on the onboarding card to acknowledge defaults are acceptable — both paths dismiss the card

**Given** all onboarding tasks are complete
**When** the manager views the Action Feed
**Then** no onboarding cards remain and the feed shows operational content (or an "All caught up" empty state)

**Implementation Notes:**
- Onboarding card variant with blue `--color-info` border
- Cards follow the standard card anatomy (4px left border, status icon, title)
- Skeleton loading while feed loads

### Story 1.6: Staff First Login & Orientation

As a **staff member**,
I want to see a brief orientation when I first log in,
So that I understand what the app does and how to use it without training.

**Acceptance Criteria:**

**Given** a staff member logging in for the first time
**When** they are authenticated and enter the app
**Then** an orientation message is displayed explaining the app's purpose and their role
**And** the bottom navigation shows only their accessible tabs (Action Feed, Wastage/Comp)

**Given** the staff member dismisses the orientation
**When** they return to the app on subsequent logins
**Then** the orientation is not shown again

**Given** a staff member on the Action Feed
**When** no checklists or tasks exist yet
**Then** a friendly empty state is shown (not a broken or blank screen)

**Implementation Notes:**
- `firstLoginAt` flag on User record
- **Creates:** `src/components/ui/empty-state.tsx` — reusable variant-based empty state component (icon + message + optional action button). Used here for staff empty feed, reused in Story 2.4 ("All caught up") and throughout the app.

## Epic 2: Action Feed & Daily Checklists

Dana and Jake see what needs doing and work through daily checklists. Manager can see completion history, daily operations summary, and who did what. The "cafe runs without me" promise is validated from the start.

### Story 2.1: Action Feed with Card Architecture

As a **cafe user**,
I want to see a prioritized feed of actionable cards when I open the app,
So that I immediately know what needs my attention right now.

**Acceptance Criteria:**

**Given** an authenticated user
**When** they open the app (default route)
**Then** the Action Feed displays cards sorted by strict priority: overdue > time-sensitive > alerts > informational

**Given** the feed has more than 5 cards
**When** the feed renders
**Then** a maximum of 5 cards are visible before scroll
**And** remaining cards are accessible by scrolling

**Given** cards of different types exist
**When** they render on the feed
**Then** each card type is visually differentiated: checklist cards show a progress bar, alert cards show a colored border (amber/red), onboarding cards show setup style (blue border), completion summary cards show green border with checkmark
**And** checklist cards display up to 4 items inline; if more exist, a "Show all X items" link expands the card or navigates to the full checklist view

**Given** a staff member is authenticated
**When** they view the Action Feed
**Then** only cards relevant to their role are displayed (no manager-only content)

**Given** pending action items exist in other modules
**When** the bottom navigation renders
**Then** navigation indicators (dots) appear on relevant tabs based on: incomplete checklists → Action Feed tab dot, low-stock alerts → Inventory tab dot, comp budget warning → Wastage/Comp tab dot
**And** badge state derives from the same `FeedResponse` data — no separate API calls

**Given** the feed is loading
**When** data has not yet returned
**Then** skeleton placeholders are shown (no spinners)
**And** the summary bar renders immediately with cached data from localStorage

**Given** the backend is unreachable
**When** the user opens or refreshes the feed
**Then** a calm offline banner appears at the top: "Offline — showing last synced data"
**And** the feed shows the last cached state from localStorage (not a blank screen or error page)

**Given** the user pulls down on the feed
**When** the pull-to-refresh gesture completes
**Then** the feed revalidates from the server and updates with fresh data

**Given** the feed API endpoint is called
**When** the request is processed
**Then** cards and summary data are returned in a single `FeedResponse` (cards + summary bundled)
**And** the feed renders with all cards in <200ms

**Given** the app layout renders for authenticated users
**When** the summary bar component is displayed (fixed position above feed)
**Then** it shows: current checklist progress (e.g., "Opening: 3/7") and grows to include comp budget when Epic 3 ships
**And** the summary bar is built as `src/components/ui/summary-bar.tsx` — this story owns its creation

**Given** the summary bar renders before Epic 3 features exist
**When** comp budget and wastage data are unavailable
**Then** the summary bar shows only checklist progress (available data) and omits unavailable sections gracefully

**Implementation Notes:**
- Server-computed feed via `getFeedCards()` in `domains/feed/composer.ts`
- `Promise.allSettled` for per-domain error isolation
- SWR for client-side revalidation via `GET /api/feed` — revalidates on focus, pull-to-refresh, and 30-second interval (`FEED_REFRESH_INTERVAL_MS = 30_000` in `src/lib/constants.ts`). 30s balances data freshness (Dana glances at phone, sees current state) against server load (acceptable for 5 users).
- `/api/feed` calls `auth()` and rejects if no session
- Card anatomy: 4px colored left border, status icon, title, dollar value, card-type content
- **ActionFeedCard is a single composition component** (`src/components/ui/action-feed-card.tsx`) with a `variant` prop (checklist | alert | onboarding | completion | supplier). Each variant renders different body/footer content within the shared card shell. New variants are added by later stories — the component is designed for extension.
- **Creates:** `src/components/ui/offline-banner.tsx` — calm offline indicator component (NFR22). Displays when backend is unreachable, hides when connection restored.
- Summary bar designed to grow — shows available data per epic; empty sections hidden, not broken

### Story 2.2: Checklist Template Management

As a **cafe manager**,
I want to create and customize checklist templates for Opening, Mid-Day, and Closing periods,
So that my staff know exactly what to do each shift.

**Acceptance Criteria:**

**Given** an authenticated manager
**When** they navigate to checklist management (via Settings or Action Feed)
**Then** they can view existing templates for Opening, Mid-Day, and Closing periods

**Given** a manager editing a checklist template
**When** they add a new item
**Then** the item is created with: title, optional notes/context, and role assignment (Manager, Staff, or Both)

**Given** a manager editing a checklist template
**When** they modify or reorder existing items
**Then** changes are saved and reflected in the next checklist instance

**Given** a manager editing a checklist template
**When** they delete an item
**Then** the item is removed from the template after confirmation

**Given** a checklist template has more than 10 items
**When** the manager views the template
**Then** a warning is displayed recommending a maximum of 8 items

**Given** the checklist system
**When** templates are structured
**Then** each period (Opening, Mid-Day, Closing) has exactly one checklist template — multiple templates per period are not supported in MVP

**Given** a manager adding a checklist item
**When** they configure the item
**Then** they can add contextual notes (e.g., "Count matches printed sheet on clipboard")
**And** they can assign it to Manager, Staff, or Both roles

**Implementation Notes:**
- Uses the same `ChecklistTemplate` and `ChecklistTemplateItem` tables created and seeded in Story 1.4
- Items support notes field and role enum
- Checklist items can be reordered (position/order field)

### Story 2.3: Daily Checklist Completion

As a **cafe user**,
I want to tap through my assigned checklist items and have my progress tracked,
So that I complete my shift tasks with accountability.

**Acceptance Criteria:**

**Given** an authenticated user with assigned checklist items
**When** they view a checklist on the Action Feed
**Then** items assigned to their role (or "Both") are displayed directly on the checklist card — no expand/collapse step

**Given** a user viewing a checklist item
**When** they tap the item
**Then** it is marked complete with an instant checkmark animation (<100ms visual feedback)
**And** a completion timestamp and the completing user are recorded server-side

**Given** a user accidentally completes an item
**When** they tap the completed item again
**Then** the completion is undone (unchecked)

**Given** a checklist item has a cross-module link configured (e.g., "Check inventory" → `/inventory`)
**When** the target screen exists in the current build
**Then** tapping the link navigates to that screen and the user can return to the checklist afterward
**And** checklist progress is preserved across navigation

**Given** a checklist item has a cross-module link to a screen not yet implemented (e.g., Inventory before Epic 3)
**When** the checklist renders
**Then** the link is displayed as plain text (no broken navigation) and becomes tappable once the target screen ships

**Implementation Notes for cross-module links:**
- Links stored as optional `linkRoute` field on ChecklistTemplateItem (e.g., `/inventory`, `/wastage?tab=log`, `/inventory?filter=dairy`)
- `linkRoute` supports query params to provide context (e.g., a "Check dairy inventory" item can link to `/inventory?filter=dairy`)
- UI conditionally renders as tappable link only if route exists in current build

**Given** all three checklist periods exist (Opening, Mid-Day, Closing)
**When** a user views checklists
**Then** they can access all three periods regardless of the current time of day via a 1-tap period switch

**Given** a new day begins (at the configured reset time, default: start of Opening period)
**When** a user opens the app after the reset time
**Then** the system creates fresh daily checklist instances from templates (on-demand, not cron)
**And** previous day's completion data is preserved in history

**Given** a checklist is partially complete at the time of daily reset
**When** the new day's checklists are generated
**Then** the incomplete items from the previous day remain in history as incomplete — they are not carried over to the new day

**Given** multiple users open the app simultaneously after the reset time
**When** daily checklist generation is triggered by each request
**Then** the system uses a database-level uniqueness constraint (cafeId + date + period) to prevent duplicate daily checklists
**And** the second user's request detects the already-created checklists and returns them

**Given** the user closes the browser mid-checklist
**When** they reopen the app
**Then** all previously completed items remain checked (no data loss)

**Implementation Notes:**
- Creates: DailyChecklist, DailyChecklistItem tables (instances of templates)
- Completion uses optimistic UI via `safeMutation`
- Server-authoritative timestamps for completion
- NFR20: Checklist progress persists on browser close (server-persisted, not localStorage)

### Story 2.4: Time-Aware Feed & Checklist Auto-Selection

As a **cafe user**,
I want the app to automatically highlight the right checklist for the current time of day,
So that I don't have to think about which checklist to work on.

**Acceptance Criteria:**

**Given** it is currently within the Opening period time boundary
**When** the user opens the Action Feed
**Then** the Opening checklist card is auto-selected and displayed prominently as the default
**And** the checklist card shows the time-range label (e.g., "Opening 5am-9am")

**Given** the user is viewing an auto-selected checklist
**When** they want a different period
**Then** they can switch with 1 tap to any other period (Opening, Mid-Day, Closing)

**Given** a checklist has been completed for the current period
**When** the user views the Action Feed
**Then** the completed checklist collapses to a "Done" summary card showing "7/7 items. All on track." with a green border and completion timestamp

**Given** an alert card was resolved
**When** 24 hours have passed since resolution
**Then** the alert is automatically dismissed from the feed
**And** note: alert creation happens in Epic 3; this AC establishes the dismiss mechanism and is fully testable once alerts exist

**Given** all checklists are complete and no alerts exist
**When** the user views the Action Feed
**Then** an "All caught up" positive empty state is displayed with a next-period hint (e.g., "Closing checklist at 3pm")

**Implementation Notes:**
- Time-aware logic runs server-side using `getCafeNow(cafeId)` in cafe's timezone
- Auto-selection is a default, not a lock — user can always switch
- Completion summary card variant with green `--color-success` border
- "All caught up" card variant

### Story 2.5: Checklist Completion History & Operations Summary

As a **cafe manager**,
I want to see who completed which checklists and a daily operations summary,
So that I can oversee operations without being physically present.

**Acceptance Criteria:**

**Given** an authenticated manager
**When** they navigate to the checklist history view (accessible from Settings > Checklist section)
**Then** they can see completion status for all users: who completed each item, when, and for which period
**And** data is organized by day with the most recent day first
**And** history is available for the last 30 days

**Given** an authenticated user (manager or staff)
**When** they tap their profile or "My Activity" on the Action Feed
**Then** they can see their own actions for the current day: checklist items completed, with timestamps

**Given** an authenticated manager
**When** they view the daily operations summary (displayed as a summary card on the Action Feed)
**Then** they see a daily summary that grows with available data: checklists completed (count and percentage) and total checklist items done (always available from Epic 2), plus wastage logged and comp spent totals (available once Epic 3 ships)
**And** sections for data not yet available are omitted entirely (not shown as "$0" or "No data")

**Given** a manager checks the app while away (e.g., sick day)
**When** they view completion history
**Then** they can see exactly what happened: "Opening: Complete. 7/7 items by Jake at 6:42am"

**Implementation Notes:**
- Queries from DailyChecklist + DailyChecklistItem completion data
- Manager sees all users' data; staff sees only their own
- Daily summary composes from checklist domain queries
- No new tables needed — reads from existing completion records

## Epic 3: Inventory, Wastage & Comp — Connected Operations

Full operational loop — count inventory, log wastage with auto-deduct, track comps with budget, see dollar values everywhere. Alerts propagate to the feed. Weekly totals visible. All connected operations unified in one epic.

### Story 3.1: Advanced Ingredient Configuration

As a **cafe manager**,
I want to configure cost, container profiles, snap increments, categories, and pinning on my ingredients,
So that inventory tracking reflects how my cafe actually uses each item and every change carries a dollar value.

**Acceptance Criteria:**

**Given** ingredients already exist from template setup (Story 1.4)
**When** the manager navigates to Inventory settings
**Then** they can enhance any ingredient with: container profile (e.g., "case (6-pack)"), cost per unit in dollars, snap increments, category, low-stock threshold, and pinning

**Given** a manager adding an ingredient with a cost
**When** the cost is saved
**Then** it is stored as integer cents in the database (e.g., $4.80 → 480)
**And** displayed using `formatCents()` throughout the app

**Given** a manager editing an ingredient
**When** they update the cost per unit
**Then** the new cost applies to future events only — historical wastage/comp dollar values are unchanged

**Given** a manager configuring an ingredient
**When** they set snap increments for the slider
**Then** the increment value is saved per ingredient (e.g., milk by 10%, beans by 250g bags)

**Given** a manager viewing the ingredient list
**When** they tap the pin icon on an ingredient
**Then** that ingredient is pinned to the top of the inventory list
**And** multiple ingredients can be pinned

**Given** a manager adding an ingredient
**When** they configure the ingredient
**Then** they can optionally assign a category (e.g., "Dairy", "Coffee", "Syrups", "Dry Goods")
**And** categories are used for filtering on the Inventory screen in Story 3.2

**Given** a manager configuring a percentage-based ingredient (e.g., milk tracked as 0-100%)
**When** they set cost per unit
**Then** they also configure a `unitsPerContainer` value (e.g., "1 container = 4 litres") so the system can convert percentage changes to dollar amounts
**And** dollar attribution formula: `(percentageDelta / 100) * unitsPerContainer * costPerUnit`

**Implementation Notes:**
- Extends existing Ingredient table (created in Story 1.4) — populates optional fields: costInCents, snapIncrement, containerProfile, isPinned, category, lowStockThreshold, unitsPerContainer
- Basic CRUD (add name+unit, edit name, delete, reorder) was handled in Story 1.4; this story adds the advanced configuration layer
- All money as integer cents — Zod validates integers at boundary
- @@index([cafeId]) on Ingredient
- Categories are freeform text (not a separate table) for MVP simplicity

### Story 3.2: Inventory Counting with Slider Input

As a **cafe user**,
I want to update inventory quantities quickly using a slider with pre-filled values,
So that daily counts take under 60 seconds.

**Acceptance Criteria:**

**Given** a user on the Inventory screen
**When** the screen loads
**Then** all ingredients are displayed with previous day's values pre-filled
**And** pinned ingredients appear at the top

**Given** a user viewing an ingredient with a pre-filled value
**When** they tap to confirm without changing
**Then** the value is confirmed with a single tap and a visual checkmark appears

**Given** a user adjusting an ingredient quantity
**When** they drag the slider
**Then** the slider snaps to the configured increments for that ingredient
**And** the slider feels heavy with snap resistance to prevent accidental changes
**And** the interaction renders at 60fps on 320px screens

**Given** a user changes a value by more than 50% from the previous day
**When** they release the slider
**Then** a confirmation prompt appears asking them to verify the large change

**Given** multiple ingredients have unchanged values
**When** the user wants to confirm them quickly
**Then** a "Confirm All Unchanged" bulk button confirms all items that match their previous day's values in a single tap

**Given** a user on the Inventory screen
**When** they use filter or sort controls
**Then** they can filter by category (from ingredient categories in Story 3.1) and sort by name, quantity, or last updated

**Given** the slider does not achieve 60fps on target devices (mid-range Android, iPhone 12) during development
**When** the fallback is needed
**Then** a stepper component (+ / - buttons with increment steps) replaces the slider

**Implementation Notes:**
- Creates: InventoryCount table with ingredientId, countDate, quantity, confirmedBy, confirmedAt
- @@index([ingredientId, countDate])
- Slider built on Radix primitive with raw `requestAnimationFrame` — no framer-motion/react-spring
- Stepper fallback uses standard shadcn Button components
- Pre-fill queries previous day's InventoryCount records
- **Dependency:** Requires Story 3.1 (Advanced Ingredient Configuration) — slider uses snap increments configured per ingredient. If ingredient has no snap increment configured, slider uses a sensible default (e.g., 5% for percentage-based, 1 unit for discrete counts).
- **Slider/stepper handles two input modes** configured per ingredient: **percentage mode** (0-100% in configurable snap increments, used for liquids like milk) and **discrete mode** (integer count in configurable step sizes, used for countable items like bags/cases). Both modes use the same component with a `mode` prop. Story 3.5 reuses this component for wastage quantity input in the same modes.

### Story 3.3: Concurrent Edits & Dollar Attribution

As a **cafe user**,
I want the system to handle it gracefully when two people update inventory at the same time,
So that I trust the numbers are accurate.

**Acceptance Criteria:**

**Given** two users are viewing the same ingredient's inventory
**When** User A saves a new quantity
**Then** the save succeeds with optimistic UI confirmation

**Given** User A has already saved a new quantity
**When** User B attempts to save their (now stale) value
**Then** the system detects the stale state via `updatedAt` comparison
**And** User B sees a prompt: "This item was updated by someone else. Review the current value?"
**And** User B can accept the current value or re-enter their own

**Given** any inventory change is saved
**When** the change is recorded
**Then** the dollar value of the change is calculated (quantity delta x cost per unit in cents) and attributed to the event

**Given** an inventory count is confirmed
**When** the value differs from the previous day
**Then** the dollar impact is visible on the confirmation (e.g., "Oat milk: 40% → 28%, -$12.60")

**Implementation Notes:**
- Optimistic concurrency: bulk confirm sends `expectedPreviousValue`, server rejects if stale
- Dollar attribution: `deltaQuantity * costInCents` calculated server-side
- FR62: Every operational event carries a dollar value — this story establishes the dollar attribution pattern. Wastage (3.5) and comp (3.8) stories apply the same pattern to their domains.

### Story 3.4: Low-Stock Alerts on Action Feed

As a **cafe manager**,
I want to see low-stock alerts on the Action Feed when inventory hits my configured thresholds,
So that I never run out of key ingredients.

**Acceptance Criteria:**

**Given** a manager configuring an ingredient
**When** they set a low-stock threshold (e.g., 25%)
**Then** the threshold is saved per ingredient

**Given** an inventory count is saved or wastage deducts inventory
**When** the resulting quantity is at or below the threshold
**Then** a low-stock alert card is generated on the Action Feed
**And** the alert uses amber `--color-warning` border and shows: ingredient name, current level, threshold level

**Given** the ingredient quantity rises above the threshold
**When** the user views the feed
**Then** the alert is resolved and will auto-dismiss after 24 hours

**Given** multiple ingredients are below threshold
**When** the feed renders
**Then** each ingredient gets its own alert card, sorted by priority within the feed

**Given** an ingredient has no threshold configured
**When** its quantity changes
**Then** no alert is generated — alerts only fire for ingredients with explicit thresholds set by the manager

**Given** a low-stock alert card is displayed for an ingredient that has an associated supplier (Epic 4)
**When** the user views the alert
**Then** the alert includes an action button: "Order from [Supplier Name]" linking to the supplier's tap-to-call card

**Given** a low-stock alert card is displayed but no supplier is linked or Epic 4 is not yet shipped
**When** the user views the alert
**Then** the alert includes a fallback action: "Review inventory" linking to the Inventory screen for that ingredient

**Implementation Notes:**
- `checkThresholds()` called after inventory updates and wastage deductions
- Alert cards created as feed card rows in the database — no separate notification system
- Feed composer's `getAlertCards()` returns inventory threshold alerts
- Threshold field is optional on Ingredient — null means no alerting
- Alert action button is conditional: links to supplier if Ingredient has `supplierId` and Operations screen exists, otherwise links to `/inventory`

### Story 3.5: Wastage Logging with Quick Presets

As a **cafe user**,
I want to log wastage in 2 taps using quick presets,
So that I capture every loss without slowing down my shift.

**Acceptance Criteria:**

**Given** a user navigating to the Wastage/Comp screen
**When** the screen loads
**Then** two tabs are displayed at the top: "Wastage" (default) and "Comp"
**And** each tab shows its own transaction log, input controls, and weekly summary section
**And** the active tab is persisted in URL query param (`?tab=wastage` or `?tab=comp`) so links from checklists/feed can deep-link to the correct tab

**Given** a user on the Wastage/Comp screen (Wastage tab)
**When** they tap to log wastage
**Then** they see quick-log presets: Spilled, Expired, Incorrect

**Given** a user selects a preset and an ingredient
**When** they are prompted for quantity
**Then** they can enter the quantity using the same slider/stepper input as inventory (respecting ingredient snap increments) or select from common quick amounts (1 unit, 1 serving)

**Given** a user confirms the wastage entry
**When** the entry is saved
**Then** the entry is recorded with: ingredient, quantity, preset reason, timestamp, and dollar value
**And** the dollar value is displayed prominently (e.g., "$4.80 wastage logged")

**Given** wastage entries exist
**When** the user views the wastage log
**Then** entries are displayed in reverse chronological order with: item name, reason, dollar value, timestamp
**And** the user can filter and sort records

**Given** a wastage entry is logged
**When** the weekly view is checked
**Then** the entry's dollar value contributes to the running weekly wastage total

**Implementation Notes:**
- Creates: WastageEntry table with ingredientId, quantity, reason (enum: SPILLED/EXPIRED/INCORRECT), dollarValueInCents, createdBy, deletedAt (soft-delete)
- @@index([cafeId, createdAt])
- Dollar value calculated server-side: quantity x ingredient costInCents
- Transaction log styled like a bank statement — amounts right-aligned, descriptions left-aligned

### Story 3.6: Wastage Auto-Deduct & Undo

As a **cafe user**,
I want wastage to automatically deduct from inventory with visible confirmation and undo,
So that inventory stays accurate without manual double-entry.

**Acceptance Criteria:**

**Given** a user logs a wastage entry
**When** the entry is confirmed
**Then** the system automatically deducts the wastage quantity from the ingredient's inventory within a single database transaction
**And** the deduction is atomic — either both wastage log and inventory update succeed, or neither does

**Given** the auto-deduct succeeds
**When** the confirmation appears
**Then** the user sees: "Oat milk: 28% → 25%. Undo?" with the affected ingredient and new quantity clearly shown

**Given** a user sees the auto-deduct confirmation
**When** they tap "Undo" within the 5-second window
**Then** the wastage entry is soft-deleted and the inventory quantity is restored
**And** the undo toast shows a visible countdown timer

**Given** the 5-second undo window passes
**When** no undo was tapped
**Then** the wastage entry is finalized and the undo option disappears

**Given** the ingredient's current quantity is less than the wastage amount
**When** the auto-deduct is calculated
**Then** the deduction is capped at the available quantity (inventory never goes negative)
**And** the user sees a message: "Deducted available amount (was X, now 0)"

**Given** multiple wastage entries are logged quickly
**When** multiple undo toasts exist
**Then** toasts stack vertically with independent 5-second timers and visible progress indicators

**Given** the auto-deduct transaction fails
**When** the error is returned
**Then** the user sees a clear error message with retry option
**And** no partial state exists (inventory unchanged, wastage not logged)

**Given** the user is offline or the backend is unreachable
**When** they attempt to log wastage
**Then** the offline banner is displayed and the action is blocked with a message: "Can't log wastage while offline. Check your connection."

**Implementation Notes:**
- Prisma `$transaction` wrapping: wastageEntry.create + deductInventory() + checkThresholds()
- `deductInventory()` and `checkThresholds()` from `src/lib/transactions.ts`
- **Creates:** `src/components/providers/undo-toast-provider.tsx` (global toast context + useReducer) and `src/components/ui/undo-toast.tsx` (toast component with countdown). Story 3.8 reuses this infrastructure.
- **Concurrency safety:** Auto-deduct transactions should use Serializable isolation level or `SELECT ... FOR UPDATE` on the ingredient's inventory row to prevent concurrent deduction race conditions. Critical for maintaining trust in inventory accuracy even with 5 users.
- Soft-delete: `deletedAt` field on WastageEntry
- NFR17: All mutations use database transactions
- NFR7: Compound mutation completes in <1s server-side

### Story 3.7: Manager Wastage Void & Correction

As a **cafe manager**,
I want to void or correct wastage entries after the undo window,
So that mistakes can be fixed anytime without losing data integrity.

**Acceptance Criteria:**

**Given** an authenticated manager viewing wastage records
**When** they select a finalized wastage entry
**Then** they see options to void or correct the entry

**Given** a manager voids a wastage entry
**When** the void is confirmed
**Then** the entry is marked as voided (soft-delete with void reason)
**And** the inventory quantity is restored by the original deduction amount within a database transaction

**Given** a manager corrects a wastage entry
**When** they update the quantity
**Then** the inventory difference is recalculated and adjusted within a transaction
**And** the original entry is preserved with an audit trail

**Given** a voided entry existed
**When** the weekly totals are viewed
**Then** the voided entry's dollar value is excluded from aggregated totals

**Given** an entry was undone or voided
**When** checked after 24 hours
**Then** the soft-deleted record is still recoverable in the database

**Implementation Notes:**
- Void uses Prisma `$transaction`: mark voided + restore inventory + recheck thresholds
- Audit trail stored on WastageEntry: voidedAt, voidedBy, voidReason, originalQuantity, correctedQuantity (if correction)
- NFR19: Undone/voided actions recoverable for at least 24 hours
- Staff cannot void — manager role required, enforced server-side

### Story 3.8: Comp Logging & Budget Tracking

As a **cafe user**,
I want to log comps with dollar values and see the remaining weekly budget,
So that I can make comp decisions autonomously within budget.

**Acceptance Criteria:**

**Given** a user on the Wastage/Comp screen (Comp tab)
**When** they log a comp event
**Then** they select the item, quantity, and provide a reason
**And** the dollar value is calculated and displayed (e.g., "$5.50 logged")

**Given** a comp entry is logged
**When** the confirmation appears
**Then** the remaining weekly budget is updated and displayed: "Budget: $6.50 remaining"
**And** a 5-second undo toast is shown (same pattern as wastage undo in Story 3.6)

**Given** a staff member logged a comp entry they want to correct
**When** the undo window has passed
**Then** they can tap "Flag for Review" on the entry to mark it for manager attention
**And** the manager sees flagged entries highlighted in the comp log

**Given** a manager views the comp log with flagged entries
**When** they select a flagged entry
**Then** they can void the entry, correct the amount, or dismiss the flag
**And** void/correct uses a transactional pattern: for void, soft-delete the comp entry and recalculate the remaining budget (simpler than wastage void since comps don't auto-deduct inventory)

**Given** a manager on the Settings screen (unified settings hub from Story 1.3)
**When** they configure the comp budget under a new "Comp Budget" section
**Then** they can set the weekly budget amount (in dollars) and the reset day (e.g., Monday)
**And** the configuration lives in Settings (FR72); the remaining budget DISPLAY lives on the Wastage/Comp screen + summary bar

**Given** the configured reset day arrives
**When** the weekly period ends
**Then** comp tracking resets to the full budget amount for the new week

**Given** no comp budget has been configured
**When** a user logs a comp
**Then** the comp is recorded successfully with a prompt suggesting the manager set a budget

**Given** the remaining comp budget is displayed
**When** any user views the summary bar or comp tab
**Then** the remaining amount is visible to all users (manager and staff)

**Implementation Notes:**
- Creates: CompEntry table with ingredientId, quantity, reason, dollarValueInCents, createdBy
- Creates/extends: CompBudget with amountInCents, resetDay, cafeId
- @@index([cafeId, weekStartDate])
- **Comp budget remaining is ALWAYS calculated, never stored as a mutable value.** Formula: `budgetInCents - SUM(compEntry.dollarValueInCents WHERE createdAt >= mostRecentResetDay)`. The reset day is used to compute the week boundary, not to trigger a reset action. No cron job, no stored balance, no reset mutation.
- Summary bar shows comp budget in real-time
- **Comp entries do NOT auto-deduct from inventory.** Comps track dollar spend against budget only. Inventory changes from comped items are captured in the next daily inventory count (Story 3.2), not at comp-log time. This is intentional — comps are a financial tracking feature, not an inventory feature.

### Story 3.9: Comp Budget Warnings on Feed

As a **cafe manager**,
I want to see warnings on the Action Feed when the comp budget approaches or exceeds the limit,
So that I can address spending before it becomes a problem.

**Acceptance Criteria:**

**Given** comp spending reaches 80% of the weekly budget
**When** the feed renders
**Then** an amber warning card appears: "Comp budget at 80% — $10 remaining this week"

**Given** comp spending reaches 100% of the weekly budget
**When** the feed renders
**Then** a red warning card appears: "Comp budget exceeded — $0 remaining this week"
**And** comp logging is still allowed (warning, not a block)

**Given** a comp budget warning exists on the feed
**When** the budget resets on the configured day
**Then** the warning card is resolved and auto-dismisses

**Given** the comp budget warning is visible
**When** both manager and staff view the feed
**Then** both roles see the warning card (comp budget visibility is for all users)

**Implementation Notes:**
- `getCompWarningCards()` in `domains/comp/queries.ts`
- Feed composer includes comp warnings via `Promise.allSettled`
- Threshold logic: `(totalSpentCents / budgetCents) >= 0.8` for amber, `>= 1.0` for red
- FR65: Comp budget threshold breaches propagate to feed

### Story 3.10: Weekly Aggregation & Dollar Totals

As a **cafe manager**,
I want to see aggregated wastage and comp dollar totals by week,
So that I can track operational costs and spot trends.

**Acceptance Criteria:**

**Given** an authenticated manager
**When** they navigate to the Wastage/Comp screen and view the weekly totals section (displayed above the transaction log)
**Then** they see: total wastage dollars this week, total comp dollars this week, broken down by day

**Given** the comp budget reset day is configured (e.g., Monday)
**When** weekly totals are calculated
**Then** the aggregation period aligns with the comp reset day (Monday-Sunday, not calendar week)

**Given** wastage entries have been voided
**When** weekly totals are calculated
**Then** voided entries are excluded from the totals

**Given** multiple weeks of data exist
**When** the manager views weekly totals
**Then** they can see the current week plus up to 4 previous weeks for comparison

**Implementation Notes:**
- Weekly totals displayed as a summary section at the top of the Wastage/Comp screen (above the log)
- Queries aggregate from WastageEntry and CompEntry tables
- Week boundaries derived from CompBudget resetDay
- Voided entries (deletedAt not null) excluded from sums
- Dollar totals formatted via `formatCents()`

## Epic 4: Supplier & Recipe Management (Deferrable)

Manager manages supplier contacts with tap-to-call and one-tap call outcome logging. Recipes show ingredient lists with live inventory status, step-by-step preparation instructions, and cost per serving.

### Story 4.1: Supplier Contact Management & Tap-to-Call

As a **cafe manager**,
I want to manage supplier contacts and call them directly from the app,
So that I never have to dig through my phone for a supplier's number.

**Acceptance Criteria:**

**Given** an authenticated manager
**When** they navigate to the Operations screen (Suppliers tab)
**Then** they see a list of all supplier contacts for their cafe

**Given** a manager adding a new supplier
**When** they fill in name, phone number, and optional notes
**Then** the supplier is saved and appears in the list

**Given** a manager editing an existing supplier
**When** they update name, phone, or notes
**Then** changes are saved immediately with confirmation

**Given** a manager deleting a supplier
**When** they confirm deletion
**Then** the supplier is removed from the list

**Given** any authenticated user viewing a supplier
**When** they tap the phone number or call button
**Then** the device phone dialer opens with the supplier's number pre-loaded via `tel:` link

**Given** the Operations screen is accessed by a staff member
**When** the route is checked
**Then** access is denied — Operations is manager-only, enforced server-side

**Implementation Notes:**
- Creates: Supplier table with name, phone, notes, cafeId, lastOrderDate
- Contact card pattern: simple list with tap-to-call
- Manager-only access via `requireRole('MANAGER')` on operations routes

### Story 4.2: Call Outcome Logging & Supplier Reminders

As a **cafe manager**,
I want to log call outcomes in one tap and see supplier reminders on the feed,
So that I never forget to follow up on orders.

**Acceptance Criteria:**

**Given** a user has just called a supplier
**When** they return to the app and tap "Log Call Outcome" on the supplier card
**Then** a call outcome prompt appears with one-tap options: Ordered, No Answer, Call Back

**Given** the user taps an outcome
**When** the outcome is recorded
**Then** the call log entry is saved with: supplier, outcome, timestamp
**And** if "Ordered", the supplier's last order date is updated

**Given** a supplier's last order was more than a configurable number of days ago
**When** the feed renders
**Then** a supplier reminder card appears on the Action Feed: "Call [Supplier] today (last order: X days ago)"
**And** the card uses blue `--color-info` border

**Given** a supplier reminder is on the feed
**When** the manager taps the card
**Then** they are navigated to the supplier's contact with tap-to-call ready

**Given** the manager calls the supplier and logs "Ordered"
**When** the feed refreshes
**Then** the reminder card is resolved

**Implementation Notes:**
- Creates: SupplierCallLog table with supplierId, outcome (enum: ORDERED/NO_ANSWER/CALL_BACK), timestamp
- Feed composer's supplier domain exports `getSupplierReminderCards()`
- Reminder threshold configurable per supplier (default: 7 days)

### Story 4.3: Recipe Management with Step-by-Step Guide & Cost

As a **cafe manager**,
I want to create recipes with step-by-step preparation instructions and see the cost per serving,
So that staff follow consistent preparation and I understand my true cost per menu item.

**Acceptance Criteria:**

**Given** an authenticated manager on the Operations screen (Recipes tab)
**When** they create a new recipe
**Then** they can enter: recipe name, serving size, and a description

**Given** a manager building a recipe
**When** they add ingredients
**Then** they select from the cafe's ingredient list with quantity per serving for each
**And** each ingredient shows its current inventory status (in stock / low / out)

**Given** a manager building a recipe
**When** they add preparation steps
**Then** they can add numbered step-by-step instructions in order
**And** steps can be reordered, edited, and deleted

**Given** a recipe has ingredients with cost-per-unit configured
**When** the recipe is viewed
**Then** the system calculates and displays cost per serving: sum of (ingredient quantity x cost per unit) for all ingredients
**And** the cost is displayed in dollars using `formatCents()`

**Given** an ingredient's cost per unit is updated (FR74)
**When** a recipe containing that ingredient is viewed afterward
**Then** the cost per serving reflects the updated ingredient cost (calculated live, not cached)

**Given** a recipe's ingredient is currently below its low-stock threshold
**When** the recipe is viewed
**Then** the ingredient shows a visual indicator (amber) that stock is low

**Given** a manager editing an existing recipe
**When** they modify ingredients, steps, or details
**Then** changes are saved with confirmation

**Given** a manager deleting a recipe
**When** they confirm deletion
**Then** the recipe is removed

**Implementation Notes:**
- Creates: Recipe table with name, description, servingSize, cafeId
- Creates: RecipeIngredient table with recipeId, ingredientId, quantityPerServing
- Creates: RecipeStep table with recipeId, stepNumber, instruction
- Cost per serving calculated live: SUM(recipeIngredient.quantity * ingredient.costInCents)
- Inventory status joined from latest InventoryCount per ingredient
- Steps stored with stepNumber for ordering
