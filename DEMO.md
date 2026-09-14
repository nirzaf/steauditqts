# STE AuditFlow — Interactive Demo Guide

> Vue + Vite synthetic prototype. Safe to click everywhere: all data is fictional QAR fixtures, browser-local by default (`LOCAL_ONLY`), no production system is touched.

## 0. 3-minute executive tour (start here)

Sign in as **Admin** (`maya@quadrate.demo` / `admin123`), then follow this chain — each page's guide now ends with a green **Demo checkpoint** telling you what success looks like:

1. **Pipeline visualizer** (`/#/pipeline`) → press **Play**: 8 stages, owner + handoff + client-visible boundary per stage.
2. **Complete cycle** (`/#/cycle`) → 36 Northstar actions + 5 failure checkpoints; clicks inspect only.
3. **Phase 0 readiness** (`/#/readiness`) → **Run clean synthetic rehearsal** → end-to-end slice with `SIMULATION` evidence.

Deep links work even logged out: open e.g. `http://127.0.0.1:5173/#/audit` first, then sign in — the app returns you there if your persona may see it, otherwise it lands you home with a permission notice.

## 1. Start in 2 minutes

```bash
cd C:\Users\DELL\repos\steaudit
npm install
npm run dev
```

Open **http://127.0.0.1:5173/** (or `http://localhost:5173/`).

> A dev server is already running on this machine (verified `200 OK` from Vite on `127.0.0.1:5173` on 2026-09-14). If you see "port already in use", just open the URL — no need to start a second server.

Optional API boundary (not needed for click-through — default is local-only):

```bash
npm run api:dev          # second terminal: fail-closed Worker on /api/*
npm run db:migrate:local # only when testing an isolated local D1 binding
```

Health: `npm test` → **103/103 passing** (backend actions + read gates + shared frontend client) (scenario, accounting, cycle, v5, pipeline, requirements regression, api, local-state, worker-boundary).

## 2. Log in — pick a persona, no signup

Login page shows a persona grid + `Quick demo credentials` with one-click **Enter demo**. Passwords are dummy and visible in `src/auth.js`.

| Persona (roleLabel) | Email | Password | Lands on | Try this |
|---|---|---|---|---|
| Admin portal | `maya@quadrate.demo` | `admin123` | Overview | Full G0–G10 rail, all pages |
| Client portal | `nadia@northstar.demo` | `client123` | Portal overview | Submit details, upload PBC, thread |
| Client management approver | `management@northstar.demo` | `management123` | Role workspace | EL review, Draft FS accept/reject |
| Accountant portal | `leila@quadrate.demo` | `accountant123` | Accountant overview | TB → mappings → journals → FS v05 |
| Accounting reviewer | `reviewer@quadrate.demo` | `reviewer123` | Role workspace | Independent TB/package review |
| Junior / preparer | `preparer@quadrate.demo` | `preparer123` | Role workspace | Submit workpaper snapshot, record time |
| Audit senior | `omar@quadrate.demo` | `omar123` | Role workspace | Plan, PBC requests, conclusion summary |
| Audit manager | `manager@quadrate.demo` | `manager123` | Role workspace | Clear review queue, recommend completion |
| Audit partner / signatory | `partner@quadrate.demo` | `partner123` | Role workspace | Acceptance, opinion, release auth |
| Finance team | `finance@quadrate.demo` | `finance123` | Role workspace | Estimate → advance → invoice → close |
| EQR reviewer | `eqr@quadrate.demo` | `eqr123` | Role workspace | Independent quality review |
| Records custodian | `records@quadrate.demo` | `records123` | Role workspace | Checkpoint → archive → legal hold |
| Compliance reviewer | `compliance@quadrate.demo` | `compliance123` | Role workspace | Acceptance/independence checks |
| System administrator | `samir@quadrate.demo` | `samir123` | Role workspace | Users, session, diagnostics (no professional decisions) |

Switch personas fast with the top-right account menu → **Switch demo account** (no password re-typing). Tip: open two browsers (e.g. Admin + Client) side-by-side to see visibility boundaries — client never sees risk scores, review deliberations, or unpublished opinions.

> Every workflow guide now shows a green **Demo checkpoint** banner (`src/data.js` → `demoCheckpoint`, rendered by `WorkflowGuide.vue`). If what you see differs from the checkpoint, stop — that is the finding to report.

## 3. 10-minute guided test script

### A. Orient (Admin, 2 min)
1. Sign in as **Admin** → Overview: read 4 signals, open oldest blocker via Next actions.
2. Go to **Engagements** → click gates **G0–G10** (incl. next-period G10). Note: clicks inspect only, never set status.
3. Open **Complete cycle**: 36 numbered Northstar actions + 5 failure checkpoints. Follow one fee/EL/advance-gated branch.

### B. Accept → Collect (Client + Admin, 2 min)
4. As **Client**: Portal overview → Client details → submit entity/period/service. Open Communications → add a note (stored as `SAVED_LOCAL_DRAFT`).
5. As **Admin**: Clients & acceptance → lead register (search/filter/bounded import) → open Northstar assessment → see UBO hold (`CE-011` missing) blocking commencement. Record partner decision (Accept/Decline/Escalate) — commercial activity never implies acceptance.
6. As **Audit senior**: PBC portal → select `PBC-019`/`PBC-023` → Log receipt / Ask clarification → check read-only client preview.

### C. Prepare → Test (Accountant + Preparer/Manager, 3 min)
7. As **Accountant**: Accounting & TB → verify control totals (14 accounts, debits == credits, signed 0) → Mappings → `AJ-001` already reflected once (TB v03 = 1.825m/side, no double-apply) → Financial statements → FS v05 impact, `AJ-002` stays PROPOSED until management decides.
8. As **Preparer**: Audit & fieldwork → submit exact workpaper snapshot → try to self-clear a significant review point → **denied** (SoD enforced).
9. As **Audit manager**: Reviews & approvals → clear segregated review point with response, recommend completion.

### D. Release → Visualize → Reset (Partner/Records + anyone, 3 min)
10. As **Partner**: Release & archive → use the **Release scope** selector to compare `RC-026` (blocked) with `RC-READY-001` (ordered path): release event → independent records checkpoint → delivery → archive (one release identity, exact report/FS pair).
11. Open **Pipeline visualizer**: play 8-stage swimlane (client→portal→audit→finance), keyboard-operable, pauses when hidden.
12. Open **Phase 0 readiness**: filter 12 experiments → **Run clean synthetic rehearsal** → watch acceptance/PBC/accounting/audit/release/recovery slice with `SIMULATION` evidence mapped to AT/ET/VT/P0 IDs. Passing ≠ tenant/production proof.
13. Every page: open **WorkflowGuide** → add client comment + walkthrough preference (presentation-only, never waives a gate).

## 4. Reset the demo

* **In-app soft reset (recommended):** Admin console → **Demo controls → Reset demo data**, or Help (`?` in sidebar) → **Reset demo data**. Clears the synthetic scenario + local comments/preferences/profiles (`auditflow-scenario-v2`, `auditflow-demo-state-v2`/`-v1`) and reloads; you stay signed in. Code: `src/demoReset.js`.
* **Rehearsal reset:** **Run clean synthetic rehearsal** (Complete cycle / Phase 0 readiness) resets the scenario slice only and keeps a bounded `SIMULATION` evidence log — use it to re-demo the slice, not to clear your notes.
* **Manual hard reset:** DevTools → Application → Local Storage → delete `auditflow-demo-session-v1`, `auditflow-demo-state-v2`, `auditflow-scenario-v2` → refresh. Needed only if storage itself looks corrupt.
* Nothing leaves the browser unless you explicitly opt into a shared demo build (`VITE_SHARED_DEMO_*` + Cloudflare Access + isolated non-production D1). Default build never calls `/api`.

## 7. Shared multi-browser demo (opt-in, `DEMO-INTERACTIVE-001`)

The default tour above is browser-local. The shared demo stores one synthetic Northstar engagement in Cloudflare D1 through the Worker, so five browsers (Client, Senior, Manager, Partner, Finance) see the same state within ~5 seconds. All values stay synthetic with `SIMULATION` evidence; no production integration is enabled.

### Enable it

1. Apply migrations in order against an **isolated non-production** binding (never the production app tables; every table uses the `auditflow_` prefix):

```bash
npx wrangler d1 execute quadrate-db --local --file worker/schema.sql
npx wrangler d1 execute quadrate-db --local --file worker/migrations/0002_shared_interactive_demo.sql
npx wrangler d1 execute quadrate-db --local --file worker/migrations/0003_demo_credentials.sql
npx wrangler d1 execute quadrate-db --local --file worker/migrations/0004_tb_sources.sql
```

(Windows note: if `npx wrangler` misparses arguments, call `node_modules/.bin/wrangler` via `npm run` scripts or your normal terminal instead. `--remote` only in a separately approved release.)
2. Protect the Worker with Cloudflare Access and set the triple flag so frontend and backend agree: `VITE_SHARED_DEMO_ENABLED=true`, `VITE_SHARED_DEMO_IDENTITY=cloudflare-access-verified`, `VITE_SHARED_DEMO_BINDING=isolated-non-production` **and** Worker vars `SHARED_DEMO_ENABLED=true`, `SHARED_DEMO_IDENTITY_MODE=cloudflare-access-verified`, `SHARED_DEMO_BINDING=isolated-non-production`. Any mismatch → clean `403 SHARED_DEMO_DISABLED`, never partial sharing.
3. Rebuild (`npm run build`) and open the app. Signing in mints a server-side session cookie (`POST /api/demo/session`); the Worker — never the browser — decides your actor and roles.

### Five-browser acceptance script (maps to story §27)

* **A — Onboarding:** Client (`/#/client-details`) submits details → Partner (`/#/clients`) accepts → Finance records estimate + Partner approves fee (`/#/blueprint`) → Management accepts `EL-2026-01` → Finance verifies advance `PAY-SIM-0018` → Partner/System-admin issues credential (one-time password, hash only in D1) → Senior announces (`/#/pbc`). Pipeline stages 1–4 flip to COMPLETE in every browser.
* **B — PBC:** Senior creates request → Client submits receipt (or hard-copy flag) → Senior accepts or clarifies. Both views show the same version history (`/#/pbc`, shared tasks + timeline).
* **C — Execution:** Preparer submits workpaper → Manager raises/resolves review point (self-clear of SIGNIFICANT stays `403 SOD_VIOLATION`) → Senior publishes Draft FS → Management rejects with explanation, then accepts the exact revision (`/#/audit`, `/#/reviews`).
* **D — Opinion & release:** EQR approves → Partner binds opinion to the exact draft candidate → Partner releases (blocked while EQR incomplete or points open) → Client sees only `CLIENT_VISIBLE` deliverables (`/#/release`, Document center).
* **E — Finance close:** Finance books actuals → invoice `INV-2026-*` shows fee 36,000 − advance 9,000 = balance 27,000 → Email/WhatsApp/portal rows queue as `QUEUED_SIMULATION` → Client sees invoice + notice. Commercial close stays `OPEN` (never auto-closed by archiving).

### Shared actions (all `POST /api/engagements/:id/actions`)

`SUBMIT_CLIENT_DETAILS` · `ACCEPT_CLIENT` · `RECORD_ESTIMATE` · `APPROVE_FEE` · `RESPOND_EL` · `VERIFY_ADVANCE` · `ISSUE_TEMP_CREDENTIAL` · `ISSUE_ANNOUNCEMENT` · `CREATE_PBC_REQUEST` · `SUBMIT_PBC_RECEIPT` · `RESPOND_PBC_RECEIPT` · `RECORD_TB_SOURCE` · `SUBMIT_WORKPAPER` · `CREATE_REVIEW_POINT` · `CLEAR_REVIEW_POINT` · `PUBLISH_DRAFT_FS` · `RESPOND_DRAFT_FS` · `COMPLETE_EQR` · `RECORD_AUDIT_OPINION` · `RELEASE_FINAL_REPORT` · `CREATE_INVOICE`

Reads: `GET /api/engagements/:id[/tasks|/timeline]` · `/api/pbc` · `/api/workpapers` (staff-only) · `/api/reviews` (staff-only) · `/api/decisions` (clients: EL + Draft FS only) · `/api/artifacts` (clients: published visible only) · `/api/outbox`.

### Shared reset & failure honesty

* Admin console → **Demo controls → Reset demo data** calls `POST /api/demo/reset` (Admin/Partner only): deletes only the three demo engagements' rows, mints a new `generation_id`, appends `DEMO_RESET`. Other browsers detect the generation change on next poll and offer reload. No `DROP TABLE` anywhere.
* Denials stay denials: `401 SESSION_REQUIRED` (pick a persona), `403 ROLE/SCOPE`, `409 REVISION_CONFLICT/VERSION_MISMATCH/PRECONDITION_FAILED`, `501 ACTION_NOT_ENABLED`. Offline or 5xx → *"was not committed"* — workflow actions never synthesize local success. Evidence: `tests/shared-demo.test.js`, `tests/phase2-actions.test.js`, `tests/phase3-commercial-pbc.test.js`, `tests/phase4-audit.test.js`, `tests/phase5-release-finance.test.js`, `tests/phase6-reads.test.js`, `tests/shared-frontend.test.js`.

## 5. Share with end users

* **Same machine:** send `http://127.0.0.1:5173/` + this file.
* **Same Wi-Fi/LAN:** run `npm run dev -- --host 0.0.0.0` and share `http://<your-lan-ip>:5173/` (firewall must allow it).
* **Public pilot:** `npm run build` → `npx wrangler pages deploy dist --project-name ste-quadrate-lk --branch main` (separate authorized release; review Access/binding safety in README first). Do not use `npm run db:migrate:remote` unless approved.

## 6. What testers should NOT expect

No live Frappe/ERPNext, Entra, MariaDB, SharePoint, Purview, email/WhatsApp, payments, or real auth. Provider evidence is `SIMULATION` with correlation IDs. See `README.md` + `docs/implementation-status.md` (Milestone M6) for boundaries.
