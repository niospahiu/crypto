# Phase 8A — Buyer-signed TEC Testnet payment lab

This prototype is intentionally **TESTNET ONLY**. The older Phase 4 checkout and
Phase 7 read-only Quote Inspector remain separate.

- Real Move `checkout::pay<TEC>` is called only after explicit buyer confirmation
  using the currently connected Sui Testnet wallet.
- Requires a **fresh** official on-chain Quote, created by the merchant's existing
  `issue_quote<TEC>` function. The first `TEC-TEST-001` quote is expired.
- The browser first checks the official coin/package/cap/amount via the existing
  read-only inspector. It registers the current quote in an isolated local ledger
  *before* the object is consumed. No site backend holds a merchant private key.
- The buyer-signed atomic Move call transfers exactly 9 TEST TEC, consumes the
  specific quote, emits `PaymentAccepted` and creates a receipt **only if it succeeds**.
- After any wallet digest is returned, a local Testnet verifier separately checks
  that transaction's unique official `PaymentAccepted` event and TEC debit/credit.
  The record becomes `VERIFIED_CONTRACT_TESTNET`, **never** a real paid order.
- If a digest exists but the node is indexing, retry that SAME digest instead of
  sending more TEC. The local ledger is `.tec-engine-orders.json` (gitignored).

## Try the updated website in regular Termux

```sh
cd ~/crypto && git pull --ff-only
cd tec/connect-wallet
npm install
node --test server/engineVerifier.test.js
node --test server/quoteInspector.test.js
npm run build
npm run dev
```

Open http://127.0.0.1:5173 and find `PHASE 8A / SMART CONTRACT PAYMENT`.
The screen has no automatic quote issuer yet. First use the Ubuntu Sui CLI with
the existing official TESTNET MerchantCap to issue a fresh 9 TEC Quote for the
buyer address. Copy the new Quote object ID into Phase 8A, register it while
it is still active, and approve only when reviewing the exact 9 TEC transfer.
Quotes expire 120 seconds after the chain transaction that creates them.

**Testnet merchant cap:** `0x135622b161a1b062ec0ac23290ba49b2f1b03675b8e7744247a66c7d5ff993d8`

**Testnet payment package:** `0x984ea1d9b89f899e326adc3f96eb9d5903ed43d06db339507ddbadacb2e93230`

**TEC coin type:** `0xed823c98495cc251a6d9f5bf3bf60a87783c4aebbf6c55830484e4ee60d487d4::tec::TEC`

To automatically issue official merchant quotes for customers requires a
separately designed authenticated merchant signing service or explicit merchant
wallet authorization. That is NOT included. Do not put signing keys in the
frontend, repo, .env, or chat. This is not production checkout and does not
process actual purchases. Legal, security, key custody, accounting, replay/
duplicate order handling and refund flows remain unimplemented.

### Quick merchant helper (Ubuntu/proot)

After running \`git pull\` in regular Termux, in Ubuntu run:

\`bash /data/data/com.termux/files/home/crypto/tec/payment-engine/issue-test-quote.sh\`

The helper selects Testnet + the \`tec-dev\` alias, issues one fresh quote,
prints its ID and then deletes its temporary response. Paste the ID into
Phase 8A within 120 seconds. It costs test SUI gas, but sends no TEC.
