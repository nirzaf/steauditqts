import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { deriveProgressFromSnapshot, evaluateProgressGates } from '../worker/progress.js';

const TODAY = '2026-09-14';

function baseSnapshot(overrides = {}) {
  return {
    engagementId: 'ENG-0018-AUD-2026',
    cachedStage: 'STAGE-01',
    revision: 1,
    generationId: 'gen-test-01',
    hasClientProfile: false,
    decisions: {},
    commercial: null,
    credentialState: null,
    portalActivated: false,
    announcement: null,
    pbcRequests: [],
    pbcReceipts: [],
    tbSources: [],
    workpapers: [],
    reviewPoints: [],
    draftVersions: [],
    tasks: [],
    artifactCount: 0,
    publishedArtifactCount: 0,
    today: TODAY,
    ...overrides,
  };
}

function acceptedCommercial(overrides = {}) {
  return {
    estimateHours: '140',
    estimateCost: '26000.00',
    feeState: 'APPROVED',
    approvedFee: '36000.00',
    elVersion: 'EL-2026-01',
    elState: 'ACCEPTED',
    advanceState: 'VERIFIED',
    advanceReference: 'PAY-SIM-0018',
    invoiceState: 'DRAFT',
    invoiceId: '',
    commercialClose: 'OPEN',
    ...overrides,
  };
}

function fullFlowSnapshot() {
  return baseSnapshot({
    cachedStage: 'STAGE-08',
    hasClientProfile: true,
    assessment: { answered: 62, required: 62, verified: 62, holds: [], hardStops: 0, prohibitions: 0 },
    decisions: {
      ACCEPTANCE: { decision: 'ACCEPT', version: 'rev-1', by: 'ACT-PARTNER', at: '2026-09-01', generation: 1 },
      ENGAGEMENT_LETTER: { decision: 'ACCEPT', version: 'EL-2026-01', by: 'ACT-NADIA-MGMT', at: '2026-09-02', generation: 1 },
      DRAFT_FS: { decision: 'ACCEPT', version: 'v02', by: 'ACT-NADIA-MGMT', at: '2026-09-10', generation: 1 },
      MANAGER_COMPLETION: { decision: 'RECOMMEND_COMPLETE', version: 'rev-9', by: 'ACT-OMAR', at: '2026-09-10', generation: 1 },
      PARTNER_COMPLETION_REVIEW: { decision: 'APPROVE_FOR_OPINION', version: 'rev-10', by: 'ACT-PARTNER', at: '2026-09-11', generation: 1 },
      EQR: { decision: 'APPROVE', version: 'v02', by: 'ACT-YUSUF', at: '2026-09-11', generation: 1 },
      AUDIT_OPINION: { decision: 'UNMODIFIED', version: 'v02', by: 'ACT-PARTNER', at: '2026-09-12', generation: 1 },
      FINAL_CLIENT_DISCUSSION: { decision: 'RECORDED', version: '2026-09-13', by: 'ACT-PARTNER', at: '2026-09-13', generation: 1 },
      RELEASE: { decision: 'RELEASED', version: 'v02', by: 'ACT-PARTNER', at: '2026-09-13', generation: 1 },
    },
    finalDiscussion: { at: '2026-09-13' },
    accounting: { reconState: 'COMPLETE', openRecons: 0, journalState: 'COMPLETE', pendingJournals: 0, fsVersion: 'FS-v04', fsState: 'FINAL', mgmtApproval: 'ACCEPTED' },
    commercial: { ...acceptedCommercial(), invoiceState: 'ISSUED', invoiceId: 'INV-2026-0018', commercialClose: 'CLOSED' },
    credentialState: 'ACTIVATED',
    portalActivated: true,
    announcement: { id: 'ann-1', at: '2026-09-03' },
    pbcRequests: [{ id: 'PBC-1', state: 'ACCEPTED', dueDate: '2026-10-10' }],
    pbcReceipts: [{ id: 'R-1', requestId: 'PBC-1', state: 'ACCEPTED' }],
    pbcRequests: [{ id: 'PBC-1', state: 'ACCEPTED', dueDate: '2026-10-10' }],
    pbcReceipts: [{ id: 'R-1', requestId: 'PBC-1', state: 'ACCEPTED' }],
    tbSources: [{ version: 'v03', validationState: 'VALIDATED', mappingComplete: 1 }],
    workpapers: [{ id: 'WP-1', state: 'SUBMITTED' }],
    reviewPoints: [{ id: 'RP-1', state: 'CLEARED', severity: 'SIGNIFICANT' }],
    draftVersions: ['v01', 'v02'],
    artifactCount: 6,
    publishedArtifactCount: 5,
  });
}

function codes(list) {
  return list.map((entry) => entry.code);
}

test('fresh engagement derives STAGE-01 with client details as next action', () => {
  const progress = deriveProgressFromSnapshot(baseSnapshot());
  assert.equal(progress.valid, true);
  assert.equal(progress.currentStage, 'STAGE-01');
  assert.equal(progress.completionPercent, 0);
  assert.equal(progress.gates.total, 25);
  assert.equal(progress.nextAction.ownerRole, 'client_contributor');
  assert.equal(progress.nextAction.route, 'client-details');
  assert.deepEqual(progress.contradictions, []);
  assert.equal(progress.approvalSummary.advisoryPending, 0);
});

test('complete evidence derives STAGE-08 at 100% with no next action', () => {
  const progress = deriveProgressFromSnapshot(fullFlowSnapshot());
  assert.equal(progress.valid, true);
  assert.equal(progress.currentStage, 'STAGE-08');
  assert.equal(progress.completionPercent, 100);
  assert.equal(progress.nextAction, null);
  assert.deepEqual(progress.blockers, []);
  assert.equal(progress.stage.state, 'COMPLETE');
});

test('fee approval cannot precede client acceptance', () => {
  const progress = deriveProgressFromSnapshot(baseSnapshot({
    hasClientProfile: true,
    commercial: { ...acceptedCommercial(), elVersion: '', elState: 'DRAFT' },
  }));
  assert.ok(codes(progress.contradictions).includes('FEE_BEFORE_ACCEPTANCE'));
  assert.equal(progress.valid, false);
  const gate = progress.gateDetails.find((entry) => entry.id === 'fee-approval');
  assert.equal(gate.state, 'BLOCKED');
});

test('EL response cannot precede quote and EL issue', () => {
  const progress = deriveProgressFromSnapshot(baseSnapshot({
    hasClientProfile: true,
    decisions: { ENGAGEMENT_LETTER: { decision: 'ACCEPT', version: 'EL-2026-01', by: 'ACT-NADIA-MGMT', at: '2026-09-02' } },
  }));
  assert.ok(codes(progress.contradictions).includes('EL_RESPONSE_WITHOUT_ISSUE'));
  assert.equal(progress.valid, false);
});

test('temporary credential cannot precede advance verification', () => {
  const progress = deriveProgressFromSnapshot(baseSnapshot({
    hasClientProfile: true,
    decisions: { ACCEPTANCE: { decision: 'ACCEPT', version: 'rev-1', by: 'ACT-PARTNER', at: '2026-09-01' } },
    commercial: { ...acceptedCommercial(), advanceState: 'NOT_REQUIRED', advanceReference: '' },
    credentialState: 'ISSUED',
  }));
  assert.ok(codes(progress.contradictions).includes('CREDENTIAL_BEFORE_ADVANCE'));
  assert.equal(progress.valid, false);
});

test('announcement cannot skip acceptance and terms', () => {
  const progress = deriveProgressFromSnapshot(baseSnapshot({ announcement: { id: 'ann-1', at: '2026-09-03' } }));
  assert.ok(codes(progress.contradictions).includes('ANNOUNCEMENT_SKIPPED_PREREQUISITES'));
  assert.ok(progress.skippedStages.some((entry) => entry.stage === 'STAGE-01'));
  assert.equal(progress.valid, false);
});

test('PBC receipt for an unknown request is a contradiction', () => {
  const progress = deriveProgressFromSnapshot(baseSnapshot({
    announcement: { id: 'ann-1', at: '2026-09-03' },
    pbcRequests: [{ id: 'PBC-1', state: 'OPEN', dueDate: '2026-10-10' }],
    pbcReceipts: [{ id: 'R-9', requestId: 'PBC-NOPE', state: 'RECEIVED' }],
  }));
  assert.ok(codes(progress.contradictions).includes('ORPHAN_PBC_RECEIPT'));
  assert.equal(progress.valid, false);
});

test('overdue PBC requests resolve to an explicit overdue state', () => {
  const { gates } = evaluateProgressGates(baseSnapshot({
    announcement: { id: 'ann-1', at: '2026-09-03' },
    pbcRequests: [{ id: 'PBC-1', state: 'OPEN', dueDate: '2000-01-01' }],
    today: TODAY,
  }));
  assert.equal(gates.find((entry) => entry.id === 'pbc-readiness').state, 'OVERDUE');
});

test('partner opinion cannot bind to a stale FS version', () => {
  const progress = deriveProgressFromSnapshot(baseSnapshot({
    draftVersions: ['v01', 'v02'],
    decisions: {
      DRAFT_FS: { decision: 'ACCEPT', version: 'v02', by: 'ACT-NADIA-MGMT', at: '2026-09-10' },
      EQR: { decision: 'APPROVE', version: 'v02', by: 'ACT-YUSUF', at: '2026-09-11' },
      AUDIT_OPINION: { decision: 'UNMODIFIED', version: 'v01', by: 'ACT-PARTNER', at: '2026-09-12' },
    },
    tbSources: [{ version: 'v03', validationState: 'VALIDATED', mappingComplete: 1 }],
    workpapers: [{ id: 'WP-1', state: 'SUBMITTED' }],
  }));
  assert.ok(codes(progress.contradictions).includes('OPINION_STALE_VERSION'));
  assert.equal(progress.gateDetails.find((entry) => entry.id === 'opinion').state, 'BLOCKED');
  assert.equal(progress.valid, false);
});

test('opinion with open significant points is unsound, without EQR is a warning', () => {
  const unsound = deriveProgressFromSnapshot(baseSnapshot({
    draftVersions: ['v02'],
    decisions: {
      DRAFT_FS: { decision: 'ACCEPT', version: 'v02', by: 'ACT-NADIA-MGMT', at: '2026-09-10' },
      EQR: { decision: 'APPROVE', version: 'v02', by: 'ACT-YUSUF', at: '2026-09-11' },
      AUDIT_OPINION: { decision: 'UNMODIFIED', version: 'v02', by: 'ACT-PARTNER', at: '2026-09-12' },
    },
    tbSources: [{ version: 'v03', validationState: 'VALIDATED', mappingComplete: 1 }],
    workpapers: [{ id: 'WP-1', state: 'SUBMITTED' }],
    reviewPoints: [{ id: 'RP-2', state: 'OPEN', severity: 'SIGNIFICANT' }],
  }));
  assert.ok(codes(unsound.contradictions).includes('OPINION_WITH_OPEN_SIGNIFICANT_POINTS'));
  assert.equal(unsound.valid, false);

  const early = deriveProgressFromSnapshot(baseSnapshot({
    draftVersions: ['v02'],
    assessment: { answered: 62, required: 62, verified: 62, holds: [], hardStops: 0, prohibitions: 0 },
    decisions: {
      DRAFT_FS: { decision: 'ACCEPT', version: 'v02', by: 'ACT-NADIA-MGMT', at: '2026-09-10', generation: 1 },
      MANAGER_COMPLETION: { decision: 'RECOMMEND_COMPLETE', version: 'rev-9', by: 'ACT-OMAR', at: '2026-09-10', generation: 1 },
      PARTNER_COMPLETION_REVIEW: { decision: 'APPROVE_FOR_OPINION', version: 'rev-10', by: 'ACT-PARTNER', at: '2026-09-11', generation: 1 },
      AUDIT_OPINION: { decision: 'UNMODIFIED', version: 'v02', by: 'ACT-PARTNER', at: '2026-09-12', generation: 1 },
    },
    pbcRequests: [{ id: 'PBC-1', state: 'ACCEPTED', dueDate: '2026-10-10' }],
    tbSources: [{ version: 'v03', validationState: 'VALIDATED', mappingComplete: 1 }],
    workpapers: [{ id: 'WP-1', state: 'SUBMITTED' }],
  }));
  assert.ok(!codes(early.contradictions).includes('OPINION_BEFORE_EQR'));
  assert.ok(codes(early.warnings).includes('OPINION_BEFORE_EQR'));
  assert.equal(early.gateDetails.find((entry) => entry.id === 'opinion').state, 'APPROVED');
});

test('release requires opinion, EQR and cleared significant points', () => {
  const noEqr = deriveProgressFromSnapshot(baseSnapshot({
    draftVersions: ['v02'],
    decisions: {
      DRAFT_FS: { decision: 'ACCEPT', version: 'v02', by: 'ACT-NADIA-MGMT', at: '2026-09-10' },
      AUDIT_OPINION: { decision: 'UNMODIFIED', version: 'v02', by: 'ACT-PARTNER', at: '2026-09-12' },
      RELEASE: { decision: 'RELEASED', version: 'v02', by: 'ACT-PARTNER', at: '2026-09-13' },
    },
    tbSources: [{ version: 'v03', validationState: 'VALIDATED', mappingComplete: 1 }],
    workpapers: [{ id: 'WP-1', state: 'SUBMITTED' }],
  }));
  assert.ok(codes(noEqr.contradictions).includes('RELEASE_WITHOUT_EQR'));

  const openPoints = deriveProgressFromSnapshot(baseSnapshot({
    draftVersions: ['v02'],
    decisions: {
      DRAFT_FS: { decision: 'ACCEPT', version: 'v02', by: 'ACT-NADIA-MGMT', at: '2026-09-10' },
      EQR: { decision: 'APPROVE', version: 'v02', by: 'ACT-YUSUF', at: '2026-09-11' },
      AUDIT_OPINION: { decision: 'UNMODIFIED', version: 'v02', by: 'ACT-PARTNER', at: '2026-09-12' },
      RELEASE: { decision: 'RELEASED', version: 'v02', by: 'ACT-PARTNER', at: '2026-09-13' },
    },
    tbSources: [{ version: 'v03', validationState: 'VALIDATED', mappingComplete: 1 }],
    workpapers: [{ id: 'WP-1', state: 'SUBMITTED' }],
    reviewPoints: [{ id: 'RP-2', state: 'OPEN', severity: 'SIGNIFICANT' }],
  }));
  assert.ok(codes(openPoints.contradictions).includes('RELEASE_WITH_OPEN_SIGNIFICANT_POINTS'));
  assert.equal(openPoints.valid, false);
});

test('invoice cannot precede release and close cannot precede invoice', () => {
  const earlyInvoice = deriveProgressFromSnapshot(baseSnapshot({
    commercial: { ...acceptedCommercial(), invoiceState: 'ISSUED', invoiceId: 'INV-2026-0018' },
  }));
  assert.ok(codes(earlyInvoice.contradictions).includes('INVOICE_BEFORE_RELEASE'));

  const earlyClose = deriveProgressFromSnapshot(baseSnapshot({
    commercial: { ...acceptedCommercial(), commercialClose: 'CLOSED' },
  }));
  assert.ok(codes(earlyClose.contradictions).includes('CLOSE_BEFORE_INVOICE'));
  assert.equal(earlyClose.valid, false);
});

test('EQR return blocks and EL rejection blocks with explicit owners', () => {
  const eqrHold = deriveProgressFromSnapshot(baseSnapshot({
    draftVersions: ['v02'],
    decisions: {
      DRAFT_FS: { decision: 'ACCEPT', version: 'v02', by: 'ACT-NADIA-MGMT', at: '2026-09-10' },
      EQR: { decision: 'HOLD', version: 'v02', by: 'ACT-YUSUF', at: '2026-09-11' },
    },
    workpapers: [{ id: 'WP-1', state: 'SUBMITTED' }],
    tbSources: [{ version: 'v03', validationState: 'VALIDATED', mappingComplete: 1 }],
  }));
  assert.equal(eqrHold.gateDetails.find((entry) => entry.id === 'eqr').state, 'BLOCKED');
  assert.equal(eqrHold.valid, false);

  const elReject = deriveProgressFromSnapshot(baseSnapshot({
    hasClientProfile: true,
    decisions: {
      ACCEPTANCE: { decision: 'ACCEPT', version: 'rev-1', by: 'ACT-PARTNER', at: '2026-09-01' },
      ENGAGEMENT_LETTER: { decision: 'REJECT', version: 'EL-2026-01', by: 'ACT-NADIA-MGMT', at: '2026-09-02' },
    },
    commercial: { ...acceptedCommercial(), elState: 'REJECTED' },
  }));
  assert.equal(elReject.gateDetails.find((entry) => entry.id === 'el-decision').state, 'REJECTED');
  assert.equal(elReject.valid, false);
});

test('cached current_stage ahead of evidence is reported as drift, not authority', () => {
  const progress = deriveProgressFromSnapshot(baseSnapshot({
    cachedStage: 'STAGE-07',
    hasClientProfile: true,
    decisions: { ACCEPTANCE: { decision: 'ACCEPT', version: 'rev-1', by: 'ACT-PARTNER', at: '2026-09-01' } },
  }));
  assert.equal(progress.currentStage, 'STAGE-01');
  assert.equal(progress.cachedStage, 'STAGE-07');
  assert.equal(progress.stageDrift, true);
  assert.ok(codes(progress.warnings).includes('CACHED_STAGE_AHEAD'));
});

test('stage states are expressive and later stages wait their turn', () => {
  const progress = deriveProgressFromSnapshot(baseSnapshot({
    hasClientProfile: true,
    assessment: { answered: 62, required: 62, verified: 62, holds: [], hardStops: 0, prohibitions: 0 },
    decisions: { ACCEPTANCE: { decision: 'ACCEPT', version: 'rev-1', by: 'ACT-PARTNER', at: '2026-09-01' } },
    commercial: { ...acceptedCommercial(), feeState: 'DRAFT', approvedFee: '0.00', elVersion: '', elState: 'DRAFT', advanceState: 'NOT_REQUIRED', advanceReference: '' },
  }));
  const byId = Object.fromEntries(progress.stages.map((entry) => [entry.id, entry.state]));
  assert.equal(byId['STAGE-01'], 'COMPLETE');
  assert.equal(byId['STAGE-02'], 'WAITING_FOR_PARTNER');
  assert.equal(byId['STAGE-05'], 'NOT_STARTED');
  assert.equal(progress.currentStage, 'STAGE-02');
  assert.equal(progress.nextOwner, 'Audit Partner');
});

const progressHeaders = {
  'Cf-Access-Jwt-Assertion': 'synthetic-jwt',
  'Cf-Access-Authenticated-User-Email': 'maya@quadrate.demo',
  'Content-Type': 'application/json',
};

function progressEnv(sessionRow) {
  const engagementRow = {
    engagement_id: 'ENG-0018-AUD-2026', client_id: 'CLI-0018', service: 'AUDIT', period: 'FY2026',
    revision: 1, current_stage: 'STAGE-01', g_status: '{}', generation_id: 'gen-seed-01', updated_at: '2026-09-14 00:00:00',
  };
  return {
    DB: {
      prepare(sql) {
        const text = String(sql);
        return {
          bind(...params) {
            return {
              async run() { return { success: true }; },
              async first() {
                if (text.includes('FROM auditflow_demo_sessions')) return sessionRow;
                if (text.includes('FROM auditflow_engagement_state')) return engagementRow;
                return null;
              },
              async all() { return { results: [] }; },
            };
          },
        };
      },
    },
    SHARED_DEMO_ENABLED: 'true',
    SHARED_DEMO_IDENTITY_MODE: 'cloudflare-access-verified',
    SHARED_DEMO_BINDING: 'isolated-non-production',
    ALLOW_DEMO_WRITES: 'true',
  };
}

test('GET /api/engagements/:id/progress requires a session and scope', async () => {
  const noSession = await worker.fetch(
    new Request('https://ste.quadrate.lk/api/engagements/ENG-0018-AUD-2026/progress', { headers: progressHeaders }),
    progressEnv(null),
  );
  assert.equal(noSession.status, 401);

  const seniorEnv = progressEnv({ session_id: 'sess-senior-0000000001', persona_id: 'audit-senior-demo', actor_id: 'ACT-OMAR-SENIOR', expires_at: '2099-01-01 00:00:00' });
  const denied = await worker.fetch(
    new Request('https://ste.quadrate.lk/api/engagements/ENG-0009-ACC-2026/progress', { headers: { ...progressHeaders, Cookie: 'auditflow_demo_session=sess-senior-0000000001' } }),
    seniorEnv,
  );
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).error.code, 'SCOPE_DENIED');
});

test('GET /api/engagements/:id/progress derives stage, gates and blockers from D1', async () => {
  const env = progressEnv({ session_id: 'sess-partner-00000001', persona_id: 'partner-demo', actor_id: 'ACT-PARTNER', expires_at: '2099-01-01 00:00:00' });
  const res = await worker.fetch(
    new Request('https://ste.quadrate.lk/api/engagements/ENG-0018-AUD-2026/progress', { headers: { ...progressHeaders, Cookie: 'auditflow_demo_session=sess-partner-00000001' } }),
    env,
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.evidenceLevel, 'SIMULATION');
  const progress = body.progress;
  assert.equal(progress.engagementId, 'ENG-0018-AUD-2026');
  assert.equal(progress.derivedFrom, 'd1');
  assert.equal(progress.valid, true);
  assert.equal(progress.currentStage, 'STAGE-01');
  assert.equal(progress.cachedStage, 'STAGE-01');
  assert.equal(progress.stageDrift, false);
  assert.equal(progress.gates.total, 25);
  assert.ok(Array.isArray(progress.stages) && progress.stages.length === 8);
  assert.ok(Array.isArray(progress.gateDetails) && progress.gateDetails.length === 25);
  assert.ok(progress.nextAction && progress.nextAction.ownerRole === 'client_contributor');
  assert.equal(progress.revision, 1);
  assert.equal(progress.generationId, 'gen-seed-01');
});
