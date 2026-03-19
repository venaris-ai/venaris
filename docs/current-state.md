# Venaris – Current State

Last updated: 2026-03-19 (Nightly Population Refresh + Global Revier Scope + Wildlife UI Navigation Refactor)

This document describes the **current implementation state** of Venaris.
It is written as the operational truth source for ongoing product, UI, architecture, and MVP work.

It is not a roadmap.
It is the best current description of what already exists, what is partially implemented, and what has been structurally decided.

---

## 1. Product State Summary

Venaris is currently a protected multi-tenant SaaS foundation for wildlife intelligence.

The product already contains:
- authenticated product access
- organization-based access model
- wildlife event visibility
- camera-centric operations
- early wildlife intelligence views
- persisted population estimates
- a nightly refresh mechanism for population modelling
- a unified app shell with main navigation, section navigation, and active context display

The system is no longer only a camera ingest prototype.
It is now structurally a first SaaS application with:
- login
- active organization context
- organization-bound data access
- role-aware memberships
- revier-aware wildlife analysis

---

## 2. Core Functional Product Areas

### 2.1 Wildlife
The Wildlife area now exists as a structured product section with these pages:

- `/wildlife`
- `/wildlife/species`
- `/wildlife/wherewhen`
- `/wildlife/activity`
- `/wildlife/popsim`

The Wildlife section is no longer a single dashboard page with local ad hoc navigation.
It now sits under a central section navigation in the app shell.

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

---

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

The Cameras area is already structurally aligned with MVP thinking:
- overview / entry page
- new camera creation
- health visibility
- event access
- ingest/import operations

`/cameras/events/[id]` is intentionally not treated as a separate section-nav item.
It lives under `Events`.

---

### 2.3 Orga
The Orga area currently exists as:

- `/orga`

It is not yet expanded into multiple subpages, but the organization / membership / revier logic is now materially relevant to the full product architecture and no longer only conceptual.

---

## 3. Authentication, Membership, and Multi-Tenant State

### 3.1 Authentication
Venaris uses protected product access via login.

Authentication foundation:
- email/password login
- protected app routes
- server-side user resolution

### 3.2 Membership Model
The MVP membership and role model is active and relevant.

Current roles:
- `owner`
- `admin`
- `member`
- `viewer`

The active organization is resolved server-side and is the source of truth for tenant scoping.

### 3.3 Organization Context
The system already has an active organization concept.
All protected product data should be interpreted relative to the active organization.

Existing architectural rule:
- tenant = organization
- user access is mediated via membership
- active organization context is server-side truth

This existing multi-tenant foundation remains the only tenant structure.
No second tenant mechanism has been introduced.

---

## 4. Revier Model and Scope Logic

### 4.1 Revier Role in the Product
Revier is now a first-class functional scope inside the organization context.

It is no longer only a data field in the database.
It is now part of the UI and query architecture.

### 4.2 Current Revier Table
`public.reviers` currently contains:
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

### 4.3 Revier Status
A status marker has been introduced on `public.reviers`.

Current allowed values:
- `active`
- `paused`
- `archived`

This was added specifically to avoid long-term wasteful processing across non-operative reviers.

Current intent:
- only `active` reviers participate in population refresh jobs
- `paused` and `archived` remain in the system but are operationally excluded where appropriate

### 4.4 Current Real Revier Status Example
Current known working setup:
- `Seed Revier Intelligence` → `active`
- `Testrevier` → `paused`
- `Heubachwiesen` → `paused`

This means the nightly population refresh currently runs only on the meaningful seeded revier.

---

## 5. App Shell, Navigation, and Context UX

### 5.1 Main Navigation
Main navigation is centralized in `MainNav`.

Current top-level items:
- Home
- Wildlife
- Cameras
- Orga

Logout has been removed from `MainNav` and separated into its own component.

### 5.2 Section Navigation
A central `SectionNav` has been introduced and is rendered from the layout.

It is context-sensitive based on pathname.

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

This removed the need for duplicated local subnavigation blocks on the Wildlife pages.

### 5.3 Context Bar
A global `ContextBar` has been introduced in the layout.

Current displayed context:
- active organization
- active role
- revier selector

This is the top-level context layer for the app shell.

### 5.4 Revier Selector
The revier selector is now part of the global context bar.

It:
- lists only active reviers of the active organization
- supports `all`
- writes `?revier=...` into the current URL
- preserves existing page parameters such as `period`
- triggers server re-render of the current page

This means the UI-level global revier scope now exists and is active.

---

## 6. Scope Resolution Contract

### 6.1 Global Context Rules
The app now follows this conceptual hierarchy after login:

1. authenticated user
2. active organization
3. membership / role
4. revier scope

### 6.2 Revier URL Contract
Revier scope is expressed in the URL via:

- `revier=all`
- `revier=<uuid>`

This is intentionally transparent and bookmarkable.

### 6.3 Validation Rule
The URL remains untrusted input.
Therefore every page that uses revier scope must validate the incoming value against the set of active reviers of the active organization.

### 6.4 Shared Revier Scope Helper
A shared helper now exists in:

- `src/lib/intelligence/revierScope.ts`

It provides the shared scope resolution logic and avoids page-by-page reinvention.

Current logical outcome:
- missing `revier` → treated as `all`
- invalid `revier` → fallback to `all`
- valid UUID within allowed reviers → single revier scope

---

## 7. Wildlife Query Scope State

The Wildlife area now differentiates correctly between:
- **global scope** = active organization + revier URL scope
- **local page filters** = e.g. `period`, `species`

This separation was not present before and is now a major architectural improvement.

### 7.1 Species
`/wildlife/species` now:
- resolves active organization
- resolves active reviers
- validates `searchParams.revier`
- filters cameras by `cameras.revier_id`
- filters event queries indirectly through camera scope
- preserves `period` as local page filter

Result:
- `species` now responds to global revier selection

### 7.2 Where & When
`/wildlife/wherewhen` now:
- uses the same revier scope pattern as `species`
- preserves local `period`
- preserves local `species`
- filters cameras and therefore wildlife event data by revier scope

Result:
- `wherewhen` now responds to global revier selection

### 7.3 Activity
`/wildlife/activity` now:
- uses the same revier scope pattern
- preserves local `period`
- filters activity data by camera scope based on revier

Result:
- `activity` now responds to global revier selection

### 7.4 Wildlife Overview
`/wildlife` has also been lifted to the global revier scope.
It no longer ignores the header revier selection.

Result:
- the overview dashboard now reacts to the active revier scope as well

### 7.5 PopSim
PopSim is intentionally **not** treated the same way as the event-based Wildlife pages.

Current product decision:
- `species`, `wherewhen`, `activity`, and `overview` support `all`
- `popsim` requires a **single revier**

Reason:
PopSim is a model-based revier snapshot, not a simple aggregate event view.

Current behavior:
- valid single revier → PopSim snapshot loads
- `revier=all` → PopSim shows an explicit information state instead of silently choosing a revier
- invalid revier → resolves via shared scope logic and effectively behaves as `all`, therefore shows the single-revier-required message

This is intentional to avoid false precision and misleading cross-revier aggregation.

---

## 8. Population Modelling State

### 8.1 Population Layer Status
The population modelling layer is no longer just conceptual.
It now has:
- formal modelling framework
- persisted results table
- revier-level refresh orchestration
- nightly scheduled refresh

### 8.2 Persisted Table
Current output table:
- `public.population_estimates`

This is the persisted source used by PopSim and future wildlife population views.

### 8.3 Population Functions
Confirmed public functions include:
- `compute_population_diurnal_surface_activity`
- `compute_population_for_revier`
- `compute_population_group_density`
- `compute_population_occupancy_presence`
- `compute_population_seasonal_migration_presence`
- `compute_population_territorial_density`
- `compute_population_wolf`
- `refresh_population_estimate_roe_deer`
- `refresh_population_estimates_for_revier`

### 8.4 Master Refresh Function
`public.refresh_population_estimates_for_revier(p_revier_id uuid)` is the current orchestration function that iterates over `species_population_model_mapping` and dispatches to the configured model family.

### 8.5 Wrapper Function
A wrapper function now exists to refresh all active reviers:

- `public.refresh_population_estimates_for_all_active_reviers()`

This function:
- iterates active reviers
- calls `refresh_population_estimates_for_revier(...)`
- isolates per-revier errors
- returns processed/success/error counters

### 8.6 Current Operational Job State
Current verified manual result:
- processed: 1
- success: 1
- error: 0

This matches the current revier status setup with only one active revier.

---

## 9. Nightly Population Refresh

### 9.1 Architectural Decision
The nightly population refresh is now implemented via:

- **Supabase Cron / pg_cron**

This was chosen over:
- Vercel cron + API route
- Hetzner cron script

Reasoning:
- the actual modelling logic already lives in SQL
- direct DB-level scheduling is simpler and cleaner for MVP
- less orchestration overhead
- native run history exists via cron tables

### 9.2 Implemented Pieces
Completed:
- `pg_cron` enabled
- `reviers.status` introduced
- wrapper function for active reviers created
- cron job scheduled

### 9.3 Current Cron Job
Current job:
- `nightly-population-refresh-active-reviers`
- schedule: `10 2 * * *`
- command: `select public.refresh_population_estimates_for_all_active_reviers();`

This means:
- daily population refresh
- 02:10
- only active reviers

### 9.4 Monitoring State
`cron.job` confirms the job is active.
`cron.job_run_details` had no rows immediately after creation, which was expected prior to the first scheduled execution.

### 9.5 MVP Interpretation
For MVP, this is considered a good stable solution:
- simple
- DB-native
- aligned with the data model
- easy to evolve later toward richer cadence logic

---

## 10. PopSim Product Naming State

The page/module is now named:

- **PopSim**

This replaced the earlier placeholder concept `wilddruck`.

Reason:
- `wilddruck` was considered too narrow, ambiguous, and too domain-loaded as a page title
- PopSim better communicates a model-based estimate rather than objective truth
- the name is intentionally product-like and softer than a hard scientific claim

Current product meaning:
- qualified population approximation
- model-based, not census-based
- management-support signal, not absolute truth

---

## 11. Camera / Revier Data Relationship

Current database evidence:
- `cameras.revier_id` exists
- `cameras.revier_id` is `NOT NULL`

This means camera-to-revier assignment is currently mandatory in the schema.

That fact was critical for the revier-scope refactor of the Wildlife pages.

---

## 12. Current Known Data Reality

The current system does not yet contain rich, production-grade data everywhere.

Known state:
- `Seed Revier Intelligence` has the strongest meaningful seeded data
- `Heubachwiesen` is effectively empty
- `Testrevier` only contains limited/random test animals
- some species such as `mouflon` currently produce no rows due to insufficient seeded basis

This means:
- the UI architecture can be validated
- the nightly job can be validated
- but not every model output is yet semantically rich

That is acceptable at current MVP stage.

---

## 13. UI / UX State After Today

### 13.1 Solved
Today’s work materially improved:
- app shell consistency
- navigation hierarchy
- organization/revier awareness
- wildlife page consistency
- removal of duplicated local subnav
- global scope handling

### 13.2 Current UX Structure
The shell now has:
- top-level navigation
- section navigation
- context bar
- global revier selection
- page-local filters kept within pages

This is the correct structural direction for the product.

### 13.3 Remaining UX Imperfections
Some visual spacing/alignment in the header is not perfect yet, but currently acceptable.
The structure is now functionally correct and can be polished later without reopening the architecture.

---

## 14. Known Open Topics

### 14.1 Context Persistence
Current revier scope is URL-based and not yet stored as user preference.
This is acceptable for MVP.

### 14.2 Orga Section Expansion
The Orga area is not yet expanded into the same level of structured subpages as Wildlife/Cameras.

### 14.3 Camera and Orga Scope Consistency
The Wildlife area is now materially refactored toward consistent organization/revier scoping.
Other product areas may still need the same systematic scope alignment.

### 14.4 PopSim and All-Reviers Mode
Deliberately not implemented.
Current product stance:
- no fake organization-wide PopSim aggregation without explicit modelling definition

### 14.5 Richer Population Refresh Cadence
Future options may include:
- weekly refresh
- batched refresh windows
- `next_population_refresh_at`
- `last_population_refresh_at`
- frequency controls per revier

Not needed for the MVP yet.

---

## 15. Current Architectural Position

Venaris is currently best described as:

- a protected multi-tenant wildlife intelligence application
- with camera ingest and event visibility already established
- with a materially improving wildlife analytics UI
- with revier-aware scope now introduced into the shell and key wildlife pages
- with a first real persisted population modelling layer
- with nightly automated refresh of population estimates
- with a clearer separation between:
  - tenant context
  - revier scope
  - section navigation
  - page-local filters

This is a major step from prototype toward MVP product structure.

---

## 16. Practical Source-of-Truth Summary

### Stable enough to build on
- authentication and active organization context
- membership roles
- cameras cluster
- wildlife section structure
- central shell navigation
- global revier selector
- nightly population refresh
- persisted population estimates
- PopSim single-revier principle

### Still evolving
- orga section depth
- some shell/header polish
- broader cross-product revier consistency
- richer seeded data quality
- later user preference persistence
- later population scheduling sophistication

---

## 17. Immediate Next-Step Candidates

Most likely sensible next work packages are:

1. **Orga area tighten-up**  
   make organization / member / revier management more explicit in UI and structure

2. **Cross-product revier scope rollout**  
   carry the same discipline into additional pages beyond Wildlife

3. **Population/PopSim refinement**  
   improve seeded data quality, missing species coverage, and interpretation states

4. **UI cleanup and polish**  
   spacing, shell refinement, cleaner interactions, lower visual friction

5. **Camera / operational workflow quality**  
   continue improving operational product depth in Cameras and Orga

---