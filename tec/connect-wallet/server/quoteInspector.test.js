import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectOnchainQuote, PAYMENT_PACKAGE, OFFICIAL_MERCHANT_CAP, FIRST_TEST_QUOTE } from './quoteInspector.js';
import { TEC_TYPE, DEMO_RECEIVER, VerificationError } from './verifyTransfer.js';

const BUYER='0xf72dff105a6f7057febbaf37fa07a87376c5e49d3fa14da6ea7b8f94ada48d74';
const EXPIRY=1792241416438;
const BASE={
  objectId: FIRST_TEST_QUOTE,
  type: PAYMENT_PACKAGE+'::checkout::Quote<'+TEC_TYPE+'>',
  owner: { $kind:'AddressOwner', AddressOwner:BUYER },
  json: { buyer:BUYER, receiver:DEMO_RECEIVER, merchant_cap_id:OFFICIAL_MERCHANT_CAP,
    order_ref:'VEVDLVRFU1QtMDAx', raw_amount:'9000000', expires_at_ms:String(EXPIRY) },
};
const mock=(data=BASE)=>({getObject:async()=>({object:data})});

test('inspects exact existing onchain TEC quote, decodes orderRef, never says paid', async()=>{
  const q=await inspectOnchainQuote({client:mock(), now:EXPIRY+1000});
  assert.equal(q.orderRef,'TEC-TEST-001');
  assert.equal(q.state,'EXPIRED');
  assert.equal(q.isPaid,false);
  assert.equal(q.amount,'9');
});
test('rejects forged merchant capability and spoofed coin',async()=>{
  for (const variant of [
    { ...BASE, json:{...BASE.json,merchant_cap_id:BUYER} },
    { ...BASE, type: PAYMENT_PACKAGE+'::checkout::Quote<0x2::sui::SUI>' },
  ]) await assert.rejects(inspectOnchainQuote({client:mock(variant)}),VerificationError);
});
test('rejects mismatched buyer owner or destination',async()=>{
  for(const variant of [
    { ...BASE, owner:{$kind:'AddressOwner',AddressOwner:DEMO_RECEIVER} },
    { ...BASE, json:{...BASE.json,receiver:BUYER} },
  ]) await assert.rejects(inspectOnchainQuote({client:mock(variant)}),VerificationError);
});
test('recognizes active quote without claiming a payment',async()=>{
  const q=await inspectOnchainQuote({client:mock(),now:EXPIRY-1000});
  assert.equal(q.state,'ACTIVE');
  assert.equal(q.isPaid,false);
});
test('rejects missing objects',async()=>{
  await assert.rejects(inspectOnchainQuote({client:{getObject:async()=>{throw Error('Missing')}}}),VerificationError);
});
