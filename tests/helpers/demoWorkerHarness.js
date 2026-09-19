// Shared test harness for the Cloudflare Worker command boundary.
//
// `makeFakeDb()` stands in for D1: it recognises the SQL the Worker issues and
// keeps the rows in memory. Where a fake has to interpret a rule the Worker also
// applies (for example which workpaper states count as submitted evidence), it
// imports the SAME shared module the Worker uses rather than restating the rule.
import { isWorkpaperSubmitted } from '../../shared/lifecycleRules.js';

export const DEMO_ENGAGEMENT_ID = 'ENG-0018-AUD-2026';

export const DEMO_PERSONA_ACTORS = {
  'admin-demo': 'ACT-MAYA',
  'partner-demo': 'ACT-PARTNER',
  'audit-senior-demo': 'ACT-OMAR-SENIOR',
  'audit-manager-demo': 'ACT-OMAR',
  'preparer-demo': 'ACT-JUNIOR',
  'eqr-demo': 'ACT-YUSUF',
  'finance-demo': 'ACT-AISHA',
};

const TRUSTED_HEADERS = {
  'Cf-Access-Jwt-Assertion': 'synthetic-jwt',
  'Cf-Access-Authenticated-User-Email': 'demo@quadrate.demo',
  'Content-Type': 'application/json',
};

export function makeFakeDb(engagementOverrides = {}) {
  const ENG = DEMO_ENGAGEMENT_ID;
  const state = {
    sessions: new Map(),
    engagements: new Map([[ENG, { engagement_id: ENG, client_id: 'CLI-0018', service: 'AUDIT', period: 'FY2026', revision: 1, current_stage: 'STAGE-03', g_status: '{}', generation_id: 'gen-seed-01', audit_commenced: 0, updated_at: '2026-09-14 00:00:00', ...engagementOverrides }]]),
    team: [],
    leads: new Map(),
    workpapers: new Map(),
    reviews: new Map(),
    decisions: [],
    tasks: new Map(),
    outbox: [],
    events: [],
    commercial: new Map(),
    accountingStatus: new Map(),
  };
  function apply(sql, p) {
    if (sql.includes('INSERT INTO auditflow_engagement_team')) {
      const existing = state.team.find((m) => m.engagement_id === p[0] && m.role === p[1] && m.actor_id === p[2]);
      const row = { engagement_id: p[0], role: p[1], actor_id: p[2], actor_name: p[3], planned_hours: p[4], start_date: p[5], end_date: p[6], responsibility: p[7] };
      if (existing) Object.assign(existing, row);
      else state.team.push(row);
    }
    else if (sql.includes('UPDATE auditflow_workpapers SET state')) { const w = state.workpapers.get(p[0]); if (w) w.state = p[1]; }
    else if (sql.includes('INSERT INTO auditflow_workpapers')) state.workpapers.set(p[0], { workpaper_id: p[0], engagement_id: p[1], state: 'SUBMITTED', submitted_by: p[5] });
    else if (sql.includes('INSERT INTO auditflow_tasks')) state.tasks.set(p[0], { task_id: p[0], engagement_id: p[1], assignee_role: p[3], title: p[4], state: p[5] });
    else if (sql.includes('UPDATE auditflow_tasks SET state')) { const key = p.length > 1 ? p[1] : p[0]; const t = state.tasks.get(key); if (t) t.state = 'COMPLETE'; }
    else if (sql.includes('INSERT INTO auditflow_outbox')) state.outbox.push({ message_id: p[0], engagement_id: p[1], channel: p[2], subject: p.length > 4 ? p[4] : (sql.match(/'([^']*Notice[^']*)'/) || [])[1] || '', state: p.length > 4 ? p[7] : 'QUEUED_SIMULATION' });
    else if (sql.includes('INSERT INTO auditflow_events')) state.events.push({ engagement_id: p[1], action: p[3], object_id: p[5] });
    else if (sql.includes('INSERT INTO auditflow_leads')) state.leads.set(p[0], { lead_id: p[0], name: p[1], company: p[2], status: p[9] || 'PENDING' });
    else if (sql.includes("UPDATE auditflow_leads SET status = 'QUALIFIED'")) { const l = state.leads.get(p[0]); if (l) l.status = 'QUALIFIED'; }
    else if (sql.includes('UPDATE auditflow_engagement_state')) { const r = state.engagements.get(p[0]); if (r) { r.revision += 1; if (sql.includes('audit_commenced')) { r.audit_commenced = 1; } } }
  }
  function one(sql, p) {
    if (sql.includes('COUNT(*)')) {
      if (sql.includes('FROM auditflow_workpapers')) return { n: [...state.workpapers.values()].filter((w) => w.engagement_id === p[0] && isWorkpaperSubmitted(w)).length };
      if (sql.includes('FROM auditflow_review_points')) return { n: [...state.reviews.values()].filter((r) => r.engagement_id === p[0] && r.state === 'OPEN').length };
      return { n: 0 };
    }
    if (sql.includes('FROM auditflow_demo_sessions')) return state.sessions.get(p[0]) || null;
    if (sql.includes('FROM auditflow_engagement_state')) return state.engagements.get(p[0]) || null;
    if (sql.includes('FROM auditflow_workpapers')) return state.workpapers.get(p[0]) || null;
    if (sql.includes('FROM auditflow_leads')) return state.leads.get(p[0]) || null;
    if (sql.includes('FROM auditflow_commercial')) return state.commercial.get(p[0]) || null;
    if (sql.includes('FROM auditflow_accounting_status')) return state.accountingStatus.get(p[0]) || null;
    if (sql.includes('FROM auditflow_decisions')) return [...state.decisions].reverse().find((d) => d.type === p[1]) || null;
    return null;
  }
  function all(sql, p) {
    if (sql.includes('FROM auditflow_engagement_team')) return { results: state.team.filter((m) => m.engagement_id === p[0]) };
    if (sql.includes('FROM auditflow_workpapers')) return { results: [...state.workpapers.values()].filter((w) => w.engagement_id === p[0]).map((w) => ({ workpaper_id: w.workpaper_id, state: w.state })) };
    return { results: [] };
  }
  const db = {
    prepare(sql) {
      const bound = (...params) => ({
        async run() { apply(sql, params); return { success: true }; },
        async first() { return one(sql, params); },
        async all() { return all(sql, params); },
      });
      return { bind: (...params) => bound(...params), async run() { apply(sql, []); return { success: true }; }, async first() { return one(sql, []); }, async all() { return all(sql, []); } };
    },
  };
  return { state, db };
}

export function envFor(fake) {
  return { DB: fake.db, SHARED_DEMO_ENABLED: 'true', SHARED_DEMO_IDENTITY_MODE: 'cloudflare-access-verified', SHARED_DEMO_BINDING: 'isolated-non-production', ALLOW_DEMO_WRITES: 'true' };
}

export function sidFor(fake, persona, sid) {
  fake.state.sessions.set(sid, { session_id: sid, persona_id: persona, actor_id: DEMO_PERSONA_ACTORS[persona], expires_at: '2099-01-01 00:00:00' });
  return sid;
}

export function act(sid, body, eng = DEMO_ENGAGEMENT_ID) {
  return new Request(`https://ste.quadrate.lk/api/engagements/${eng}/actions`, { method: 'POST', headers: { ...TRUSTED_HEADERS, Cookie: `auditflow_demo_session=${sid}` }, body: JSON.stringify(body) });
}

export function seedCommencementReady(fake) {
  // acceptance ACCEPT + commercial EL ACCEPTED so only staffing gates remain
  fake.state.decisions.push({ type: 'ACCEPTANCE', decision: 'ACCEPT' });
  fake.state.commercial.set(DEMO_ENGAGEMENT_ID, { engagement_id: DEMO_ENGAGEMENT_ID, el_state: 'ACCEPTED', advance_required: '0.00', advance_state: 'NOT_REQUIRED' });
}
