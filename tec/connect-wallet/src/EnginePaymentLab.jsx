import { useEffect, useState } from 'react';
import { useCurrentAccount, useCurrentNetwork, useDAppKit } from '@mysten/dapp-kit-react';
import { Transaction } from '@mysten/sui/transactions';

const PACKAGE = '0x984ea1d9b89f899e326adc3f96eb9d5903ed43d06db339507ddbadacb2e93230';
const TEC = '0xed823c98495cc251a6d9f5bf3bf60a87783c4aebbf6c55830484e4ee60d487d4::tec::TEC';

export default function EnginePaymentLab() {
  const account = useCurrentAccount();
  const network = useCurrentNetwork();
  const dapp = useDAppKit();
  const [quoteId, setQuoteId] = useState('');
  const [quote, setQuote] = useState(null);
  const [digest, setDigest] = useState('');
  const [verified, setVerified] = useState(false);
  const [digestInput, setDigestInput] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    setQuote(null);
    setDigest('');
    setVerified(false);
    setDigestInput('');
    setError('');
  }, [account?.address, network]);

  async function loadQuote() {
    if (working) return;
    setWorking(true); setError(''); setQuote(null); setDigest(''); setVerified(false); setDigestInput('');
    try {
      if (!account || network !== 'testnet') throw new Error('Connect your buyer wallet on Sui Testnet.');
      const response = await fetch('/api/tec-demo/onchain-quote?id=' + encodeURIComponent(quoteId.trim()));
      const q = await response.json();
      if (!response.ok) throw new Error(q.error || 'Testnet quote lookup failed.');
      if (q.buyer !== account.address.toLowerCase()) throw new Error('This quote belongs to a different buyer wallet.');
      if (q.state !== 'ACTIVE' || q.expiresAt <= Date.now()) throw new Error('Quote expired. The merchant must issue a fresh one.');
      const registration = await fetch('/api/tec-engine/quotes/register', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({quoteId:q.quoteId}),
      });
      const record = await registration.json();
      if (!registration.ok) throw new Error(record.error || 'Could not bind this Quote on the local server.');
      if (record.quoteId !== q.quoteId || record.buyer !== q.buyer || record.orderRef !== q.orderRef) {
        throw new Error('Quote registry mismatch. No wallet action allowed.');
      }
      if (record.status === 'VERIFIED_CONTRACT_TESTNET') {
        setDigest(record.digest); setVerified(true);
      }
      setQuote(q);
    } catch (e) {
      setError(e.message || 'Unable to read quote.');
    } finally { setWorking(false); }
  }

  async function verifyDigest(d) {
    if (!quote) throw new Error('Register the original Quote before verifying.');
    const response = await fetch('/api/tec-engine/quotes/' + quote.quoteId + '/verify', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({digest:d.trim()}),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Payment proof could not be checked.');
    if (body.status !== 'VERIFIED_CONTRACT_TESTNET' || body.digest !== d.trim()) {
      throw new Error('Server did not independently confirm the event.');
    }
    setDigest(body.digest); setVerified(true);
  }

  async function retryVerification() {
    if (working) return;
    setWorking(true); setError('');
    try {await verifyDigest(digestInput);} catch(e) {setError(e.message || 'Testnet verification unavailable.');}
    finally {setWorking(false);}
  }

  async function payQuote() {
    if (working || !quote || digest || digestInput) return;
    if (!account || network !== 'testnet' || quote.buyer !== account.address.toLowerCase()) {
      setError('Wrong wallet or network.'); return;
    }
    if (quote.expiresAt <= Date.now()) {
      setError('The 120-second quote has expired. Do not sign.'); return;
    }
    if (!window.confirm('SUI TESTNET ONLY: authorize an on-chain payment of exactly 9 TEST TEC for ' +
      quote.orderRef + '? These test coins will be sent to the development wallet.')) return;

    setWorking(true); setError('');
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: PACKAGE + '::checkout::pay',
        typeArguments: [TEC],
        arguments: [
          tx.object(quote.quoteId),
          tx.coin({ type: TEC, balance: 9_000_000n }),
          tx.object.clock(),
        ],
      });
      const result = await dapp.signAndExecuteTransaction({ transaction: tx, network: 'testnet' });
      if (result.FailedTransaction || result.Transaction?.status?.success !== true) {
        throw new Error(result.FailedTransaction?.status?.error?.message || 'Testnet transaction failed.');
      }
      const d = result.Transaction.digest;
      setDigest(d); setDigestInput(d);
      // Do not claim a paid order from the wallet response alone.
      try {await verifyDigest(d);} catch (verificationError) {
        setError(verificationError.message + ' Preserve this digest; do NOT pay again.');
      }
    } catch (e) {
      setError(e.message || 'Wallet declined or transaction failed.');
    } finally { setWorking(false); }
  }

  const seconds = quote ? Math.max(0, Math.ceil((quote.expiresAt - now) / 1000)) : 0;
  return <section className="card engine-pay" id="phase8-testnet">
    <span className="eyebrow">PHASE 8A / SMART CONTRACT PAYMENT</span>
    <h2>TEC ON-CHAIN CHECKOUT LAB</h2>
    <p><b>TESTNET ONLY.</b> Pay a NEW official 9 TEC Quote through the
      deployed Move contract. The old sample quote is expired.</p>
    <label htmlFor="engine-quote-id">Fresh blockchain Quote ID</label>
    <input id="engine-quote-id" value={quoteId} spellCheck="false" autoComplete="off"
      placeholder="0x…" onChange={e => {setQuoteId(e.target.value);setQuote(null);setDigest('');setVerified(false);setDigestInput('');}} />
    <button type="button" className="quote-button" disabled={working || !quoteId.trim() || !account}
      onClick={loadQuote}>Verify active Quote before signing</button>
    {quote && <div className="engine-details">
      <div>Order reference: <b>{quote.orderRef}</b></div>
      <div>Exact price: <b>9 TEST TEC</b></div>
      <div>Deadline: <b>{seconds}s remaining</b></div>
      <div>Payment: <b>NOT PAID</b></div>
      <button className="pay-button" type="button" disabled={working || seconds === 0 || !!digest || !!digestInput}
        onClick={payQuote}>{working ? 'Waiting for wallet…' : 'Approve exact 9 TEC contract payment'}</button>
    </div>}
    {quote && <div className="manual-verify">
      <label htmlFor="engine-digest">Already paid via wallet or Termux? Verify digest without another transfer</label>
      <input id="engine-digest" value={digestInput} maxLength={80} autoComplete="off" spellCheck="false"
        onChange={e=>setDigestInput(e.target.value)} placeholder="Sui transaction digest" />
      <button className="quote-button" type="button" disabled={!digestInput.trim() || working}
        onClick={retryVerification}>Verify exact on-chain PaymentAccepted event</button>
    </div>}
    {digest && <div className="demo-receipt" role="status">
      <b>{verified ? '✓ Verified smart-contract Testnet transfer' : 'Transaction submitted — verification pending'}</b>
      <p>Digest: <code>{digest}</code></p>
      <p>{verified ? 'Official payment event, merchant cap, order reference and TEC balance changes confirmed. Still NOT a real store order.' : 'Order settlement is NOT YET VERIFIED. Do not send again to fix an indexing delay.'}</p>
      <a href={'https://suiscan.xyz/testnet/tx/' + digest}
        target="_blank" rel="noreferrer">Inspect transaction ↗</a>
    </div>}
    {error && <p className="error" role="alert">{error}</p>}
    <p className="checkout-warning">This is a developer test, not a customer checkout.
      Merchant quote issuance is not automated here. Payment proof is read-only
      and requires this local server and chain data. Never enter recovery phrases or use real money.</p>
  </section>;
}
