import {events,funnel,evaluation,scenario} from './measurement.js';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {analyze,approve,respondToRecommendation,getRun,getOpportunities,listAccounts,reset,PolicyError,type AccountId} from './core.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../public');
const port=Number(process.env.PORT||3000);
const server=createServer(async(req,res)=>{
 const url=new URL(req.url||'/',`http://localhost:${port}`);
 const send=(code:number,data:unknown)=>{res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));};
 try{
  if(req.method==='GET'&&url.pathname==='/api/metrics')return send(200,{funnel:funnel(),evaluation:evaluation(),scenario:scenario()});
  if(req.method==='GET'&&url.pathname==='/api/events')return send(200,events());
  if(req.method==='GET'&&url.pathname==='/api/accounts')return send(200,listAccounts());
  if(req.method==='GET'&&url.pathname==='/api/opportunities')return send(200,getOpportunities());
  if(req.method==='GET'&&url.pathname.startsWith('/api/runs/'))return send(200,getRun(url.pathname.split('/').at(-1)!)||{error:'Not found'});
  if(req.method==='POST'&&url.pathname.startsWith('/api/')){
   let body='';for await(const chunk of req)body+=chunk;if(body.length>20000)return send(413,{error:'Payload too large'});
   const payload=body?JSON.parse(body):{};
   // Demo-only identity. Production must derive this from authenticated server-side session.
   const rmId='rm_001';
   if(url.pathname==='/api/analyze/stream'){
    res.writeHead(200,{'content-type':'application/x-ndjson; charset=utf-8','cache-control':'no-store'});
    res.flushHeaders();
    const write=(event:unknown)=>{
     if(!res.destroyed)res.write(JSON.stringify(event)+'\n');
    };
    try{
     const run=await analyze(payload.accountId as AccountId,rmId,undefined,event=>write({type:'trace',event}));
     write({type:'complete',run});
    }catch(err){
     write({type:'error',error:(err as Error).message});
    }
    return res.end();
   }
   if(url.pathname==='/api/analyze')return send(200,await analyze(payload.accountId as AccountId,rmId));
   if(url.pathname==='/api/recommendation/decision'){
    return send(200,respondToRecommendation(payload.runId,payload.action,payload.note,rmId));
   }
   if(url.pathname==='/api/approve')return send(200,approve(payload.runId,rmId));
   if(url.pathname==='/api/reset'){reset();return send(200,{ok:true});}
  }
  if(req.method==='GET'&&(url.pathname==='/'||url.pathname==='/index.html')){
   const html=await readFile(resolve(root,'index.html'));res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(html);
  }
  send(404,{error:'Not found'});
 }catch(err){const e=err as Error;send(err instanceof PolicyError?403:400,{error:e.message,code:err instanceof PolicyError?err.code:'BAD_REQUEST'});}
});
server.listen(port,'127.0.0.1',()=>console.log(`Empire State Bank demo running at http://127.0.0.1:${port}`));
