# STE AuditFlow QTS

Vue + Vite multi-page prototype for a Frappe/Microsoft 365 accounting and audit practice platform.

## Prototype pages

- Overview dashboard
- Clients and acceptance
- CRM-inspired synthetic lead register (search, filters, list/grid, bounded demo import)
- Engagement gates G0–G10
- PBC portal
- Accounting and trial balance
- Audit planning and fieldwork
- Reviews and approvals
- Release and archive
- Integration health
- Architecture map (V5 systems of record, control planes and service routes)
- V5 operating model (11 gates, 26 named outputs, commercial fixture, roles and notifications)
- Role workspaces (client contributor, management approver, preparer, senior, manager, partner, finance, accounting reviewer, EQR, records, compliance and system administrator)
- Document center (all 26 v5 outputs with scoped metadata, version, state and destination)
- Audit portal pipeline visualizer (animated eight-stage client, portal, audit and finance swimlane)
- Complete cycle walkthrough (§35.1 journey and §27–29 failure-boundary overlays)
- Phase 0 readiness (12 synthetic proof experiments, vertical slice and feasibility decision)

The UI uses fictional QAR data based on the supplied workflow architecture. It demonstrates workflow controls and versioning; it is not a production accounting system or an audit opinion engine. Safety copy remains available in the login and workflow guidance surfaces, while the persistent synthetic warning card has been removed from the page shell. Do not enter real client information, credentials, files, or professional decisions.

## Local development

```bash
npm install
npm run dev
```

Create a production build with `npm run build`. The static Vue/Vite output is in `dist/` and is deployed to Cloudflare Pages for `ste.quadrate.lk`. Nuxt is intentionally not required: the browser workflow stays a small static client, while server-side functions belong in the separately scoped Cloudflare Worker.

### Server-side boundary

Server-side functions live in `worker/index.js` and are exposed only through the `steaudit-api` Worker route in `wrangler.jsonc`. The Worker is the place for validated, correlation-aware API commands and D1 persistence; the client remains local-only unless an explicitly configured, non-production shared-demo boundary is enabled. Keep the Worker and Pages deployments separate so a UI build cannot silently grant provider or records access.

## Client comments and walkthrough preferences

Every workflow guide includes a client-comment composer and a presentation-only walkthrough preference. A participant can add a note to the current guide step and choose whether it may be skipped in this walkthrough. This preference never changes a professional gate, approval, independence check, methodology, or release eligibility.

The default build is **LOCAL_ONLY**: it stores scoped synthetic comments, walkthrough preferences, and client submissions in browser storage and does not contact `/api`. Local saves are labelled `SAVED_LOCAL_DRAFT` and are never promised for automatic replay. A shared demo must be explicitly opted into at build time with a verified Cloudflare Access boundary and an isolated non-production binding; caller-supplied roles, passwords, Origin headers, or URLs are not authentication. The Worker fails closed unless that boundary is configured. In an explicitly enabled shared demo, the API is the `steaudit-api` Cloudflare Worker on the `ste.quadrate.lk/api/*` route and persists records in additive tables in a separately approved non-production binding.

### Client-safe invitation runs

An Admin or Partner demo session can create a seven-day invitation from the Admin console. Each invitation creates a short-lived, run-prefixed synthetic engagement namespace inside the existing `quadrate-db`; the recipient is fixed to the selected client persona and cannot switch to presenter or staff pages. Portal messages are stored in the run-scoped `auditflow_portal_messages` table, so a second browser using the same invitation sees the same thread while another invitation run remains isolated.

Evidence uploads use the private `steaudit-demo-uploads` R2 bucket through the Worker `DEMO_UPLOADS` binding. The Worker accepts only PDF, CSV, XLS and XLSX files up to 10 MB, stores the receipt metadata and SHA-256 digest in D1, and refuses downloads after 24 hours. A `*/5 * * * *` scheduled handler removes expired/abandoned objects; the bucket also has a one-day lifecycle rule as a cleanup backstop. No public R2 URL or browser credential is issued.

The additive client-safe schema is applied by `npm run db:migrate:client-safe`, which targets only the `auditflow_*` tables in the existing D1 database. The deployment workflow runs the migration before publishing the Worker and Pages bundle from the same commit. Configure `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` as repository secrets before relying on the GitHub Actions deploy job; local OAuth is suitable for an operator-run deployment only.

### If a page looks empty

An empty shell is usually a browser holding an older lazy-loaded chunk after a deployment. Refresh the tab (or close and reopen it) so `index.html` and its versioned page modules come from the same build. The current source also shows an explicit “This demo page needs a refresh” panel when a chunk cannot be loaded. A role-ineligible deep link is redirected to that persona's landing page with a permission notice, and an intentionally blocked synthetic fixture may show no downstream records until its prerequisite gate is completed. The deployed `ste.quadrate.lk` site must be rebuilt and delivered before these local fixes can appear there.

Run the API locally in a second terminal with:

```bash
npm run api:dev
```

Apply the isolated schema locally only when needed for a deliberately configured test binding:

```bash
npm run db:migrate:local
```

For an authorized release, review the safety boundary and Cloudflare Access configuration first, then run the deployment commands from a controlled release environment:

```bash
npx wrangler deploy --config wrangler.jsonc --minify
npm run build
npx wrangler pages deploy dist --project-name ste-quadrate-lk --branch main
```

For a reproducible build, set `VITE_BUILD_COMMIT` to the commit being released before `npm run build`, pass the same commit as `DEPLOYMENT_SHA` to `wrangler deploy`, and verify with `EXPECTED_COMMIT=<sha> node scripts/live-smoke.mjs`. The smoke check confirms Pages and `/api/health` are reachable and that the Worker reports the expected deployment version.

The Worker is intentionally fail-closed demo infrastructure: inputs are length- and key-validated, writes are scoped to an explicit engagement and step, public health returns no client records, and every response includes a correlation ID and `SIMULATION` evidence. Do not treat this API or its D1 tables as production identity, isolation, tamper resistance, records protection, or audit evidence.

## V5 architecture views

The admin navigation includes architecture-focused prototype pages. **Architecture map** explains the v5 Frappe-first modular-monolith boundary, the optional Cloudflare Worker edge/server-function boundary used by this prototype, Entra identity, MariaDB/outbox records, SharePoint document ownership, Purview protection and independent recovery checkpoints. **Admin architecture**, **Accountant architecture**, and **Client architecture** provide the same high-level diagram through each persona's boundary: control ownership, source-to-package preparation, or portal submission and communication. **V5 operating model** translates the new specification into its 11 independent gates, 26 named outputs, commercial fixture, role boundaries and notification handoffs. **Phase 0 readiness** turns the inherited experiments into a filterable register with owners, pass criteria, a small complete vertical slice and the conditional feasibility decision. All values are synthetic planning examples; these pages do not claim that a tenant capability, production approval, or regulatory control has been proven.

The **Phase 0 readiness** page also includes an explicit **Run clean synthetic rehearsal** action. It resets only the browser-local synthetic scenario (separate from every professional command), runs the small end-to-end acceptance/PBC/accounting/audit/release/recovery slice, exercises confirmed-prohibition and non-renewal branches, and retains a bounded step-by-step `SIMULATION` evidence record. The source-derived traceability register contains 28 AT, 44 ET, 64 BT and 24 VT identities (160 acceptance scenarios), plus 12 P0 experiments. A passing rehearsal is not a Microsoft, Frappe/MariaDB, records-retention, provider exactly-once, or recovery-fencing proof.

The **Pipeline visualizer** is the client-friendly high-level explanation layer. Its eight animated stages map the supplied portal flow from client details and acceptance through quote, activation, planning, PBC, Draft FS, opinion, final report, invoice, and archive. Playback is interruptible, keyboard-operable, pauses when hidden, and falls back to manual stepping for reduced-motion preferences. Each stage exposes the accountable owner, portal handoff, documents, visibility boundary, and a link to the detailed prototype page.

The **Complete cycle** page is the guided explanation layer for the rehearsal. It follows the v5 new-client route from G0 through G10 with 36 numbered actions, derived outcomes, control boundaries, destination links, and five cross-cutting failure checkpoints. It makes fee approval, EL/signature, advance-gated onboarding, paired Draft FS/information-letter response, final discussion, invoice/cost close and recovery visible; use **Phase 0 readiness** for the resulting evidence register.

## Iconography and accessibility

The interface uses the shared `src/components/Icon.vue` outline set for navigation, workflow steps, status pills, portal actions, and system feedback. Icons are decorative when nearby text already explains the action, while standalone controls keep an accessible label and tooltip. The set is SVG-only, token-sized, and paired with text/status copy so color is never the only signal.

## Demo personas

The sign-in screen exposes scoped fictional accounts so a stakeholder can walk the same engagement from each important perspective:

| Persona | Login | Main scope |
| --- | --- | --- |
| Client portal | `nadia@northstar.demo` / `client123` | Submit client details, review requests, and keep all communication in the portal thread |
| Client management approver | `management@northstar.demo` / `management123` | Accept the engagement letter and review the Draft FS package |
| Admin portal | `maya@quadrate.demo` / `admin123` | Full workflow visibility plus the admin console and persona matrix |
| System administrator | `samir@quadrate.demo` / `samir123` | Technical actor/session and integration diagnostics only |
| Audit senior | `omar@quadrate.demo` / `omar123` | Planning, PBC requests, workpapers and Draft FS coordination |
| Audit manager | `manager@quadrate.demo` / `manager123` | Plan/workpaper/review-point queue and completion recommendation |
| Audit partner / signatory | `partner@quadrate.demo` / `partner123` | Acceptance, opinion, final discussion and guarded release |
| Finance team | `finance@quadrate.demo` / `finance123` | Cost estimate, advance verification, invoice and commercial close |
| Junior / preparer | `preparer@quadrate.demo` / `preparer123` | Assigned procedures, workpaper submission and time entry |
| Accountant portal | `leila@quadrate.demo` / `accountant123` | View client details and continue PBC, accounting, and audit preparation |
| Accounting reviewer | `reviewer@quadrate.demo` / `reviewer123` | Independent source, journal and statement-package review |
| EQR reviewer | `eqr@quadrate.demo` / `eqr123` | Independent engagement-quality review before release |
| Records custodian | `records@quadrate.demo` / `records123` | Checkpoint, archive and legal-hold operations |
| Compliance reviewer | `compliance@quadrate.demo` / `compliance123` | Acceptance evidence and records-policy observations |

These credentials are for the prototype only. The browser session is a local demo switch, not an authentication system. The role workspace and document center are synthetic records backed by the same browser-local scenario; temporary credential issuance reveals a one-time demo password only in the command response and never stores it in event history.
