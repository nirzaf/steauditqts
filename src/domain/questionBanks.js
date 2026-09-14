// Normative synthetic question identities and wording reproduced from the
// supplied v4 Appendix A/B. Applicability, evidence and decisions remain
// mutable scenario records; this module only holds versioned templates.
export const QUESTION_BANK_VERSION = 'v4-2026-01'

const ce = (id, question, evidence, rule, category) => ({ id, question, evidence, rule, category, professionalOnly: ['CE-070', 'CE-071', 'CE-072', 'CE-073', 'CE-074', 'CE-075'].includes(id) })

export const clientEvaluationQuestions = [
  ce('CE-001', "Has the client's legal existence been verified?", 'Registry extract, incorporation certificate', 'No = Hard Stop pending verification', 'Identity and Legal Existence'),
  ce('CE-002', 'Is the registered address verified?', 'Registry/public source/official document', 'No = request evidence', 'Identity and Legal Existence'),
  ce('CE-003', 'Are directors/key officers identified?', 'Registry, board records', 'Missing = moderate/high', 'Identity and Legal Existence'),
  ce('CE-004', 'Are authorized signatories identified?', 'Board resolution/authorization', 'Missing = cannot execute engagement', 'Identity and Legal Existence'),
  ce('CE-005', "Is the client's business activity clearly understood?", 'Website, licenses, management explanation', 'Unclear = EDD', 'Identity and Legal Existence'),
  ce('CE-006', 'Are all material jurisdictions of operation known?', 'Group chart, management declaration', 'High-risk/unknown jurisdiction = higher score', 'Identity and Legal Existence'),
  ce('CE-010', 'Is the full ownership structure documented?', 'Ownership chart/register', 'No = request info', 'Ownership and Beneficial Ownership'),
  ce('CE-011', 'Are ultimate beneficial owners identified where required?', 'UBO declaration, registry', 'No = Hard Stop where legally required', 'Ownership and Beneficial Ownership'),
  ce('CE-012', 'Can beneficial ownership be independently verified to a reasonable level?', 'Registry/reliable source', 'No = EDD', 'Ownership and Beneficial Ownership'),
  ce('CE-013', 'Are nominees, trusts or layered entities involved?', 'Structure documents', 'Yes = higher risk / EDD', 'Ownership and Beneficial Ownership'),
  ce('CE-014', 'Has ownership changed materially in the last 12 months?', 'Share transfer/registry', 'Yes = review purpose/source', 'Ownership and Beneficial Ownership'),
  ce('CE-015', 'Is the ownership structure unusually complex relative to business purpose?', 'Structure analysis', 'Yes = high risk', 'Ownership and Beneficial Ownership'),
  ce('CE-020', 'Are there known integrity concerns involving owners/directors/senior management?', 'Public records, prior experience', 'Yes = partner/compliance review', 'Management Integrity and Reputation'),
  ce('CE-021', 'Has management previously provided misleading or inconsistent information?', 'Firm history, prior provider communication', 'Yes = high risk', 'Management Integrity and Reputation'),
  ce('CE-022', 'Is management willing to correct identified accounting errors?', 'Discussion/documentation', 'No = high risk / possible decline', 'Management Integrity and Reputation'),
  ce('CE-023', 'Does management accept responsibility for the financial statements?', 'Engagement letter/representation', 'No = Hard Stop for FS/audit engagement', 'Management Integrity and Reputation'),
  ce('CE-024', 'Is management cooperative with information requests?', 'Onboarding history', 'No = moderate/high', 'Management Integrity and Reputation'),
  ce('CE-025', 'Are there unexplained adverse media or serious reputation concerns?', 'Reliable screening', 'Yes = EDD, not automatic guilt', 'Management Integrity and Reputation'),
  ce('CE-030', 'Has required KYC/CDD been completed?', 'KYC checklist', 'No = Hard Stop where required', 'AML/CFT, Sanctions and PEP Risk'),
  ce('CE-031', 'Are any owners/controllers/directors PEPs or close associates where screening is required?', 'Screening result', 'Yes = EDD / senior approval; not automatic decline', 'AML/CFT, Sanctions and PEP Risk'),
  ce('CE-032', 'Are there sanctions matches requiring legal/compliance action?', 'Screening result', 'Confirmed legal prohibition = Hard Stop', 'AML/CFT, Sanctions and PEP Risk'),
  ce('CE-033', 'Does the client operate in a high-risk sector/jurisdiction?', 'Risk matrix', 'Yes = weighted high risk', 'AML/CFT, Sanctions and PEP Risk'),
  ce('CE-034', 'Is expected transaction behavior consistent with the stated business?', 'Business profile', 'No = EDD', 'AML/CFT, Sanctions and PEP Risk'),
  ce('CE-035', 'Is source of funds/source of wealth required and satisfactorily understood?', 'Supporting documents', 'No = block/EDD where applicable', 'AML/CFT, Sanctions and PEP Risk'),
  ce('CE-036', 'Are there unexplained cash-intensive or complex transactions?', 'Financials/business description', 'Yes = higher risk', 'AML/CFT, Sanctions and PEP Risk'),
  ce('CE-037', 'Have material beneficial-ownership changes been screened?', 'New UBO records', 'No = request/update', 'AML/CFT, Sanctions and PEP Risk'),
  ce('CE-040', 'Has the client changed accountants/auditors recently?', 'Client explanation', 'Yes = follow-up', 'Previous Accountant/Auditor and Engagement History'),
  ce('CE-041', 'Is the reason for change reasonable and documented?', 'Management explanation', 'Unclear = high risk', 'Previous Accountant/Auditor and Engagement History'),
  ce('CE-042', 'Where permitted/required, has predecessor communication been considered?', 'Professional clearance', 'Refusal/concerns = partner review', 'Previous Accountant/Auditor and Engagement History'),
  ce('CE-043', 'Were prior fees disputed or unpaid?', 'Client/prior provider data', 'Yes = commercial/integrity review', 'Previous Accountant/Auditor and Engagement History'),
  ce('CE-044', 'Were prior reports modified/qualified?', 'Prior auditor report', 'Yes = understand cause', 'Previous Accountant/Auditor and Engagement History'),
  ce('CE-045', 'Were significant internal-control issues reported previously?', 'Management letter', 'Yes = engagement planning risk', 'Previous Accountant/Auditor and Engagement History'),
  ce('CE-046', 'Were there recurring uncorrected misstatements?', 'Prior audit summary', 'Yes = high audit risk', 'Previous Accountant/Auditor and Engagement History'),
  ce('CE-050', 'Are recent financial statements available?', 'FS/TB', 'No = request info', 'Financial and Going-Concern Profile'),
  ce('CE-051', 'Is the entity experiencing severe losses or negative working capital?', 'Financial analysis', 'Yes = higher risk', 'Financial and Going-Concern Profile'),
  ce('CE-052', 'Are there significant overdue loans/taxes/payables?', 'Schedules', 'Yes = higher risk', 'Financial and Going-Concern Profile'),
  ce('CE-053', 'Is financing dependent on uncertain renewal?', 'Loan documents', 'Yes = going-concern focus', 'Financial and Going-Concern Profile'),
  ce('CE-054', 'Are major legal claims or contingent liabilities known?', 'Legal information', 'Yes = higher risk', 'Financial and Going-Concern Profile'),
  ce('CE-055', 'Are there significant related-party balances or unusual transactions?', 'TB/related-party list', 'Yes = higher risk', 'Financial and Going-Concern Profile'),
  ce('CE-056', 'Are accounting records sufficiently complete to perform the service?', 'Ledger/sample records', 'No = conditions or decline', 'Financial and Going-Concern Profile'),
  ce('CE-060', 'Does the firm have technical competence for the industry?', 'Resource assessment', 'No = Hard Stop unless competent expert/resource obtained', 'Engagement Complexity and Resources'),
  ce('CE-061', 'Are enough qualified staff available before the deadline?', 'Scheduling plan', 'No = reschedule/decline', 'Engagement Complexity and Resources'),
  ce('CE-062', 'Are specialist skills required?', 'Scoping assessment', 'Yes = assign expert', 'Engagement Complexity and Resources'),
  ce('CE-063', 'Is group reporting/component work involved?', 'Group structure', 'Yes = higher complexity', 'Engagement Complexity and Resources'),
  ce('CE-064', 'Are multiple reporting frameworks/currencies involved?', 'Scope', 'Yes = complexity score', 'Engagement Complexity and Resources'),
  ce('CE-065', 'Are significant estimates/fair values/valuations involved?', 'Prior FS/TB', 'Yes = expertise requirement', 'Engagement Complexity and Resources'),
  ce('CE-066', 'Is the proposed deadline realistic?', 'Timeline', 'No = renegotiate before acceptance', 'Engagement Complexity and Resources'),
  ce('CE-070', 'Is an audit/review/assurance engagement requested?', 'Scope', 'Yes = independence workflow', 'Independence, Ethics and Conflicts'),
  ce('CE-071', 'Do firm/personnel have financial interests or prohibited relationships with the client?', 'Independence declarations', 'Yes = ethics review / possible Hard Stop', 'Independence, Ethics and Conflicts'),
  ce('CE-072', 'Does the firm provide non-assurance services to the same audit client?', 'Service register', 'Yes = permissibility/threat assessment', 'Independence, Ethics and Conflicts'),
  ce('CE-073', 'Would the proposed service cause the firm to assume management responsibility?', 'Scope analysis', 'Yes = modify/decline service', 'Independence, Ethics and Conflicts'),
  ce('CE-074', 'Is there a self-review, advocacy, familiarity, self-interest or intimidation threat?', 'Ethics assessment', 'Yes = evaluate safeguards', 'Independence, Ethics and Conflicts'),
  ce('CE-075', 'Can threats be eliminated or reduced to an acceptable level?', 'Safeguard record', 'No = Hard Stop', 'Independence, Ethics and Conflicts'),
  ce('CE-080', 'Is the fee adequate for the expected effort and quality requirements?', 'Budget', 'No = re-scope/reprice', 'Commercial and Engagement Viability'),
  ce('CE-081', 'Is the client willing to sign the engagement letter?', 'Signed agreement', 'No = do not start', 'Commercial and Engagement Viability'),
  ce('CE-082', 'Are payment terms acceptable?', 'Proposal/credit check', 'No = commercial escalation', 'Commercial and Engagement Viability'),
  ce('CE-083', 'Is fee dependency or overdue fee status relevant to independence/ethics?', 'Client billing data', 'Yes = ethics/partner review', 'Commercial and Engagement Viability'),
  ce('CE-084', 'Is there unusual pressure to reduce procedures or issue before work is complete?', 'Communications', 'Yes = high integrity risk', 'Commercial and Engagement Viability'),
  ce('CE-090', 'Will sensitive or regulated personal/business data be processed?', 'Data classification', 'Yes = security controls', 'Data, Cyber and Confidentiality'),
  ce('CE-091', 'Is cross-border data transfer involved?', 'System/data map', 'Yes = legal/privacy review as required', 'Data, Cyber and Confidentiality'),
  ce('CE-092', 'Does the client require special access restrictions?', 'Contract', 'Configure permissions', 'Data, Cyber and Confidentiality'),
  ce('CE-093', 'Are secure file-transfer methods agreed?', 'Onboarding checklist', 'No = block sensitive-data exchange', 'Data, Cyber and Confidentiality'),
]

export const annualContinuanceQuestions = [
  ['RV-001', 'Any change in legal name or registration?', 'Compare registry fields'],
  ['RV-002', 'Any ownership/UBO change?', 'Mandatory new verification if changed'],
  ['RV-003', 'Any new director/key manager?', 'Run relevant screening'],
  ['RV-004', 'Any new country of operation?', 'Jurisdiction-risk reassessment'],
  ['RV-005', 'Any major change in business model?', 'Reassess engagement risk'],
  ['RV-006', 'Any acquisition/disposal/restructuring?', 'Accounting/audit complexity'],
  ['RV-007', 'Any new financing or debt covenant concern?', 'Going-concern/risk impact'],
  ['RV-008', 'Any new significant related parties?', 'Disclosure/audit impact'],
  ['RV-009', 'Any major litigation/regulatory investigation?', 'High risk / legal input'],
  ['RV-010', 'Any change in reporting framework?', 'Technical review'],
  ['RV-011', 'Any change in accounting software/data environment?', 'IT/process risk'],
  ['RV-012', "Were last year's records delivered late/incomplete?", 'Continuance condition'],
  ['RV-013', 'Were there repeated unsupported balances?', 'Higher engagement risk'],
  ['RV-014', 'Were there significant proposed adjustments?', 'Repeat-risk assessment'],
  ['RV-015', 'Did management refuse material adjustments?', 'Partner/continuance review'],
  ['RV-016', 'Were significant deficiencies reported?', 'Follow-up remediation status'],
  ['RV-017', "Was last year's report modified?", 'Reassess reason/current status'],
  ['RV-018', 'Was there a scope limitation?', 'Determine if recurring'],
  ['RV-019', 'Were representations difficult to obtain?', 'Integrity concern'],
  ['RV-020', 'Any suspected/confirmed fraud or illegal act concerns?', 'Compliance/partner review'],
  ['RV-021', 'Any complaints/allegations involving the engagement?', 'Quality management review'],
  ['RV-022', 'Are fees significantly overdue?', 'Commercial/independence review'],
  ['RV-023', 'Can the firm remain independent?', 'Mandatory for assurance'],
  ['RV-024', 'Does the firm still have competent resources?', 'Capacity check'],
  ['RV-025', 'Are deadlines achievable?', 'Resource scheduling'],
  ['RV-026', 'Have prior acceptance conditions been satisfied?', 'If no, escalate'],
  ['RV-027', 'Has client risk rating increased?', 'Recalculate'],
  ['RV-028', 'Should engagement scope/fee change?', 'Proposal update'],
  ['RV-029', 'Is a new engagement letter required by policy/change?', 'Generate new letter'],
  ['RV-030', 'Should the relationship continue?', 'Final partner conclusion'],
].map(([id, question, trigger]) => {
  const number = Number(id.slice(3))
  const professionalOnly = new Set([12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30]).has(number)
  const category = number <= 11 ? 'Client facts and scope' : number <= 22 ? 'Prior delivery and integrity' : 'Resources, independence and conclusion'
  return { id, question, trigger, evidence: trigger, category, professionalOnly }
})

export const clientEvaluationQuestionIds = clientEvaluationQuestions.map((item) => item.id)
export const annualContinuanceQuestionIds = annualContinuanceQuestions.map((item) => item.id)

export function questionById(id) {
  return clientEvaluationQuestions.find((item) => item.id === id) || annualContinuanceQuestions.find((item) => item.id === id) || null
}
