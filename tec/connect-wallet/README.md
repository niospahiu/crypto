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
