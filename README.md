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
