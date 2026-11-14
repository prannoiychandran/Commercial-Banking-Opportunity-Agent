import {randomUUID} from 'node:crypto';

export type MetricStatus = 'synthetic_demo' | 'scenario_assumption' | 'pilot_observed' | 'production_observed';
export type EventType = 'signal_detected' | 'analysis_started' | 'tool_call_completed' |
  'eligibility_decided' | 'revenue_estimated' | 'recommendation_presented' |
  'rm_decision_recorded' | 'crm_approval_rejected' | 'crm_opportunity_created' | 'run_completed';

type PayloadValue = string | number | boolean | null | readonly string[];
export type MeasurementEvent = {
  event_id: string;
  event_type: EventType;
  occurred_at: string;
  run_id: string;
  account_id: string;
  actor_type: 'agent' | 'rm' | 'policy' | 'system';
  source_system: string;
  environment: 'synthetic_demo';
  schema_version: '1.0';
  payload: Record<string, PayloadValue>;
};

const ledger: MeasurementEvent[] = [];
let windowStart = new Date().toISOString();

export function emit(
  event_type: EventType, run_id: string, account_id: string, actor_type: MeasurementEvent['actor_type'],
  source_system: string, payload: MeasurementEvent['payload'] = {}
) {
  const event: MeasurementEvent = {
    event_id: randomUUID(), event_type, occurred_at: new Date().toISOString(), run_id, account_id,
    actor_type, source_system, environment: 'synthetic_demo', schema_version: '1.0', payload
  };
  ledger.push(event);
  return event;
}

export function events() {
  return structuredClone(ledger);
}

export function clearEvents() {
  ledger.length = 0;
  windowStart = new Date().toISOString();
}

export function funnel() {
  const unique = (type: EventType, filter: (e: MeasurementEvent) => boolean = () => true) =>
    new Set(ledger.filter(e => e.event_type === type && filter(e)).map(e => e.run_id)).size;
  const started = ledger.filter(e => e.event_type === 'analysis_started');
  const analyzed = unique('analysis_started');
  const eligible = unique('eligibility_decided', e => e.payload.phase === 'analysis' && e.payload.eligible === true);
  const blocked = unique('eligibility_decided', e => e.payload.phase === 'analysis' && e.payload.eligible === false);
  const presented = unique('recommendation_presented');
  const approved = unique('rm_decision_recorded', e => e.payload.decision === 'approved');
  const writes = ledger.filter(e => e.event_type === 'crm_opportunity_created');
  const uniqueWrites = new Map(writes.map(e => [e.payload.idempotency_key, e]));
  const annualPipeline = [...uniqueWrites.values()].reduce((total, e) => total + Number(e.payload.annual_fee_estimate), 0);

  return {
    status: 'synthetic_demo' as const, source: 'event_ledger', windowStart, windowEnd: new Date().toISOString(),
    analyzed, uniqueAccounts: new Set(started.map(e => e.account_id)).size, eligible, blocked, presented, approved,
    completed: unique('run_completed', e => e.payload.status === 'completed'),
    failed: unique('run_completed', e => e.payload.status === 'failed'),
    created: uniqueWrites.size, annualPipeline,
    rmAcceptanceRate: presented ? approved / presented : null,
    qualificationRate: eligible ? approved / eligible : null,
    qualificationDenominator: 'unique eligible analyzed runs',
    revenueAttribution: 'not_measured', realizedRevenue: null, modelCost: null
  };
}

export function evaluation() {
  const decisions = new Map(ledger.filter(e => e.event_type === 'eligibility_decided').map(e => [e.event_id, e]));
  const approvals = new Set(ledger.filter(e => e.event_type === 'rm_decision_recorded' && e.payload.decision === 'approved')
    .map(e => e.payload.proposal_id));
  const writes = ledger.filter(e => e.event_type === 'crm_opportunity_created');
  const unauthorizedWrites = writes.filter(e => {
    const decision = decisions.get(String(e.payload.eligibility_check_id));
    return !approvals.has(e.payload.proposal_id) || decision?.run_id !== e.run_id ||
      decision.payload.phase !== 'approval' || decision.payload.eligible !== true;
  }).length;
  const rejections = ledger.filter(e => e.event_type === 'crm_approval_rejected');
  return {
    status: 'synthetic_demo' as const, source: 'event_ledger', policyBlockedRuns: funnel().blocked,
    unauthorizedWrites, duplicateWrites: writes.length - new Set(writes.map(e => e.payload.idempotency_key)).size,
    rejectedApprovals: rejections.length,
    duplicateApprovalAttempts: rejections.filter(e => e.payload.reason_code === 'DUPLICATE').length,
    modelGroundingRate: null, modelEvaluationStatus: 'not_evaluated',
    note: 'Write counters cover the local demo ledger. Automated tests cover selected guardrail cases.'
  };
}

export function scenario() {
  const accounts = 2000, coverage = .3, qualification = .2, conversion = .25;
  const fee = 12000, margin = .6, operatingCost = 100000;
  const analyzed = accounts * coverage;
  const qualified = analyzed * qualification;
  const wins = qualified * conversion;
  const annualizedFees = wins * fee;
  return {
    status: 'scenario_assumption' as const, accounts, coverage, qualification, conversion, fee, margin,
    operatingCost, analyzed, qualified, wins, annualizedFees,
    netAnnualContribution: annualizedFees * margin - operatingCost,
    disclaimer: 'Illustrative only. No measured incremental lift, revenue, model usage, or human time savings.'
  };
}
