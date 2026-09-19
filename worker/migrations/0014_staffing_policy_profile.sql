-- P8A — Staffing policy profile carried by the engagement record.
--
-- The commencement staffing rules live in shared/staffingRules.js and are
-- enforced identically by the browser-local domain and this Worker. Two of
-- their inputs are professional policy, not code: whether an Audit Manager may
-- be waived (approved small-firm engagement) and whether engagement quality
-- review applies. Before this migration the Worker had to pass constants, which
-- let LOCAL_ONLY and SHARED_DEMO disagree about the same team.
--
-- Both columns default to "not applicable", so existing rows keep their current
-- behaviour and no engagement is silently re-classified.

ALTER TABLE auditflow_engagement_state ADD COLUMN small_firm_mode INTEGER NOT NULL DEFAULT 0 CHECK (small_firm_mode IN (0, 1));
ALTER TABLE auditflow_engagement_state ADD COLUMN eqr_required INTEGER NOT NULL DEFAULT 0 CHECK (eqr_required IN (0, 1));

-- The seeded Northstar audit is an EQR-applicable engagement in the local
-- scenario fixture; the shared demo must declare the same policy or the two
-- modes report different completion guidance.
UPDATE auditflow_engagement_state SET eqr_required = 1 WHERE engagement_id = 'ENG-0018-AUD-2026' AND service = 'AUDIT';
