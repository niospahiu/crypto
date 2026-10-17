import { testnetClient, TEC_TYPE, DEMO_RECEIVER, DIGEST_PATTERN, VerificationError } from './verifyTransfer.js';
import { PAYMENT_PACKAGE, OFFICIAL_MERCHANT_CAP } from './quoteInspector.js';

// Strict read-only chain proof. Never trust the wallet's "success" alone.
const EVENT_TYPE = PAYMENT_PACKAGE + '::checkout::PaymentAccepted';
const lower = x => typeof x === 'string' ? x.toLowerCase() : '';
function orderRef(value) {
  let b;
  if (Array.isArray(value) && value.every(n => Number.isInteger(n) && n >= 0 && n < 256)) b = Buffer.from(value);
  else if (typeof value === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(value)) b = Buffer.from(value, 'base64');
  else throw new VerificationError('Invalid order ref in contract event.');
  return b.toString('utf8');
}
function changedBalance(changes, address) {
  let sum = 0n;
  for (const c of changes) {
    const who = lower(c.address ?? c.owner?.AddressOwner);
    if (c.coinType !== TEC_TYPE || who !== address) continue;
    if (!/^-?\d+$/.test(String(c.amount ?? ''))) throw new VerificationError('Bad balance change.',503);
    sum += BigInt(c.amount);
  }
  return sum;
}
export async function verifyContractPayment({ registered, digest, client = testnetClient }) {
  if (!registered || registered.status !== 'AWAITING_TESTNET_PAYMENT')
    throw new VerificationError('On-chain Quote was not registered before this payment.',409);
  if (!DIGEST_PATTERN.test(digest ?? '')) throw new VerificationError('Invalid Sui digest.',400);
  let result;
  try {
    result = await client.getTransaction({
      digest, include: { transaction:true, effects:true, events:true, balanceChanges:true },
    });
  } catch {
    throw new VerificationError('Testnet indexing delayed. Verify this SAME digest later; do not pay again.',503);
  }
  const tx = result?.Transaction;
  if (!tx || result.FailedTransaction || tx.digest !== digest || tx.status?.success !== true)
    throw new VerificationError('Blockchain transaction missing or not successful.');
  if (lower(tx.transaction?.sender) !== registered.buyer)
    throw new VerificationError('Wrong sender for the registered TEC Quote.');
  if (!Array.isArray(tx.events) || !Array.isArray(tx.balanceChanges))
    throw new VerificationError('Payment event or balance evidence not indexed yet.',503);
  const found = tx.events.filter(event => event.eventType === EVENT_TYPE);
  if (found.length !== 1 || !found[0].json) throw new VerificationError('No unique official PaymentAccepted event.');
  const e = found[0].json;
  if (lower(e.quote_id) !== registered.quoteId ||
      lower(e.merchant_cap_id) !== OFFICIAL_MERCHANT_CAP ||
      lower(e.buyer) !== registered.buyer ||
      lower(e.receiver) !== DEMO_RECEIVER ||
      String(e.raw_amount) !== '9000000' ||
      orderRef(e.order_ref) !== registered.orderRef) {
    throw new VerificationError('PaymentAccepted event does not match this trusted Quote.');
  }
  const timestamp = Number(e.paid_at_ms);
  if (!Number.isSafeInteger(timestamp) ||
      timestamp > registered.expiresAt || timestamp < registered.expiresAt - 120_000)
    throw new VerificationError('Payment timestamp does not match the Quote window.');
  if (registered.buyer === DEMO_RECEIVER ||
      changedBalance(tx.balanceChanges, registered.buyer) !== -9_000_000n ||
      changedBalance(tx.balanceChanges, DEMO_RECEIVER) !== 9_000_000n)
    throw new VerificationError('Exact TEC buyer debit and merchant credit not confirmed.');
  return { status:'VERIFIED_CONTRACT_TESTNET', digest, paidAt:timestamp };
}
