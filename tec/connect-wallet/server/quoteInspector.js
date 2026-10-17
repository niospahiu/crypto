import { testnetClient, TEC_TYPE, DEMO_RECEIVER, VerificationError } from './verifyTransfer.js';

// Phase 7 read-only quote viewer. It cannot issue quotes or transfer coins.
export const PAYMENT_PACKAGE = '0x984ea1d9b89f899e326adc3f96eb9d5903ed43d06db339507ddbadacb2e93230';
export const OFFICIAL_MERCHANT_CAP = '0x135622b161a1b062ec0ac23290ba49b2f1b03675b8e7744247a66c7d5ff993d8';
export const FIRST_TEST_QUOTE = '0x8aca403881fca62cf43e02eb80b5e4635d3ed1fd4b389bb566e10a9b169cd700';
const EXPECTED_TYPE = PAYMENT_PACKAGE + '::checkout::Quote<' + TEC_TYPE + '>';
const ADDRESS = /^0x[0-9a-fA-F]{64}$/;

function getAddressOwner(owner) {
  if (typeof owner?.AddressOwner === 'string') return owner.AddressOwner;
  if (owner?.$kind === 'AddressOwner') return owner.AddressOwner;
  return null;
}
function stringField(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return stringField(value.id);
  return null;
}
function readReference(value) {
  let bytes;
  if (Array.isArray(value) && value.every(n => Number.isInteger(n) && n >= 0 && n <= 255)) {
    bytes = Buffer.from(value);
  } else if (typeof value === 'string' && /^[a-zA-Z0-9+/]*={0,2}$/.test(value)) {
    bytes = Buffer.from(value, 'base64');
  } else {
    throw new VerificationError('Quote order reference has an unsupported encoding.', 422);
  }
  const ref = bytes.toString('utf8');
  if (bytes.length < 1 || bytes.length > 64 || !/^[\x20-\x7e]+$/.test(ref)) {
    throw new VerificationError('Invalid on-chain test order reference.', 422);
  }
  return ref;
}

export async function inspectOnchainQuote({ client = testnetClient, quoteId = FIRST_TEST_QUOTE, now = Date.now() } = {}) {
  if (!ADDRESS.test(quoteId)) throw new VerificationError('Invalid Sui Quote object ID.', 400);
  let object;
  try {
    ({ object } = await client.getObject({ objectId: quoteId, include: { json: true } }));
  } catch {
    throw new VerificationError('Could not find this Testnet quote; it may have been consumed or deleted.', 404);
  }
  if (!object || object.type !== EXPECTED_TYPE) {
    throw new VerificationError('Object is not an official TEC Testnet Checkout quote.', 422);
  }
  const fields = object.json?.fields ?? object.json;
  if (!fields || typeof fields !== 'object') {
    throw new VerificationError('On-chain Quote JSON is unavailable; no payment determination made.', 503);
  }
  const owner = getAddressOwner(object.owner)?.toLowerCase();
  const buyer = stringField(fields.buyer)?.toLowerCase();
  const receiver = stringField(fields.receiver)?.toLowerCase();
  const cap = stringField(fields.merchant_cap_id)?.toLowerCase();
  const amount = String(fields.raw_amount ?? '');
  const expiry = String(fields.expires_at_ms ?? '');
  if (!owner || !buyer || owner !== buyer || !ADDRESS.test(buyer) ||
      receiver !== DEMO_RECEIVER || cap !== OFFICIAL_MERCHANT_CAP ||
      amount !== '9000000' || !/^\d+$/.test(expiry)) {
    throw new VerificationError('Quote fields do not match the official TEC Testnet configuration.', 422);
  }
  const expiresAt = Number(expiry);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) {
    throw new VerificationError('Quote expiration is invalid.', 422);
  }
  return {
    quoteId,
    orderRef: readReference(fields.order_ref),
    buyer,
    receiver,
    merchantCapId: cap,
    packageId: PAYMENT_PACKAGE,
    coinType: TEC_TYPE,
    amount: '9',
    amountRaw: amount,
    expiresAt,
    state: now > expiresAt ? 'EXPIRED' : 'ACTIVE',
    onchainObjectExists: true,
    isPaid: false,
    note: 'READ-ONLY OBJECT INSPECTION. This is a quote, not proof of payment. No tokens were transferred.',
  };
}
