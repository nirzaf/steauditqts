# AuditFlow walkthrough architecture

AuditFlow is deliberately organized around responsibility boundaries rather
than a new framework or a single global store.

## Demo shell

App.vue mounts lazy route components and coordinates sign-in, the existing
DemoNavigator, command palette, notifications, and restart confirmation.
navigation/registry.js is the single source for route labels, titles, sections,
and navigation visibility. App keeps only component loaders plus navigation
order and icons.

The navigator reads the active context projection. Presenter-only controls
are guarded in App: authorized presenter sessions may switch persona and
restart; invitation-bound client sessions do not receive those controls.
Shared walkthrough focus uses only the Worker-backed preset API exposed by
sharedDemo.js.

## UI

Pages and reusable components render records, forms, tables, timelines, and
feedback. They request domain or application commands; they do not determine
professional approval, release, accounting, or gate outcomes themselves.

## Application state and projection

auth.js owns the browser session. demoContext.js owns the active context
projection, one shared refresh loop, selection correction, derived
stage/progress, next action, breadcrumbs, and notifications.

In LOCAL_ONLY mode, that projection reads the authoritative scenario.js state
and its gate summary. Small drafts, preferences, and comments remain scoped
browser-local data in localState.js and infrastructure/localDrafts.js.

In SHARED_DEMO mode, Worker/D1 state is accessed only through sharedDemo.js
and projected through demoContext.js and composables/useDemoWorkspace.js.
Browser storage never becomes workflow truth for shared runs.

## Domain logic and data

domain and shared modules own workflow rules, validation, separation of
duties, accounting, audit, approvals, and release behavior. Scenario fixtures,
presentation data, and Worker/D1 records provide the synthetic data layer.

Presentation stages, professional gates, tasks, and approvals remain distinct:
the shell displays a derived progress view, not an editable workflow field.
