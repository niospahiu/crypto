import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { inspectOnchainQuote } from './quoteInspector.js';
import { verifyContractPayment } from './engineVerifier.js';
import { VerificationError } from './verifyTransfer.js';

// This ledger is only for LOCAL TESTNET development, not commercial orders.
const PATH = resolve(process.cwd(), '.tec-engine-orders.json');
const ID = /^0x[a-f0-9]{64}$/;
const ROUTE = /^\/api\/tec-engine\/quotes\/(0x[a-fA-F0-9]{64})\/(verify|status)$/;
let records = [];
try {
  const previous = JSON.parse(readFileSync(PATH, 'utf8'));
  if (Array.isArray(previous)) records = previous.filter(x => x && typeof x.quoteId === 'string').slice(-300);
} catch { /* first run */ }
function save() {
  const temp = PATH + '.tmp';
  writeFileSync(temp, JSON.stringify(records.slice(-300),null,2), { mode:0o600 });
  renameSync(temp,PATH);
}
function json(res,status,value){
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(value));
}
async function payload(req) {
  let b = '';
  for await (const data of req) {
    b += data;
    if (b.length > 1024) throw new VerificationError('Request too large.',413);
  }
  try { return JSON.parse(b || '{}'); }
  catch { throw new VerificationError('Malformed JSON.',400); }
}
function publicEntry(record) {
  return {quoteId:record.quoteId,buyer:record.buyer,orderRef:record.orderRef,
    receiver:record.receiver,amountRaw:'9000000',expiresAt:record.expiresAt,
    status:record.status,digest:record.digest || null,paidAt:record.paidAt || null};
}
export function enginePlugin(){
  return {name:'tec-contract-testnet-prototype',configureServer(vite){
    vite.middlewares.use(async(req,res,next)=>{
      const u=new URL(req.url || '/','http://127.0.0.1:5173');
      if(!u.pathname.startsWith('/api/tec-engine/'))return next();
      const origin=req.headers.origin;
      if(origin && !['http://127.0.0.1:5173','http://localhost:5173'].includes(origin))
        return json(res,403,{error:'Cross-origin request rejected.'});
      try{
        if(req.method==='POST' && u.pathname==='/api/tec-engine/quotes/register'){
          const {quoteId}=await payload(req);
          const id=typeof quoteId==='string'?quoteId.toLowerCase():'';
          if(!ID.test(id))throw new VerificationError('Invalid Quote ID.',400);
          const prior=records.find(r=>r.quoteId===id);
          if(prior)return json(res,200,publicEntry(prior));
          // On-chain object MUST exist before payment so the association is saved.
          const q=await inspectOnchainQuote({quoteId:id});
          if(q.state!=='ACTIVE')throw new VerificationError('Quote expired. A fresh on-chain Quote is required.',410);
          const record={quoteId:id,orderRef:q.orderRef,buyer:q.buyer,receiver:q.receiver,
            expiresAt:q.expiresAt,status:'AWAITING_TESTNET_PAYMENT',digest:null,paidAt:null};
          records.push(record);records=records.slice(-300);
          save();
          return json(res,201,publicEntry(record));
        }
        const m=u.pathname.match(ROUTE);
        if(m){
          const id=m[1].toLowerCase();
          const record=records.find(r=>r.quoteId===id);
          if(!record)return json(res,404,{error:'Quote not registered before payment. No attribution can be made.'});
          if(req.method==='GET' && m[2]==='status')return json(res,200,publicEntry(record));
          if(req.method==='POST' && m[2]==='verify'){
            const {digest}=await payload(req);
            if(typeof digest!=='string')throw new VerificationError('Digest required.',400);
            if(record.status==='VERIFIED_CONTRACT_TESTNET'){
              if(record.digest===digest)return json(res,200,publicEntry(record));
              throw new VerificationError('Quote already verified using a different digest.',409);
            }
            if(records.some(r=>r.quoteId!==id && r.digest===digest))
              throw new VerificationError('Transaction already used by another test record.',409);
            const proof=await verifyContractPayment({registered:record,digest});
            if(record.status!=='AWAITING_TESTNET_PAYMENT' ||
              records.some(r=>r.quoteId!==id && r.digest===digest))
              throw new VerificationError('Concurrent verification conflict.',409);
            record.status=proof.status;
            record.digest=proof.digest;
            record.paidAt=proof.paidAt;
            save();
            return json(res,200,publicEntry(record));
          }
        }
        return json(res,404,{error:'Unknown phase 8 route.'});
      }catch(e){
        if(e instanceof VerificationError)return json(res,e.statusCode,{error:e.message});
        console.error('[TEC PHASE 8]',e);
        return json(res,500,{error:'Local Testnet service unavailable.'});
      }
    });
  }};
}
