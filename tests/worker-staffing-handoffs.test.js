// P8A/P8B — focused Worker coverage for:
//   * strict staffing validation at ASSIGN_ENGAGEMENT_TEAM (role/actor/hours/dates)
//   * the START_AUDIT commencement staffing profile (no more preparer-only hole)
//   * the senior-review gate before manager completion
//   * SENIOR_REVIEWED workpapers still counting as submitted
//   * P4 automatic next-owner task handoffs
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const TRUSTED = {
  'Cf-Access-Jwt-Assertion': 'synthetic-jwt',
  'Cf-Access-Authenticated-User-Email': 'demo@quadrate.demo',
  'Content-Type': 'application/json',
};
const ACTOR = {
  'admin-demo': 'ACT-MAYA',
  'partner-demo': 'ACT-PARTNER',
  'audit-senior-demo': 'ACT-OMAR-SENIOR',
  'audit-manager-demo': 'ACT-OMAR',
  'preparer-demo': 'ACT-JUNIOR',
  'eqr-demo': 'ACT-YUSUF',
  'finance-demo': 'ACT-AISHA',
};
const ENG = 'ENG-0018-AUD-2026';

function makeFakeDb() {
  const state = {
    sessions: new Map(),
    engagements: new Map([[ENG, { engagement_id: ENG, client_id: 'CLI-0018', service: 'AUDIT', period: 'FY2026', revision: 1, current_stage: 'STAGE-03', g_status: '{}', generation_id: 'gen-seed-01', audit_commenced: 0, updated_at: '2026-09-14 00:00:00' }]]),
    team: [],
    leads: new Map(),
    workpapers: new Map(),
    reviews: new Map(),
    decisions: [],
    tasks: new Map(),
    outbox: [],
    events: [],
    commercial: new Map(),
  };
  function apply(sql, p) {
    if (sql.includes('INSERT INTO auditflow_engagement_team')) {
      const existing = state.team.find((m) => m.engagement_id === p[0] && m.role === p[1] && m.actor_id === p[2]);
      const row = { engagement_id: p[0], role: p[1], actor_id: p[2], actor_name: p[3], planned_hours: p[4], start_date: p[5], end_date: p[6], responsibility: p[7] };
      if (existing) Object.assign(existing, row);
      else state.team.push(row);
    }
    else if (sql.includes("UPDATE auditflow_workpapers SET state = 'SENIOR_REVIEWED'")) { const w = state.workpapers.get(p[0]); if (w) w.state = 'SENIOR_REVIEWED'; }
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
      if (sql.includes('FROM auditflow_workpapers')) return { n: [...state.workpapers.values()].filter((w) => w.engagement_id === p[0] && ['SUBMITTED', 'SENIOR_REVIEWED'].includes(w.state)).length };
      if (sql.includes('FROM auditflow_review_points')) return { n: [...state.reviews.values()].filter((r) => r.engagement_id === p[0] && r.state === 'OPEN').length };
      return { n: 0 };
    }
    if (sql.includes('FROM auditflow_demo_sessions')) return state.sessions.get(p[0]) || null;
    if (sql.includes('FROM auditflow_engagement_state')) return state.engagements.get(p[0]) || null;
    if (sql.includes('FROM auditflow_workpapers')) return state.workpapers.get(p[0]) || null;
    if (sql.includes('FROM auditflow_leads')) return state.leads.get(p[0]) || null;
    if (sql.includes('FROM auditflow_commercial')) return state.commercial.get(p[0]) || null;
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

const envFor = (fake) => ({ DB: fake.db, SHARED_DEMO_ENABLED: 'true', SHARED_DEMO_IDENTITY_MODE: 'cloudflare-access-verified', SHARED_DEMO_BINDING: 'isolated-non-production', ALLOW_DEMO_WRITES: 'true' });
function sidFor(fake, persona, sid) {
  fake.state.sessions.set(sid, { session_id: sid, persona_id: persona, actor_id: ACTOR[persona], expires_at: '2099-01-01 00:00:00' });
  return sid;
}
const act = (sid, body, eng = ENG) => new Request(`https://ste.quadrate.lk/api/engagements/${eng}/actions`, { method: 'POST', headers: { ...TRUSTED, Cookie: `auditflow_demo_session=${sid}` }, body: JSON.stringify(body) });

function seedCommencementReady(fake) {
  // acceptance ACCEPT + commercial EL ACCEPTED so only staffing gates remain
  fake.state.decisions.push({ type: 'ACCEPTANCE', decision: 'ACCEPT' });
  fake.state.commercial.set(ENG, { engagement_id: ENG, el_state: 'ACCEPTED', advance_required: '0.00', advance_state: 'NOT_REQUIRED' });
}

test('ASSIGN_ENGAGEMENT_TEAM enforces actor role matrix, hours and dates', async () => {
  const fake = makeFakeDb();
  const partner = sidFor(fake, 'partner-demo', 'sess-p8-staff-00000001');
  const env = envFor(fake);

  const roleMismatch = await worker.fetch(act(partner, { action: 'ASSIGN_ENGAGEMENT_TEAM', assignments: [{ role: 'audit_senior', actorId: 'ACT-JUNIOR', plannedHours: '40' }] }), env);
  assert.equal(roleMismatch.status, 409);
  assert.equal((await roleMismatch.json()).error.code, 'ACTOR_ROLE_MISMATCH');

  const notFound = await worker.fetch(act(partner, { action: 'ASSIGN_ENGAGEMENT_TEAM', assignments: [{ role: 'preparer', actorId: 'ACT-GHOST' }] }), env);
  assert.equal((await notFound.json()).error.code, 'ACTOR_NOT_FOUND');

  const badRole = await worker.fetch(act(partner, { action: 'ASSIGN_ENGAGEMENT_TEAM', assignments: [{ role: 'wizard', actorId: 'ACT-JUNIOR' }] }), env);
  assert.equal((await badRole.json()).error.code, 'INVALID_ROLE');

  const badHours = await worker.fetch(act(partner, { action: 'ASSIGN_ENGAGEMENT_TEAM', assignments: [{ role: 'preparer', actorId: 'ACT-JUNIOR', plannedHours: 'forty' }] }), env);
  assert.equal((await badHours.json()).error.code, 'HOURS_INVALID');

  const badDates = await worker.fetch(act(partner, { action: 'ASSIGN_ENGAGEMENT_TEAM', assignments: [{ role: 'preparer', actorId: 'ACT-JUNIOR', startDate: '2026-12-01', endDate: '2026-01-01' }] }), env);
  assert.equal((await badDates.json()).error.code, 'DATE_RANGE_INVALID');

  // Nothing written on any failure (no partial writes).
  assert.equal(fake.state.team.length, 0);

  const valid = await worker.fetch(act(partner, {
    action: 'ASSIGN_ENGAGEMENT_TEAM',
    assignments: [
      { role: 'engagement_partner', actorId: 'ACT-PARTNER', plannedHours: '12' },
      { role: 'audit_manager', actorId: 'ACT-OMAR', plannedHours: '30' },
      { role: 'audit_senior', actorId: 'ACT-OMAR-SENIOR', plannedHours: '40' },
      { role: 'preparer', actorId: 'ACT-JUNIOR', plannedHours: '60', startDate: '2026-10-01', endDate: '2026-12-15' },
    ],
  }), env);
  assert.equal(valid.status, 201);
  assert.equal(fake.state.team.length, 4);
});

test('START_AUDIT rejects a preparer-only team with the full blocker profile', async () => {
  const fake = makeFakeDb();
  seedCommencementReady(fake);
  const partner = sidFor(fake, 'partner-demo', 'sess-p8-start-00000001');
  const env = envFor(fake);
  await worker.fetch(act(partner, { action: 'ASSIGN_ENGAGEMENT_TEAM', assignments: [{ role: 'preparer', actorId: 'ACT-JUNIOR' }] }), env);
  const blocked = await worker.fetch(act(partner, { action: 'START_AUDIT' }), env);
  assert.equal(blocked.status, 409);
  const body = await blocked.json();
  const codes = (body.blockers || []).map((b) => b.code);
  assert.ok(codes.includes('PARTNER_REQUIRED'));
  assert.ok(codes.includes('AUDIT_SENIOR_REQUIRED'));
  assert.ok(codes.includes('AUDIT_MANAGER_REQUIRED'));
  assert.ok(!codes.includes('PREPARER_REQUIRED'));
  assert.equal(fake.state.engagements.get(ENG).audit_commenced, 0);
});

test('START_AUDIT succeeds with the full staffing profile and opens fieldwork task', async () => {
  const fake = makeFakeDb();
  seedCommencementReady(fake);
  const partner = sidFor(fake, 'partner-demo', 'sess-p8-start-00000002');
  const env = envFor(fake);
  await worker.fetch(act(partner, {
    action: 'ASSIGN_ENGAGEMENT_TEAM',
    assignments: [
      { role: 'engagement_partner', actorId: 'ACT-PARTNER' },
      { role: 'audit_manager', actorId: 'ACT-OMAR' },
      { role: 'audit_senior', actorId: 'ACT-OMAR-SENIOR' },
      { role: 'preparer', actorId: 'ACT-JUNIOR' },
    ],
  }), env);
  const started = await worker.fetch(act(partner, { action: 'START_AUDIT' }), env);
  assert.equal(started.status, 201);
  assert.equal(fake.state.engagements.get(ENG).audit_commenced, 1);
  assert.equal(fake.state.tasks.get(`audit-fieldwork-${ENG}`)?.state, 'OPEN');
  assert.ok(fake.state.outbox.some((m) => m.subject === 'Audit Commencement Notice'));
});

test('manager completion requires senior review; SENIOR_REVIEWED still counts as submitted', async () => {
  const fake = makeFakeDb();
  const senior = sidFor(fake, 'audit-senior-demo', 'sess-p8-senior-00000001');
  const mgr = sidFor(fake, 'audit-manager-demo', 'sess-p8-mgr-0000000001');
  const prep = sidFor(fake, 'preparer-demo', 'sess-p8-prep-000000001');
  const env = envFor(fake);

  const wp = await worker.fetch(act(prep, { action: 'SUBMIT_WORKPAPER', procedureTitle: 'Revenue cut-off', evidenceReference: 'INV-1042', conclusion: 'No exception.' }), env);
  const workpaperId = (await wp.json()).workpaperId;
  // P4 handoff: submission opens the senior review task.
  assert.equal(fake.state.tasks.get(`wp-senior-review-${workpaperId}`)?.state, 'OPEN');

  const early = await worker.fetch(act(mgr, { action: 'RECORD_MANAGER_COMPLETION', decision: 'RECOMMEND_COMPLETE', rationale: 'Ready.' }), env);
  assert.equal(early.status, 409);
  assert.equal((await early.json()).error.code, 'SENIOR_REVIEW_REQUIRED');

  const review = await worker.fetch(act(senior, { action: 'RECORD_SENIOR_REVIEW', workpaperId }), env);
  assert.equal(review.status, 200);
  const reviewBody = await review.json();
  assert.equal(reviewBody.seniorReview.complete, true);
  // P4 handoff: completing the senior gate opens the manager completion task.
  assert.equal(fake.state.tasks.get(`manager-completion-${ENG}`)?.state, 'OPEN');
  assert.equal(fake.state.tasks.get(`wp-senior-review-${workpaperId}`)?.state, 'COMPLETE');

  // Zero raw SUBMITTED rows remain — the pre-fix NO_SUBMITTED_WORKPAPERS bug
  // would fire here. It must not.
  assert.equal([...fake.state.workpapers.values()].filter((w) => w.state === 'SUBMITTED').length, 0);
  const complete = await worker.fetch(act(mgr, { action: 'RECORD_MANAGER_COMPLETION', decision: 'RECOMMEND_COMPLETE', rationale: 'Senior review clear.' }), env);
  assert.equal(complete.status, 201);
  // P4 handoff: manager completion opens the partner review task.
  assert.equal(fake.state.tasks.get(`partner-review-${ENG}`)?.state, 'OPEN');
  assert.equal(fake.state.tasks.get(`manager-completion-${ENG}`)?.state, 'COMPLETE');
});

test('lead qualification opens a deterministic conversion task', async () => {
  const fake = makeFakeDb();
  const partner = sidFor(fake, 'partner-demo', 'sess-p8-lead-000000001');
  const env = envFor(fake);
  await worker.fetch(act(partner, { action: 'CREATE_LEAD', leadId: 'LEAD-P8-001', name: 'Rashid', company: 'Falcon Trading', email: 'rashid@falcon.demo' }), env, 'DEMO-LEADS');
  const qualified = await worker.fetch(act(partner, { action: 'QUALIFY_LEAD', leadId: 'LEAD-P8-001' }), env, 'DEMO-LEADS');
  assert.equal(qualified.status, 200);
  assert.equal(fake.state.tasks.get('lead-convert-LEAD-P8-001')?.state, 'OPEN');
});
