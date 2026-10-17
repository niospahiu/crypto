import React from 'react';
import { createRoot } from 'react-dom/client';
import { DAppKitProvider } from '@mysten/dapp-kit-react';
import { dAppKit } from './dapp-kit.js';
import App from './App.jsx';
import './styles.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { message: '' };
  }

  static getDerivedStateFromError(error) {
    return { message: error?.message || 'Unexpected application error.' };
  }

  componentDidCatch(error, info) {
    console.error('TEC wallet render error:', error, info);
  }

  render() {
    if (this.state.message) {
      return (
        <div style={{ minHeight: '100vh', background: '#080b11', color: '#fff', padding: '40px 24px', fontFamily: 'system-ui' }}>
          <h1>TEC · Connection Error</h1>
          <p style={{ color: '#ffb6ac', overflowWrap: 'anywhere' }}>{this.state.message}</p>
          <p>Nothing was transferred. Your wallet and tokens are unaffected.</p>
          <button style={{ padding: '12px 20px', borderRadius: '8px' }} onClick={() => window.location.reload()}>
            Reload Wallet
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <DAppKitProvider dAppKit={dAppKit}><App /></DAppKitProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
