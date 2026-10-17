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
  const [orderId, setOrderId] = useState('');
  const [demoHistory, setDemoHistory] = useState([]);
  const [demoRef, setDemoRef] = useState('');
  const [digestInput, setDigestInput] = useState('');
  const [submittedDigest, setSubmittedDigest] = useState('');

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
    setOrderId('');
    setDemoRef('');
    setDigestInput('');
    setSubmittedDigest('');
    setDemoHistory([]);
    if (account?.address && network === 'testnet') {
      fetch('/api/tec-demo/orders?wallet=' + encodeURIComponent(account.address))
        .then(response => response.ok ? response.json() : { orders: [] })
        .then(data => setDemoHistory(Array.isArray(data.orders) ? data.orders : []))
        .catch(() => {});
    }
  }, [account?.address, network]);

  async function generateQuote() {
    if (busy) return;
    if (!account || network !== 'testnet') {
      setError('Connect a Testnet wallet before creating a demonstration order.');
      return;
    }
    setBusy(true);
    setReceipt('');
    setMockReceipt(false);
    setError('');
    setOrderId('');
    setDemoRef('');
    setDigestInput('');
    setSubmittedDigest('');
    setExpiresAt(null);
    try {
      const response = await fetch('/api/tec-demo/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: account.address }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to create demonstration quote.');
      setOrderId(data.id);
      setExpiresAt(data.expiresAt);
    } catch (e) {
      setError(e?.message || 'Local demonstration order server unavailable.');
    } finally {
      setBusy(false);
    }
  }

  async function reloadHistory(wallet) {
    const response = await fetch('/api/tec-demo/orders?wallet=' + encodeURIComponent(wallet));
    if (response.ok) {
      const result = await response.json();
      setDemoHistory(Array.isArray(result.orders) ? result.orders : []);
    }
  }

  async function verifyDigestOnServer(digest) {
    if (!orderId || !account || network !== 'testnet') {
      throw new Error('Connect a Testnet wallet and create a quote first.');
    }
    const response = await fetch('/api/tec-demo/orders/' + encodeURIComponent(orderId) + '/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ digest: digest.trim() }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Sui Testnet verification failed.');
    if (data.status !== 'verified_testnet' || data.digest !== digest.trim()) {
      throw new Error('Server did not confirm the Testnet transfer.');
    }
    setReceipt(data.digest);
    setExpiresAt(null);
    setError('');
    await reloadHistory(account.address);
  }

  async function manuallyVerifyDigest() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await verifyDigestOnServer(digestInput);
    } catch (e) {
      setError(e?.message || 'Unable to verify Sui Testnet digest.');
    } finally {
      setBusy(false);
    }
  }

  async function simulateCheckout() {
    if (busy) return;
    if (!orderId || !expiresAt || Date.now() >= expiresAt) {
      setError('The demo quote expired. Create a new one to simulate the checkout.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/tec-demo/orders/' + encodeURIComponent(orderId) + '/simulate', {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Demo could not be recorded.');
      setMockReceipt(true);
      setDemoRef(data.id);
      setExpiresAt(null);
      await reloadHistory(account.address);
    } catch (e) {
      setError(e?.message || 'Could not save demo to local order history.');
    } finally {
      setBusy(false);
    }
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
      // Preserve submitted digest even if server verification is temporarily
      // unavailable. The app must NEVER show verified based on the wallet alone.
      setSubmittedDigest(digest);
      setDigestInput(digest);
      try {
        await client.waitForTransaction({ digest });
      } catch {
        // Indexing may lag; manual re-verification remains available.
      }
      await verifyDigestOnServer(digest);
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
        <div><span className="eyebrow">PHASE 4 / TESTNET VERIFICATION LAB</span><h2>TEC TEST CHECKOUT</h2></div>
        <span className="lab-badge">LOCAL TEST ORDER LOG</span>
      </div>
      <p className="checkout-intro">Practice a wallet-authorized Testnet token transfer.
        This is a developer experiment, not a real purchase or protected merchant checkout.
        Slush Web may prevent imported passphrase/private-key accounts from signing; never enter your key on this website.
        The simulation now saves a local TEST order record in Termux; it is never a paid order.</p>

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

      {orderId && !receipt && !mockReceipt && (
        <div className="manual-verify">
          <label className="eyebrow" htmlFor="digest-input">VERIFY AN ON-CHAIN TESTNET TRANSACTION</label>
          <p>Already transferred 9 TEC from this wallet to the test receiver during this quote? Paste that transaction's digest to ask the local server to verify it. This NEVER signs or sends coins.</p>
          <input id="digest-input" type="text" value={digestInput} autoComplete="off"
            spellCheck="false" placeholder="Sui transaction digest" maxLength={80}
            onChange={event => setDigestInput(event.target.value)} />
          <button className="quote-button" type="button" disabled={busy || !digestInput.trim()}
            onClick={manuallyVerifyDigest}>
            {busy ? 'Checking Sui Testnet…' : 'Verify digest on Sui Testnet'}
          </button>
          {submittedDigest && <small>Wallet submitted: {submittedDigest}. If verification fails temporarily, retry above; the on-chain transfer is not reversed.</small>}
        </div>
      )}
      {error && <p role="alert" className="error">{error}</p>}
      {mockReceipt && (
        <div className="demo-receipt" role="status">
          <b>✓ Demo checkout recorded — SIMULATION ONLY</b>
          <p>Test price: {TOKENS_TO_SEND} TEC. No Slush signature was requested, no TEC or SUI moved.
             A local TEST record was saved; no paid order or blockchain transaction exists.</p>
          <p>Test order ID: <code>{demoRef}</code> · Status: SIMULATED (NOT PAID)</p>
          <button type="button" onClick={generateQuote}>Restart demo</button>
        </div>
      )}
      {receipt && (
        <div className="demo-receipt" role="status">
          <b>✓ Verified TEC transfer on Sui Testnet</b>
          <p>The local development server confirmed the sender, test receiver, exact TEC amount and transaction timestamp. This is not a real merchandise payment.</p>
          <p>Test order: <code>{orderId}</code> · VERIFIED_TESTNET</p>
          <a href={'https://suiscan.xyz/testnet/tx/' + receipt}
             rel="noreferrer" target="_blank">View blockchain transaction ↗</a>
          <button type="button" onClick={() => { setReceipt(''); setError(''); }}>Try another test</button>
        </div>
      )}
      {walletChanged && <p className="error">Wallet changed while signing. Re-check your receipt on the explorer.</p>}
      {demoHistory.length > 0 && (
        <div className="demo-history">
          <span className="eyebrow">LOCAL TEST ORDER HISTORY</span>
          {demoHistory.slice(0, 5).map(order => (
            <div key={order.id} className="demo-history-row">
              <code>{order.id.slice(0, 12)}</code>
              <span>{order.totalTec} TEC</span>
              <b>{order.status === 'simulated' ? 'SIMULATED · NOT PAID' : order.status === 'verified_testnet' ? '✓ VERIFIED TESTNET TRANSFER' : 'QUOTE ONLY'}</b>
            </div>
          ))}
          <small>Development records stored only on this device. No real purchases.</small>
        </div>
      )}
      <p className="checkout-warning">⚠️ TESTNET ONLY. The green SIMULATE button never sends tokens; it saves a local NOT PAID record on the Termux development server. The separate optional transfer button asks Slush to send {TOKENS_TO_SEND} test TEC
        to the development wallet, and gas fees consume Testnet SUI. No actual EUR/TEC price exists.
        Imported passphrase/private-key accounts may be restricted from signing via Slush Web; this app does not bypass wallet restrictions. The demo quote expires on the local server after two minutes, but does not enforce an on-chain expiry.
        A verified Testnet transfer is not a production checkout. A simple token transfer has no unique on-chain order identifier; this local demo must never be used for actual sales.
        Before real orders: server authentication, a binding payment nonce, secure receiver custody, robust replay prevention, production settlement testing, and legal review.</p>
    </section>
  );
}
