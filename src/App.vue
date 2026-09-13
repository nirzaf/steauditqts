<script setup>
import { computed, ref } from 'vue'

const money = (value) => new Intl.NumberFormat('en-QA', {
  style: 'currency',
  currency: 'QAR',
  maximumFractionDigits: 0,
}).format(value)

const milestones = [
  {
    short: 'Continuance', time: 'Step 1', name: 'Renewal opens', state: 'done', kicker: 'Annual revalidation', status: 'review', statusText: 'Review in progress',
    title: 'Current facts are refreshed; last year is a reference, not an approval.',
    narrative: 'A new shareholder and a new accounting system trigger fresh verification. Prior late bank reconciliations remain active risk inputs.',
    overview: { heading: 'The relationship can be reviewed, but work has not started.', copy: 'The platform opens a new assessment with 30 annual revalidation questions. It carries forward reference facts and open actions only; it does not copy samples, conclusions, or signatures.', metrics: [['30', 'annual questions', 'Current-year answers required'], ['2', 'changed facts', 'Shareholder and accounting system'], ['1', 'prior issue', 'Late bank reconciliations']], path: [['Prior file', 'Reference only'], ['Change review', 'New evidence'], ['Partner decision', 'Required'], ['Terms', 'Before work starts']] },
    evidence: ['RV-002 ownership change requires new verification', 'RV-011 system change updates audit data-risk assessment', 'No current-year sign-off has been inherited'], gates: { G1: 'review', G2: 'block', G3: 'block', G4: 'block', G5: 'block', G6: 'block', G7: 'block', G8: 'block', G9: 'block' },
  },
  {
    short: 'Authorization', time: 'Step 5', name: 'Terms authorize work', state: 'done', kicker: 'Engagement authorization', status: 'pass', statusText: 'Work activated',
    title: 'Acceptance, independence, capacity, and current terms now align.',
    narrative: 'The engagement partner records continuance and the authorized terms activate the work. Planning can begin while accounting data is still being requested.',
    overview: { heading: 'The service route is explicit.', copy: 'This scenario uses an independent audit firm. The accountant prepares the accounting package; the auditor controls the audit file and its conclusions.', metrics: [['G1', 'continuance', 'Partner approved'], ['G2', 'terms & team', 'Authorized'], ['2', 'parallel tracks', 'Accounting and audit']], path: [['Clearances', 'Independence & capacity'], ['Terms', 'Current period'], ['Workspace', 'Roles & scope'], ['Kickoff', 'Owners & dates']] },
    evidence: ['Accounting preparation and audit responsibility remain separate', 'PBC owners, deadlines, and escalation route are defined', 'Audit planning is allowed before the final FS package'], gates: { G1: 'pass', G2: 'pass', G3: 'review', G4: 'block', G5: 'review', G6: 'block', G7: 'block', G8: 'block', G9: 'block' },
  },
  {
    short: 'Data intake', time: 'Step 8', name: 'TB v02 validated', state: 'done', kicker: 'Accounting data', status: 'pass', statusText: 'Data usable',
    title: 'A reconciled replacement trial balance passes the data gate.',
    narrative: 'The first upload held an unexplained opening-equity difference. The corrected TB v02 is retained as a new raw version, linked to the prior upload and validated before use.',
    overview: { heading: 'A balanced TB is a data control, not an audit conclusion.', copy: 'The example fixture has 14 accounts. Debit and credit control totals both equal QAR 1,820,000; the signed balance is zero.', metrics: [['14', 'accounts', 'Leading-zero codes preserved'], [money(1820000), 'debits / credits', 'Control total'], ['0', 'signed-balance sum', 'No balancing plug']], path: [['Original upload', 'Preserved'], ['Schema checks', 'Passed'], ['Balance control', 'Passed'], ['TB v02', 'Processing-ready']] },
    evidence: ['Original file and source context remain unchanged', 'Preliminary versus final status is explicit', 'Rejected v01 cannot become the release base'], gates: { G1: 'pass', G2: 'pass', G3: 'pass', G4: 'review', G5: 'review', G6: 'block', G7: 'block', G8: 'block', G9: 'block' },
  },
  {
    short: 'Adjustment', time: 'Step 11', name: 'Source reflects AJ-001', state: 'active', kicker: 'Accounting package', status: 'pass', statusText: 'Control passed',
    title: 'Revised source is reconciled without double counting.',
    narrative: 'The accountant’s replacement TB already includes AJ-001. The application records the bridge, marks the adjustment reflected in source, and keeps the pre-adjustment import intact.',
    overview: { heading: 'AJ-001 changes depreciation once — not twice.', copy: 'AJ-001 debits depreciation expense and credits accumulated depreciation by QAR 5,000. The updated TB proves the entry is already reflected in source.', metrics: [[money(175000), 'current profit', 'After AJ-001'], [money(745000), 'total assets', 'After AJ-001'], [money(475000), 'total equity', 'Assets = liabilities + equity']], path: [['TB v02', 'Raw source'], ['AJ-001', 'QAR 5,000'], ['Source bridge', 'Entry reflected'], ['TB v03', 'Adjusted package']] },
    evidence: ['AJ-001 has an idempotent application key', 'Raw TB v02 and revised TB v03 are both retained', 'Prior approvals would become stale if signed against v02'], gates: { G1: 'pass', G2: 'pass', G3: 'pass', G4: 'pass', G5: 'pass', G6: 'review', G7: 'block', G8: 'block', G9: 'block' },
  },
  {
    short: 'Fieldwork', time: 'Step 15', name: 'Evidence conflict', state: 'attention', kicker: 'Audit execution', status: 'review', statusText: 'Further work required',
    title: 'One receivables sample item has contradictory evidence.',
    narrative: 'The exception is retained and assigned for follow-up. The item cannot be silently replaced with an easier selection, and PBC receipt is not treated as sufficient audit evidence.',
    overview: { heading: 'Evidence is assessed, not just uploaded.', copy: 'The receivables population reconciles to TB v03. Sample item AR-019 has a disputed balance after year end, so the team performs additional work and records the conclusion.', metrics: [['AR-019', 'selected item', 'Evidence conflict'], [money(300000), 'AR population', 'Reconciled to TB v03'], ['1', 'open exception', 'Blocks area conclusion']], path: [['Receivables risk', 'Valuation'], ['Population', 'Reconciled'], ['Sample AR-019', 'Selected'], ['Exception', 'Follow-up required']] },
    evidence: ['Sample plan is linked to materiality and population version', 'Original selection is preserved', 'Exception requires alternative work or a supported conclusion'], gates: { G1: 'pass', G2: 'pass', G3: 'pass', G4: 'pass', G5: 'pass', G6: 'review', G7: 'block', G8: 'block', G9: 'block' },
  },
  {
    short: 'Re-review', time: 'Step 17', name: 'Approvals go stale', state: 'attention', kicker: 'Version control', status: 'review', statusText: 'Re-approval required',
    title: 'A final impairment correction creates a new package and re-review.',
    narrative: 'When management accepts the auditor’s proposed correction, the system produces a new TB and FS version. Existing approvals remain historical, but cannot authorize the new release.',
    overview: { heading: 'No release can borrow approval from an earlier version.', copy: 'A version graph links the final package to its raw source, mappings, adjustment set, disclosures, evidence, and signatures. Changed dependencies automatically create impact-review tasks.', metrics: [['TB v04', 'new source package', 'Revised after correction'], ['FS v05', 'financial statements', 'Needs management approval'], ['3', 'stale approvals', 'Impact review created']], path: [['New journal', 'Accepted'], ['New TB / FS', 'Generated'], ['Affected approvals', 'Marked stale'], ['Re-review', 'Required']] },
    evidence: ['Approvals bind object, version, scope, role, and dependencies', 'Release verifies dependency state atomically', 'Prior approved FS version is preserved as history'], gates: { G1: 'pass', G2: 'pass', G3: 'pass', G4: 'pass', G5: 'pass', G6: 'pass', G7: 'review', G8: 'block', G9: 'block' },
  },
  {
    short: 'Completion', time: 'Step 22', name: 'EQR completes', state: 'done', kicker: 'Report-dating gate', status: 'pass', statusText: 'Ready for release',
    title: 'The final package is complete for its exact version.',
    narrative: 'Management responsibility, representations, partner completion, and the required engagement quality review are all recorded for the same final package.',
    overview: { heading: 'A report date is a conclusion gate, not a progress label.', copy: 'The partner confirms evidence, risks, misstatements, final FS, required communications, signatory authority, and EQR completion. A modified opinion remains possible where the supported conclusion requires it.', metrics: [['FS v05', 'final statements', 'Management approved'], ['EQR', 'quality review', 'Completed before dating'], ['0', 'stale approvals', 'Release dependency check']], path: [['Final FS', 'Exact version'], ['Representations', 'Current'], ['Partner review', 'Complete'], ['EQR', 'Complete']] },
    evidence: ['EQR is independent of the engagement team', 'No unresolved substantive issuance blocker remains', 'Report references, entity, period, and attachment match FS v05'], gates: { G1: 'pass', G2: 'pass', G3: 'pass', G4: 'pass', G5: 'pass', G6: 'pass', G7: 'pass', G8: 'review', G9: 'block' },
  },
  {
    short: 'Release & archive', time: 'Step 24', name: 'Package locked', state: 'done', kicker: 'Release and records', status: 'pass', statusText: 'Issued & archived',
    title: 'The matched report and final statements are released, then locked.',
    narrative: 'The authorized signatory releases the exact report/FS package to approved recipients. The file is then assembled, indexed, locked, and retained with a controlled amendment path.',
    overview: { heading: 'Release and archive are separate controls.', copy: 'Issuance freezes the deliverable. Assembly completes the archive manifest and retention profile; it does not permit missing substantive work or silent replacement of the issued report.', metrics: [['REL-026', 'release event', 'Recipients checked'], ['9', 'archive sections', 'Indexed'], ['LOCKED', 'file state', 'Controlled amendments only']], path: [['Release', 'Matched package'], ['Delivery log', 'Recipients'], ['Assembly', 'Manifest'], ['Archive', 'Locked']] },
    evidence: ['Issued package hashes and delivery event are retained', 'Client export excludes internal working papers by default', 'Next-year continuance is scheduled, not automatically approved'], gates: { G1: 'pass', G2: 'pass', G3: 'pass', G4: 'pass', G5: 'pass', G6: 'pass', G7: 'pass', G8: 'pass', G9: 'pass' },
  },
]

const gateInfo = {
  G1: ['Client/service accepted', 'Partner decision & required clearances'],
  G2: ['Engagement authorized', 'Terms, team, access, and dates'],
  G3: ['Accounting data usable', 'Validated source and mapping controls'],
  G4: ['Draft package reviewed', 'Statements, reconciliations, and journals'],
  G5: ['Audit plan approved', 'Risks, materiality, and procedures'],
  G6: ['Audit conclusions complete', 'Evidence, exceptions, and evaluation'],
  G7: ['Final package approved', 'Management, partner, and EQR where required'],
  G8: ['Release authorized', 'Matched report, package, and recipients'],
  G9: ['Archive complete', 'Index, lock, retention, and manifest'],
}

const current = ref(3)
const panel = ref('overview')
const scene = computed(() => milestones[current.value])
const adjusted = computed(() => current.value >= 3)
const assets = computed(() => adjusted.value ? 745000 : 750000)
const equity = computed(() => adjusted.value ? 475000 : 480000)
const profit = computed(() => adjusted.value ? 175000 : 180000)

const accountRows = computed(() => {
  const depreciation = adjusted.value ? 25000 : 20000
  const accumDep = adjusted.value ? -55000 : -50000
  const rows = [
    ['100101', 'Bank', 150000, 150000],
    ['110100', 'Trade receivables', 300000, 300000],
    ['120100', 'Inventory', 200000, 200000],
    ['150100', 'PPE cost', 150000, 150000],
    ['159100', 'Accumulated depreciation', -50000, accumDep],
    ['400100', 'Revenue', -1200000, -1200000],
    ['500100', 'Cost of sales', 800000, 800000],
    ['510100', 'Payroll expense', 190000, 190000],
    ['520100', 'Depreciation expense', 20000, depreciation],
    ['530100', 'Finance costs', 10000, 10000],
  ]
  return rows.map(([code, name, source, currentBalance]) => ({
    code,
    name,
    source,
    current: currentBalance,
    changed: source !== currentBalance,
    delta: currentBalance - source,
  }))
})

function statusClass(status) {
  return status === 'pass' ? 'pass' : status === 'review' ? 'review' : 'block'
}

function statusLabel(status) {
  return status === 'pass' ? 'Satisfied' : status === 'review' ? 'In review' : 'Blocked'
}

function barHeight(value) {
  return `${value / 7000}px`
}

function selectMilestone(index) {
  current.value = index
}

function previous() {
  if (current.value > 0) current.value -= 1
}

function next() {
  if (current.value < milestones.length - 1) current.value += 1
}
</script>

<template>
  <header class="topbar">
    <div class="shell topbar-inner">
      <div class="brand" aria-label="AuditFlow Demonstrator"><span class="brand-mark" aria-hidden="true"></span>AuditFlow <span>Demonstrator</span></div>
      <div class="top-note"><i aria-hidden="true"></i> Illustrative data only — professional decisions remain human-owned</div>
    </div>
  </header>

  <main class="shell">
    <section class="intro" aria-labelledby="page-title">
      <div class="intro-copy">
        <p class="eyebrow">End-to-end accounting &amp; audit workflow</p>
        <h1 id="page-title">Follow one engagement from continuance to archive.</h1>
        <p>Step through a recurring-client scenario to see the separate accounting and audit tracks, the QAR control totals behind them, and the approval gates that prevent a release when evidence or versions are not ready.</p>
      </div>
      <div class="scenario-pill" aria-label="Current scenario">
        <strong>Demo entity: Northstar Trading W.L.L.</strong>
        <span>Recurring audit • Year ended 31 Dec 2026 • QAR</span>
      </div>
    </section>

    <aside class="notice" aria-label="Important demonstration note">
      <b>How to read this demo</b>
      <span>These figures are the fictional balanced trial-balance fixture from the source workflow. Statuses demonstrate proposed controls; they are not an audit opinion, legal advice, or a production approval.</span>
    </aside>

    <section class="workspace" aria-labelledby="journey-title">
      <header class="workspace-header">
        <div>
          <h2 id="journey-title">Guided engagement journey</h2>
          <p>Select any milestone to inspect its data, decisions, and safeguards.</p>
        </div>
        <div class="step-readout" aria-live="polite">
          <strong>Milestone {{ current + 1 }} of {{ milestones.length }}</strong>
          <span>{{ scene.name }}</span>
          <div class="progress" aria-label="Scenario progress" role="progressbar" aria-valuemin="1" :aria-valuemax="milestones.length" :aria-valuenow="current + 1"><span :style="{ width: `${((current + 1) / milestones.length) * 100}%` }"></span></div>
        </div>
      </header>

      <nav class="journey" aria-label="Scenario milestones">
        <div class="journey-row">
          <button v-for="(milestone, index) in milestones" :key="milestone.name" class="journey-step" :class="{ done: index < current, active: index === current, attention: index === current && milestone.state === 'attention' }" type="button" :aria-current="index === current ? 'step' : 'false'" @click="selectMilestone(index)">
            <span class="journey-dot">{{ index < current ? '✓' : index + 1 }}</span>
            <span class="time">{{ milestone.time }}</span>
            <span class="name">{{ milestone.name }}</span>
          </button>
        </div>
      </nav>

      <div class="content-grid">
        <section class="content-main" aria-labelledby="sceneTitle">
          <div class="scene-heading">
            <div>
              <p class="eyebrow">{{ scene.kicker }}</p>
              <h2 id="sceneTitle">{{ scene.title }}</h2>
              <p>{{ scene.narrative }}</p>
            </div>
            <span class="status" :class="scene.status">{{ scene.statusText }}</span>
          </div>

          <div class="panel-tabs" aria-label="View the selected milestone by track">
            <button type="button" :aria-pressed="panel === 'overview'" @click="panel = 'overview'">Overview</button>
            <button type="button" :aria-pressed="panel === 'accounting'" @click="panel = 'accounting'">Accounting data</button>
            <button type="button" :aria-pressed="panel === 'audit'" @click="panel = 'audit'">Audit trail</button>
            <button type="button" :aria-pressed="panel === 'completion'" @click="panel = 'completion'">Completion</button>
          </div>

          <div aria-live="polite">
            <template v-if="panel === 'overview'">
              <article class="story-card"><h3>{{ scene.overview.heading }}</h3><p>{{ scene.overview.copy }}</p><div class="control-strip"><div v-for="metric in scene.overview.metrics" :key="metric[1]"><strong>{{ metric[0] }}</strong><span>{{ metric[1] }}</span><span>{{ metric[2] }}</span></div></div></article>
              <div class="chart-block"><header><h3>Control path</h3><span>Each handoff leaves a traceable record</span></header><div class="path"><template v-for="(item, index) in scene.overview.path" :key="item[0]"><div class="path-item"><strong>{{ item[0] }}</strong><span>{{ item[1] }}</span></div><span v-if="index < scene.overview.path.length - 1" class="path-arrow" aria-hidden="true">→</span></template></div></div>
            </template>

            <template v-else-if="panel === 'accounting'">
              <div class="metrics" aria-label="Financial control values">
                <div class="metric"><label>Total assets</label><strong>{{ money(assets) }}</strong><em>Current package</em></div>
                <div class="metric"><label>Liabilities + equity</label><strong>{{ money(assets) }}</strong><em>Reconciles to assets</em></div>
                <div class="metric"><label>Current profit</label><strong>{{ money(profit) }}</strong><em :class="{ alert: !adjusted }">{{ adjusted ? 'After AJ-001' : 'Before AJ-001' }}</em></div>
              </div>
              <div class="chart-block" aria-labelledby="balanceChartTitle">
                <header><h3 id="balanceChartTitle">Statement-of-financial-position control</h3><span>QAR • final package amounts at this milestone</span></header>
                <div class="balance-rail" role="img" :aria-label="`Assets of ${money(assets)} equal liabilities of ${money(270000)} plus equity of ${money(equity)}`">
                  <div class="bar-group"><span class="bar-value">{{ money(assets) }}</span><div class="bar" :style="{ height: barHeight(assets) }"></div><span>Assets</span></div>
                  <div class="bar-group"><span class="bar-value">{{ money(270000) }}</span><div class="bar liability" style="height:39px"></div><span>Liabilities</span></div>
                  <div class="bar-group"><span class="bar-value">{{ money(equity) }}</span><div class="bar equity" :style="{ height: barHeight(equity) }"></div><span>Equity</span></div>
                </div>
                <p class="chart-caption">The QAR 5,000 depreciation adjustment reduces profit, net PPE, assets, and equity together. It is only applied when not already reflected in the selected raw source.</p>
              </div>
              <div class="chart-block"><header><h3>Selected TB source bridge</h3><span>Debit balances shown positive; credits shown negative</span></header><div class="table-wrap"><table><thead><tr><th>Account</th><th>Name</th><th class="num">TB v02</th><th class="num">Current package</th><th class="num">Movement</th></tr></thead><tbody><tr v-for="row in accountRows" :key="row.code" :class="{ changed: row.changed }"><td><code>{{ row.code }}</code></td><td>{{ row.name }}</td><td class="num">{{ money(row.source) }}</td><td class="num">{{ money(row.current) }}</td><td class="num" :class="{ delta: row.changed }">{{ row.changed ? money(row.delta) : '—' }}</td></tr></tbody></table></div></div>
            </template>

            <template v-else-if="panel === 'audit'">
              <article class="story-card"><h3>Receivables: evidence-to-conclusion chain</h3><p>The system exposes the relationships a reviewer must evaluate. It cannot decide evidence sufficiency or a professional conclusion by itself.</p><div class="path"><div class="path-item"><strong>Risk</strong><span>Receivables not recoverable</span></div><span class="path-arrow" aria-hidden="true">→</span><div class="path-item"><strong>Assertion</strong><span>Valuation</span></div><span class="path-arrow" aria-hidden="true">→</span><div class="path-item"><strong>Procedure</strong><span>Aging, receipts, dispute evidence</span></div><span class="path-arrow" aria-hidden="true">→</span><div class="path-item"><strong>Conclusion</strong><span>{{ current >= 6 ? 'Reviewed against final package' : current === 4 ? 'Further work open for AR-019' : 'Planning / fieldwork status' }}</span></div></div></article>
              <div class="metrics"><div class="metric"><label>Materiality status</label><strong>Approved</strong><em>Relevant version linked</em></div><div class="metric"><label>Population</label><strong>{{ money(300000) }}</strong><em>Reconciled to TB</em></div><div class="metric"><label>Sample exception</label><strong>{{ current === 4 ? 'Open' : current >= 6 ? 'Concluded' : 'Tracked' }}</strong><em :class="{ alert: current === 4 }">{{ current === 4 ? 'AR-019 requires follow-up' : 'Selection history preserved' }}</em></div></div>
              <div class="story-card"><h3>What the workflow stops</h3><p>A selected item with missing or contradictory evidence cannot be replaced silently. The original selection, evidence versions, alternative work, exception, reviewer response, and reporting effect remain linked to the exact procedure.</p></div>
            </template>

            <template v-else>
              <article class="story-card"><h3>Completion is checked from current records.</h3><p>“Ready to issue” is derived from dependencies, evidence and signatures. A dashboard label or an earlier approval cannot release a changed file.</p></article>
              <div class="table-wrap"><table><thead><tr><th>Release condition</th><th>Scenario status</th></tr></thead><tbody><tr><td>Final FS / TB / report versions match</td><td><span class="status" :class="statusClass(current >= 6 ? 'pass' : 'block')">{{ statusLabel(current >= 6 ? 'pass' : 'block') }}</span></td></tr><tr><td>Management responsibility for exact FS version</td><td><span class="status" :class="statusClass(current >= 6 ? 'pass' : 'block')">{{ statusLabel(current >= 6 ? 'pass' : 'block') }}</span></td></tr><tr><td>Partner conclusion and required EQR</td><td><span class="status" :class="statusClass(current >= 6 ? 'pass' : 'review')">{{ statusLabel(current >= 6 ? 'pass' : 'review') }}</span></td></tr><tr><td>Approved recipients and delivery record</td><td><span class="status" :class="statusClass(current === 7 ? 'pass' : 'block')">{{ statusLabel(current === 7 ? 'pass' : 'block') }}</span></td></tr><tr><td>Archive manifest and locked file</td><td><span class="status" :class="statusClass(current === 7 ? 'pass' : 'block')">{{ statusLabel(current === 7 ? 'pass' : 'block') }}</span></td></tr></tbody></table></div>
              <div class="story-card" style="margin-top:18px"><h3>{{ current === 7 ? 'Issued documents are immutable.' : current >= 6 ? 'The next action is authorized release.' : 'The package is not releasable yet.' }}</h3><p>{{ current === 7 ? 'A controlled archive amendment is a new authorized record; it cannot silently replace the issued report.' : current >= 6 ? 'The signatory checks the exact report, financial statements, recipients, delivery method, and package hashes before issuing.' : 'The workflow surfaces the specific blocker so work returns to the appropriate owner without disguising a professional judgment as automation.' }}</p></div>
            </template>
          </div>
        </section>

        <aside class="side" aria-labelledby="gatesHeading">
          <p class="eyebrow">Gate evaluation</p>
          <h2 id="gatesHeading">What must be true next</h2>
          <ul class="gate-list"><li v-for="([id, info]) in Object.entries(gateInfo)" :key="id" class="gate"><span class="gate-id">{{ id }}</span><span><strong>{{ info[0] }}</strong><small>{{ info[1] }}</small></span><span class="status" :class="statusClass(scene.gates[id])">{{ statusLabel(scene.gates[id]) }}</span></li></ul>
          <div class="evidence"><h3>Version-aware control</h3><ul><li v-for="item in scene.evidence" :key="item">{{ item }}</li></ul></div>
        </aside>
      </div>

      <footer class="nav-actions"><button class="button" type="button" :disabled="current === 0" @click="previous">Previous milestone</button><button class="button primary" type="button" :disabled="current === milestones.length - 1" @click="next">{{ current === milestones.length - 1 ? 'End of scenario' : 'Next milestone' }}</button></footer>
    </section>
    <p class="source-line">Modelled from “Accounting &amp; Audit Firm — Consolidated End-to-End Workflow”, v2.0. The workflow requires local technical, ethics, and compliance approval before operational adoption.</p>
  </main>
</template>
