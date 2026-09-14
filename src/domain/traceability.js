// Source-derived traceability inventory for the demonstrator.
//
// These rows are planning/test identities, not proof that a live tenant has
// passed them.  Keeping the normative scenario and expected consequence in
// the browser bundle lets the readiness page show exactly which checks a
// synthetic rehearsal exercised and which remain NOT RUN.

function freezeRows(rows, kind) {
  return Object.freeze(rows.map((row) => Object.freeze({
    id: row[0],
    kind,
    title: kind === 'P0' ? row[1] : null,
    scenario: kind === 'P0' ? row[2] : row[1],
    expected: kind === 'P0' ? row[3] : row[2],
  })))
}

export const acceptanceScenarios = freezeRows([
  ["AT-01", "Low numerical risk but mandatory identity evidence is missing", "Information hold; no service commencement"],
  ["AT-02", "Confirmed legal/professional prohibition and partner/admin attempts approval", "No override path; decline or lawfully revised scope"],
  ["AT-03", "Possible sanctions match later verified as false positive", "Specialist disposition retained; risk rerun; no automatic accusation"],
  ["AT-04", "Independence and EDD concerns triggered together", "Both reviews required; neither disappears because another rule fired first"],
  ["AT-05", "Existing client adds a new service", "Service-specific assessment/terms required"],
  ["AT-06", "Annual rollover copies last year's file", "Reference data copies; current-year samples, conclusions and approvals reset"],
  ["AT-07", "New TB does not balance", "Import rejected for processing/final release; original preserved"],
  ["AT-08", "Account code begins with zero or duplicates across entities", "Code preserved; correct dimensioned uniqueness applied"],
  ["AT-09", "Small unmapped accounts aggregate to a significant balance", "Final mapping gate fails until complete"],
  ["AT-10", "Client's replacement TB includes an already approved journal", "Verified source bridge prevents applying the journal twice"],
  ["AT-11", "Auditor proposes adjustment but management rejects it", "No posting; uncorrected-item and reporting evaluation created"],
  ["AT-12", "A cash-flow difference is entered as a plug", "Reconciliation/review fails; no unexplained balancing route"],
  ["AT-13", "PBC upload has wrong period", "Remains unaccepted; client clarification requested"],
  ["AT-14", "Sample selected from incomplete/unreconciled population", "Plan approval blocked or scoped exception explicitly resolved"],
  ["AT-15", "A selected sample item lacks evidence", "No silent replacement; alternative work/exception conclusion required"],
  ["AT-16", "Materiality decreases after testing", "Impact assessment of coverage/sampling/misstatements required"],
  ["AT-17", "Significant risk has no procedure or supported conclusion", "Planning/completion gate identifies missing coverage"],
  ["AT-18", "Preparer attempts to clear their own significant review point", "Denied under approved segregation policy"],
  ["AT-19", "Approved FS changes through a new journal or disclosure", "Affected approvals stale; new version and required re-approval"],
  ["AT-20", "Client approval says “subject to AJ-014 posting”", "Conditional; cannot satisfy final approval gate"],
  ["AT-21", "EQR required but incomplete", "Report dating/release blocked"],
  ["AT-22", "Uncorrected misstatement supports a modified opinion", "Appropriate documented reporting path allowed; item not falsely corrected"],
  ["AT-23", "Management-letter action is due next year but current audit implications are concluded", "Action remains open without false implementation status; release assessed independently"],
  ["AT-24", "Client user opens private review point or full internal export", "Denied; no attachment/link permission leakage"],
  ["AT-25", "Report is attached to a different FS version", "Release blocked"],
  ["AT-26", "Two users approve/change a package concurrently", "Version conflict detected; stale approval cannot pass release"],
  ["AT-27", "User edits an issued document or requests deletion under legal hold", "Original immutable; controlled amendment/disposal restrictions enforced"],
  ["AT-28", "Draft next-year engagement is scheduled before continuance", "Shell allowed; professional work remains blocked"],
], 'AT')

export const engineeringScenarios = freezeRows([
  ["ET-01", "Token from an unapproved tenant/issuer", "Sign-in denied; no automatic local staff account."],
  ["ET-02", "Email changes or a different identity reuses an address", "No silent account merge or authority inheritance."],
  ["ET-03", "Client A guesses Client B IDs through API/search/export", "No content, metadata, count or attachment leakage."],
  ["ET-04", "Client submits protected fields or arbitrary Graph target", "Input rejected/ignored safely; server resolves authorized destination."],
  ["ET-05", "Staff assignment or guest access expires", "Frappe access revoked; direct SharePoint rights reconciled and verified."],
  ["ET-06", "Runtime Graph identity requests unrelated site", "Denied; integration does not broaden consent automatically."],
  ["ET-07", "Standard user attempts to assign partner/EQR authority", "Denied; privileged change recorded and separately authorized."],
  ["ET-08", "Direct SharePoint link bypasses portal", "Repository permissions still enforce intended access."],
  ["ET-09", "Upload finishes remotely but response times out", "Retry reconciles existing item; one receipt/reference."],
  ["ET-10", "Upload uses unexpected size/type or interrupted chunks", "Bounded safe failure/resume; no false PBC receipt."],
  ["ET-11", "Source workbook changes bytes during metadata handling", "Original receipt hash retained; transformed hash/relationship distinct."],
  ["ET-12", "Working document changes while snapshot is created", "Stable exact version obtained or operation conflicts/retries safely."],
  ["ET-13", "Office editor has unsaved changes", "Submission uses saved verified content; no assertion that unsaved edits were captured."],
  ["ET-14", "Old SharePoint version is pruned", "Required preserved approval snapshot remains reconstructable."],
  ["ET-15", "File renamed or moved within supported boundary", "Stable association reconciled; no unexpected access expansion."],
  ["ET-16", "File copied/moved across drives", "Controlled new binding/identity; history not silently conflated."],
  ["ET-17", "Duplicate or out-of-order notification", "Idempotent reconciliation; no duplicate review tasks."],
  ["ET-18", "Notification is missed entirely", "Scheduled reconciliation identifies relevant change."],
  ["ET-19", "Delta cursor expires or process dies mid-page", "Full/resumed reconciliation; cursor not advanced past uncommitted work."],
  ["ET-20", "`429`, `403`, `5xx` or token expiry", "Documented backoff/escalation; no silent broader permissions or false success."],
  ["ET-21", "App-only Excel workbook session attempted", "Capability fails as expected; supported server calculation path remains available."],
  ["ET-22", "Sensitivity-protected file rejects app-only replacement", "Approved alternate path or explicit hold; protection not stripped."],
  ["ET-23", "CSV has leading-zero codes and locale-specific amounts", "Explicit parser policy preserves identifiers and rejects ambiguity."],
  ["ET-24", "NaN, formula-only values, huge archive or external workbook link", "No execution or silent zero; safe rejection/controlled handling."],
  ["ET-25", "TB import crashes after partial staging", "No partial dataset promotion; restart/disposal is controlled."],
  ["ET-26", "Simultaneous journal application requests", "Unique application key; exactly one accounting application."],
  ["ET-27", "Replacement source includes a prior journal", "Reviewed bridge prevents double counting; historical snapshots unchanged."],
  ["ET-28", "Cash-flow/notes lack supporting information", "Draft may remain incomplete; final gate cannot pass through a plug/default."],
  ["ET-29", "Materiality/population changes after testing", "Relevant dependencies/approvals stale; prior testing retained historically."],
  ["ET-30", "Preparer clears own significant review or client approves internal work", "Denied by action-specific role/segregation rules."],
  ["ET-31", "Two users approve/change the same submission", "Revision conflict; no stale signature satisfies current gate."],
  ["ET-32", "Metadata-only change versus content-relevant change", "Recorded impact classification; no undocumented blanket revalidation exemption."],
  ["ET-33", "Required EQR incomplete at proposed report date", "Dating/release blocked; cannot backdate around requirement."],
  ["ET-34", "Signing changes file bytes", "Approved input and signed output linked/verified; hashes not falsely equated."],
  ["ET-35", "Source changes during/after finalization", "Issued artifacts remain exact preserved package; relevant new facts assessed."],
  ["ET-36", "Release request repeated or email response lost", "One release event; controlled delivery retry and accurate status."],
  ["ET-37", "Graph outage during final-package verification", "No unverified package issuance; safe local work remains available."],
  ["ET-38", "Ordinary record can be unlocked by an edit-capable user", "Test exposes risk; archive permission/profile corrected before go-live."],
  ["ET-39", "Retention label desired but not observed/applied", "Archive remains pending; no false compliance claim."],
  ["ET-40", "Legal hold plus disposal/move request", "Applicable destructive action blocked; external hold status reconciled."],
  ["ET-41", "Restore database older than SharePoint and pending jobs", "Outgoing effects suspended; manifest/operation reconciliation prevents duplicate actions."],
  ["ET-42", "Export for client versus inspector", "Different approved scope; private working papers excluded from client package."],
  ["ET-43", "New-year roll-forward after prior open findings", "References/actions carried; prior samples/conclusions/approvals not copied as current work."],
  ["ET-44", "Dependency/core upgrade or migration changes behavior", "Regression suite and real-tenant capability checks block unsafe deployment."],
], 'ET')

export const verificationScenarios = freezeRows([
  ["VT-01", "Generic REST create/update of an Approval Decision or Release Event", "Denied; only the authorized command can append the record"],
  ["VT-02", "Protected-field change through Desk/import/generic workflow", "Denied or routed through the same guarded command; no alternative write path"],
  ["VT-03", "Custom report/export uses unrestricted query on client data", "Negative-scope test fails build; approved scoped query passes without metadata leakage"],
  ["VT-04", "Source transaction commits while impact worker is stopped", "Client generation advances immediately; current candidate cannot release"],
  ["VT-05", "Two concurrent commands present the same expected revision", "At most one logical mutation succeeds; other receives conflict"],
  ["VT-06", "Impact worker finishes after another input generation has committed", "Old evaluation cannot be published CURRENT for new input"],
  ["VT-07", "Final release races a source/journal/authority change", "Consistent guard ordering produces one valid serialization; no stale gate pass"],
  ["VT-08", "Accounting source changes while linked audit candidate is ready", "Shared client guard invalidates release evaluation across the linked engagements"],
  ["VT-09", "Identical idempotency key submitted with different payload or target", "Conflict; no reuse of prior success for changed request"],
  ["VT-10", "Same idempotency key used by another client/actor", "No result or content leakage; correct scoping enforced"],
  ["VT-11", "Export requester loses access while export is queued", "No unauthorized export generation/delivery; authorization disposition retained"],
  ["VT-12", "Original employee leaves after a valid release is authorized", "Historical approval preserved; system-duty delivery follows current recipient/hold policy"],
  ["VT-13", "Old worker resumes after its lease/token was replaced", "Cannot publish local result; any uncertain remote effect is reconciled"],
  ["VT-14", "Forged generic Graph path/label is placed in a privileged operation", "Typed executor rejects target/action; no broadened capability"],
  ["VT-15", "Provider upload succeeds then local commit fails", "Reconcile same deterministic artifact and expected hash; no renamed duplicate"],
  ["VT-16", "Client sends TB with a journal partially incorporated", "Explicit partial-reflection hold; no guessed residual application"],
  ["VT-17", "Two revisions of one logical journal selected in a plan", "Plan rejected unless a reviewed explicit reversal/correction explains treatment"],
  ["VT-18", "Canonical manifest inputs reordered or decimal encoding changed", "Defined canonical scheme produces expected digest or schema rejection; no ambiguous approval"],
  ["VT-19", "Reviewer views mutable working URL while command targets snapshot", "UI/command binding prevents mismatched review; approved artifact explicitly shown"],
  ["VT-20", "Legal hold active during preservation and disposal requests", "Authorized preservation allowed; prohibited disposal denied"],
  ["VT-21", "Entra user disabled while Frappe session remains open", "Local disable/epoch policy blocks protected requests; remote revocation tracked separately"],
  ["VT-22", "Local assignment removed but direct SharePoint group remains", "Drift is detected, contained and not falsely marked revoked"],
  ["VT-23", "Database restored before issued event while checkpoint exists", "External quarantine holds; one historical release reconstructed without duplicate issue/delivery"],
  ["VT-24", "Release protection/checkpoint feature unavailable in an early phase", "Real release remains disabled; synthetic test can fail safely without publishing live report"],
], 'VT')

// Business-test identities from the v5 acceptance contract. These rows are
// intentionally kept separate from engineering/verification scenarios so the
// readiness page can distinguish acceptance coverage from technical proof.
export const businessTestScenarios = freezeRows([
  ['BT-01', 'Client contributor sees only assigned client workspace', 'Private portal projection contains no internal review or risk fields'],
  ['BT-02', 'Client contributor submits a complete business profile', 'Submission receives a scoped revision and review owner'],
  ['BT-03', 'Client contributor replaces a rejected profile', 'Earlier submission remains historical; new revision is current'],
  ['BT-04', 'Client contributor uploads electronic PBC evidence', 'Receipt records entity, period, bytes, hash and request owner'],
  ['BT-05', 'Client contributor uploads a replacement PBC file', 'Replacement preserves the first receipt and links supersession'],
  ['BT-06', 'Client contributor marks hard-copy readiness', 'Readiness is recorded without fabricating physical custody'],
  ['BT-07', 'Client contributor answers an information request', 'Response remains bound to the request and reporting period'],
  ['BT-08', 'Client contributor views a published deliverable', 'Only released report/FS artifacts are visible'],
  ['BT-09', 'Client management reviews quotation version', 'Approval references exact quotation and fee basis'],
  ['BT-10', 'Client management accepts the engagement letter', 'Exact EL version and accepting identity are recorded'],
  ['BT-11', 'Client management rejects the engagement letter', 'Rejection creates a correction path and holds G3'],
  ['BT-12', 'Client management approves a Draft FS version', 'Decision is bound to the exact Draft FS snapshot'],
  ['BT-13', 'Client management rejects a Draft FS version', 'Rejection creates a preparer revision task and retains feedback'],
  ['BT-14', 'Client management responds to an MIR', 'Response is visible to the assigned senior and manager'],
  ['BT-15', 'Junior records assigned time', 'Time entry stores engagement, date, task, role and hours'],
  ['BT-16', 'Junior submits an assigned workpaper', 'Submission freezes a versioned snapshot for next-level review'],
  ['BT-17', 'Junior attempts to clear own significant review point', 'Command is denied by segregation of duties'],
  ['BT-18', 'Senior creates a scoped PBC request', 'Request includes category, period, criteria, owner, due date and reviewer'],
  ['BT-19', 'Senior issues the audit announcement', 'Announcement artifact links to the approved plan and client contact'],
  ['BT-20', 'Senior submits a conclusion summary', 'Summary freezes its exact workpaper and FS dependencies'],
  ['BT-21', 'Senior coordinates Draft FS dispatch', 'Draft FS and MIR are sent as separate versioned records'],
  ['BT-22', 'Senior records a workpaper response', 'Response is linked to the review point and revision'],
  ['BT-23', 'Manager reviews the audit plan', 'Plan approval remains separate from partner acceptance'],
  ['BT-24', 'Manager reviews a submitted workpaper', 'Reviewer sees the submitted snapshot, not a mutable working file'],
  ['BT-25', 'Manager raises a significant review point', 'Point has severity, owner, evidence detail and due date'],
  ['BT-26', 'Manager clears a segregated review point', 'Non-empty response and exact revision are retained'],
  ['BT-27', 'Manager evaluates client feedback', 'Feedback updates completion dependencies without overwriting history'],
  ['BT-28', 'Manager recommends completion', 'Recommendation lists remaining partner/EQR blockers'],
  ['BT-29', 'Partner reviews acceptance evidence', 'Partner decision is blocked while required evidence is unresolved'],
  ['BT-30', 'Partner accepts a relationship', 'G1 records a named decision, rationale and assessment revision'],
  ['BT-31', 'Partner declines a relationship', 'Decline preserves evidence and blocks downstream work'],
  ['BT-32', 'Partner records a continuance decision', 'New-period shell resets current approvals and responses'],
  ['BT-33', 'Partner forms an audit opinion', 'Opinion references the completion candidate and required authorities'],
  ['BT-34', 'Partner records final client discussion', 'Discussion is separate from report delivery and release'],
  ['BT-35', 'Partner authorizes a guarded release', 'Release requires matched report/FS, approvals and current generations'],
  ['BT-36', 'Finance prepares a cost estimate', 'Estimate preserves hours, internal cost and approved fee separately'],
  ['BT-37', 'Finance routes a fee approval', 'Approver sees the exact estimate revision and scope assumptions'],
  ['BT-38', 'Finance verifies a required advance', 'Advance is allocated once and becomes G4 evidence'],
  ['BT-39', 'Finance records an advance reversal', 'Portal eligibility is re-evaluated and may return to hold'],
  ['BT-40', 'Finance approves staff time', 'Approved hours become the basis for actual cost calculation'],
  ['BT-41', 'Finance creates the final invoice', 'Invoice uses the approved fee basis and one advance allocation'],
  ['BT-42', 'Finance closes engagement cost', 'G9 derives from invoice, time, cost and exceptions, not archive'],
  ['BT-43', 'Accountant imports a selected TB', 'Source is validated for entity, period, currency and balanced totals'],
  ['BT-44', 'Accountant replaces a TB source', 'Previous source and input generation remain preserved'],
  ['BT-45', 'Accountant resolves an unmapped code', 'Coverage changes only after explicit mapping review'],
  ['BT-46', 'Accountant stages a journal', 'Journal has a logical ID, reflection state, amount and rationale'],
  ['BT-47', 'Accountant rejects a journal request', 'Rejected journal does not affect the accounting package totals'],
  ['BT-48', 'Accountant submits a complete statement package', 'Statement revision becomes ready for management review'],
  ['BT-49', 'Accounting reviewer reviews source controls', 'Reviewer is separate from the preparer and sees source lineage'],
  ['BT-50', 'Accounting reviewer requests a correction', 'Package returns to preparation with history intact'],
  ['BT-51', 'Accounting reviewer submits an independent result', 'Review result is bound to the exact package revision'],
  ['BT-52', 'EQR reviews a required candidate', 'EQR result is separate from manager and partner decisions'],
  ['BT-53', 'EQR returns an incomplete candidate', 'G7/G8 remain held and a correction path is created'],
  ['BT-54', 'EQR completes an exact candidate review', 'EQR completion is recorded before report dating'],
  ['BT-55', 'Records verifies a release checkpoint', 'Checkpoint references the exact release manifest'],
  ['BT-56', 'Records assembles the electronic archive', 'Archive includes required outputs, events, custody and hashes'],
  ['BT-57', 'Records manages an action-specific legal hold', 'Only prohibited disposal/delivery/issuance actions are held'],
  ['BT-58', 'Records preserves an amendment case', 'Amendment links to issued artifacts without overwriting them'],
  ['BT-59', 'System admin disables a synthetic actor', 'Actor status changes and session epoch rotates'],
  ['BT-60', 'System admin inspects integration health', 'Diagnostics show operation identity and simulation evidence'],
  ['BT-61', 'System admin runs recovery quarantine', 'Restored state has outward effects disabled until reconciliation'],
  ['BT-62', 'User opens a direct unauthorized scope', 'No unrelated client, engagement, count or attachment metadata leaks'],
  ['BT-63', 'User replays an idempotent command', 'The original result is returned once without duplicate mutation'],
  ['BT-64', 'User refreshes after a committed action', 'Committed synthetic state persists exactly once in browser-local storage'],
], 'BT')

export const phase0Experiments = freezeRows([
  ["P0-01", "Build", "Build/install the exact custom app, Frappe/ERPNext tags and database/runtime set; recreate from clean environment", "Reproducible build and upgrade/migration smoke evidence"],
  ["P0-02", "Identity", "Staff, invited client, unknown tenant, reused email and disabled actor", "Correct stable mapping; no silent merge; local session revocation demonstrable"],
  ["P0-03", "Isolation", "Two clients with different assignments, direct URLs and generic API/export/search routes", "No cross-client metadata/files; approved direct Office access only"],
  ["P0-04", "Microsoft capability", "Test each required metadata/upload/version/delta operation with selected grants and unrelated denied repository", "Exact successful/failed endpoint matrix retained"],
  ["P0-05", "Receipt/snapshot", "Upload known bytes, create native working copy, edit/save, capture exact version and retrieve snapshot after later edit", "Original/stored/approved identities and hashes distinct and reconstructable"],
  ["P0-06", "Local release race", "Pause invalidation worker; change input; concurrently evaluate/authorize candidate", "Generation blocks stale release; concurrent revision conflict is deterministic"],
  ["P0-07", "Accounting bridge", "Import Appendix D; apply AJ-001; re-upload source already containing it; try two journal revisions", "Expected 175,000 result retained; duplicates/partial reflection blocked"],
  ["P0-08", "Privileged execution", "Submit forged URL/label/target and stale operation to records executor", "Typed-operation denial and trusted binding enforcement; residual shared-DB risk documented"],
  ["P0-09", "Records", "Apply candidate profile to synthetic artifacts; test representative edit/delete/unlock/access roles", "Protection meets approved threat/profile; no unsupported immutability claim"],
  ["P0-10", "Retry/revocation", "Fail local completion after remote upload succeeds; expire worker lease; revoke requester before queued export", "Existing artifact reconciled; stale attempt cannot publish; unauthorized delivery denied"],
  ["P0-11", "Release/recovery", "Commit one synthetic release/checkpoint; restore DB to earlier point; leave remote artifact intact", "External side effects quarantined; one release identity reconstructed; no duplicate issue"],
  ["P0-12", "Scope/economics", "Run representative workflow with professional leads; record time/cost/license unknowns", "Service profile and revised backlog/feasibility decision signed"],
], 'P0')

export const traceabilityGroups = Object.freeze([
  Object.freeze({ id: 'AT', label: 'Acceptance scenarios', source: 'AT-01–AT-28', entries: acceptanceScenarios }),
  Object.freeze({ id: 'ET', label: 'Engineering scenarios', source: 'ET-01–ET-44', entries: engineeringScenarios }),
  Object.freeze({ id: 'VT', label: 'Verification scenarios', source: 'VT-01–VT-24', entries: verificationScenarios }),
  Object.freeze({ id: 'BT', label: 'Business acceptance scenarios', source: 'BT-01–BT-64', entries: businessTestScenarios }),
  Object.freeze({ id: 'P0', label: 'Phase 0 experiments', source: 'P0-01–P0-12', entries: phase0Experiments }),
])

export const traceabilityInventory = Object.freeze(traceabilityGroups.flatMap((group) => group.entries))
export const traceabilityCounts = Object.freeze({
  AT: acceptanceScenarios.length,
  ET: engineeringScenarios.length,
  VT: verificationScenarios.length,
  BT: businessTestScenarios.length,
  P0: phase0Experiments.length,
  acceptanceTotal: acceptanceScenarios.length + businessTestScenarios.length + verificationScenarios.length + engineeringScenarios.length,
  total: traceabilityInventory.length,
})

export function traceabilityFor(id) {
  return traceabilityInventory.find((entry) => entry.id === id) || null
}

export function traceabilitySummary(executedIds = []) {
  const executed = new Set((Array.isArray(executedIds) ? executedIds : []).filter((id) => traceabilityFor(id)))
  const groups = Object.fromEntries(traceabilityGroups.map((group) => {
    const executedCount = group.entries.filter((entry) => executed.has(entry.id)).length
    return [group.id, { total: group.entries.length, executed: executedCount, remaining: group.entries.length - executedCount }]
  }))
  return {
    total: traceabilityInventory.length,
    executed: executed.size,
    remaining: traceabilityInventory.length - executed.size,
    groups,
    executedIds: [...executed],
  }
}
