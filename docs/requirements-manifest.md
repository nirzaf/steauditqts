# STE AuditFlow requirements manifest

This repository-local manifest keeps the prototype's source-of-truth pointers portable. The referenced source documents remain externally controlled in the stakeholder's Downloads folder; they are not copied into the application bundle.

| Document | Version / date | SHA-256 (observed 2026-09-14) | Precedence | Presence / control |
|---|---|---|---|---|
| `steauditqts_codex_master_prompt.md` | Master implementation prompt | `DB7C28BD763287D744F1B926E7A2919A4F11C62006386F6CAB3B1FB55BB55B55` | Implementation constraints and review findings F01–F18 | External controlled file; not checked in |
| `steauditqts_complete_prototype_user_story.md` | Complete prototype user story | `8E8BF11AC52FBC2D78073F6CE72C0CEF75C7FC955099A61DDB93407A16452262` | Detailed acceptance contract; use with the master prompt | External controlled file; not checked in |
| `audit_platform_v5_complete_specification.md` | v5 approved specification | `C1B796C0ED0F1FE1931BB196ECE7E91B15498BC9A8E3536A565A7435DB4F9239` | Highest-priority business/output model when documents conflict | External controlled file; not checked in |
| `audit_platform_v4_final_specification_and_feasibility.md` | v4 feasibility baseline | `74DC3ABD7091791146A677FFBFC45793F8D62D132BDB0786A719AD8FE2D0A66B` | Historical feasibility and Phase 0 context | External controlled file; not checked in |
| `consolidated_accounting_audit_workflow_v2.md` | Consolidated workflow baseline | `4AD7D3C8AA1E5F0C19EE2BA00A8E880BF0C2F95A18982BBF5F32F60E0B0008F6` | Original named workflow and actor handoffs | External controlled file; not checked in |

## Accepted contract in this prototype

- Vue/Vite remains the client demonstrator; browser-local synthetic state is the default mode.
- Frappe/ERPNext plus `audit_practice` remains the documented production target; the optional Cloudflare Worker is a narrow, fail-closed server-function boundary only.
- Traceability counts are 28 AT + 44 ET + 64 BT + 24 VT = 160 acceptance scenarios, with 12 P0 experiments tracked separately.
- The v5 workflow retains eleven gates (G0–G10), twenty-six named outputs (DOC-01–DOC-26), scoped role authority, temporary credential simulation, synthetic outbox messaging, exact-version decisions and independent release/checkpoint/archive controls.
- No live Microsoft, Frappe, payment, email, WhatsApp, records-policy or production authentication integration is enabled by this prototype milestone.
