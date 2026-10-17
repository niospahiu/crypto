import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { verifyTestnetTransfer, VerificationError, DEMO_RECEIVER } from './verifyTransfer.js';

// Local-only Vite middleware for EDUCATIONAL fake orders.
// No payment settlement, blockchain transfer, or wallet key ever occurs here.
const STORAGE = resolve(process.cwd(), '.tec-test-orders.json');
const TERM = 120_000;
const DEFAULT_ORDER = { product: 'TEC Identity Patch — DEMO', eur: '10.00', discountPercent: 10, totalTec: '9', rate: 'FICTIONAL 1 TEC = €1', network: 'testnet' };
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const VERIFY_ROUTE = /^\/api\/tec-demo\/orders\/(SIM-[0-9a-f-]+)\/verify$/;
let orders = [];
try {
  const saved = JSON.parse(readFileSync(STORAGE, 'utf8'));
  if (Array.isArray(saved)) orders = saved.filter(x => x && typeof x.id === 'string').slice(-500);
} catch {
  // New development installation.
}

function store() {
  const tmp = STORAGE + '.tmp';
  writeFileSync(tmp, JSON.stringify(orders.slice(-500), null, 2), { mode: 0o600 });
  renameSync(tmp, STORAGE);
}
function respond(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
}
function parseJson(req) {
  return new Promise((resolveBody, reject) => {
    let buffer = '';
    req.on('data', piece => {
      buffer += piece;
      if (buffer.length > 4000) {
        reject(new Error('Request too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolveBody(JSON.parse(buffer || '{}')); }
      catch { reject(new Error('Malformed JSON')); }
    });
    req.on('error', reject);
  });
}

export function testOrdersPlugin() {
  return {
    name: 'tec-testnet-fake-orders',
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        const u = new URL(req.url || '/', 'http://127.0.0.1:5173');
        if (!u.pathname.startsWith('/api/tec-demo/')) return next();
        // Only this local Vite app should call the development order endpoints.
        const origin = req.headers.origin;
        if (origin && origin !== 'http://127.0.0.1:5173' && origin !== 'http://localhost:5173') {
          return respond(res, 403, { error: 'Cross-origin request rejected' });
        }
        try {
          if (req.method === 'POST' && u.pathname === '/api/tec-demo/quotes') {
            const body = await parseJson(req);
            if (!ADDRESS_PATTERN.test(body.walletAddress || '')) {
              return respond(res, 400, { error: 'Connect a valid Sui Testnet wallet first.' });
            }
            const quote = {
              ...DEFAULT_ORDER,
              id: 'SIM-' + randomUUID(),
              walletAddress: body.walletAddress.toLowerCase(),
              createdAt: Date.now(),
              expiresAt: Date.now() + TERM,
              status: 'quoted',
              simulatedAt: null,
              receiver: DEMO_RECEIVER,
            };
            orders.push(quote);
            orders = orders.slice(-500);
            store();
            return respond(res, 201, quote);
          }
          if (req.method === 'GET' && u.pathname === '/api/tec-demo/orders') {
            const wallet = u.searchParams.get('wallet') || '';
            if (!ADDRESS_PATTERN.test(wallet)) return respond(res, 400, { error: 'Invalid wallet address' });
            return respond(res, 200, {
              orders: orders.filter(x => x.walletAddress === wallet.toLowerCase()).slice(-15).reverse(),
            });
          }
          const verifyMatch = u.pathname.match(VERIFY_ROUTE);
          if (req.method === 'POST' && verifyMatch) {
            const order = orders.find(x => x.id === verifyMatch[1]);
            if (!order) return respond(res, 404, { error: 'Demo quote not found' });
            const { digest } = await parseJson(req);
            if (typeof digest !== 'string') {
              return respond(res, 400, { error: 'Transaction digest required' });
            }
            if (order.status === 'verified_testnet') {
              if (order.digest === digest) return respond(res, 200, order);
              return respond(res, 409, { error: 'This Testnet quote is already verified against another digest.' });
            }
            if (order.status !== 'quoted') {
              return respond(res, 409, { error: 'Only an unsimulated quote can be verified.' });
            }
            if (orders.some(x => x.digest === digest && x.id !== order.id)) {
              return respond(res, 409, { error: 'This transaction digest is already assigned to a different Testnet order.' });
            }
            // Network lookup is asynchronous. Re-check order and digest after
            // awaiting it to prevent concurrent requests crediting twice.
            const proof = await verifyTestnetTransfer({ order, digest });
            if (order.status === 'verified_testnet' && order.digest === digest) return respond(res, 200, order);
            if (order.status !== 'quoted' || orders.some(x => x.digest === digest && x.id !== order.id)) {
              return respond(res, 409, { error: 'Duplicate digest or quote status conflict.' });
            }
            order.digest = proof.digest;
            order.verifiedAt = proof.verifiedAt;
            order.checkpointAt = proof.checkpointAt;
            order.receiver = proof.receiver;
            order.status = 'verified_testnet'; // NOT production paid/fulfilled
            store();
            return respond(res, 200, order);
          }
          const match = u.pathname.match(/^\/api\/tec-demo\/orders\/(SIM-[0-9a-f-]+)\/simulate$/);
          if (req.method === 'POST' && match) {
            const order = orders.find(x => x.id === match[1]);
            if (!order) return respond(res, 404, { error: 'Demo quote not found' });
            if (order.status === 'simulated') return respond(res, 200, order); // idempotent fake checkout
            if (Date.now() > order.expiresAt) return respond(res, 410, { error: 'Server quote expired. Generate a new demo quote.' });
            order.status = 'simulated'; // NEVER 'paid' or 'fulfilled'
            order.simulatedAt = Date.now();
            store();
            return respond(res, 200, order);
          }
          return respond(res, 404, { error: 'Unknown demo API route' });
        } catch (e) {
          if (e instanceof VerificationError) {
            return respond(res, e.statusCode, { error: e.message });
          }
          console.error('[TEC TESTNET API]', e);
          return respond(res, 500, { error: 'Local Testnet server failure.' });
        }
      });
    },
  };
}
