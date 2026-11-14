import {analyze,approve,listAccounts} from './core.js';
for(const {id,name} of listAccounts()){const r=await analyze(id);console.log('\n',name,r.proposal.status,r.proposal.reason,'tools:',r.toolCalls);if(r.proposal.status==='awaiting_approval')console.log('CRM created:',approve(r.id));}
