import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyContractPayment } from './engineVerifier.js';
import { PAYMENT_PACKAGE, OFFICIAL_MERCHANT_CAP } from './quoteInspector.js';
import { TEC_TYPE, DEMO_RECEIVER, VerificationError } from './verifyTransfer.js';

const BUYER='0xf72dff105a6f7057febbaf37fa07a87376c5e49d3fa14da6ea7b8f94ada48d74';
const QUOTE='0x8aca403881fca62cf43e02eb80b5e4635d3ed1fd4b389bb566e10a9b169cd700';
const digest='BekaYTY8vgZSGupRvz1MDYXRAfkjBph3cYMPYHkiyMjn';
const expiresAt=1792241416438;
const registered={quoteId:QUOTE,orderRef:'TEC-TEST-001',buyer:BUYER,
  receiver:DEMO_RECEIVER,expiresAt,status:'AWAITING_TESTNET_PAYMENT'};
const event={
  eventType:PAYMENT_PACKAGE+'::checkout::PaymentAccepted',
  json:{quote_id:QUOTE,merchant_cap_id:OFFICIAL_MERCHANT_CAP,
    order_ref:'VEVDLVRFU1QtMDAx',buyer:BUYER,receiver:DEMO_RECEIVER,
    raw_amount:'9000000',paid_at_ms:String(expiresAt-1000)},
};
const success={Transaction:{digest,status:{success:true},transaction:{sender:BUYER},
  events:[event],balanceChanges:[
    {address:BUYER,coinType:TEC_TYPE,amount:'-9000000'},
    {address:DEMO_RECEIVER,coinType:TEC_TYPE,amount:'9000000'},
  ]}};
const verify=(result=success,reg=registered)=>verifyContractPayment({
  registered:reg,digest,client:{getTransaction:async()=>result},
});

test('accepts exact official contract event and matching TEC debit/credit',async()=>{
  const proof=await verify();
  assert.equal(proof.status,'VERIFIED_CONTRACT_TESTNET');
});
test('rejects unrelated generic TEC transfer without PaymentAccepted',async()=>{
  await assert.rejects(verify({Transaction:{...success.Transaction,events:[]}}),VerificationError);
});
test('rejects untrusted quote/cap, wrong order ref or receiver',async()=>{
  for(const [key,bad] of [['quote_id',BUYER],['merchant_cap_id',BUYER],['order_ref','YmFk'],['receiver',BUYER]]){
    const ev={...event,json:{...event.json,[key]:bad}};
    await assert.rejects(verify({Transaction:{...success.Transaction,events:[ev]}}),VerificationError);
  }
});
test('rejects incorrect token transfer and wrong sender',async()=>{
  for(const changes of [
    [{...success.Transaction.balanceChanges[0],amount:'-8000000'},success.Transaction.balanceChanges[1]],
    [success.Transaction.balanceChanges[0],{...success.Transaction.balanceChanges[1],coinType:'0x2::sui::SUI'}],
  ])await assert.rejects(verify({Transaction:{...success.Transaction,balanceChanges:changes}}),VerificationError);
  await assert.rejects(verify({Transaction:{...success.Transaction,transaction:{sender:DEMO_RECEIVER}}}),VerificationError);
});
test('rejects late event and failed transaction',async()=>{
  const ev={...event,json:{...event.json,paid_at_ms:String(expiresAt+1)}};
  await assert.rejects(verify({Transaction:{...success.Transaction,events:[ev]}}),VerificationError);
  await assert.rejects(verify({FailedTransaction:success.Transaction}),VerificationError);
});
test('rejects unregistered quote and duplicate events',async()=>{
  await assert.rejects(verify(success,{...registered,status:'SIMULATED'}),VerificationError);
  await assert.rejects(verify({Transaction:{...success.Transaction,events:[event,event]}}),VerificationError);
});
