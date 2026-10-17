# TEC Connect Wallet & Test Checkout — Sui Testnet

Experimental frontend for **The Eastern Code**. Wallet integration uses `@mysten/dapp-kit-react` with `@mysten/sui` over Sui Testnet.

## Start in native Android Termux

```sh
cd ~/crypto
git pull --ff-only
cd tec/connect-wallet
npm run dev
```

Open `http://127.0.0.1:5173` in Chrome on the same phone while Vite is running. If dependencies are not installed yet, run `npm install` before `npm run dev`.

## Current functionality

- Slush wallet connect and account switching
- Read-only **TEC balance** with 6 decimals, **SUI Testnet gas balance**, refresh, copy address, explorer link
- An **opt-in Testnet payment lab**: a fictional TEC patch priced at €10, a **fake** rate of €1 / TEC, a 10% sample discount, and a two-minute **UI-only** quote that computes 9 TEC
- Two deliberate actions before any transfer: create quote, then approve the transaction (Slush also requests user permission)
- If approved, actually transfers **9 Testnet TEC** from the connected wallet to the known test `tec-dev` account. This is **not** a real order. The wallet's TEC balance decreases and a little Testnet SUI gas is spent.
- Displays transaction digest and a Suiscan testnet transaction link on success.

## Important limits

**Testnet tokens have no monetary value.** No real EUR/TEC exchange rate exists for this token. The two-minute countdown is client-side only and cannot invalidate a transaction after the wallet has already approved it. The receipt shown in this demo is **not merchant settlement verification**.

Before any real checkout, the project requires a server-generated quote, a fixed beneficiary wallet with protected keys, verification on the server of the exact coin type/recipient/amount and transaction success, idempotency/replay protection, expired quote handling, persistently stored orders, security review, and appropriate legal treatment. No Mainnet features are provided.

The `tec-dev` and `eloquent-jasper` recovery phrases appeared in earlier screenshots, so **do not send real assets to those addresses or reuse them for Mainnet**.

Documentation:
- https://sdk.mystenlabs.com/dapp-kit/getting-started/react
- https://sdk.mystenlabs.com/sui/transactions/coins-and-balances
- https://sdk.mystenlabs.com/dapp-kit/actions/sign-and-execute-transaction

## Phase 3 — Local demo order logging (Termux only)

The built-in Vite development middleware registers `/api/tec-demo/quotes`, `/api/tec-demo/orders?wallet=...`, and `/api/tec-demo/orders/:id/simulate`. These generate **server-timed 120-second demonstration quotes**, store **SIMULATED — NOT PAID** order entries in `.tec-test-orders.json`, and show recent local order history. This record remains after browser refresh and server restart, but is **not** a real customer order, an authenticated wallet signature, or proof of payment. No network transfers are required.

This educational API works only with `npm run dev` on the same device. A static `npm run build` deployment does not contain the API and needs a separate secure backend. **Do not expose the Vite development server publicly, and do not use this code for Mainnet sales or merchant acceptance.**

## Phase 4 — Read-only on-chain Testnet verification (development)

The optional *Slush Testnet transfer* button continues to require the wallet's normal confirmation. Imported private-key / mnemonic accounts may not be allowed to sign in Slush Web; **this does not bypass that restriction**. A separate `Verify digest on Sui Testnet` field allows a transaction made independently through an approved wallet flow to be checked by the local server (without signing or sending anything from the form).

The new endpoint `POST /api/tec-demo/orders/:id/verify` accepts a transaction digest. The local server queries **Sui Testnet gRPC**, and checks:

- Sui reports a successful on-chain execution;
- the transaction sender matches the quote wallet;
- the correct TEC coin type moved, with an **exact** 9 TEC debit and 9 TEC credit to the test recipient;
- the on-chain checkpoint timestamp is within the server-issued quote's 120-second window;
- the same digest is not assigned to another local Testnet order.

Only if all checks pass is the local order flagged `verified_testnet`. This never means production `paid` or `fulfilled`. Old `simulated` order records remain explicitly NOT PAID. Failing verification does **not** revert an already executed blockchain transfer.

Run offline verifier unit tests in Termux with `npm run test:verify`. These use fake RPC client responses and do not move tokens.

**Not production-safe:** The local API is unauthenticated and a generic Sui coin transfer has no cryptographic order-specific payment nonce. Do not open this dev server to the internet, attach payment fulfilment, or reuse screenshots-exposed wallet keys with money. A real payment flow requires per-order on-chain binding (e.g., contract event / nonce), user authentication, server-side settlement, secure merchant custody, monitoring and review.

## Phase 4b — audit an earlier transfer, without another payment

The `HISTORICAL TESTNET TRANSFER AUDIT` panel accepts an existing public digest. The local server checks Sui Testnet for a successful **exactly 9 TEC** transfer from the currently connected wallet to the test development wallet, and shows the checkpoint time. It does **not** require a new timed quote and does **not** modify any existing order.

This separate endpoint is `POST /api/tec-demo/audit` and returns the unambiguous flag `verified_transfer_only`, `matchesOrder: false`. It never says PAID. Old pre-quote or post-expiry transfers cannot be retroactively attached to a new order. This prevents repeating token transfers while investigating UI timing errors.

Run the full offline test suite with `npm run test:verify`. 
## Phase 7 — On-chain Quote Inspector (READ ONLY)

The prototype app now includes a stand-alone panel for inspecting the **first
existing TEC-TEST-001 quote**, identified by Sui object ID
`0x8aca403881fca62cf43e02eb80b5e4635d3ed1fd4b389bb566e10a9b169cd700`.

The inspector reads the quote directly from Sui Testnet using the Sui SDK, and
validates the exact deployed package type, coin type, official merchant-cap ID,
buyer ownership, receiver, and amount. It displays the decoded order reference,
expiry and clear **NOT PAID** status. It never asks for mnemonic, writes to chain,
changes old order records, signs transactions, or mints a token.

To test in normal Termux:

```sh
cd ~/crypto && git pull --ff-only
cd tec/connect-wallet
node --test server/quoteInspector.test.js
npm run dev
```

Scroll to the **PHASE 7 / ON-CHAIN QUOTE INSPECTOR** card. This is a bridge
toward a production checkout architecture, NOT the checkout itself. The
existing Phase 4 demonstration is unchanged.

Next steps will need: secure merchant-only quote issuing, protection against
duplicate order refs, a real wallet signing flow for consuming the unique quote,
and a server that checks the payment event and receipt, with replay prevention.
