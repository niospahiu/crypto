import { SuiGrpcClient } from '@mysten/sui/grpc';

// TESTNET-ONLY validation of a user-submitted transaction digest.
// Strictly read-only: neither this module nor this server signs or sends tokens.
export const TEC_TYPE = '0xed823c98495cc251a6d9f5bf3bf60a87783c4aebbf6c55830484e4ee60d487d4::tec::TEC';
export const DEMO_RECEIVER = '0x873293776c908c19c34ffdc3dfd286f115b7a90be1691c168871fa41f90b8fce';
export const DEMO_AMOUNT_RAW = 9_000_000n; // 9 TEC x 10^6
export const DIGEST_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;

export const testnetClient = new SuiGrpcClient({
  network: 'testnet',
  baseUrl: 'https://fullnode.testnet.sui.io:443',
});

export class VerificationError extends Error {
  constructor(message, statusCode = 422) {
    super(message);
    this.name = 'VerificationError';
    this.statusCode = statusCode;
  }
}

function accountOf(change) {
  // The Sui SDK v2 shared Core API returns 'address'. Other clients can
  // represent it as an AddressOwner discriminated union.
  const raw = change?.address ?? change?.owner?.AddressOwner ??
    (change?.owner?.$kind === 'AddressOwner' ? change.owner.AddressOwner : null);
  return typeof raw === 'string' ? raw.toLowerCase() : null;
}

function amountFor(changes, who) {
  let total = 0n;
  for (const change of changes) {
    if (change?.coinType !== TEC_TYPE || accountOf(change) !== who.toLowerCase()) continue;
    if (!/^-?\d+$/.test(String(change.amount ?? ''))) {
      throw new VerificationError('Invalid on-chain balance-change amount.');
    }
    total += BigInt(change.amount);
  }
  return total;
}

function checkpointTimeMs(timestamp) {
  if (timestamp == null || timestamp.seconds == null) {
    throw new VerificationError('Checkpoint timestamp unavailable. Cannot verify payment.', 503);
  }
  const seconds = BigInt(timestamp.seconds);
  const nanos = BigInt(timestamp.nanos ?? 0);
  const millis = seconds * 1_000n + nanos / 1_000_000n;
  if (millis <= 0n || millis > 8_640_000_000_000_000n) {
    throw new VerificationError('Invalid checkpoint timestamp.', 503);
  }
  return Number(millis);
}

export async function verifyTestnetTransfer({ client = testnetClient, order, digest, checkQuoteWindow = true }) {
  if (!DIGEST_PATTERN.test(digest || '')) {
    throw new VerificationError('Enter a valid Sui transaction digest.', 400);
  }
  if (!order || order.network !== 'testnet') {
    throw new VerificationError('This quote is not for Testnet.', 400);
  }
  if (order.status !== 'quoted') {
    throw new VerificationError('This quote is not waiting for a payment digest.', 409);
  }
  if (order.totalTec !== '9') {
    throw new VerificationError('Unexpected quote amount.', 422);
  }

  let result, timestampResponse;
  try {
    [result, timestampResponse] = await Promise.all([
      client.getTransaction({
        digest,
        include: { transaction: true, effects: true, balanceChanges: true },
      }),
      client.ledgerService.getTransaction({
        digest,
        readMask: { paths: ['digest', 'timestamp'] },
      }),
    ]);
  } catch {
    throw new VerificationError('Sui Testnet lookup failed or transaction is not indexed yet. Retry shortly.', 503);
  }

  const tx = result?.Transaction ?? result?.FailedTransaction;
  if (!tx || tx.digest !== digest || result.FailedTransaction || tx.status?.success !== true) {
    throw new VerificationError('The transaction is missing, failed, or not confirmed.', 422);
  }

  const sender = tx.transaction?.sender;
  if (typeof sender !== 'string' || sender.toLowerCase() !== order.walletAddress) {
    throw new VerificationError('The transaction sender does not match this quote.', 422);
  }

  if (!Array.isArray(tx.balanceChanges)) {
    throw new VerificationError('Transaction balance changes not available.', 503);
  }
  if (order.walletAddress === DEMO_RECEIVER) {
    throw new VerificationError('The payer and receiver cannot be the same.', 422);
  }

  const received = amountFor(tx.balanceChanges, DEMO_RECEIVER);
  const debited = amountFor(tx.balanceChanges, order.walletAddress);
  if (received !== DEMO_AMOUNT_RAW || debited !== -DEMO_AMOUNT_RAW) {
    throw new VerificationError('The transaction does not transfer exactly 9 TEC from the quote wallet to the test receiver.', 422);
  }

  const raw = timestampResponse?.response?.transaction;
  const occurredAt = checkpointTimeMs(raw?.timestamp);
  // The observed chain timestamp must fall within the server-generated
  // quote window. The verifier can be called after the quote expires.
  if (checkQuoteWindow && occurredAt < order.createdAt) {
    throw new VerificationError(
      'VALID TESTNET TRANSFER, BUT NOT THIS ORDER: The 9 TEC transfer was confirmed at ' +
      new Date(occurredAt).toISOString() + ', BEFORE this demo quote began at ' +
      new Date(order.createdAt).toISOString() +
      '. The tokens already moved; do NOT send them again just to clear this error. ' +
      'This quote will stay NOT PAID.',
      422,
    );
  }
  if (checkQuoteWindow && occurredAt > order.expiresAt) {
    throw new VerificationError(
      'VALID TESTNET TRANSFER, BUT TOO LATE: The 9 TEC transfer was confirmed at ' +
      new Date(occurredAt).toISOString() + ', AFTER the demo quote deadline ' +
      new Date(order.expiresAt).toISOString() +
      '. The tokens already moved; do NOT resend them. ' +
      'This quote will stay NOT PAID.',
      422,
    );
  }

  return {
    digest,
    verifiedAt: Date.now(),
    checkpointAt: occurredAt,
    amountRaw: DEMO_AMOUNT_RAW.toString(),
    receiver: DEMO_RECEIVER,
    network: 'testnet',
  };
}

/**
 * Read-only historical transfer audit, separate from quote verification.
 * This NEVER changes an order or grants PAID status. It intentionally checks
 * only the on-chain transfer details, not association with a timed quote.
 */
export async function auditHistoricalTransfer({ client = testnetClient, digest, walletAddress }) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(walletAddress || '')) {
    throw new VerificationError('Supply the full connected Sui wallet address.', 400);
  }
  const evidence = await verifyTestnetTransfer({
    client,
    digest,
    checkQuoteWindow: false,
    order: {
      walletAddress: walletAddress.toLowerCase(),
      network: 'testnet',
      status: 'quoted',
      totalTec: '9',
    },
  });
  return {
    ...evidence,
    status: 'verified_transfer_only',
    matchesOrder: false,
    warning: 'On-chain 9 TEC transfer verified. NOT linked to any order or quote. No order was marked paid.',
  };
}
