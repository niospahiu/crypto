# TEC Payment Engine — Phase 5 technical test plan

This checklist is *planning*, not a statement that the contract is deployed.

## A. Pure Move unit tests (free, local)

- Exact amount coin: payment succeeds, quote consumed, receipt issued.
- Underpayment or overpayment: atomic abort, no coins leave wallet.
- Wrong buyer: atomic abort.
- Expired quote: atomic abort.
- Already-consumed quote: cannot be referenced again (on-chain object model).
- Bogus merchant cap ID: server must reject event even if a payment occurred.
- Wrong coin type: generic contract may accept that T; **server must reject**.
- Duplicate textual order ref minted in a different quote: **server must reject**.

## B. Testnet integration (ONLY after compiling and reviewing)

- Register an official test merchant cap and record its *object ID*.
- Issue a unique test quote bound to known buyer, coin type and amount.
- Read the quote object and verify cap ID, owner, amount, receiver, deadline.
- Wallet-authorized payment using coin split + quoted object.
- Confirm receipt and `PaymentAccepted` event, quote consumed and amount moved.
- Attempt to replay the quote ID: fail.
- Confirm that wrong quote ID, wrong merchant cap ID, wrong coin type or late payment
  never mark an order as paid in the local server.
- Inspect RPC error paths, pending indexing, server restarts, duplicate requests.

## C. Production blockers

- Dedicated controlled merchant treasury, private key management and role separation.
- Authentication, on-chain quote issuance workflow, event+effects validation,
  audit logs, idempotency, refunds, dispute handling and accounting.
- Security audit and legal/tax/compliance review.
- Availability and service monitoring, managed RPC and capacity planning.

The current demo website still uses the earlier generic Testnet transfer flow:
it is NOT connected to this new Move contract yet.
