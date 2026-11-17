import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Runtime Google Maps Platform quota & auth failure listener
(window as any).gm_authFailure = () => {
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
};

const origConsoleError = console.error;
console.error = (...args: any[]) => {
  if (args.some((a) => typeof a === 'string' && a.includes('OverQuotaMapError'))) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
  origConsoleError.apply(console, args);
};

if ('serviceWorker' in navigator) {
  registerSW({ immediate: true });
}

createRoot(document.getElementById('root')!).render(<App />);
