import { useEffect, useState } from 'react';
import { ConnectButton } from '@mysten/dapp-kit-react/ui';
import { useCurrentAccount, useCurrentClient, useCurrentNetwork, useCurrentWallet } from '@mysten/dapp-kit-react';

const PACKAGE = '0xed823c98495cc251a6d9f5bf3bf60a87783c4aebbf6c55830484e4ee60d487d4';
const TEC_TYPE = PACKAGE + '::tec::TEC';
const ICON = 'https://raw.githubusercontent.com/niospahiu/crypto/main/tec/tec-coin-icon.jpg';

function formatAmount(raw, decimals) {
  const value = BigInt(raw);
  const base = 10n ** BigInt(decimals);
  const whole = (value / base).toLocaleString('en-US');
  const fraction = (value % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return whole + (fraction ? '.' + fraction : '');
}

function Balances({ account, client }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [version, refresh] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let closed = false;
    setData(null);
    setError('');
    if (!account) return () => { closed = true; };
    setLoading(true);
    Promise.all([
      client.getBalance({ owner: account.address, coinType: TEC_TYPE }),
      client.getBalance({ owner: account.address }),
    ]).then(([tec, sui]) => {
      if (!closed) setData({ tec: tec.balance, sui: sui.balance });
    }).catch(err => {
      if (!closed) setError(err.message || 'Unable to read the network.');
    }).finally(() => { if (!closed) setLoading(false); });
    return () => { closed = true; };
  }, [account?.address, client, version]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(account.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { setError('Copy is unavailable in this browser.'); }
  }

  return (
    <section className="card">
      <div className="sectionHead">
        <span className="eyebrow">WALLET OVERVIEW</span>
        <span className={account ? 'status on' : 'status'}>{account ? '● CONNECTED' : '○ DISCONNECTED'}</span>
      </div>
      {account ? <>
        <div className="address">
          <div><small>Wallet address</small><strong>{account.address.slice(0, 9)}…{account.address.slice(-7)}</strong></div>
          <button onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
        </div>
        <div className="balance">
          <div className="identity"><img src={ICON} alt="TEC logo" /><div><b>The Eastern Code</b><small>TEC · Testnet</small></div></div>
          <strong>{loading ? 'Loading…' : data ? formatAmount(data.tec, 6) + ' TEC' : '—'}</strong>
        </div>
        <div className="balance secondary">
          <div className="identity"><span className="suiIcon">S</span><div><b>SUI</b><small>Testnet gas token</small></div></div>
          <strong>{loading ? 'Loading…' : data ? formatAmount(data.sui, 9) + ' SUI' : '—'}</strong>
        </div>
        {error && <p role="alert" className="error">{error}</p>}
        <div className="actions">
          <button onClick={() => refresh(n => n + 1)} disabled={loading}>↻ Refresh</button>
          <a href={'https://suiscan.xyz/testnet/account/' + account.address} target="_blank" rel="noreferrer">View on explorer ↗</a>
        </div>
      </> : <div className="empty">
        <div className="emptyLogo">⌁</div>
        <h3>No wallet connected</h3>
        <p>Tap Connect Wallet to authorize Slush and show your on-chain TEC balance.</p>
        <small>Read-only demo. No seed phrase, private key or signing required.</small>
      </div>}
    </section>
  );
}

export default function App() {
  const account = useCurrentAccount();
  const client = useCurrentClient();
  const network = useCurrentNetwork();
  const wallet = useCurrentWallet();

  return (
    <div className="shell"><div className="container">
      <header><a className="brand" href="./"><img src={ICON} alt="TEC" />
        <span><b>THE EASTERN CODE</b><small>BLOCKCHAIN LAB</small></span>
      </a><span className="pill">● TESTNET ONLY</span></header>
      <main>
        <section className="hero">
          <span className="eyebrow">SUI NETWORK / EXPERIMENTAL</span>
          <h1>YOUR CODE.<br /><em>YOUR WALLET.</em></h1>
          <p>Connect a Sui wallet and check your <b>real TEC Testnet balance</b> — without sending tokens or signing transactions.</p>
          <div className="connect"><ConnectButton><span>Connect Wallet ↗</span></ConnectButton></div>
          <small>Slush compatible · Testnet balances · No monetary value</small>
        </section>
        <div className="layout">
          <Balances account={account} client={client} />
          <aside>
            <section className="card"><span className="eyebrow">CURRENT SESSION</span>
              <dl>
                <div><dt>Network</dt><dd className="green">{network?.toUpperCase()}</dd></div>
                <div><dt>Wallet</dt><dd>{account ? (wallet?.name || 'Connected') : 'Not connected'}</dd></div>
                <div><dt>Coin type</dt><dd>TEC · 6 decimals</dd></div>
                <div><dt>Supply</dt><dd>1,000,000 TEC</dd></div>
              </dl>
            </section>
            <section className="card callout"><span className="eyebrow">DEVELOPMENT STATUS</span>
              <h3>Wallet Connection · Phase 1</h3>
              <p>Only public balances are read from Sui Testnet. Checkout, discounts and payments are not implemented here.</p>
              <a href={'https://suiscan.xyz/testnet/object/' + PACKAGE} target="_blank" rel="noreferrer">TEC contract ↗</a>
            </section>
          </aside>
        </div>
      </main>
      <footer><span>© THE EASTERN CODE · DEV 01</span><span>TESTNET TOKENS ARE NOT REAL MONEY</span></footer>
    </div></div>
  );
}
