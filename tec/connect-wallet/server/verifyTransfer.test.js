import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyTestnetTransfer, auditHistoricalTransfer, VerificationError, TEC_TYPE, DEMO_RECEIVER,
  DEMO_AMOUNT_RAW,
} from './verifyTransfer.js';

const PAYER = '0xf72dff105a6f7057febbaf37fa07a87376c5e49d3fa14da6ea7b8f94ada48d74';
const DIGEST = '2oGjLgEhUyofdQAerHbweUQwXD1DyHu6qeYtBbqoTwz8';
const CREATED = Date.UTC(2026, 9, 17, 13, 40, 0);
const ORDER = {
  walletAddress: PAYER,
  network: 'testnet',
  totalTec: '9',
  status: 'quoted',
  createdAt: CREATED,
  expiresAt: CREATED + 120000,
};

function mockClient({
  sender = PAYER,
  recipient = DEMO_RECEIVER,
  coinType = TEC_TYPE,
  amount = DEMO_AMOUNT_RAW,
  occurredAt = CREATED + 30_000,
  failed = false,
} = {}) {
  return {
    getTransaction: async ({ digest }) => ({
      ...(failed ? { FailedTransaction: { digest, status: { success: false } } } : {
        Transaction: {
          digest,
          status: { success: true },
          transaction: { sender },
          balanceChanges: [
            { address: PAYER, coinType, amount: '-' + amount.toString() },
            { address: recipient, coinType, amount: amount.toString() },
          ],
        },
      }),
    }),
    ledgerService: {
      getTransaction: async () => ({
        response: {
          transaction: {
            timestamp: {
              seconds: BigInt(Math.floor(occurredAt / 1000)),
              nanos: (occurredAt % 1000) * 1_000_000,
            },
          },
        },
      }),
    },
  };
}

test('accepts exact, successful Sui TESTNET TEC transfer within quote window', async () => {
  const result = await verifyTestnetTransfer({ client: mockClient(), order: ORDER, digest: DIGEST });
  assert.equal(result.amountRaw, '9000000');
  assert.equal(result.network, 'testnet');
  assert.equal(result.digest, DIGEST);
});

test('rejects incorrect token type', async () => {
  await assert.rejects(
    verifyTestnetTransfer({ client: mockClient({ coinType: '0x2::sui::SUI' }), order: ORDER, digest: DIGEST }),
    VerificationError,
  );
});
test('rejects incorrect recipient', async () => {
  await assert.rejects(
    verifyTestnetTransfer({ client: mockClient({ recipient: PAYER }), order: ORDER, digest: DIGEST }),
    VerificationError,
  );
});
test('rejects underpayment', async () => {
  await assert.rejects(
    verifyTestnetTransfer({ client: mockClient({ amount: 5_000_000n }), order: ORDER, digest: DIGEST }),
    VerificationError,
  );
});
test('rejects a prior transaction outside quote time', async () => {
  await assert.rejects(
    verifyTestnetTransfer({ client: mockClient({ occurredAt: CREATED - 10_000 }), order: ORDER, digest: DIGEST }),
    VerificationError,
  );
});
test('rejects transaction after expiry', async () => {
  await assert.rejects(
    verifyTestnetTransfer({ client: mockClient({ occurredAt: CREATED + 150_000 }), order: ORDER, digest: DIGEST }),
    VerificationError,
  );
});
test('rejects incorrect sender', async () => {
  await assert.rejects(
    verifyTestnetTransfer({ client: mockClient({ sender: DEMO_RECEIVER }), order: ORDER, digest: DIGEST }),
    VerificationError,
  );
});
test('rejects unsuccessful chain execution', async () => {
  await assert.rejects(
    verifyTestnetTransfer({ client: mockClient({ failed: true }), order: ORDER, digest: DIGEST }),
    VerificationError,
  );
});
test('rejects unverified metadata', async () => {
  const c=mockClient();
  c.ledgerService.getTransaction=async () => ({ response: { transaction: {} } });
  await assert.rejects(
    verifyTestnetTransfer({ client: c, order: ORDER, digest: DIGEST }),
    VerificationError,
  );
});

test('historical audit accepts real-shaped older transfer but never links an order', async () => {
  const old = CREATED - 30_000;
  const proof = await auditHistoricalTransfer({
    client: mockClient({ occurredAt: old }),
    digest: DIGEST,
    walletAddress: PAYER,
  });
  assert.equal(proof.status, 'verified_transfer_only');
  assert.equal(proof.matchesOrder, false);
  assert.equal(proof.checkpointAt, old);
  assert.equal(proof.amountRaw, '9000000');
});

test('historical audit still rejects incorrect recipient and TEC amount', async () => {
  for (const opts of [{ recipient: PAYER }, { amount: 5_000_000n }]) {
    await assert.rejects(
      auditHistoricalTransfer({
        client: mockClient(opts), digest: DIGEST, walletAddress: PAYER,
      }),
      VerificationError,
    );
  }
});

test('historical audit never accepts a different sender', async () => {
  await assert.rejects(
    auditHistoricalTransfer({
      client: mockClient({ sender: DEMO_RECEIVER }), digest: DIGEST, walletAddress: PAYER,
    }),
    VerificationError,
  );
});
