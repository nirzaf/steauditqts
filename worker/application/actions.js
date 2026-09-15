// M7 PIPE-01 — concrete action registry, not a generic workflow engine.

export const ACTION_REGISTRY = Object.freeze({
  SUBMIT_CLIENT_DETAILS: { roles: ['client_contributor', 'client_finance', 'management_approver', 'system_admin'], targetType: 'client_profile' },
  VERIFY_ADVANCE: { roles: ['finance_team'], targetType: 'commercial' },
  ISSUE_TEMP_CREDENTIAL: { roles: ['engagement_partner', 'system_admin'], targetType: 'credential' },
  ACTIVATE_PORTAL: { roles: ['client_contributor', 'client_finance', 'management_approver'], targetType: 'portal' },
  ISSUE_ANNOUNCEMENT: { roles: ['audit_senior', 'audit_manager'], targetType: 'announcement' },
  RECORD_ESTIMATE: { roles: ['finance_team'], targetType: 'commercial' },
  APPROVE_FEE: { roles: ['engagement_partner'], targetType: 'commercial' },
  RESPOND_EL: { roles: ['management_approver'], targetType: 'engagement_letter' },
  CREATE_PBC_REQUEST: { roles: ['audit_senior', 'audit_manager'], targetType: 'pbc_request' },
  SUBMIT_PBC_RECEIPT: { roles: ['client_contributor', 'client_finance', 'system_admin'], targetType: 'pbc_receipt' },
  RESPOND_PBC_RECEIPT: { roles: ['audit_senior', 'audit_manager'], targetType: 'pbc_receipt' },
  SUBMIT_WORKPAPER: { roles: ['preparer', 'audit_senior'], targetType: 'workpaper' },
  CREATE_REVIEW_POINT: { roles: ['audit_manager', 'independent_reviewer', 'engagement_partner'], targetType: 'review_point' },
  CLEAR_REVIEW_POINT: { roles: ['audit_manager', 'independent_reviewer', 'engagement_partner'], targetType: 'review_point' },
  PUBLISH_DRAFT_FS: { roles: ['audit_senior', 'audit_manager'], targetType: 'draft_fs' },
  COMPLETE_EQR: { roles: ['eqr_reviewer'], targetType: 'candidate' },
  RELEASE_FINAL_REPORT: { roles: ['engagement_partner'], targetType: 'release' },
  DELIVER_FINAL_REPORT: { roles: ['engagement_partner'], targetType: 'release' },
  CREATE_INVOICE: { roles: ['finance_team'], targetType: 'invoice' },
  CLOSE_ENGAGEMENT: { roles: ['finance_team'], targetType: 'commercial' },
  SUBMIT_AUDIT_FILE: { roles: ['audit_senior', 'preparer'], targetType: 'audit_file' },
  RECOMMEND_COMPLETION: { roles: ['audit_manager'], targetType: 'candidate' },
  RETURN_TO_TEAM: { roles: ['audit_manager'], targetType: 'candidate' },
  REVIEW_PARTNER_COMPLETION: { roles: ['engagement_partner'], targetType: 'candidate' },
  RETURN_TO_MANAGER: { roles: ['engagement_partner'], targetType: 'candidate' },
  RECORD_FINAL_DISCUSSION: { roles: ['engagement_partner'], targetType: 'candidate' },
  VERIFY_RELEASE_CHECKPOINT: { roles: ['records_custodian'], targetType: 'release' },
  ASSEMBLE_ARCHIVE: { roles: ['records_custodian'], targetType: 'release' },
  ACCEPT_CLIENT: { roles: ['engagement_partner'], targetType: 'assessment' },
  RECORD_MANAGER_COMPLETION: { roles: ['audit_manager'], targetType: 'candidate' },
  RECORD_PARTNER_REVIEW: { roles: ['engagement_partner'], targetType: 'candidate' },
  RECORD_AUDIT_OPINION: { roles: ['engagement_partner'], targetType: 'candidate' },
  RESPOND_DRAFT_FS: { roles: ['management_approver'], targetType: 'draft_fs' },
  APPROVE_ACCOUNTING_FS: { roles: ['management_approver'], targetType: 'accounting_package' },
  APPLY_SCENARIO_PRESET: { roles: ['system_admin', 'engagement_partner', 'audit_manager'], targetType: 'engagement' },
  // These commands intentionally include the exact technical/client roles
  // accepted by their Worker handlers.  A presenter admin may carry
  // `system_admin`, but that role is never treated as every professional
  // authority; it is only allowed on the explicitly listed operations.
  RECORD_ASSESSMENT_RESPONSE: { roles: ['client_contributor', 'client_finance', 'management_approver', 'preparer', 'compliance_reviewer', 'engagement_partner', 'system_admin'], targetType: 'assessment' },
  UPDATE_ACCOUNTING_STATUS: { roles: ['preparer', 'accounting_reviewer', 'system_admin'], targetType: 'accounting_package' },
  EVALUATE_ACCOUNTING_INPUT: { roles: ['audit_senior', 'audit_manager'], targetType: 'accounting_package' },
  RECORD_TB_SOURCE: { roles: ['client_contributor', 'preparer', 'accounting_reviewer', 'system_admin'], targetType: 'tb_source' },
})

export function actionDefinition(action) {
  return ACTION_REGISTRY[String(action || '').toUpperCase()] || null
}

export function actionAllowed(action, roles = []) {
  const definition = actionDefinition(action)
  return Boolean(definition && definition.roles.some((role) => roles.includes(role)))
}
