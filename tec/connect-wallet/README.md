# TEC Connect Wallet — Sui Testnet

A read-only Sui wallet connection and TEC balance viewer for **The Eastern Code**, based on the current `@mysten/dapp-kit-react` + gRPC SDK.

## Android Termux startup (native Termux, NOT the Ubuntu proot)

```sh
exit  # only if the prompt is root@localhost (leave proot-distro)
pkg update && pkg install git nodejs-lts -y
git clone https://github.com/niospahiu/crypto.git
cd crypto/tec/connect-wallet
npm install
npm run dev
```

Open `http://127.0.0.1:5173` on the same Android phone. Tap **Connect Wallet** and approve in Slush if supported by your browser. **Mobile wallet handoffs may require public HTTPS hosting**, not localhost; run `npm run build` and deploy `dist` to an HTTPS static site for a production-like connection test.

The app reads actual TEC / SUI balances for whichever Sui account the wallet authorizes, with the current Testnet coin type and 6 decimals. Refresh, copy address, Suiscan link and connection state are included.

**Security:** no private keys, mnemonics, or signatures required. No real transfers/payments, mainnet or live exchange rate. Testnet coins are not money. Never reuse the publicly exposed test wallet seeds for mainnet.

Sources: https://sdk.mystenlabs.com/dapp-kit/getting-started/react and https://sdk.mystenlabs.com/sui/clients/querying
