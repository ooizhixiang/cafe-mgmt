# Story 1.4: Quick-Start Cafe Template Selection

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **cafe manager**,
I want to select a cafe-type template during initial setup so the app is pre-populated with relevant data,
so that setup takes minutes instead of hours.

## Acceptance Criteria (BDD)

### AC1: Template Selection Routing
**Given** a newly registered manager with no template selected
**When** they complete registration and are authenticated
**Then** they are immediately routed to the template selection screen (no intermediate blank/empty feed state)
**And** they can select from three templates: Specialty Coffee, Traditional Cafe, Tea & Light Bites

### AC2: Template Data Population
**Given** the manager selects a template
**When** the selection is confirmed
**Then** the system populates: ingredients with names and units, three daily checklists (Opening/Mid-Day/Closing) with sensible default items, and supplier placeholders
**And** the data is created via idempotent upsert operations
**And** each checklist is assigned to the correct period using the configured or default time boundaries from Story 1.3

### AC3: Ingredient Review & Customization
**Given** template data is populated
**When** the manager reviews the populated ingredients
**Then** they can: edit ingredient names, delete unwanted ingredients, add new ingredients (name and unit only), and reorder the list
**And** advanced ingredient features (cost-per-unit, snap increments, container profiles, categories, pinning, thresholds) are deferred to Story 3.1

### AC4: Editable Populated Data
**Given** template data is populated
**When** the manager reviews the populated data
**Then** all ingredients, checklists, and suppliers are editable and deletable
**And** the manager can customize the template to match their cafe

### AC5: Idempotent Operations
**Given** the template selection action is called
**When** a template has already been applied
**Then** the operation does not create duplicate records (uses upsert)
**And** returns an appropriate error or no-op response

### AC6: Server Action Authorization
**Given** any Server Action in this story (selectTemplate, ingredient CRUD, etc.)
**When** called by any user
**Then** the action internally validates `requireRole('MANAGER')` or `requireAuth()` as appropriate
**And** returns `{ success: false, error: "Unauthorized" }` if the caller lacks permission

## Tasks / Subtasks

- [ ] **Task 1: Database Schema — New Models** (AC: #2, #3, #4)
  - [ ] Add `templateSelected` field to Cafe model (String?, null = not selected, stores template key like "specialty-coffee")
  - [ ] Create `Ingredient` model: id, name (String), unit (String), cafeId, displayOrder (Int), costPerUnitInCents (Int?), snapIncrement (Int?), containerProfile (String?), category (String?), isPinned (Boolean @default(false)), lowStockThreshold (Int?), createdAt, updatedAt. Relation to Cafe. @@index([cafeId])
  - [ ] Create `ChecklistTemplate` model: id, name (String), period (Period enum: OPENING, MID_DAY, CLOSING), cafeId, createdAt, updatedAt. Relation to Cafe. @@index([cafeId])
  - [ ] Create `ChecklistTemplateItem` model: id, text (String), displayOrder (Int), notes (String?), role (Role?), checklistTemplateId. Relation to ChecklistTemplate. @@index([checklistTemplateId])
  - [ ] Create `Supplier` model: id, name (String), phone (String?), notes (String?), cafeId, displayOrder (Int), createdAt, updatedAt. Relation to Cafe. @@index([cafeId])
  - [ ] Create `Period` enum: OPENING, MID_DAY, CLOSING
  - [ ] Run `npx prisma migrate dev --name add-template-models`

- [ ] **Task 2: Template Seed Data** (AC: #2, #5)
  - [ ] Create `src/lib/template-data.ts` — defines all 3 templates as typed constants (NOT in prisma/seed.ts — this is runtime data used by the selectTemplate action):
    - **Specialty Coffee**: ~18 ingredients (espresso beans, whole milk, oat milk, vanilla syrup, hazelnut syrup, caramel sauce, chocolate powder, whipped cream, half & half, almond milk, matcha powder, chai concentrate, cold brew concentrate, sugar, cups/lids, pastry display items, cleaning supplies, to-go bags), 3 checklists (6-8 items each), 3 supplier placeholders
    - **Traditional Cafe**: ~18 ingredients (drip coffee beans, decaf beans, whole milk, cream, sugar, sweetener packets, tea bags assorted, lemonade, muffins, croissants, bagels, cream cheese, butter, soup base, sandwich bread, deli meats, lettuce/tomato, napkins/utensils), 3 checklists, 3 suppliers
    - **Tea & Light Bites**: ~18 ingredients (loose leaf black tea, green tea, herbal tea blend, honey, agave, oat milk, whole milk, scones, cookies, macarons, finger sandwiches, fruit cups, sparkling water, kombucha, matcha powder, chai spice blend, lavender syrup, to-go cups), 3 checklists, 3 suppliers
  - [ ] Each template has a key (e.g., "specialty-coffee", "traditional-cafe", "tea-light-bites")
  - [ ] Each ingredient has: name, unit (string like "bags", "gallons", "cases", "each")
  - [ ] Each checklist item has: text, optional notes, optional role (null = both roles)
  - [ ] Each supplier has: name placeholder (e.g., "Coffee Bean Supplier", "Dairy Supplier", "Bakery Supplier")
  - [ ] **CRITICAL**: Present seed data to user for review before continuing implementation

- [ ] **Task 3: Template Selection Server Action** (AC: #1, #2, #5, #6)
  - [ ] Create `src/actions/onboarding.actions.ts` with:
    - `selectTemplate(formData)` — requireRole('MANAGER'), validates template key, checks if template already selected (return error if so), creates all data in a `$transaction` (ingredients, checklists + items, suppliers), sets Cafe.templateSelected, returns ActionResult<void>
    - `getTemplateStatus()` — requireAuth(), returns `ActionResult<{ templateSelected: string | null }>` — used to determine routing
  - [ ] Inside $transaction: create ingredients with displayOrder, create 3 ChecklistTemplates with Period enum, create ChecklistTemplateItems for each template, create suppliers
  - [ ] All data creation uses cafe's cafeId from session

- [ ] **Task 4: Ingredient CRUD Server Actions** (AC: #3, #4, #6)
  - [ ] Create `src/actions/ingredient.actions.ts` with:
    - `getIngredients()` — requireAuth(), returns all ingredients for cafeId ordered by displayOrder
    - `addIngredient(formData)` — requireRole('MANAGER'), Zod validates name (non-empty, max 100 chars) + unit (non-empty, max 50 chars), auto-assigns displayOrder (max + 1), returns ActionResult<{ id: string }>
    - `updateIngredient(formData)` — requireRole('MANAGER'), validates ingredientId belongs to cafeId, updates name, returns ActionResult<void>
    - `deleteIngredient(formData)` — requireRole('MANAGER'), validates ingredientId belongs to cafeId, deletes, returns ActionResult<void>
    - `reorderIngredients(formData)` — requireRole('MANAGER'), accepts JSON array of {id, displayOrder}, validates all belong to cafeId, updates in $transaction, returns ActionResult<void>

- [ ] **Task 5: Template Selection Screen** (AC: #1)
  - [ ] Create `src/app/(app)/setup/page.tsx` — server component, checks auth, loads template status
  - [ ] Create `src/components/onboarding/template-selector.tsx` — client component:
    - Three cards (one per template) with cafe type name and brief description
    - Tap to select → confirmation state → "Set up my cafe" button
    - Loading/disabled state during submission
    - On success: router.push('/') to go to feed
    - On error: toast error message
  - [ ] Style: Cards with border, active selection highlighted with `--color-info`, 44px min touch targets
  - [ ] Single-column mobile layout

- [ ] **Task 6: Template Selection Routing (Middleware)** (AC: #1)
  - [ ] Update `middleware.ts` to check template selection status:
    - After auth check, for authenticated managers with no template selected, redirect to `/setup`
    - Allow `/setup` route for managers only
    - Staff should never see `/setup`
    - If template already selected, `/setup` redirects to `/`
  - [ ] **IMPORTANT**: Middleware runs in Edge Runtime. Cannot call Prisma directly. Options:
    - Option A (recommended): Store `templateSelected` in the JWT token (add to jwt/session callbacks in auth.ts). Check `token.templateSelected` in middleware.
    - Option B: Make `/setup` page do the check server-side and redirect if template exists
  - [ ] Add `/setup` to MANAGER_ONLY_PATHS in middleware

- [ ] **Task 7: Ingredient Management UI** (AC: #3, #4)
  - [ ] Create `src/app/(app)/setup/ingredients/page.tsx` — server component, loads ingredients
  - [ ] Create `src/components/onboarding/ingredient-list.tsx` — client component:
    - List of ingredients with name and unit displayed
    - Inline edit: tap ingredient name to edit (or edit button)
    - Delete button with confirmation dialog
    - "Add Ingredient" form at bottom (name + unit fields)
    - Reorder with up/down arrow buttons (keep bundle lean — no drag library for MVP)
  - [ ] After template selection, redirect to this page to review ingredients
  - [ ] "Continue" button at bottom to proceed to feed (router.push('/'))
  - [ ] Toast on successful add/edit/delete

- [ ] **Task 8: Tests** (AC: all)
  - [ ] Create `src/lib/template-data.test.ts`:
    - All 3 templates have valid structure (ingredients array, checklists array, suppliers array)
    - Each template has exactly 3 checklists (one per period)
    - Each checklist has 6-8 items
    - Each template has ~18 ingredients with name and unit
    - Each template has 3 suppliers
    - No duplicate ingredient names within a template
    - No duplicate checklist item text within a checklist
  - [ ] Create `src/actions/ingredient.actions.test.ts`:
    - Zod schema validation for ingredient name and unit
    - Name max length enforcement
    - Empty name/unit rejection

## Dev Notes

### Architecture Patterns (MUST FOLLOW)

**ActionResult<T> — The ONE Return Type:**
```typescript
type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }
```
Every Server Action returns this. No exceptions.
[Source: architecture.md — ActionResult pattern]

**Never accept cafeId from client** — always derive from `session.user.cafeId` on server side.
[Source: architecture.md — Security Hardening]

**Server Actions location** — Onboarding actions in `src/actions/onboarding.actions.ts`, ingredient actions in `src/actions/ingredient.actions.ts`.
[Source: architecture.md — File structure: `src/actions/*.actions.ts`]

**Database naming conventions:**
- Models: PascalCase, singular (`Ingredient`, `ChecklistTemplate`)
- Fields: camelCase (`displayOrder`, `costPerUnitInCents`)
- Enums: PascalCase name, SCREAMING_SNAKE values (`enum Period { OPENING MID_DAY CLOSING }`)
- Foreign keys: `{relation}Id` (`checklistTemplateId`, `cafeId`)
- IDs: `String @id @default(cuid())`
[Source: architecture.md — Database Naming]

**Money as integer cents:**
- `costPerUnitInCents` (Int?) — NOT used in this story but field must exist
- `formatCents(480)` → `"$4.80"` — utility in `src/lib/format.ts`
[Source: architecture.md — Money formatting]

### Prisma Schema — New Models

```prisma
enum Period {
  OPENING
  MID_DAY
  CLOSING
}

model Ingredient {
  id                  String   @id @default(cuid())
  name                String
  unit                String
  displayOrder        Int
  cafeId              String
  costPerUnitInCents  Int?
  snapIncrement       Int?
  containerProfile    String?
  category            String?
  isPinned            Boolean  @default(false)
  lowStockThreshold   Int?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  cafe Cafe @relation(fields: [cafeId], references: [id])

  @@index([cafeId])
}

model ChecklistTemplate {
  id        String   @id @default(cuid())
  name      String
  period    Period
  cafeId    String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  cafe  Cafe                    @relation(fields: [cafeId], references: [id])
  items ChecklistTemplateItem[]

  @@index([cafeId])
}

model ChecklistTemplateItem {
  id                   String  @id @default(cuid())
  text                 String
  displayOrder         Int
  notes                String?
  role                 Role?
  checklistTemplateId  String

  template ChecklistTemplate @relation(fields: [checklistTemplateId], references: [id], onDelete: Cascade)

  @@index([checklistTemplateId])
}

model Supplier {
  id           String   @id @default(cuid())
  name         String
  phone        String?
  notes        String?
  displayOrder Int
  cafeId       String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  cafe Cafe @relation(fields: [cafeId], references: [id])

  @@index([cafeId])
}
```

**Cafe model additions:**
```prisma
model Cafe {
  // ... existing fields ...
  templateSelected String?    // null = not selected, "specialty-coffee" | "traditional-cafe" | "tea-light-bites"

  // New relations
  ingredients        Ingredient[]
  checklistTemplates ChecklistTemplate[]
  suppliers          Supplier[]
}
```

### Template Selection Flow

```
Registration → Login → Middleware checks templateSelected
                          ↓ (null)
                    Redirect to /setup
                          ↓
                    Template selection (3 cards)
                          ↓ (selectTemplate action)
                    $transaction: create all data
                          ↓
                    Redirect to /setup/ingredients
                          ↓
                    Review/customize ingredients
                          ↓ ("Continue" button)
                    Redirect to / (Action Feed)
```

### Middleware Edge Runtime Strategy

The middleware runs in Edge Runtime and cannot use Prisma. To check `templateSelected`:

**Recommended approach**: Add `templateSelected` to the JWT token in `auth.ts`:
```typescript
// In jwt callback:
if (user) {
  token.templateSelected = user.templateSelected ?? null;
}

// In session callback (after DB check):
if (dbUser) {
  session.user.templateSelected = dbUser.templateSelected ?? null;
}
```

Then in middleware:
```typescript
// After existing auth checks:
if (req.auth?.user?.role === 'MANAGER' && !req.auth?.user?.templateSelected) {
  if (!req.nextUrl.pathname.startsWith('/setup')) {
    return NextResponse.redirect(new URL('/setup', req.nextUrl));
  }
}
```

**IMPORTANT**: Update `src/types/next-auth.d.ts` to add `templateSelected: string | null` to Session.user, User, and JWT interfaces.

### Reorder Strategy (Ingredients)

Use simple up/down arrow buttons instead of drag-and-drop library to keep bundle size under NFR6 (<200KB JS). Implementation:
- Each ingredient row has ↑ and ↓ buttons
- Clicking swaps displayOrder with adjacent item
- Calls `reorderIngredients` action with the new order array
- Optimistic UI update for responsiveness

### What This Story Does NOT Include

- Onboarding cards on the Action Feed (Story 1.5)
- Staff orientation (Story 1.6)
- Advanced ingredient features: cost-per-unit editing, snap increments, container profiles, categories, pinning, thresholds (Story 3.1)
- Checklist template editing UI (Story 2.2) — templates are created but editing is later
- Checklist completion workflow (Story 2.3)
- Supplier management beyond placeholders (Story 4.x)
- Supplier CRUD actions (Story 4.1)

### UX Patterns (MUST FOLLOW)

**Template selection screen:**
- Single-column, mobile-first layout
- Three template cards with clear labels and brief descriptions
- Active selection highlighted with `--color-info` blue border
- "Set up my cafe" primary button, full-width, 48px height
- Disabled + "Setting up..." state during submission
[Source: ux-design-specification.md — Journey 6, Form Patterns]

**Ingredient list:**
- List items with name and unit displayed
- 44x44px minimum touch targets for edit/delete/reorder buttons
- Add form: name + unit fields, labels above inputs, 16px gap
- Delete requires confirmation (ConfirmationDialog from Story 1.2)
- Toast on success for all operations
[Source: ux-design-specification.md — Form Patterns, Touch Targets]

### Project Structure Notes

Files created/modified in this story:
```
prisma/
└── schema.prisma                      ← MODIFY: Add Ingredient, ChecklistTemplate, ChecklistTemplateItem, Supplier, Period enum, Cafe.templateSelected

src/lib/
└── template-data.ts                   ← NEW: Template definitions for all 3 cafe types
└── template-data.test.ts              ← NEW: Template data validation tests

src/actions/
├── onboarding.actions.ts              ← NEW: selectTemplate(), getTemplateStatus()
└── ingredient.actions.ts              ← NEW: getIngredients(), addIngredient(), updateIngredient(), deleteIngredient(), reorderIngredients()
└── ingredient.actions.test.ts         ← NEW: Ingredient validation tests

src/components/onboarding/
├── template-selector.tsx              ← NEW: Template selection cards
└── ingredient-list.tsx                ← NEW: Ingredient list with CRUD

src/app/(app)/setup/
├── page.tsx                           ← NEW: Template selection page
└── ingredients/
    └── page.tsx                       ← NEW: Ingredient review page

src/types/next-auth.d.ts              ← MODIFY: Add templateSelected to Session/User/JWT
auth.ts                               ← MODIFY: Add templateSelected to jwt/session callbacks
middleware.ts                          ← MODIFY: Add template selection routing
```

### Previous Story Intelligence (Story 1.3)

**Established patterns to follow:**
- `auth.ts` at project root with JWT strategy, dynamic imports for Edge Runtime compat
- `src/lib/auth.ts` re-exports `auth()` + `requireRole()` + `requireAuth()`
- `middleware.ts` uses `auth()` wrapper with mustChangePassword check
- `src/actions/auth.actions.ts` has all auth/invite/staff actions
- `src/actions/settings.actions.ts` has settings/time boundary actions
- `src/components/ui/toast.tsx` — ToastProvider with `useToast()` hook
- `src/components/ui/confirmation-dialog.tsx` — Reusable dialog
- App layout wraps with `<ToastProvider>`

**Key technical decisions from Story 1.1/1.2/1.3:**
- Prisma v7: `prisma.config.ts` for config, `@prisma/adapter-pg` for adapter
- Prisma imports: `@/generated/prisma/client` (PrismaClient), `@/generated/prisma/enums` (Role, Period)
- Zod v4: use `.issues` not `.errors`
- Tailwind v4: CSS-based `@theme inline {}`, `@utility`, `@custom-variant` — NO tailwind.config.ts
- shadcn/ui v4: Button has no `asChild` — use `buttonVariants()` on Link
- Run migrations with direct connection (port 5432), app uses pooler (port 6543)
- Blue buttons: `bg-[var(--color-info)] text-white hover:bg-[var(--color-info)]/90`
- Time boundaries: DEFAULT_TIME_BOUNDARIES in `src/lib/format.ts` with getCafeNow() utility

### References

- [Source: epics.md — Story 1.4, lines 418-458]
- [Source: architecture.md — Data Architecture, File Structure, ActionResult, Seed Idempotency]
- [Source: prd.md — FR7, FR8, Journey 4 (Dana's Setup)]
- [Source: ux-design-specification.md — Journey 6 Onboarding, Form Patterns, Touch Targets]
- [Source: 1-3-unified-settings-checklist-time-boundaries.md — Previous Story Intelligence]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
