# STE AuditFlow QTS

Vue + Vite multi-page prototype for a Frappe/Microsoft 365 accounting and audit practice platform.

## Prototype pages

- Overview dashboard
- Clients and acceptance
- Engagement gates G0–G10
- PBC portal
- Accounting and trial balance
- Audit planning and fieldwork
- Reviews and approvals
- Release and archive
- Integration health
- Architecture map (V4 systems of record, control planes and service routes)
- Phase 0 readiness (12 synthetic proof experiments, vertical slice and feasibility decision)

The UI uses fictional QAR data based on the supplied workflow architecture. It demonstrates workflow controls and versioning; it is not a production accounting system or an audit opinion engine. Every screen is marked **SYNTHETIC DEMO** and carries `SIMULATION` evidence. Do not enter real client information, credentials, files, or professional decisions.

## Local development

```bash
npm install
npm run dev
```

Create a production build with `npm run build`. The static output is in `dist/` and is deployed to Cloudflare Pages for `ste.quadrate.lk`.

## Client comments and walkthrough preferences

Every workflow guide includes a client-comment composer and a presentation-only walkthrough preference. A participant can add a note to the current guide step and choose whether it may be skipped in this walkthrough. This preference never changes a professional gate, approval, independence check, methodology, or release eligibility.

The default build is **LOCAL_ONLY**: it stores scoped synthetic comments, walkthrough preferences, and client submissions in browser storage and does not contact `/api`. Local saves are labelled `SAVED_LOCAL_DRAFT` and are never promised for automatic replay. A shared demo must be explicitly opted into at build time with a verified Cloudflare Access boundary and an isolated non-production binding; caller-supplied roles, passwords, Origin headers, or URLs are not authentication. The Worker fails closed unless that boundary is configured. In an explicitly enabled shared demo, the API is the `steaudit-api` Cloudflare Worker on the `ste.quadrate.lk/api/*` route and persists records in additive tables in a separately approved non-production binding.

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

Remote deployment is intentionally outside the prototype implementation task. If a separately authorized release is required, review the safety boundary and Cloudflare Access configuration first, then run the deployment commands from a controlled release environment:

```bash
npx wrangler deploy --config wrangler.jsonc --minify
npm run build
npx wrangler pages deploy dist --project-name ste-quadrate-lk --branch main
```

The Worker is intentionally fail-closed demo infrastructure: inputs are length- and key-validated, writes are scoped to an explicit engagement and step, public health returns no client records, and every response includes a correlation ID and `SIMULATION` evidence. Do not treat this API or its D1 tables as production identity, isolation, tamper resistance, records protection, or audit evidence.

## V4 architecture views

The admin navigation includes architecture-focused prototype pages. **Architecture map** explains the Frappe-first modular-monolith boundary, Entra identity, MariaDB/outbox records, SharePoint document ownership, Purview protection and independent recovery checkpoints. **Admin architecture**, **Accountant architecture**, and **Client architecture** provide the same high-level diagram through each persona's boundary: control ownership, source-to-package preparation, or portal submission and communication. **Phase 0 readiness** turns the specification's 12 experiments into a filterable register with owners, pass criteria, a small complete vertical slice and the conditional feasibility decision. All values are synthetic planning examples; these pages do not claim that a tenant capability, production approval, or regulatory control has been proven.

The **Phase 0 readiness** page also includes an explicit **Run clean synthetic rehearsal** action. It resets only the browser-local synthetic scenario (separate from every professional command), runs the small end-to-end acceptance/PBC/accounting/audit/release/recovery slice, exercises confirmed-prohibition and non-renewal branches, and retains a bounded step-by-step `SIMULATION` evidence record. Each run links its exercised steps to the source-derived 28 AT, 44 ET, 24 VT, and 12 P0 traceability identities. A passing rehearsal is not a Microsoft, Frappe/MariaDB, records-retention, provider exactly-once, or recovery-fencing proof.

## Iconography and accessibility

The interface uses the shared `src/components/Icon.vue` outline set for navigation, workflow steps, status pills, portal actions, and system feedback. Icons are decorative when nearby text already explains the action, while standalone controls keep an accessible label and tooltip. The set is SVG-only, token-sized, and paired with text/status copy so color is never the only signal.

## Demo personas

The sign-in screen exposes three fictional accounts so a stakeholder can walk the same engagement from different perspectives:

| Persona | Login | Main scope |
| --- | --- | --- |
| Client portal | `nadia@northstar.demo` / `client123` | Submit client details, review requests, and keep all communication in the portal thread |
| Admin portal | `maya@quadrate.demo` / `admin123` | Full workflow visibility plus the admin console and persona matrix |
| Accountant portal | `leila@quadrate.demo` / `accountant123` | View client details and continue PBC, accounting, and audit preparation |

These credentials are for the prototype only. The browser session is a local demo switch, not an authentication system.
