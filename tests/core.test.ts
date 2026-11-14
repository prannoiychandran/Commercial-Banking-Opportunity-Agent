import {events,funnel,evaluation,scenario} from '../src/measurement.js';
import test from 'node:test';import assert from 'node:assert/strict';
import {analyze,approve,reset,PolicyError} from '../src/core.js';
test('eligible account requires approval and creates CRM record once',async()=>{reset();const r=await analyze('acct_1042');assert.equal(r.proposal.status,'awaiting_approval');assert.ok(r.toolCalls>=5);const c=approve(r.id);assert.equal(c.accountId,'acct_1042');assert.throws(()=>approve(r.id),(e:unknown)=>e instanceof PolicyError&&e.code==='DUPLICATE');});
test('ineligible account blocked',async()=>{reset();const r=await analyze('acct_2075');assert.equal(r.proposal.status,'blocked');assert.throws(()=>approve(r.id),/not approvable/);});
test('incomplete data requires review',async()=>{reset();const r=await analyze('acct_3186');assert.equal(r.proposal.status,'needs_review');assert.equal(r.proposal.annualRevenue,null);});
test('account authorization enforced',async()=>{reset();await assert.rejects(()=>analyze('acct_1042','other_rm'),/not authorized/);});
test('measurement funnel counts unique run events and CRM creation',async()=>{reset();const a=await analyze('acct_1042');await analyze('acct_2075');let f=funnel();assert.equal(f.analyzed,2);assert.equal(f.eligible,1);assert.equal(f.blocked,1);assert.equal(f.created,0);assert.equal(f.rmAcceptanceRate,0);approve(a.id);f=funnel();assert.equal(f.created,1);assert.equal(f.approved,1);assert.equal(f.annualPipeline,12000);assert.equal(f.rmAcceptanceRate,1);assert.equal(f.realizedRevenue,null);assert.equal(f.modelCost,null);assert.ok(events().every(e=>e.schema_version==='1.0'&&e.environment==='synthetic_demo'));});
test('measurement scenario and evaluation explicitly avoid measured revenue and model claims',()=>{reset();assert.equal(scenario().annualizedFees,360000);assert.equal(scenario().netAnnualContribution,116000);assert.equal(evaluation().modelGroundingRate,null);assert.equal(funnel().rmAcceptanceRate,null);});
test('reset clears event ledger',async()=>{reset();await analyze('acct_3186');assert.ok(events().length>0);reset();assert.equal(events().length,0);});

test('streamed trace links to ledger and successful approval evidence', async () => {
  reset();
  const streamed: import('../src/core.js').Trace[] = [];
  const run = await analyze('acct_1042', undefined, undefined, event => streamed.push(event));
  assert.deepEqual(streamed, run.trace);
  assert.ok(streamed.some(event => event.kind === 'model' && event.system === 'openai'));
  const turns = streamed.filter(event => event.kind === 'model').map(event => event.responsesExchange!);
  assert.equal(turns.length, 4);
  assert.equal(turns[0].request.previous_response_id, undefined);
  assert.equal(turns[0].request.tools.length, 6);
  for (let index = 1; index < turns.length; index++) {
    const prior = turns[index - 1].response!;
    const request = turns[index].request;
    assert.equal(request.previous_response_id, prior.id);
    assert.ok(Array.isArray(request.input));
    assert.deepEqual(request.input.map(item => item.call_id),
      prior.output.flatMap(item => item.type === 'function_call' ? [item.call_id] : []));
  }
  const finalItem = turns.at(-1)?.response?.output[0];
  assert.equal(finalItem?.type, 'message');
  if (finalItem?.type === 'message') assert.equal(finalItem.content[0].type, 'output_text');
  assert.ok(streamed.filter(event => event.kind !== 'model').every(event => event.system === 'internal'));
  const toolEvents = events().filter(event => event.event_type === 'tool_call_completed');
  for (const entry of streamed.filter(event => event.kind === 'tool')) {
    const exchange = entry.toolExchange;
    assert.ok(exchange?.response);
    assert.equal(exchange.request.type, 'function_call');
    assert.equal(exchange.response.type, 'function_call_output');
    assert.equal(exchange.request.call_id, exchange.response.call_id);
    assert.deepEqual(JSON.parse(exchange.request.arguments), {customer_id: 'acct_1042'});
    assert.equal(exchange.response.output, entry.detail);
  }
  assert.deepEqual(streamed.filter(event => event.kind === 'tool').map(event => event.eventId),
    toolEvents.map(event => event.event_id));
  approve(run.id);
  assert.throws(() => approve(run.id), /Already approved/);
  const write = events().find(event => event.event_type === 'crm_opportunity_created');
  assert.ok(write);
  assert.equal(run.trace.at(-1)?.eventId, write.event_id);
  assert.equal(run.trace.at(-1)?.system, 'salesforce');
  assert.equal(evaluation().unauthorizedWrites, 0);
  assert.equal(evaluation().duplicateWrites, 0);
  assert.equal(evaluation().duplicateApprovalAttempts, 1);
});

test('reset during an analysis leaves the next demo ledger empty', async () => {
  reset();
  const pending = analyze('acct_1042');
  reset();
  await assert.rejects(pending, /Workspace was reset/);
  assert.equal(events().length, 0);
});

test('RM can record a follow-up, request refinement, and decline without creating CRM records', async () => {
  reset();
  const {respondToRecommendation, getOpportunities} = await import('../src/core.js');
  const brooklyn = await analyze('acct_1042');
  const manhattan = await analyze('acct_2075');
  const bronx = await analyze('acct_3186');

  assert.throws(() => respondToRecommendation(brooklyn.id, 'refine', ''), /requires a note/);
  assert.throws(() => respondToRecommendation(brooklyn.id, 'decline', '', 'other_rm'), /not authorized/);
  assert.equal(respondToRecommendation(brooklyn.id, 'refine', 'Check the fee estimate').proposal.decisionNote, 'Check the fee estimate');
  assert.throws(() => approve(brooklyn.id), /not approvable/);
  assert.equal(respondToRecommendation(manhattan.id, 'follow_up', '').proposal.followUpRecorded, true);
  assert.throws(() => respondToRecommendation(manhattan.id, 'follow_up', ''), /unavailable/);
  assert.equal(respondToRecommendation(bronx.id, 'decline', '').proposal.status, 'declined');
  assert.throws(() => approve(bronx.id), /not approvable/);
  assert.equal(getOpportunities().length, 0);
  assert.deepEqual(events().filter(event => event.event_type === 'rm_decision_recorded').map(event => event.payload.decision),
    ['refinement_requested', 'follow_up_recorded', 'declined']);
});
