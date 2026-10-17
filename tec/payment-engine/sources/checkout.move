// SPDX-License-Identifier: Apache-2.0
/// TEC Payment Engine - educational, TESTNET-ONLY prototype.
///
/// One merchant-issued owned quote = one specific Sui object ID.
/// The quote is consumed atomically with payment, so it cannot be replayed.
/// A successful payment emits a uniquely identifying event and issues a receipt.
/// This package does not depend on TEC directly; deployers must instantiate it
/// with the existing Sui TEC coin type and pin the official merchant capability
/// ID in their frontend/backend. Do NOT treat arbitrary MerchantCap<T> as trusted.
module tec_payment_engine::checkout;

use sui::coin::{Self, Coin};
use sui::clock::{Self, Clock};
use sui::event;
use sui::object::{Self, ID, UID};
use sui::tx_context::{Self, TxContext};
use std::vector;

const EInvalidReceiver: u64 = 0;
const EInvalidBuyer: u64 = 1;
const EInvalidOrderRef: u64 = 2;
const EInvalidAmount: u64 = 3;
const EInvalidDeadline: u64 = 4;
const EWrongBuyer: u64 = 5;
const EExpired: u64 = 6;
const EWrongAmount: u64 = 7;

const QUOTE_TTL_MS: u64 = 120_000;
const MAX_ORDER_REF_BYTES: u64 = 64;

/// The merchant keeps this owned object secret from untrusted apps.
/// Any address may initialize its own cap, but the official merchant MUST
/// be identified by the specific cap ID, never by the coin type alone.
public struct MerchantCap<phantom T> has key, store {
    id: UID,
    receiver: address,
}

/// A quote is a unique, transferable OBJECT assigned to its intended buyer.
/// The buyer must be the transaction sender, preventing third-party payment.
public struct Quote<phantom T> has key, store {
    id: UID,
    merchant_cap_id: ID,
    order_ref: vector<u8>,
    buyer: address,
    receiver: address,
    raw_amount: u64,
    expires_at_ms: u64,
}

/// Proof issued after successful atomic transfer of the exact Coin<T> amount.
/// Quotes cannot be paid twice because pay consumes their UID.
public struct Receipt<phantom T> has key, store {
    id: UID,
    quote_id: ID,
    merchant_cap_id: ID,
    order_ref: vector<u8>,
    buyer: address,
    receiver: address,
    raw_amount: u64,
    paid_at_ms: u64,
}

public struct QuoteIssued has copy, drop {
    quote_id: ID,
    merchant_cap_id: ID,
    order_ref: vector<u8>,
    buyer: address,
    receiver: address,
    raw_amount: u64,
    expires_at_ms: u64,
}

public struct PaymentAccepted has copy, drop {
    quote_id: ID,
    merchant_cap_id: ID,
    order_ref: vector<u8>,
    buyer: address,
    receiver: address,
    raw_amount: u64,
    paid_at_ms: u64,
}

/// Create a cap owned by the caller with receiver set to the caller's address.
/// For the official TEC shop, only the original trusted cap ID should be used.
public fun create_merchant<T>(ctx: &mut TxContext) {
    transfer::public_transfer(
        MerchantCap<T> {
            id: object::new(ctx),
            receiver: ctx.sender(),
        },
        ctx.sender(),
    );
}

/// Admin sends a separate quote object to the intended buyer.
/// The expiration is set with the shared Clock (not the client's clock).
/// Minting a quote is a CHAIN TRANSACTION and costs Testnet gas.
public fun issue_quote<T>(
    cap: &MerchantCap<T>,
    order_ref: vector<u8>,
    buyer: address,
    raw_amount: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(cap.receiver != @0x0, EInvalidReceiver);
    assert!(buyer != @0x0, EInvalidBuyer);
    assert!(order_ref.length() > 0 && order_ref.length() <= MAX_ORDER_REF_BYTES, EInvalidOrderRef);
    assert!(raw_amount > 0, EInvalidAmount);

    let now = clock::timestamp_ms(clock);
    let deadline = now + QUOTE_TTL_MS;
    assert!(deadline > now, EInvalidDeadline);

    let quote = Quote<T> {
        id: object::new(ctx),
        merchant_cap_id: object::id(cap),
        order_ref,
        buyer,
        receiver: cap.receiver,
        raw_amount,
        expires_at_ms: deadline,
    };
    let quote_id = object::id(&quote);
    event::emit(QuoteIssued {
        quote_id,
        merchant_cap_id: quote.merchant_cap_id,
        order_ref: copy quote.order_ref,
        buyer: quote.buyer,
        receiver: quote.receiver,
        raw_amount: quote.raw_amount,
        expires_at_ms: quote.expires_at_ms,
    });
    transfer::public_transfer(quote, buyer);
}

/// Buyer pays exactly the expected Coin<T> amount. This transaction both
/// consumes the quote and transfers coins, or BOTH fail atomically.
/// Never uses arbitrary client-provided receiver/amount/order information.
public fun pay<T>(
    quote: Quote<T>,
    payment: Coin<T>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == quote.buyer, EWrongBuyer);
    assert!(clock::timestamp_ms(clock) <= quote.expires_at_ms, EExpired);
    assert!(coin::value(&payment) == quote.raw_amount, EWrongAmount);

    let quote_id = object::id(&quote);
    let Quote {
        id,
        merchant_cap_id,
        order_ref,
        buyer,
        receiver,
        raw_amount,
        expires_at_ms: _,
    } = quote;
    id.delete();

    transfer::public_transfer(payment, receiver);

    let paid_at_ms = clock::timestamp_ms(clock);
    event::emit(PaymentAccepted {
        quote_id,
        merchant_cap_id,
        order_ref: copy order_ref,
        buyer,
        receiver,
        raw_amount,
        paid_at_ms,
    });

    transfer::public_transfer(Receipt<T> {
        id: object::new(ctx),
        quote_id,
        merchant_cap_id,
        order_ref,
        buyer,
        receiver,
        raw_amount,
        paid_at_ms,
    }, buyer);
}

/// Cleanup of an expired quote: no funds ever moved into it.
public fun discard_expired<T>(quote: Quote<T>, clock: &Clock) {
    assert!(clock::timestamp_ms(clock) > quote.expires_at_ms, EExpired);
    let Quote {
        id,
        merchant_cap_id: _,
        order_ref: _,
        buyer: _,
        receiver: _,
        raw_amount: _,
        expires_at_ms: _,
    } = quote;
    id.delete();
}

public fun quote_amount<T>(quote: &Quote<T>): u64 { quote.raw_amount }
public fun quote_deadline<T>(quote: &Quote<T>): u64 { quote.expires_at_ms }
public fun quote_merchant<T>(quote: &Quote<T>): ID { quote.merchant_cap_id }
public fun quote_receiver<T>(quote: &Quote<T>): address { quote.receiver }
public fun quote_buyer<T>(quote: &Quote<T>): address { quote.buyer }
public fun quote_reference<T>(quote: &Quote<T>): &vector<u8> { &quote.order_ref }

#[test_only]
use sui::sui::SUI;

#[test_only]
fun sample_quote(ctx: &mut TxContext, buyer: address, amount: u64, deadline: u64): Quote<SUI> {
    Quote<SUI> {
        id: object::new(ctx),
        merchant_cap_id: object::id_from_address(@0xA),
        order_ref: b"LOCAL-TEST-ORDER",
        buyer,
        receiver: @0xB,
        raw_amount: amount,
        expires_at_ms: deadline,
    }
}

#[test]
fun test_exact_coin_payment_is_atomic() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    clock.set_for_testing(1000);
    let buyer = ctx.sender();
    let quote = sample_quote(&mut ctx, buyer, 9_000_000, 121_000);
    let coins = coin::mint_for_testing<SUI>(9_000_000, &mut ctx);
    pay(quote, coins, &clock, &mut ctx);
    clock.destroy_for_testing();
}

#[test]
#[expected_failure(abort_code = EWrongAmount)]
fun test_wrong_amount_is_rejected() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    clock.set_for_testing(1000);
    let buyer = ctx.sender();
    let quote = sample_quote(&mut ctx, buyer, 9_000_000, 121_000);
    let coins = coin::mint_for_testing<SUI>(8_000_000, &mut ctx);
    pay(quote, coins, &clock, &mut ctx);
    clock.destroy_for_testing();
}

#[test]
#[expected_failure(abort_code = EWrongBuyer)]
fun test_wrong_buyer_is_rejected() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    clock.set_for_testing(1000);
    let quote = sample_quote(&mut ctx, @0xAB, 9_000_000, 121_000);
    let coins = coin::mint_for_testing<SUI>(9_000_000, &mut ctx);
    pay(quote, coins, &clock, &mut ctx);
    clock.destroy_for_testing();
}

#[test]
#[expected_failure(abort_code = EExpired)]
fun test_expired_quote_is_rejected() {
    let mut ctx = tx_context::dummy();
    let mut clock = clock::create_for_testing(&mut ctx);
    clock.set_for_testing(121_001);
    let buyer = ctx.sender();
    let quote = sample_quote(&mut ctx, buyer, 9_000_000, 121_000);
    let coins = coin::mint_for_testing<SUI>(9_000_000, &mut ctx);
    pay(quote, coins, &clock, &mut ctx);
    clock.destroy_for_testing();
}
