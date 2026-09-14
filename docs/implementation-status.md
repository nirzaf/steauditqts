# AuditFlow prototype implementation status

**Track:** P — architecture-faithful synthetic prototype  
**Current milestone:** M4 — coherent walkthrough and evidence register (M0/M1 complete; M2–M4 slices implemented)  
**Environment:** Vue/Vite browser build; no live Frappe, Microsoft tenant, ledger, records policy, or production release is enabled.

This is an evidence register, not a production-readiness claim. The complete `docs/v4-handoff/` source bundle is not present in this repository. The normative copies used for this pass are `C:\Users\DELL\Downloads\audit_platform_v4_final_specification_and_feasibility.md`, `C:\Users\DELL\Downloads\consolidated_accounting_audit_workflow_v2.md`, and `C:\Users\DELL\Downloads\02_USER_STORIES.md`; source-derived accounting fixtures are checked in under `fixtures/`.

## M0 — honest and safe demo

| Requirement | Code | Test / command | Evidence and status |
|---|---|---|---|
| P01.1 — persistent synthetic boundary | `src/components/SyntheticDemoBanner.vue`, `src/App.vue`, `src/pages/LoginPage.vue`, `src/style.css` | `npm run build`; browser smoke | Every login and workspace view presents SYNTHETIC DEMO, local/shared mode, and `SIMULATION` evidence. **Implemented.** |
| P01.1 — current vs target architecture labels | `src/pages/ArchitecturePage.vue`, `src/pages/RoleArchitecturePage.vue` | `npm run build` | Architecture views label CURRENT IMPLEMENTATION and TARGET V4 ARCHITECTURE separately. **Implemented.** |
| P01.2–P01.4 — fail-closed shared boundary and honest health | `src/api.js`, `worker/index.js`, `wrangler.jsonc`, `README.md` | `tests/worker-boundary.test.js`, `tests/api.test.js` | Browser defaults to `LOCAL_ONLY`; public health contains no client records; legacy data routes return `SHARED_DEMO_DISABLED` without explicit trusted Access configuration; simulated provider evidence is `SIMULATION`. **Implemented in source; live Access/JWT and shared API proof NOT_RUN.** |
| P02.1–P02.2 — scoped persistence and v1 migration | `src/localState.js`, `src/api.js` | `tests/local-state.test.js`, `tests/api.test.js` | Profiles are keyed by engagement; comments/preferences remain intact; v1 profile migrates additively and the original key is retained. **Implemented and tested.** |
| P02.3 — denial/conflict metadata | `src/api.js`, `worker/index.js` | `tests/api.test.js`, `tests/worker-boundary.test.js` | 400/401/403/409-style status, code, correlation and retry metadata stay distinguishable; HTTP failures are not converted to local success. **Implemented and tested locally.** |
| P02.4–P02.5 — explicit drafts and visible storage failures | `src/api.js`, `src/components/WorkflowGuide.vue`, client detail pages, `src/localState.js` | `tests/api.test.js`, `tests/local-state.test.js` | Local edits return `SAVED_LOCAL_DRAFT` with `LOCAL_ONLY`; no automatic replay is promised; read/migration/quota errors are surfaced. **Implemented and tested.** |
| P21.3 — walkthrough preference is presentation-only | `src/components/WorkflowGuide.vue`, `README.md` | `npm run build`; browser smoke | “Required/optional” was replaced with a walkthrough visibility preference that cannot waive a professional gate. **Implemented.** |
| Stale lazy chunk must not leave a blank page | `src/App.vue`, `src/components/AsyncPageError.vue`, `src/components/AsyncPageLoading.vue`, `public/_headers` | `npm run build`; 19-route browser smoke | Route transitions render a loading surface immediately; a tab holding an older content-hash chunk can then show an explicit refresh/error panel instead of an empty `<main>`. `index.html` is no-store and hashed assets are immutable. **Implemented in source; new Cloudflare delivery NOT_RUN.** |

## M1 — thin control slice

| Story | Code | Test / command | Evidence and status |
|---|---|---|---|
| P03–P04 — roles, authority and two-client scope | `src/domain/scenario.js`, `src/App.vue`, scoped selectors in pages | `tests/scenario.test.js`; browser smoke | One firm, Northstar (linked audit + accounting) and Cedar (accounting-only) are explicit. Preparer, independent reviewer, client finance, management approver, partner/signatory, EQR, records, compliance and system-admin-only personas are distinct. Scope, assignment, professional role and session persona are checked at command boundaries. **Implemented for the synthetic slice.** |
| P05 — derived G0–G10 gates | `src/domain/scenario.js`, `src/pages/EngagementsPage.vue`, `src/pages/ReleasePage.vue` | `tests/scenario.test.js`; browser smoke | All eleven gates are rendered, including next-period G10, with applicable denominators and record-specific blockers. Gate/rail clicks inspect only; they cannot set a status. **Implemented for the synthetic slice.** |
| P09–P10 — PBC receipts, replacements, snapshots and manifests | `src/domain/documents.js`, `src/domain/scenario.js`, `src/pages/PbcPage.vue` | `tests/scenario.test.js` | Bounded synthetic bytes are hashed; original/stored/snapshot hashes, provider version, canonical RFC 8785 manifest bytes and digest are retained. Replacement uploads preserve the earlier receipt and mark `REPLACEMENT_RECEIVED`; idempotent replay returns the original result. **Implemented for the synthetic slice.** |
| P15 — exact workpaper submission and independent review | `src/domain/scenario.js`, `src/pages/AuditPage.vue`, `src/pages/ReviewsPage.vue` | `tests/scenario.test.js`; browser smoke | Submission freezes an exact snapshot and revision. Reviewer commands enforce assignment, supported response, expected revision and separation of duties; an author cannot self-clear. **Implemented for the synthetic slice.** |
| P16 — synchronous generations and stale-input blocking | `src/domain/scenario.js`, `src/pages/AccountingPage.vue`, `src/pages/ReleasePage.vue` | `tests/scenario.test.js` | Linked accounting mutation increments input/safety generations and records an impact case synchronously, even with impact processing paused. A stale candidate returns `INPUTS_NOT_EVALUATED` before release. **Implemented in the browser simulation; MariaDB/CAS proof NOT_RUN.** |
| P17 — guarded release, checkpoint-before-delivery | `src/domain/scenario.js`, `src/pages/ReleasePage.vue` | `tests/scenario.test.js`; browser smoke | Blocked RC-026 cannot advance. RC-READY-001 follows the ordered synthetic release event → independent records checkpoint → delivery → archive path with one release identity. **Implemented for the synthetic slice.** |
| P19/P22 subset — deterministic operation state and runnable negative paths | `src/domain/scenario.js`, `src/pages/IntegrationPage.vue`, `tests/scenario.test.js` | `npm test`; browser smoke | Reconciliation creates a unique scoped operation and reports `NOT_CONNECTED` rather than manufacturing provider success. Focused negative-path tests cover authority, idempotency, stale revisions, reflection and release guards. **Subset implemented; full fault/fence/recovery cycle remains partial.** |

## M2 — lifecycle and accounting slice

| Story | Code | Test / command | Evidence and status |
|---|---|---|---|
| P06 — acceptance decision, signed terms and activation blockers | `src/domain/scenario.js`, `src/pages/ClientsPage.vue`, `src/pages/EngagementsPage.vue` | `tests/scenario.test.js`; local role smoke | Partner-only accept/continue/decline decisions, management/partner terms recording, explicit acceptance/hold/terms/workspace blockers, and partner-only activation are executable in the synthetic scope. **Implemented for the slice; complete policy catalogue remains partial.** |
| P07–P08 — continuance shell and renewal/non-renewal preservation | `src/domain/scenario.js`, `src/pages/EngagementsPage.vue` | `tests/scenario.test.js` | Next-period shell copies prior RV context while resetting current responses to UNKNOWN; renewal is hold-guarded and non-renewal records a deletion-disabled closeout. **Domain slice implemented; full UI decision workflow remains partial.** |
| P09–P10 — receipt suitability separate from receipt capture | `src/domain/scenario.js`, `src/pages/PbcPage.vue` | `tests/scenario.test.js`; local PBC interaction | Client/firm receipt capture remains a bounded snapshot operation; assigned reviewer can accept or request clarification, and the page exposes receipt hash plus suitability state. **Implemented for the slice.** |
| P11–P13 — accounting source, journal and statement controls | `src/domain/accounting.js`, `src/domain/scenario.js`, `src/pages/AccountingPage.vue` | `tests/accounting.test.js`, `tests/scenario.test.js`; local accountant interaction | Exact 14-row Decimal fixtures, source replacement history, reflection-aware journal staging, management authorization, statement submission blockers, and snapshot-backed management approval are executable. Cash-flow, comparative and disclosure inputs remain intentionally incomplete. **Slice implemented; complete package remains partial.** |

## M3 — audit chain, records and recovery slice

| Story | Code | Test / command | Evidence and status |
|---|---|---|---|
| P14 — materiality, risk, population, sample and finding chain | `src/domain/audit.js`, `src/domain/scenario.js`, `src/pages/AuditPage.vue` | `tests/scenario.test.js`; local audit interaction | Materiality thresholds use exact Decimal arithmetic; both significant synthetic risks link to their own reconciled populations and sample plans (four sample rows total); contradictory AR-019 evidence blocks conclusion until independent alternative work and partner disposition are recorded. The inventory listing is clearly labelled as a supplementary synthetic assumption. **Implemented for the synthetic slice.** |
| P18 — structured archive, legal hold and amendment preservation | `src/domain/scenario.js`, `src/pages/ReleasePage.vue` | `tests/scenario.test.js`; local release interaction | Archive assembly creates a canonical manifest digest from scoped snapshots and records; records custodians can append/release legal holds; partners open linked amendment cases without overwriting the issued candidate. **Implemented for the synthetic slice; external records-policy enforcement NOT_RUN.** |
| P19 — provider fault matrix and deterministic retries | `src/domain/scenario.js`, `src/pages/IntegrationPage.vue` | `tests/scenario.test.js`; local integration interaction | 429, 403, 5xx, timeout-after-success, expired lease, cursor expiry and not-connected outcomes are explicit. Retry keeps operation identity, request digest and fence semantics; uncertain success reconciles the same target. **Implemented for the synthetic simulator; provider exactly-once proof NOT_RUN.** |
| P20 — backup, restore quarantine and independent checkpoint | `src/domain/scenario.js`, `src/pages/IntegrationPage.vue` | `tests/scenario.test.js`; local recovery interaction | Recovery captures scoped candidate IDs and generations, restores into a quarantined epoch, requires a matching independent checkpoint, and resumes with outward effects permanently disabled in the prototype. **Implemented for the synthetic rehearsal; production restore/fencing proof NOT_RUN.** |

## M4 — coherent walkthrough and evidence register

| Story | Code | Test / command | Evidence and status |
|---|---|---|---|
| P21–P22 — role-aware walkthrough and evidence register | `src/pages/ReadinessPage.vue`, `src/components/WorkflowGuide.vue`, `src/domain/scenario.js` | `npm test`; local route smoke | Readiness now projects the selected engagement’s live gates, accounting package, audit-chain blockers, workpaper snapshots, release candidate, records state, operations and recovery epoch into one M4 register. Every row is labelled READY, HELD, SIMULATION, NOT RUN or NOT APPLICABLE. **Implemented for the synthetic walkthrough; full AT/ET/VT catalogue remains partial.** |

## Verification run

```text
npm test                 PASS — 32 tests
npm run build            PASS — Vite production build (53 modules)
git diff --check         PASS — whitespace check (line-ending warnings only)
browser smoke            PASS — 19 local admin routes, 6 accountant routes, and 4 client routes; each exposed main-content, SYNTHETIC DEMO, and a heading; no console warn/error
live smoke               PASS — prior deployed bundle exposed all permitted client/admin/accountant routes; role-ineligible deep links redirected to the landing page; no console warn/error
```

The earlier empty-page symptom was a deployment-version mismatch: an already-open tab requested a removed lazy chunk such as `index-Nk4Ahvci.js` while the new `index.html` had a different content hash. The server returned the SPA fallback HTML with HTTP 200, so the dynamic import failed and the app shell left an empty main region. The async error component and cache headers above make that failure explicit, but the fix still needs to be delivered to the live Cloudflare site before it can be verified there.

Read-only live check: `https://ste.quadrate.lk/` is still serving the prior shell (`index-DPTVXdzk.js` / `index-CaSaewpp.css`). The open session is the client persona, so admin/accountant deep links are correctly redirected to `#/client-home`; they are not evidence that those role pages are empty. A new build has not been deployed in this pass.

## Partial / not yet implemented

- **M2 (P06–P08, P11–P13):** acceptance/terms/activation, continuance shell, PBC suitability, source replacement, journal authorization, statement submission and management snapshot approval now have a runnable synthetic slice. The exact CE-001…CE-093 and RV-001…RV-030 identities are present. A complete policy catalogue, full renewal UI, disclosure/cash-flow inputs, and a complete financial-statement package remain partial; the miniature TB stays explicitly incomplete for cash flow, comparatives and disclosures.
- **M3 (P14, P18–P20):** the synthetic audit chain, archive/legal-hold/amendment controls, provider fault matrix and recovery rehearsal are implemented. Full real-system evidence (records policy, provider exactly-once, restore fencing and external checkpoints) remains NOT_RUN.
- **M4 (P21–P22):** changed pages have local route and negative-path coverage, but the complete §39.2 end-to-end cycle, all 28 AT + 44 ET + 24 VT entries and all 12 Phase 0 experiments are not yet recorded as executable evidence.

Real-system proof is **NOT_RUN/BLOCKED**: Frappe/MariaDB transactions and locks, Entra identity, Microsoft Graph/SharePoint/Purview permissions and retention, provider exactly-once behavior, Cloudflare Access/JWT verification, external delivery, records enforcement and restore fencing. No remote database migration, Worker deployment or Pages deployment was performed for this pass.

**Next runnable task:** add the reviewed `docs/v4-handoff/` source bundle, then finish the remaining M2 package fields and M4 end-to-end evidence matrix. Keep all live integrations disabled and update this register with each runnable story and its evidence.
