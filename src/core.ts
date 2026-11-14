import {clearEvents,emit,type EventType,type MeasurementEvent} from './measurement.js';
export type AccountId = 'acct_1042'|'acct_2075'|'acct_3186';
export type Account = {id:AccountId; name:string; industry:string; rmId:string; product:string; products:string[]; monthlyPayments:number; paymentGrowth:number; manualPayments:number; eligibility:'eligible'|'ineligible'|'review'; consent:boolean; dataComplete:boolean;};
export type TraceSystem = 'openai'|'internal'|'salesforce';
export type Trace = {step:number; system:TraceSystem; kind:'model'|'tool'|'policy'|'action'; name:string; status:'ok'|'blocked'|'pending'|'error'; detail:string; durationMs:number;eventId?:string; responsesExchange?:{request:ResponsesRequest; response?:ResponsesBody}; toolExchange?:{request:ToolCall; response?:ToolResult}};
export type Proposal = {id:string; accountId:AccountId; product:string; annualRevenue:number|null; evidence:string[]; status:'awaiting_approval'|'blocked'|'needs_review'|'approved'|'refinement_requested'|'declined'; reason:string; decisionNote?:string; followUpRecorded?:boolean};
export type Run = {id:string; accountId:AccountId; trace:Trace[]; proposal:Proposal; toolCalls:number; mock:true};
export type ToolCall = {type:'function_call';call_id:string;name:string;arguments:string};
export type ToolResult = {type:'function_call_output';call_id:string;output:string};
export type ModelResponse = {id:string;output:Array<ToolCall|{type:'message';content:string}>};
const toolDescriptions = {
 get_customer_profile: 'Retrieve the customer profile and consent status.',
 get_transaction_summary: 'Retrieve payment activity and data completeness.',
 get_existing_products: 'List the products the customer already uses.',
 search_product_catalog: 'Retrieve details for the relevant product.',
 check_product_eligibility: 'Check the customer’s eligibility for the relevant product.',
 estimate_revenue_opportunity: 'Estimate annual fees for an eligible opportunity.'
};
const responsesTools = Object.entries(toolDescriptions).map(([name,description])=>({
 type:'function' as const,name,description,strict:true,
 parameters:{
  type:'object',
  properties:{customer_id:{type:'string',description:'Opaque customer account ID'}},
  required:['customer_id'],additionalProperties:false
 }
}));
type ResponsesRequest = {
 model:string; instructions:string; tools:typeof responsesTools;
 input:string|ToolResult[]; previous_response_id?:string;
};
type ResponsesBody = {
 id:string; object:'response'; created_at:number; status:'completed'; model:string;
 output:Array<(ToolCall & {id:string;status:'completed'})|{
  type:'message'; id:string; role:'assistant'; status:'completed';
  content:Array<{type:'output_text';text:string;annotations:[]}>;
 }>;
};
export const accounts:Record<AccountId,Account> = {
 acct_1042:{id:'acct_1042',name:'Brooklyn Distribution',industry:'Logistics',rmId:'rm_001',product:'treasury_management',products:['business_checking','commercial_lending'],monthlyPayments:850,paymentGrowth:42,manualPayments:850,eligibility:'eligible',consent:true,dataComplete:true},
 acct_2075:{id:'acct_2075',name:'Manhattan Imports',industry:'Wholesale',rmId:'rm_001',product:'fx_treasury',products:['business_checking'],monthlyPayments:420,paymentGrowth:68,manualPayments:220,eligibility:'ineligible',consent:true,dataComplete:true},
 acct_3186:{id:'acct_3186',name:'Bronx Manufacturing',industry:'Manufacturing',rmId:'rm_001',product:'corporate_card',products:['business_checking'],monthlyPayments:310,paymentGrowth:29,manualPayments:170,eligibility:'review',consent:true,dataComplete:false}
};
export const catalog:Record<string,{name:string;annualFee:number;description:string}> = {treasury_management:{name:'Treasury Management',annualFee:12000,description:'ACH automation and cash management'},fx_treasury:{name:'FX Treasury',annualFee:18000,description:'International payment services'},corporate_card:{name:'Corporate Card',annualFee:9000,description:'Corporate spend management'}};
export class PolicyError extends Error {constructor(public code:string,message:string){super(message);this.name='PolicyError';}}
const runs=new Map<string,Run>(); const opportunities=new Map<string,{id:string;proposalId:string;accountId:AccountId;annualRevenue:number}>();
let seq=0;
let resetVersion=0;
export function listAccounts(){return Object.values(accounts).map(({id,name,industry,product,paymentGrowth,eligibility})=>({id,name,industry,product,paymentGrowth,eligibility}));}
export function getRun(id:string){return runs.get(id);}
export function getOpportunities(){return [...opportunities.values()];}
export function reset(){runs.clear();opportunities.clear();clearEvents();seq=0;resetVersion++;}
function authorize(rmId:string,account:Account){if(rmId!==account.rmId)throw new PolicyError('ACCESS_DENIED','RM is not authorized for this account');}
function tool(name:string,args:Record<string,unknown>,rmId:string):unknown{
 const id=args.customer_id;
 if(typeof id!=='string'||!Object.hasOwn(accounts,id))throw new PolicyError('INVALID_ACCOUNT','Unknown account');
 const a=accounts[id as AccountId];authorize(rmId,a);
 switch(name){
  case 'get_customer_profile':return {customer_id:a.id,name:a.name,industry:a.industry,consent:a.consent,rm_id:a.rmId,data_complete:a.dataComplete};
  case 'get_transaction_summary':return {customer_id:a.id,monthly_payments:a.monthlyPayments,payment_growth_pct:a.paymentGrowth,manual_payments:a.manualPayments,data_complete:a.dataComplete};
  case 'get_existing_products':return {customer_id:a.id,products:a.products};
  case 'search_product_catalog':return {product_id:a.product,...catalog[a.product]};
  case 'check_product_eligibility':return {customer_id:a.id,product_id:a.product,status:a.eligibility,reason:a.eligibility==='ineligible'?'Product-specific onboarding incomplete':a.eligibility==='review'?'Incomplete source data':'Eligibility checks passed'};
  case 'estimate_revenue_opportunity':if(a.eligibility!=='eligible'||!a.dataComplete)throw new PolicyError('REVENUE_ESTIMATE_BLOCKED','Eligibility and complete data required');return {annual_fee_revenue:catalog[a.product].annualFee,method:'Annual fee from product catalog'};
  default:throw new PolicyError('UNKNOWN_TOOL',`Tool ${name} not allowed`);
 }
}
// Mimics the Responses API function-call / function-call-output contract, not actual model reasoning.
export class MockResponsesAdapter {
 async create(input:{accountId:AccountId;previous?:ModelResponse;outputs?:ToolResult[]}):Promise<ModelResponse>{
  const turn=input.previous?Number(input.previous.id.split('_').at(-1))+1:1;
  const names=turn===1?['get_customer_profile','get_transaction_summary','get_existing_products']:turn===2?['search_product_catalog','check_product_eligibility']:turn===3&&accounts[input.accountId].eligibility==='eligible'?['estimate_revenue_opportunity']:[];
  return {id:`mock_response_${turn}`,output:names.length?names.map((name,i)=>({type:'function_call' as const,call_id:`call_${turn}_${i}`,name,arguments:JSON.stringify({customer_id:input.accountId})})):[{type:'message',content:'Investigation complete. Recommendation must pass application policy checks.'}]};
 }
}
export async function analyze(accountId:AccountId,rmId='rm_001',adapter=new MockResponsesAdapter(),onTrace?:(event:Trace)=>void):Promise<Run>{
 const account=Object.hasOwn(accounts,accountId)?accounts[accountId]:undefined;if(!account)throw new PolicyError('INVALID_ACCOUNT','Unknown account');authorize(rmId,account);
 const version=resetVersion;
 const id=`run_${++seq}`;
 const started=performance.now();
 const trace:Trace[]=[];
 let previous:ModelResponse|undefined;
 let outputs:ToolResult[]|undefined;
 let calls=0;
 let estimateId:string|null=null;
 const record=(type:EventType,actor:MeasurementEvent['actor_type'],source:string,payload:MeasurementEvent['payload'])=>
  emit(type,id,accountId,actor,source,payload);
 const log=(kind:Trace['kind'],name:string,status:Trace['status'],detail:string,durationMs:number,eventId?:string,exchanges:Pick<Trace,'toolExchange'|'responsesExchange'>={})=>{
  const event:Trace={step:trace.length+1,system:kind==='model'?'openai':'internal',kind,name,status,detail,durationMs,eventId,...exchanges};
  trace.push(event);
  onTrace?.(event);
 };
 const signalId=`signal_${id}`;
 record('signal_detected','system','synthetic_signal_feed',{
  signal_id:signalId,signal_type:'payment_activity_growth',detected_at:new Date().toISOString(),
  source_record_ids:[`synthetic_get_transaction_summary_${accountId}`]
 });
 record('analysis_started','agent','mock_responses_adapter',{
  signal_id:signalId,model_adapter:'mock',model_id_or_mock:'scripted_mock',prompt_version:'v1'
 });
 let failureClass='model';
 try{
  for(let turn=0;turn<5;turn++){
   failureClass='model';
   const modelStarted=performance.now();
   const name=`Model turn #${turn+1}`;
   const request:ResponsesRequest={
    model:'gpt-6-astra',
    instructions:'Assess the account using the supplied banking tools. Respect product eligibility and require relationship manager approval before creating a CRM opportunity.',
    tools:responsesTools,
    ...(previous ? {previous_response_id:`resp_${id}_${turn}`,input:outputs ?? []} :
     {input:`Assess revenue opportunities for customer ${accountId}.`})
   };
   let response:ModelResponse;
   try{
    response=await adapter.create({accountId,previous,outputs});
   }catch(error){
    if(version===resetVersion)log('model',name,'error','Model turn failed',performance.now()-modelStarted,undefined,{responsesExchange:{request}});
    throw error;
   }
   if(version!==resetVersion)throw new PolicyError('RUN_RESET','Workspace was reset during analysis');
   const body:ResponsesBody={
    id:`resp_${id}_${turn+1}`,object:'response',created_at:Math.floor(Date.now()/1000),
    status:'completed',model:request.model,
    output:response.output.map((item,index)=>item.type==='function_call'
     ? {...item,id:`fc_${id}_${turn+1}_${index}`,status:'completed'}
     : {type:'message',id:`msg_${id}_${turn+1}_${index}`,role:'assistant',status:'completed',
        content:[{type:'output_text',text:item.content,annotations:[]}]})
   };
   log('model',name,'ok',`${response.output.length} output item(s)`,performance.now()-modelStarted,
    undefined,{responsesExchange:{request,response:body}});
   const requested=response.output.filter((o):o is ToolCall=>o.type==='function_call');
   if(!requested.length)break;
   failureClass='tool';
   outputs=[];
   for(const call of requested){
    const toolStarted=performance.now();
    const recordId=`synthetic_${call.name}_${accountId}`;
    let output:string;
    try{
     const args=JSON.parse(call.arguments) as Record<string,unknown>;
     output=JSON.stringify(tool(call.name,args,rmId));
    }catch(error){
     const duration=performance.now()-toolStarted;
     const event=record('tool_call_completed','agent','banking_mock',{
      tool_name:call.name,status:'error',duration_ms:duration,call_id:call.call_id
     });
     log('tool',call.name,'error',error instanceof PolicyError?error.code:'Tool execution failed',duration,event.event_id,{toolExchange:{request:call}});
     throw error;
    }
    calls++;
    const duration=performance.now()-toolStarted;
    const event=record('tool_call_completed','agent','banking_mock',{
     tool_name:call.name,status:'ok',duration_ms:duration,call_id:call.call_id,
     input_record_ids:[accountId],output_record_ids:[recordId]
    });
    const response:ToolResult={type:'function_call_output',call_id:call.call_id,output};
    log('tool',call.name,'ok',output,duration,event.event_id,{toolExchange:{request:call,response}});
    if(call.name==='estimate_revenue_opportunity'){
     const estimate=JSON.parse(output) as {annual_fee_revenue:number};
     estimateId=record('revenue_estimated','system','pricing_engine',{
      product_id:account.product,annual_fee_estimate:estimate.annual_fee_revenue,currency:'USD',
      pricing_version:'synthetic-v1',assumption_ids:['catalog_fee']
     }).event_id;
    }
    outputs.push(response);
   }
   previous=response;
  }
  failureClass='policy';
  const policyStarted=performance.now();
  const eligible=account.eligibility==='eligible'&&account.dataComplete&&account.consent;
  const status:Proposal['status']=eligible?'awaiting_approval':account.eligibility==='ineligible'?'blocked':'needs_review';
  const reason=eligible?'RM approval required before CRM write':account.eligibility==='ineligible'?'Onboarding incomplete: product offer blocked':'Missing information: RM investigation required';
  const reasonCodes=policyReasonCodes(account);
  const decision=record('eligibility_decided','policy','eligibility_engine',{
   product_id:account.product,eligible,reason_codes:reasonCodes,policy_version:'demo-v1',phase:'analysis'
  });
  log('policy','product_and_data_guardrails',eligible?'ok':'blocked',`${reason} (${reasonCodes.join(', ')})`,
   performance.now()-policyStarted,decision.event_id);
  const proposal:Proposal={
   id:`proposal_${id}`,accountId,product:account.product,annualRevenue:eligible?catalog[account.product].annualFee:null,
   evidence:[`${account.paymentGrowth}% payment growth`,`${account.manualPayments} manual payments/month`,`Current products: ${account.products.join(', ')}`],
   status,reason
  };
  if(version!==resetVersion)throw new PolicyError('RUN_RESET','Workspace was reset during analysis');
  const run:Run={id,accountId,trace,proposal,toolCalls:calls,mock:true};
  runs.set(id,run);
  if(eligible)record('recommendation_presented','agent','revenue_workspace',{
   proposal_id:proposal.id,product_id:proposal.product,
   evidence_record_ids:[`synthetic_get_transaction_summary_${accountId}`,`synthetic_get_existing_products_${accountId}`],
   estimate_id:estimateId
  });
  record('run_completed','system','orchestrator',{status:'completed',duration_ms:performance.now()-started,failure_class:null});
  return run;
 }catch(error){
  if(version===resetVersion)record('run_completed','system','orchestrator',{
   status:'failed',duration_ms:performance.now()-started,failure_class:failureClass
  });
  throw error;
 }
}

function policyReasonCodes(account:Account){
 const reasons:string[]=[];
 if(account.eligibility==='ineligible')reasons.push('PRODUCT_INELIGIBLE');
 if(account.eligibility==='review')reasons.push('REVIEW_REQUIRED');
 if(!account.dataComplete)reasons.push('INCOMPLETE_DATA');
 if(!account.consent)reasons.push('CONSENT_REQUIRED');
 return reasons.length?reasons:['ELIGIBLE'];
}

export function approve(runId:string,rmId='rm_001'){
 const started=performance.now();
 const run=runs.get(runId);
 if(!run)throw new PolicyError('RUN_NOT_FOUND','Unknown run');
 const account=accounts[run.accountId];
 const recordEvent=(type:EventType,actor:MeasurementEvent['actor_type'],source:string,payload:MeasurementEvent['payload'])=>
  emit(type,run.id,account.id,actor,source,payload);
 let eligibilityCheck:MeasurementEvent;
 try{
  authorize(rmId,account);
  if(run.proposal.status==='approved')throw new PolicyError('DUPLICATE','Already approved');
  if(run.proposal.status!=='awaiting_approval')throw new PolicyError('APPROVAL_BLOCKED','Proposal is not approvable');
  const reasons=policyReasonCodes(account);
  const eligible=reasons[0]==='ELIGIBLE';
  eligibilityCheck=recordEvent('eligibility_decided','policy','eligibility_engine',{
   product_id:account.product,eligible,reason_codes:reasons,policy_version:'demo-v1',phase:'approval'
  });
  if(!eligible)throw new PolicyError('POLICY_CHANGED','Fresh eligibility check failed');
  if(opportunities.has(run.proposal.id))throw new PolicyError('DUPLICATE','Opportunity already exists');
 }catch(error){
  if(error instanceof PolicyError)recordEvent('crm_approval_rejected','policy','eligibility_engine',{
   proposal_id:run.proposal.id,reason_code:error.code
  });
  throw error;
 }
 const record={
  id:`crm_${opportunities.size+1}`,proposalId:run.proposal.id,accountId:account.id,
  annualRevenue:run.proposal.annualRevenue!
 };
 recordEvent('rm_decision_recorded','rm','revenue_workspace',{
  proposal_id:run.proposal.id,decision:'approved',rm_actor_id:rmId,
  decision_at:new Date().toISOString(),reason_code:'explicit_approval'
 });
 opportunities.set(run.proposal.id,record);
 const write=recordEvent('crm_opportunity_created','system','crm_mock',{
  proposal_id:run.proposal.id,crm_opportunity_id:record.id,idempotency_key:run.proposal.id,
  eligibility_check_id:eligibilityCheck.event_id,annual_fee_estimate:record.annualRevenue
 });
 run.proposal.status='approved';
 run.trace.push({
  step:run.trace.length+1,kind:'action',system:'salesforce',name:'create_crm_opportunity',status:'ok',
  detail:`Created ${record.id} after explicit RM approval`,durationMs:performance.now()-started,eventId:write.event_id
 });
 return record;
}

export function respondToRecommendation(runId:string, action:unknown, note:unknown, rmId='rm_001'){
 const run=runs.get(runId);
 if(!run)throw new PolicyError('RUN_NOT_FOUND','Unknown run');
 const account=accounts[run.accountId];
 authorize(rmId,account);
 const proposal=run.proposal;
 if(action!=='refine'&&action!=='decline'&&action!=='follow_up'){
  throw new PolicyError('INVALID_DECISION','Choose a supported next step');
 }
 const comment=typeof note==='string'?note.trim():'';
 if(comment.length>500||(action==='refine'&&!comment)){
  throw new PolicyError('INVALID_NOTE','Enter up to 500 characters. Refinement requires a note.');
 }
 if(!['awaiting_approval','blocked','needs_review'].includes(proposal.status)){
  throw new PolicyError('DECISION_CLOSED','This recommendation already has a final decision');
 }
 if(action==='follow_up'){
  if(proposal.status==='awaiting_approval'||proposal.followUpRecorded){
   throw new PolicyError('FOLLOW_UP_UNAVAILABLE','A follow-up is unavailable for this recommendation');
  }
  proposal.followUpRecorded=true;
 }else{
  proposal.status=action==='refine'?'refinement_requested':'declined';
  proposal.decisionNote=comment;
 }
 const decision=action==='refine'?'refinement_requested':action==='decline'?'declined':'follow_up_recorded';
 const event=emit('rm_decision_recorded',run.id,account.id,'rm','revenue_workspace',{
  proposal_id:proposal.id,decision,rm_actor_id:rmId,decision_at:new Date().toISOString(),
  reason_code:decision,has_note:Boolean(comment)
 });
 run.trace.push({
  step:run.trace.length+1,kind:'action',system:'internal',name:decision,status:'ok',
  detail:'Relationship manager decision recorded',durationMs:0,eventId:event.event_id
 });
 return run;
}
