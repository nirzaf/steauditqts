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

The UI uses fictional QAR data based on the supplied workflow architecture. It demonstrates workflow controls and versioning; it is not a production accounting system or an audit opinion engine.

## Local development

```bash
npm install
npm run dev
```

Create a production build with `npm run build`. The static output is in `dist/` and is deployed to Cloudflare Pages for `ste.quadrate.lk`.

## Client comments and optional steps

Every workflow guide includes a client-comment composer and a step setting. A client can add a note to the current guide step, then mark that step as required or optional for this walkthrough. The page keeps the setting visible and explains that optional status does not bypass a real approval, independence check, or audit requirement.

The UI first uses the same-origin API at `/api`. If the API is temporarily unavailable, it falls back to browser storage and labels that state clearly. In production, the API is the `steaudit-api` Cloudflare Worker on the `ste.quadrate.lk/api/*` route and persists records in two additive tables (`auditflow_comments` and `auditflow_step_preferences`) in the existing `quadrate-db` D1 database.

Run the API locally in a second terminal with:

```bash
npm run api:dev
```

Apply the isolated schema locally or remotely only when needed:

```bash
npm run db:migrate:local
npm run db:migrate:remote
```

Deploy the API and Pages bundle with:

```bash
npx wrangler deploy --config wrangler.jsonc --minify
npm run build
npx wrangler pages deploy dist --project-name ste-quadrate-lk --branch main
```

The Worker is intentionally a demo API: inputs are length- and key-validated, writes are scoped to the selected engagement and step, and the interface keeps fictional data and professional decision boundaries visible.

## Demo personas

The sign-in screen exposes three fictional accounts so a stakeholder can walk the same engagement from different perspectives:

| Persona | Login | Main scope |
| --- | --- | --- |
| Client portal | `nadia@northstar.demo` / `client123` | Submit client details, review requests, and keep all communication in the portal thread |
| Admin portal | `maya@quadrate.demo` / `admin123` | Full workflow visibility plus the admin console and persona matrix |
| Accountant portal | `leila@quadrate.demo` / `accountant123` | View client details and continue PBC, accounting, and audit preparation |

These credentials are for the prototype only. The browser session is a local demo switch, not an authentication system.
