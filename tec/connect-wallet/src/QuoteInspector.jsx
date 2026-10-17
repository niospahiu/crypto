import { useEffect, useState } from 'react';

const DEFAULT_QUOTE = '0x8aca403881fca62cf43e02eb80b5e4635d3ed1fd4b389bb566e10a9b169cd700';

export default function QuoteInspector() {
  const [id,setId]=useState(DEFAULT_QUOTE);
  const [quote,setQuote]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function loadQuote(){
    if(busy)return;
    setBusy(true);setError('');setQuote(null);
    try {
      const response=await fetch('/api/tec-demo/onchain-quote?id='+encodeURIComponent(id.trim()));
      const result=await response.json();
      if(!response.ok)throw new Error(result.error || 'Failed to inspect Testnet Quote');
      setQuote(result);
    } catch(e){setError(e.message || 'Quote lookup failed.');}
    finally{setBusy(false);}
  }
  useEffect(()=>{loadQuote();},[]); // Show the already-created quote on startup.
  return (
    <section className="card inspector" id="onchain-quote-inspector">
      <span className="eyebrow">PHASE 7 / ON-CHAIN QUOTE INSPECTOR</span>
      <h2>TEC BLOCKCHAIN QUOTE</h2>
      <p>Read the actual Move Quote object on Sui Testnet. This is an inspection only:
         it does not issue, pay, refresh, or transfer tokens.</p>
      <label htmlFor="quote-object-input" className="eyebrow">Sui Quote object ID</label>
      <input id="quote-object-input" value={id} spellCheck="false" autoComplete="off"
        onChange={e=>setId(e.target.value)} />
      <button type="button" className="quote-button" onClick={loadQuote} disabled={busy}>
        {busy?'Checking Sui Testnet…':'Inspect on-chain quote (NO payment)'}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
      {quote && <div className="quote-inspector-result" role="status">
        <strong>✓ Official TEC Testnet quote verified</strong>
        <dl>
          <div><dt>Order reference</dt><dd>{quote.orderRef}</dd></div>
          <div><dt>Quote status</dt><dd className={quote.state==='EXPIRED'?'quote-expired':'green'}>{quote.state}</dd></div>
          <div><dt>Test price</dt><dd>{quote.amount} TEC</dd></div>
          <div><dt>Deadline</dt><dd>{new Date(quote.expiresAt).toLocaleString()}</dd></div>
          <div><dt>Payment status</dt><dd>NOT PAID</dd></div>
        </dl>
        <p>Validated official merchant capability, buyer, receiver and 9 TEC amount.
           A Quote object is NOT evidence of an executed payment.</p>
        <a href={'https://suiscan.xyz/testnet/object/'+quote.quoteId}
          target="_blank" rel="noreferrer">Inspect Testnet object ↗</a>
      </div>}
    </section>
  );
}
