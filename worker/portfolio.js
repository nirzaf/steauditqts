// Phase D — operational portfolio projections.
//
// These functions are deliberately pure. The Worker supplies canonical D1
// snapshots and the Phase B progress projection; this module only derives
// explainable operational views from those records. It never invents a stage,
// an owner, or a workflow action in the browser.
import { progressOwnerLabel } from './progress.js';

export const REQUIRED_DOCUMENT_OUTPUTS = 26;

export const SCENARIO_PRESETS = Object.freeze([
  Object.freeze({ key: 'NEW_CLIENT', label: 'New client', stage: 'STAGE-01', description: 'Focus acceptance evidence, ownership checks, and the partner decision.' }),
  Object.freeze({ key: 'FIELDWORK', label: 'Fieldwork', stage: 'STAGE-05', description: 'Focus PBC evidence, trial balance validation, and assigned procedures.' }),
  Object.freeze({ key: 'MANAGER_REVIEW_BLOCKED', label: 'Manager review blocked', stage: 'STAGE-07', description: 'Focus unresolved review points and the manager completion gate.' }),
  Object.freeze({ key: 'READY_FOR_PARTNER', label: 'Ready for partner', stage: 'STAGE-07', description: 'Focus the current manager recommendation and partner review handoff.' }),
  Object.freeze({ key: 'READY_FOR_RELEASE', label: 'Ready for release', stage: 'STAGE-08', description: 'Focus final discussion, release checks, and records handoff.' }),
]);

const presetByKey = new Map(SCENARIO_PRESETS.map((preset) => [preset.key, preset]));
const staleDecisionTypes = new Set([
  'DRAFT_FS',
  'MANAGER_COMPLETION',
  'PARTNER_COMPLETION_REVIEW',
  'AUDIT_OPINION',
  'FINAL_CLIENT_DISCUSSION',
]);

export function resolveScenarioPreset(value) {
  return presetByKey.get(String(value || '').trim().toUpperCase()) || null;
}

function dateOnly(value) {
  const match = String(value || '').match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}

function incompleteTask(task) {
  const state = String(task?.state || '').toUpperCase();
  return state !== 'COMPLETE' && state !== 'CANCELLED';
}

function generationOf(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 1;
}

export function deriveProcessHealth(rawSnapshot = {}, rawProgress = {}) {
  const snapshot = rawSnapshot && typeof rawSnapshot === 'object' ? rawSnapshot : {};
  const progress = rawProgress && typeof rawProgress === 'object' ? rawProgress : {};
  const today = dateOnly(snapshot.today) || new Date().toISOString().slice(0, 10);
  const inputGeneration = generationOf(snapshot.inputGeneration);
  const evaluatedGeneration = generationOf(snapshot.evaluatedGeneration);
  const taskRows = Array.isArray(snapshot.tasks) ? snapshot.tasks : [];
  const openTasks = taskRows.filter(incompleteTask);
  const overdueTasks = openTasks.filter((task) => {
    const due = dateOnly(task?.dueDate || task?.due_date);
    return Boolean(due && due < today);
  });
  const reviewPoints = Array.isArray(snapshot.reviewPoints) ? snapshot.reviewPoints : [];
  const significantIssues = reviewPoints.filter((point) => (
    String(point?.state || '').toUpperCase() === 'OPEN'
    && String(point?.severity || '').toUpperCase() === 'SIGNIFICANT'
  ));
  const staleDecisions = Object.entries(snapshot.decisions || {})
    .filter(([type, decision]) => staleDecisionTypes.has(type) && decision && generationOf(decision.generation) < inputGeneration)
    .map(([type, decision]) => ({ type, decision: decision.decision || '', generation: generationOf(decision.generation) }));
  const staleReviewPoints = reviewPoints
    .filter((point) => String(point?.state || '').toUpperCase() === 'CLEARED' && generationOf(point?.clearedGeneration) < inputGeneration)
    .map((point) => ({ id: point.id || '', generation: generationOf(point.clearedGeneration) }));
  const blockers = Array.isArray(progress.blockers) ? progress.blockers : [];
  const warnings = Array.isArray(progress.warnings) ? progress.warnings : [];
  const artifactsCreated = Math.max(0, Number(snapshot.artifactCount) || 0);
  const artifactsPublished = Math.max(0, Number(snapshot.publishedArtifactCount) || 0);
  const missingDocuments = Math.max(0, REQUIRED_DOCUMENT_OUTPUTS - artifactsCreated);
  const isCurrent = inputGeneration === evaluatedGeneration;
  const blocking = blockers.length > 0 || significantIssues.length > 0 || !isCurrent;
  const atRisk = overdueTasks.length > 0 || staleDecisions.length > 0 || staleReviewPoints.length > 0;
  return {
    status: blocking ? 'BLOCKED' : atRisk ? 'AT_RISK' : progress.valid === false ? 'ATTENTION' : 'ON_TRACK',
    validity: {
      valid: progress.valid === true,
      currentStage: progress.currentStage || snapshot.cachedStage || '',
      cachedStage: snapshot.cachedStage || '',
      blockers: blockers.length,
      warnings: warnings.length,
    },
    dataGeneration: {
      current: isCurrent,
      inputGeneration,
      evaluatedGeneration,
      state: isCurrent ? 'CURRENT' : 'STALE',
    },
    tasks: {
      open: openTasks.length,
      overdue: overdueTasks.length,
      overdueTaskIds: overdueTasks.map((task) => task.id || task.taskId || ''),
    },
    significantIssues: significantIssues.map((point) => ({ id: point.id || '', severity: point.severity || 'SIGNIFICANT', owner: point.owner || '' })),
    staleApprovals: [...staleDecisions, ...staleReviewPoints.map((point) => ({ type: 'REVIEW_POINT', ...point }))],
    documents: {
      required: REQUIRED_DOCUMENT_OUTPUTS,
      created: artifactsCreated,
      ready: artifactsPublished,
      missing: missingDocuments,
    },
    nextBestAction: progress.nextAction || null,
    blockers,
    warnings,
    derivedFrom: 'd1',
  };
}

function healthOrder(status) {
  return ({ BLOCKED: 0, ATTENTION: 1, AT_RISK: 2, ON_TRACK: 3 })[status] ?? 4;
}

export function buildPortfolioRows(contexts = [], progressById = {}, healthById = {}) {
  return (Array.isArray(contexts) ? contexts : []).map((context) => {
    const engagementId = context?.engagementId || '';
    const progress = progressById[engagementId] || {};
    const health = healthById[engagementId] || {};
    const next = health.nextBestAction || progress.nextAction || null;
    const firstBlocker = (health.blockers || progress.blockers || [])[0] || null;
    return {
      engagementId,
      client: context?.clientName || context?.clientId || '',
      clientShortName: context?.clientShortName || context?.clientName || context?.clientId || '',
      service: context?.serviceLabel || context?.service || '',
      period: context?.period || '',
      stage: progress.currentStage || context?.currentStage || '',
      stageLabel: progress.currentStageLabel || '',
      progress: Number(progress.completionPercent || 0),
      health: health.status || 'ATTENTION',
      blocker: firstBlocker ? firstBlocker.message || firstBlocker.code || '' : '',
      nextOwner: next?.ownerLabel || progressOwnerLabel(next?.ownerRole || ''),
      nextOwnerRole: next?.ownerRole || '',
      nextAction: next?.title || '',
      nextRoute: next?.route || 'role-workspace',
      openTasks: Number(health.tasks?.open || progress.tasks?.open || 0),
      overdueTasks: Number(health.tasks?.overdue || progress.tasks?.overdue || 0),
      significantIssues: Array.isArray(health.significantIssues) ? health.significantIssues.length : 0,
      updatedAt: context?.updatedAt || '',
    };
  }).sort((left, right) => (
    healthOrder(left.health) - healthOrder(right.health)
    || right.overdueTasks - left.overdueTasks
    || right.significantIssues - left.significantIssues
    || String(left.client).localeCompare(String(right.client))
  ));
}

const priorityOrder = Object.freeze({ CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 });

export function taskPriorityTuple(task = {}, today = new Date().toISOString().slice(0, 10)) {
  const state = String(task.state || '').toUpperCase();
  const escalation = String(task.escalationState || task.escalation_state || '').toUpperCase();
  const due = dateOnly(task.slaDueAt || task.sla_due_at || task.dueDate || task.due_date);
  const blocked = state === 'BLOCKED' || escalation === 'ESCALATED';
  const overdue = incompleteTask(task) && Boolean(due && due < today);
  const priority = priorityOrder[String(task.priority || 'NORMAL').toUpperCase()] ?? priorityOrder.NORMAL;
  const route = String(task.route || task.target || '');
  return [blocked ? 0 : 1, overdue ? 0 : 1, priority, due || '9999-12-31', route, String(task.taskId || task.task_id || '')];
}

export function rankTasks(tasks = [], today) {
  return [...(Array.isArray(tasks) ? tasks : [])].sort((left, right) => {
    const a = taskPriorityTuple(left, today);
    const b = taskPriorityTuple(right, today);
    for (let index = 0; index < a.length; index += 1) {
      if (a[index] < b[index]) return -1;
      if (a[index] > b[index]) return 1;
    }
    return 0;
  });
}
