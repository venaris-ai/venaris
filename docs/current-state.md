# Venaris – Current State

Last updated: 2026-03-26 (Orga/Product Expansion + Subscription Flow + Central Role Access Hardening)

This document describes the current implementation state of Venaris.
It is the operational truth source for ongoing product, UI, architecture, and MVP work.

It is not a roadmap.
It is the best current description of what already exists, what is partially implemented, and what has been structurally decided.

---

## 1. Product State Summary

Venaris is currently a protected multi-tenant SaaS foundation for wildlife intelligence with a materially expanded product surface.

The product already contains:
- authenticated product access
- organization-based access model
- role-aware memberships
- active organization context
- revier-aware wildlife analysis
- camera-centric operations
- early wildlife intelligence views
- persisted population estimates
- nightly population refresh for active reviers
- a unified app shell with main navigation, section navigation, and active context display
- a real Orga area with account, reviers, members, invites, and subscription
- self-sign-up with first-organization creation
- manual subscription request / approval flow for the MVP
- central page-level role access control with an explicit access-denied page

The system is no longer only a camera ingest prototype.
It is now structurally a first SaaS application with:
- login and public auth flows
- tenant-scoped product areas
- organization-bound billing state
- membership and role enforcement
- revier-aware wildlife intelligence
- operational camera provisioning and ingest monitoring

---

## 2. Core Functional Product Areas

### 2.1 Wildlife
The Wildlife area exists as a structured product section with these pages:

- `/wildlife`
- `/wildlife/species`
- `/wildlife/wherewhen`
- `/wildlife/activity`
- `/wildlife/popsim`

The Wildlife section sits under the central section navigation in the app shell.

Current functional split:

- **Overview**  
  dashboard-style aggregation of recent wildlife signals, species, activity, and PopSim teaser

- **Species**  
  species frequency, event counts, observed animal counts, leading cameras, average relevance

- **Where & When**  
  species-specific probability hints by camera and time window

- **Activity**  
  hourly wildlife activity and camera-level activity view

- **PopSim**  
  model-based population estimate view based on persisted population snapshots

Wildlife pages other than PopSim support the global revier scope including `revier=all`. PopSim intentionally requires a single revier and shows an explicit information state when `all` is selected.

### 2.2 Cameras
The Cameras area currently contains:

- `/cameras`
- `/cameras/new`
- `/cameras/health`
- `/cameras/events`
- `/cameras/events/[id]`
- `/cameras/import`
- `/cameras/ingest`

The Cameras cluster is currently the most operational product area and serves as reference quality for further UI work.

The Cameras area is structurally aligned with MVP thinking:
- overview / entry page
- new camera creation
- health visibility
- event access
- ingest / import operations

`/cameras/events/[id]` is intentionally not treated as a separate section-nav item and lives under `Events`.

### 2.3 Orga
The Orga area is now a real operational product area and no longer just conceptual.

Current pages:
- `/orga`
- `/orga/account`
- `/orga/reviere`
- `/orga/reviere/new`
- `/orga/reviere/[id]/edit`
- `/orga/members`
- `/orga/members/invite`
- `/orga/subscription`

Current functional split:

- **Overview**  
  Orga dashboard with tenant and commercial summary

- **Mein Konto / Account**  
  editable organization master data

- **Reviere**  
  list, create, edit, and status management for reviers

- **Members**  
  membership visibility, invite visibility, resend / revoke invite actions, and ongoing member-management work

- **Subscription**  
  current plan, limits, plan choices, and manual change-request entry point

### 2.4 Home
`/` is now a real product home page and central aggregation layer across Wildlife, Cameras, and Orga / Subscription.

Home is no longer just a placeholder or a pure navigation page.
It reflects current product state and is filtered by role-based visibility.

---

## 3. Authentication, Public Flows, Membership, and Multi-Tenant State

### 3.1 Authentication
Venaris uses protected product access via email / password login.

Authentication foundation:
- email / password login
- server-side user resolution
- protected app routes
- public auth pages outside the product shell where appropriate

Current public / auth-related pages:
- `/login`
- `/register`
- `/invite/accept`
- `/reset-password`

Password-reset is productively implemented:
- login page links to password reset
- `/reset-password` renders without the normal app shell
- password can be reset directly
- the redirect / login continuation flow is consistent

### 3.2 Self-Sign-up
New users can now self-register and directly create their first organization.

Current behavior:
- `/register` is public
- authenticated registration flow creates the first `organization`
- an owner membership is created automatically
- the active organization is set immediately after registration
- a default Starter trial is created automatically for the new organization

### 3.3 Membership Model
The membership and role model is active and product-relevant.

Current roles:
- `owner`
- `admin`
- `member`
- `viewer`

The active organization is resolved server-side and is the source of truth for tenant scoping.

### 3.4 Organization Context
The app has an active organization concept.
All protected product data is interpreted relative to the active organization.

Existing architectural rule:
- tenant = organization
- user access is mediated via membership
- active organization context is server-side truth

This remains the only tenant structure.
No second tenant mechanism has been introduced.

### 3.5 Invite Model and Onboarding
A dedicated invite model is now active.

Current domain truth:
- `organization_invites` = truth for open invites and invite lifecycle
- `organization_members` = truth for real memberships

Implemented invite flow:
- invite is created inside active organization
- mail is sent via Resend
- user opens invite link
- password is set
- invite is accepted
- membership is created
- invite is marked accepted

Invite operations currently available:
- create invite
- resend invite
- revoke invite

Confirm email is intentionally disabled in the invite onboarding flow so that the process remains one-step and operational for MVP.

---

## 4. Role Access and Authorization State

### 4.1 Central Access Model
Page-level access is now centrally defined and enforced.

A dedicated route access layer exists and is used to decide:
- whether a route is public
- which roles may access it
- whether a route is restricted to specific emails
- which main-nav and section-nav items should be rendered for the current user

This central layer now drives:
- page access
- main navigation visibility
- section navigation visibility
- access-denied routing

### 4.2 Access-Denied UX
Forbidden page access no longer falls back to an implicit not-found behavior.

Current behavior:
- denied page access redirects to `/access-denied`
- APIs keep returning explicit 403-style JSON responses where appropriate

This makes denied page access visible and understandable for users.

### 4.3 Current Page-Level Role Intent
Current effective role split is:

- **owner**  
  full product access except Venaris-internal admin-only routes

- **admin**  
  broad operational access, but not owner-only or Venaris-internal functions

- **member**  
  operational access mainly in Wildlife and Cameras, but no organization-sensitive management areas

- **viewer**  
  highly restricted visibility and explicitly blocked from Camera- and Orga-sensitive areas

### 4.4 Venaris Internal Admin
`dev@venaris.io` is currently the Venaris-internal admin identity for manual subscription approval / rejection.

This applies to:
- `/admin/subscriptions`
- approve / reject subscription routes

This is a deliberate MVP exception and not part of the regular customer role model.

### 4.5 API Hardening State
Relevant product APIs have been reviewed and role-hardening has been applied.

Key outcome:
- viewer is no longer implicitly allowed through Camera APIs where the product matrix says no
- camera / asset / ingest routes are limited to `owner | admin | member` where appropriate
- token / provisioning routes remain `owner | admin`
- Venaris-internal subscription admin routes remain restricted to `dev@venaris.io`

This means page access and API access are now much more aligned than before.

---

## 5. Revier Model and Scope Logic

### 5.1 Revier Role in the Product
Revier is now a first-class operational scope inside the organization context.

It is no longer just a data field in the database.
It is part of the UI and query architecture.

### 5.2 Current Revier Table
`public.reviers` currently contains at least:
- `id`
- `name`
- `area_ha`
- `region`
- `created_at`
- `country`
- `boundary_geojson`
- `notes`
- `organization_id`
- `status`

### 5.3 Revier Status
A status marker exists on `public.reviers`.

Current allowed values:
- `active`
- `paused`
- `archived`

Intent:
- only `active` reviers participate in active operational flows where that matters
- `paused` and `archived` remain in the system but are operationally excluded where appropriate

### 5.4 Operational Revier Management
Reviere are now productively manageable in the Orga area.

Implemented:
- list
- create
- edit
- status changes
- `area_ha` enforced operationally as required input because PopSim depends on it

### 5.5 Global Revier Scope
The app supports a global revier scope in the shell.

Contract:
- `revier=all`
- `revier=<uuid>`

The value is transparent and bookmarkable, but remains untrusted input.
Every page using it must validate it against active reviers of the active organization.

A shared helper exists in:
- `src/lib/intelligence/revierScope.ts`

Logical outcome:
- missing `revier` → treated as `all`
- invalid `revier` → fallback to `all`
- valid UUID within allowed reviers → single-revier scope

### 5.6 Header / Context Behavior
The global revier dropdown in the shell now:
- lists only active reviers
- supports `all`
- writes back to the current URL
- preserves local page parameters such as `period`
- triggers server re-render

Revier status now correctly influences what appears in that dropdown.

---

## 6. App Shell, Navigation, and Context UX

### 6.1 Main Navigation
Main navigation is centralized.

Current top-level items:
- Home
- Wildlife
- Cameras
- Orga

Navigation visibility is now filtered by the central access model.

Logout has been separated from main navigation into its own component.

### 6.2 Section Navigation
A central section navigation exists and is rendered from the layout.
It is pathname-sensitive and role-filtered.

Current section-nav behavior:

#### Wildlife
- Overview
- Species
- Where & When
- Activity
- PopSim

#### Cameras
- Overview
- New
- Health
- Events
- Import
- Ingest

#### Orga
- Overview
- Account
- Reviere
- Members
- Subscription

### 6.3 Context Bar
A global `ContextBar` exists in the layout.

Current displayed context:
- active organization
- active role
- revier selector

Header refinements completed:
- logged-in email shown next to Venaris
- label shortened from `Organization:` to `Orga:` to reduce line pressure

### 6.4 Public / Blocked Shell States
Public auth routes use a stripped-down shell behavior instead of the normal product shell.

Additionally, blocked subscription states are now handled centrally in the app shell.

This means the shell itself can decide whether the user should see:
- normal product content
- a blocked / reactivation state
- public auth pages without the normal app chrome

---

## 7. Subscription and Billing State

### 7.1 Subscription Domain
`organization_subscriptions` is now the central subscription table.

The billing domain for MVP is defined as:
- paying unit = `organization`
- plans = `starter | pro | enterprise`
- statuses = `trialing | active | past_due | canceled | expired`
- billing providers = `none | manual | stripe`

### 7.2 Default Subscription Creation
New organizations now automatically receive a default subscription.

Current default:
- Starter
- trialing
- 30-day trial

A backfill for existing organizations has been executed.
A separate repair also fixed historical trial rows missing `trial_ends_at`.

### 7.3 Subscription Policy Layer
A centralized policy layer exists in `subscriptionPolicy.ts`.

It governs at least:
- trial expiry logic
- effective status resolution
- `canCreateCamera`
- `canInviteMember`

This policy is now product-relevant and server-side enforced.

### 7.4 Usage / Limit Enforcement
Current usage logic:
- camera creation is blocked when `max_cameras` is reached
- member expansion is blocked when `max_members` is reached
- member usage counts active members plus open invites

This enforcement is active both in UI and server logic for the relevant flows.

### 7.5 Subscription UI State
The subscription page is no longer a placeholder.

It now shows:
- current plan
- current status
- billing cycle
- prices incl. VAT
- usage against plan limits
- direct plan selection / change-request entry points

Manual billing is now productively usable for MVP.
The UI is prepared for manual and later stripe-based provider handling.

### 7.6 Request / Approval Flow
A manual subscription change-request flow is operational.

Implemented:
- user can select a plan in the app
- request is created in `organization_subscription_change_requests`
- only one open request per organization is allowed at a time
- internal admin page exists for request processing
- approve route exists
- reject route exists
- approve flow has been tested end-to-end

Current tested outcome:
- request → approved
- subscription → active
- billing provider → manual

### 7.7 Blocked Subscription State
Expired or otherwise blocked subscription states are now handled centrally by the app shell.

Current behavior:
- blocked users do not simply see a hint on home
- instead they see a central blocked / reactivation state
- reactivation UX points directly to plan choice
- logout remains available and consistent in blocked state

### 7.8 Current Commercial Reality
Billing is operational for MVP, but still manual.

Known current limitations:
- Stripe / automated payment is not yet implemented
- `current_period_end` is not yet always meaningfully maintained in the manual approval flow
- Enterprise is intentionally a manual path and is expected to remain special-cased even after Starter / Pro automation

---

## 8. Organization, Account, Members, and Invite State

### 8.1 Organization Account
`/orga/account` is no longer a placeholder.
It reads and writes real organization data.

### 8.2 Members Area
`/orga/members` is now tenant-sharp and operational.

Implemented visibility:
- existing memberships
- email from auth.users
- last login
- invite list

Current invite actions on the page:
- resend
- revoke

### 8.3 Member Management
Member management has been extended beyond read-only visibility.

Implemented / in-progress behavior in current work:
- existing members can be seen in a management table
- role changes are supported with owner/admin safeguards
- member removal is supported with owner/admin safeguards
- self-mutation is blocked
- the last active owner is protected
- admins cannot mutate or remove owners

This area has seen active UX iteration and may still require final polish, but the functional membership-management logic is now materially present.

### 8.4 Invite Creation Rights
Membership rights now visibly affect the UI:
- member cannot see the invite button
- direct access to `/orga/members/invite` without permission shows access denied

This means membership rights are enforced both server-side and visibly in the product.

---

## 9. Wildlife Query Scope State

The Wildlife area now differentiates correctly between:
- **global scope** = active organization + revier URL scope
- **local page filters** = e.g. `period`, `species`

### 9.1 Species
`/wildlife/species` now:
- resolves active organization
- resolves active reviers
- validates `searchParams.revier`
- filters cameras by `cameras.revier_id`
- filters event queries indirectly through camera scope
- preserves `period` as local page filter

### 9.2 Where & When
`/wildlife/wherewhen` now:
- uses the same revier scope pattern as `species`
- preserves local `period`
- preserves local `species`
- filters cameras and therefore wildlife event data by revier scope

### 9.3 Activity
`/wildlife/activity` now:
- uses the same revier scope pattern
- preserves local `period`
- filters activity data by camera scope based on revier

### 9.4 Wildlife Overview
`/wildlife` reacts to the active global revier scope.
It no longer ignores the header revier selection.

### 9.5 PopSim
PopSim remains intentionally different:
- overview / species / wherewhen / activity support `all`
- PopSim requires a single revier

Reason:
PopSim is a model-based revier snapshot, not a simple cross-revier event aggregate.

---

## 10. Population Modelling State

### 10.1 Population Layer Status
The population-modelling layer is no longer just conceptual.
It has:
- formal modelling framework
- persisted results table
- revier-level refresh orchestration
- nightly scheduled refresh

### 10.2 Persisted Table
Current output table:
- `public.population_estimates`

This is the persisted source used by PopSim and future wildlife population views.

### 10.3 Population Functions
Confirmed functions include at least:
- `compute_population_diurnal_surface_activity`
- `compute_population_for_revier`
- `compute_population_group_density`
- `compute_population_occupancy_presence`
- `compute_population_seasonal_migration_presence`
- `compute_population_territorial_density`
- `compute_population_wolf`
- `refresh_population_estimate_roe_deer`
- `refresh_population_estimates_for_revier`

### 10.4 Master Refresh Function
`public.refresh_population_estimates_for_revier(p_revier_id uuid)` is the orchestration function that iterates over the configured species/model mapping and dispatches to the chosen model family.

### 10.5 Wrapper Function
A wrapper exists for all active reviers:
- `public.refresh_population_estimates_for_all_active_reviers()`

It:
- iterates active reviers
- calls the per-revier refresh
- isolates per-revier errors
- returns processed / success / error counters

### 10.6 Current Operational Job State
Current verified manual result from the earlier setup:
- processed: 1
- success: 1
- error: 0

This matched the current status setup with only one active seeded revier.

---

## 11. Nightly Population Refresh

### 11.1 Architectural Decision
Nightly population refresh is implemented via:
- Supabase Cron / pg_cron

This was chosen over Vercel cron or Hetzner cron because the modelling logic already lives in SQL.

### 11.2 Implemented Pieces
Completed:
- `pg_cron` enabled
- `reviers.status` introduced
- wrapper function for active reviers created
- cron job scheduled

### 11.3 Current Operational Principle
Only active reviers are refreshed.
This prevents wasteful long-term computation over non-operative reviers.

---

## 12. Camera Provisioning, Ingest, and Monitoring State

### 12.1 Camera Creation
Camera creation is now plan-aware and subscription-limited.

Implemented:
- camera provisioning page
- plan-limit enforcement via subscription policy
- manual / smtp / ftp routing support
- technical provisioning result handling

### 12.2 Ingest Monitoring
Ingest monitoring exists as a product page and a scoped API.
It is now role-hardened in line with the Cameras area.

### 12.3 Camera Health
Camera health exists both as page and API and is role-restricted to camera-allowed roles.

### 12.4 Assets / Signed URLs / Relevance
Asset listing, signed URLs, and relevance toggling are organization-scoped and have been brought into closer alignment with the intended role model.

---

## 13. Known Current Risks and Incompletenesses

Current relevant risks / incomplete areas:
- Stripe / automated billing is still missing
- manual billing is operational but not the final commercial architecture
- `current_period_end` is not yet consistently meaningful in the manual approval flow
- Enterprise remains intentionally manual
- membership-management UX still needs polish even though the core logic is materially present
- parts of the role system may still need continued review when new routes/pages are introduced

---

## 14. Current Working Architectural Truths

The following truths should be treated as current working rules:

- tenant = organization
- organization is the paying unit
- membership mediates all customer-user access
- active organization is resolved server-side and remains the tenant truth
- revier is a functional operational scope inside the active organization
- open invites count against member usage
- new organizations auto-receive a default Starter trial
- blocked subscription states are handled centrally by the app shell
- `dev@venaris.io` is the Venaris-internal admin for manual subscription approval/rejection
- page-level route access is centrally defined and rendered into navigation visibility
- denied page access redirects to `/access-denied`

---

## 15. Immediate Next Logical Focus

From the current implementation state, the next major logical focus areas are:
- finish Stripe / automated billing for Starter and Pro
- leave Enterprise on a manual internal process
- continue product polish on membership management UX
- continue to keep role access centralized as new pages / APIs are added

