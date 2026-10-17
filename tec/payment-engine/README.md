# TEC Payment Engine · Move prototype · Sui Testnet

**Status: source code only. NOT DEPLOYED, NOT COMPILED/TESTED YET.**
This prototype must not be used for real payments or Mainnet. It does not modify
the existing fungible TEC token contract or supply.

## Purpose

This design fixes the core weakness of the earlier Phase 4 demo: a generic 9 TEC
transfer cannot be unequivocally associated with a particular shopping order.

- `create_merchant<T>`: creates an owned `MerchantCap<T>` bound to the caller.
  **Any user may create their own cap.** The website/server MUST pin and verify
  the trusted official cap *object ID* and network/package, not merely the type.
- `issue_quote<T>`: cap holder issues a unique owned `Quote<T>` to a single buyer.
  The quote contains a server-generated order reference, buyer, merchant cap ID,
  destination, precise atomic-unit amount, and a 120-second on-chain deadline.
  The quote receives a unique Sui object ID (stronger than just a text order ID).
- `pay<T>`: the named buyer passes that exact `Quote<T>` and an exact `Coin<T>`.
  If checks pass, payment and quote consumption happen atomically. Emits
  `PaymentAccepted` and issues a buyer-owned `Receipt<T>`.
- `discard_expired<T>`: permits safe cleanup after the deadline.

**No shared mutable order book** in the `pay` path. Each customer pays using
their separate owned quote, which helps avoid contention.

### Limits and security properties

1. Package is *generic over coin type*. It becomes TEC only when the
   caller uses `T = 0xed823c98495cc251a6d9f5bf3bf60a87783c4aebbf6c55830484e4ee60d487d4::tec::TEC`
   (EXISTING TESTNET TEC ONLY). There is intentionally **no new TEC mint**.
2. Server must **pin official package ID, merchant cap ID, quote ID, buyer,
   receiver, coin type, order reference and exact amount** and verify the
   matching `PaymentAccepted` event and effects. Never trust a receipt/event
   from an arbitrary package, merchant cap, or different test token.
3. An individual Quote object can only be consumed once. However, the contract
   **does not enforce order-reference uniqueness across multiple quotes**;
   the merchant server must ensure uniqueness and avoid issuing duplicates.
4. The quote is issued as a **separate on-chain transaction**, so a 120-second
   deadline starts at issuance, not when the user begins filling the basket.
   Backend/UI retries and expiration need explicit handling.
5. Quotes may be transferable on-chain; the function additionally checks
   `tx_context::sender() == quote.buyer`, so receiving someone else's quote
   does not authorize payment. The merchant must still verify that the cap ID
   belongs to the official TEC merchant.
6. Existing DEV wallet recovery phrases were visible in chat screenshots.
   **Do not reuse their keys for Mainnet**, production custody, or real value.
7. This is a Testnet architecture exercise, not production-grade payment software:
   no merchant identity proofs, e-commerce integration, invoicing, refunds,
   monitoring, security audit or legal review have been implemented.

## Build and run offline tests in Ubuntu (NO PUBLISH / NO TOKEN TRANSFER)

First update source in regular Termux:
```sh
cd ~/crypto && git pull --ff-only
```

Then return to your existing Ubuntu/proot shell where `sui` is installed.
Use the shared Termux storage path if accessible:
```sh
mkdir -p ~/TEC/tec_payment_engine
cp -a /data/data/com.termux/files/home/crypto/tec/payment-engine/. ~/TEC/tec_payment_engine/
cd ~/TEC/tec_payment_engine
sui client switch --env testnet
sui move build
sui move test
```

**Stop and share the complete compiler output if a build or test fails.**
This branch has not been built on Sui 1.82.1 yet. Compilation is the next
validation step and may require adjusting the Move.toml for your CLI version.

Do **not** run `sui client publish` or send TEC as part of this step.
