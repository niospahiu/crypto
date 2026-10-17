import { useEffect, useState } from 'react';
import { useDAppKit, useCurrentAccount, useCurrentClient, useCurrentNetwork } from '@mysten/dapp-kit-react';
import { Transaction } from '@mysten/sui/transactions';

const TEC = '0xed823c98495cc251a6d9f5bf3bf60a87783c4aebbf6c55830484e4ee60d487d4::tec::TEC';
// This was the tec-dev wallet used in the earlier testnet token deployment.
// WARNING: its mnemonic appeared in screenshots. NEVER use it on Mainnet.
const TEST_RECEIVER = '0x873293776c908c19c34ffdc3dfd286f115b7a90be1691c168871fa41f90b8fce';
const TOKEN_DECIMALS = 6n;

// ALL PRICES BELOW ARE FICTIONAL AND ONLY FOR TESTNET.
const EURO_EXAMPLE = 10;
const TEC_DISCOUNT_PERCENT = 10;
const EXAMPLE_RATE = 1; // fake demonstration rate: 1 TEC = 1 EUR (NOT a market quote)
const TOKENS_TO_SEND = (EURO_EXAMPLE * (100 - TEC_DISCOUNT_PERCENT)) / 100 / EXAMPLE_RATE;
const AMOUNT_RAW = BigInt(TOKENS_TO_SEND) * 10n ** TOKEN_DECIMALS;
const QUOTE_LENGTH = 120;

const pad2 = (n) => String(n).padStart(2, '0');

export default function TestnetCheckout() {
  const account = useCurrentAccount();
  const client = useCurrentClient();
  const network = useCurrentNetwork();
  const dAppKit = useDAppKit();
  const [expiresAt, setExpiresAt] = useState(null);
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState('');
  const [error, setError] = useState('');
  const [attemptedFrom, setAttemptedFrom] = useState('');
  const [mockReceipt, setMockReceipt] = useState(false);

  // No automatic wallet actions. Timer is UI-only, not a payment guarantee.
  useEffect(() => {
    if (!expiresAt) {
      setRemaining(0);
      return;
    }
    const tick = () => setRemaining(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [expiresAt]);

  useEffect(() => {
    // Never reuse a quote/receipt for a different account or network.
    setExpiresAt(null);
    setReceipt('');
    setError('');
    setAttemptedFrom('');
    setMockReceipt(false);
  }, [account?.address, network]);

  function generateQuote() {
    setReceipt('');
    setMockReceipt(false);
    setError('');
    setExpiresAt(Date.now() + QUOTE_LENGTH * 1000);
  }

  function simulateCheckout() {
    if (!expiresAt || Date.now() >= expiresAt) {
      setError('The demo quote expired. Create a new one to simulate the checkout.');
      return;
    }
    if (busy) return;
    // A local UI-only simulation: never signs, never transfers, never creates an order.
    setMockReceipt(true);
    setExpiresAt(null);
    setError('');
  }

  async function pay() {
    if (busy) return;
    if (!account || network !== 'testnet') {
      setError('Connect your Slush wallet on TESTNET first.');
      return;
    }
    if (!expiresAt || Date.now() >= expiresAt) {
      setError('The demo quote has expired. Create a new one.');
      return;
    }
    // Explicit opt-in for sending test tokens. Signing in the wallet is separate.
    const approved = window.confirm(
      'TESTNET ONLY: Transfer ' + TOKENS_TO_SEND + ' TEC to the tec-dev testing wallet?\n' +
      'Your balance will decrease. This is NOT a real shop order.'
    );
    if (!approved) return;

    setBusy(true);
    setError('');
    setAttemptedFrom(account.address);
    try {
      const [{ balance: tecBalance }, { balance: gasBalance }] = await Promise.all([
        client.getBalance({ owner: account.address, coinType: TEC }),
        client.getBalance({ owner: account.address }),
      ]);
      if (BigInt(tecBalance.balance) < AMOUNT_RAW) {
        throw new Error('Insufficient TEC test tokens. Need ' + TOKENS_TO_SEND + ' TEC.');
      }
      if (BigInt(gasBalance.balance) === 0n) {
        throw new Error('No Testnet SUI available for gas.');
      }
      if (Date.now() >= expiresAt) {
        throw new Error('Quote expired before signing. Start again.');
      }

      const tx = new Transaction();
      tx.transferObjects(
        [tx.coin({ type: TEC, balance: AMOUNT_RAW })],
        TEST_RECEIVER,
      );

      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      if (result.FailedTransaction || !result.Transaction?.status?.success) {
        throw new Error(
          result.FailedTransaction?.status?.error?.message ||
          'The Sui Testnet transaction did not succeed.'
        );
      }

      const digest = result.Transaction.digest;
      // A digest is not enough for production merchant settlement, but onchain
      // execution success is a legitimate result for this isolated test.
      try {
        await client.waitForTransaction({ digest });
      } catch {
        // Wallet already reported chain execution success. Explorer can still
        // show the digest while indexers catch up.
      }
      setReceipt(digest);
      setExpiresAt(null);
    } catch (e) {
      const message = e?.message || 'Wallet request failed or was rejected.';
      if (/passphrase and private key accounts cannot be unlocked on web/i.test(message)) {
        setError('Slush Web does not allow this imported passphrase/private-key account to sign here. Your TEC has not moved. You can still test the checkout using the SIMULATE button (no blockchain transaction).');
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  const quoteLive = remaining > 0 && !receipt && !mockReceipt;
  const walletChanged = attemptedFrom && account?.address !== attemptedFrom;

  return (
    <section className="card checkout" id="testnet-checkout">
      <div className="checkout-top">
        <div><span className="eyebrow">PHASE 2 / PAYMENT LAB</span><h2>TEC TEST CHECKOUT</h2></div>
        <span className="lab-badge">SIMULATED PRICING</span>
      </div>
      <p className="checkout-intro">Practice a wallet-authorized Testnet token transfer.
        This is a developer experiment, not a real purchase or protected merchant checkout.
        Slush Web may prevent imported passphrase/private-key accounts from signing; never enter your key on this website.</p>

      <div className="checkout-grid">
        <div className="demo-product">
          <div className="demo-product-art">TEC</div>
          <div><b>TEC Identity Patch — DEMO</b>
            <small>Fictional test product · No shipment or order</small></div>
        </div>
        <div className="quote-info">
          <div><span>Illustrative EUR amount</span><b>€{EURO_EXAMPLE.toFixed(2)}</b></div>
          <div><span>Illustrative TEC discount</span><b>−{TEC_DISCOUNT_PERCENT}%</b></div>
          <div><span>Fictional conversion</span><b>1 TEC = €1 (DEMO)</b></div>
          <div className="amount"><span>Testnet amount</span><strong>{TOKENS_TO_SEND} TEC</strong></div>
        </div>
      </div>

      <div className="checkout-actions">
        {!receipt && !mockReceipt && (
          <button className="quote-button" type="button" disabled={busy} onClick={generateQuote}>
            {expiresAt ? '↻ Restart 2-min demo quote' : 'Create 2-min demo quote'}
          </button>
        )}
        {expiresAt && !receipt && !mockReceipt && (
          <div className="timer" aria-live="polite">
            {quoteLive ? 'Expires in ' + pad2(Math.floor(remaining / 60)) + ':' + pad2(remaining % 60)
                       : 'Quote expired — create a new one'}
          </div>
        )}
        {!receipt && !mockReceipt && expiresAt && (
          <>
            <button className="pay-button" type="button" onClick={simulateCheckout}
              disabled={busy || !quoteLive}>
              Simulate checkout (NO transfer)
            </button>
            <button className="quote-button" type="button" onClick={pay}
              disabled={busy || !quoteLive || !account || network !== 'testnet'}>
              {busy ? 'Waiting for Slush / network…' : 'Optional: Sign real Testnet ' + TOKENS_TO_SEND + ' TEC transfer'}
            </button>
          </>
        )}
      </div>

      {error && <p role="alert" className="error">{error}</p>}
      {mockReceipt && (
        <div className="demo-receipt" role="status">
          <b>✓ Demo checkout flow complete — SIMULATION ONLY</b>
          <p>Test price: {TOKENS_TO_SEND} TEC. No Slush signature was requested,
             no TEC or SUI moved and no blockchain transaction or order was created.</p>
          <button type="button" onClick={generateQuote}>Restart demo</button>
        </div>
      )}
      {receipt && (
        <div className="demo-receipt" role="status">
          <b>✓ Testnet transfer executed</b>
          <p>{TOKENS_TO_SEND} TEC was sent to the development wallet. No merchandise order was created.</p>
          <a href={'https://suiscan.xyz/testnet/tx/' + receipt}
             rel="noreferrer" target="_blank">View blockchain transaction ↗</a>
          <button type="button" onClick={() => { setReceipt(''); setError(''); }}>Try another test</button>
        </div>
      )}
      {walletChanged && <p className="error">Wallet changed while signing. Re-check your receipt on the explorer.</p>}
      <p className="checkout-warning">⚠️ TESTNET ONLY. The green SIMULATE button never sends anything. The separate optional transfer button asks Slush to send {TOKENS_TO_SEND} test TEC
        to the development wallet, and gas fees consume Testnet SUI. No actual EUR/TEC price exists.
        Imported passphrase/private-key accounts may be restricted from signing via Slush Web; this app does not bypass wallet restrictions. The two-minute timer runs in the browser only; it does not enforce an on-chain expiry.
        Real orders require a server-issued quote, replay protection, verified transaction details,
        legal review, and server-side order settlement.</p>
    </section>
  );
}
