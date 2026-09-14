# STE AuditFlow — Interactive Demo Guide

> Vue + Vite synthetic prototype. Safe to click everywhere: all data is fictional QAR fixtures, browser-local by default (`LOCAL_ONLY`), no production system is touched.

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

Health: `npm test` → **75/75 passing** (scenario, accounting, cycle, v5, pipeline, requirements regression, api, local-state, worker-boundary).

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

Tip: open two browsers (e.g. Admin + Client) side-by-side to see visibility boundaries — client never sees risk scores, review deliberations, or unpublished opinions.

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

* Browser-only reset: DevTools → Application → Local Storage → delete `auditflow-demo-session-v1`, `auditflow-demo-state-v2`, `auditflow-scenario-v2` → refresh. Or use **Run clean synthetic rehearsal** (resets scenario slice, keeps a bounded evidence log).
* Nothing leaves the browser unless you explicitly opt into a shared demo build (`VITE_SHARED_DEMO_*` + Cloudflare Access + isolated non-production D1). Default build never calls `/api`.

## 5. Share with end users

* **Same machine:** send `http://127.0.0.1:5173/` + this file.
* **Same Wi-Fi/LAN:** run `npm run dev -- --host 0.0.0.0` and share `http://<your-lan-ip>:5173/` (firewall must allow it).
* **Public pilot:** `npm run build` → `npx wrangler pages deploy dist --project-name ste-quadrate-lk --branch main` (separate authorized release; review Access/binding safety in README first). Do not use `npm run db:migrate:remote` unless approved.

## 6. What testers should NOT expect

No live Frappe/ERPNext, Entra, MariaDB, SharePoint, Purview, email/WhatsApp, payments, or real auth. Provider evidence is `SIMULATION` with correlation IDs. See `README.md` + `docs/implementation-status.md` (Milestone M6) for boundaries.
