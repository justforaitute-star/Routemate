/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { AlertTriangle, X } from 'lucide-react';
import { AppProvider } from './context/AppContext';
import { AppHeader } from './components/common/AppHeader';
import { AppDock, DemoTabId } from './components/common/AppDock';
import { DemoShowcaseView } from './components/demo/DemoShowcaseView';
import { OfflineIndicator } from './components/pwa/OfflineIndicator';
import { useMediaQuery } from './utils/useMediaQuery';

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

const MainApp: React.FC = () => {
  const isWideScreen = useMediaQuery('(min-width: 768px)');
  const [activeTab, setActiveTab] = useState<DemoTabId>('overview');
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);

  useEffect(() => {
    const handleQuotaExceeded = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
  }, []);

  return (
    <div className="h-dvh w-full flex flex-col relative overflow-hidden bg-gradient-to-br from-[#dcebf2] via-[#ebf3f7] to-[#dfecf2] pt-[env(safe-area-inset-top)]">
      {/* Shared Demo Key Quota Exhaustion Banner */}
      {gmpQuotaExceeded && (
        <div
          role="alert"
          data-testid="gmp-quota-banner"
          className="fixed top-0 left-0 right-0 z-50 bg-amber-50/95 backdrop-blur-md border-b border-amber-300/80 px-3 py-2 text-[11px] font-semibold text-[#631B08] flex items-center justify-between gap-2 shadow-sm"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 text-[#E2480C] shrink-0" />
            <span className="leading-snug">
              This demo uses a shared demo Maps key whose daily quota is currently exhausted. To keep using Maps without limits,{' '}
              <a
                href="https://console.cloud.google.com/google/maps-apis/credentials"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-bold text-[#26788E]"
              >
                switch to your own Google Cloud project&apos;s Maps key
              </a>
              .
            </span>
          </div>
          <button
            type="button"
            onClick={() => setGmpQuotaExceeded(false)}
            aria-label="Dismiss Maps quota notice"
            className="p-1 rounded-full hover:bg-amber-200/50 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Soft Refractive Color Blooms behind Clear Glass */}
      <div className="pointer-events-none fixed -top-24 -left-24 w-96 h-96 rounded-full bg-[#A4CCD4]/65 blur-3xl" />
      <div className="pointer-events-none fixed top-1/4 -right-24 w-[28rem] h-[28rem] rounded-full bg-[#26788E]/28 blur-3xl" />
      <div className="pointer-events-none fixed -bottom-20 left-1/4 w-96 h-96 rounded-full bg-[#E2480C]/20 blur-3xl" />
      <div className="pointer-events-none fixed bottom-1/3 right-1/3 w-72 h-72 rounded-full bg-white/60 blur-3xl" />

      {/* Top Navigation Bar */}
      <AppHeader onNotificationClick={() => setActiveTab('alerts')} />

      {/* Main Unified Showcase Area */}
      <main
        className={`flex-1 relative z-10 min-h-0 ${
          isWideScreen ? 'overflow-hidden flex flex-col' : 'overflow-y-auto overscroll-none flex flex-col'
        }`}
      >
        <DemoShowcaseView activeTab={activeTab} onTabChange={setActiveTab} />
      </main>

      {/* Unified Clear Liquid Glass Dock with Co-Driver Mic (Visible across Mobile, Tablet, Desktop) */}
      <AppDock activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Offline Connectivity Banner */}
      <OfflineIndicator />
    </div>
  );
};

export default function App() {
  const tree = (
    <AppProvider>
      <MainApp />
    </AppProvider>
  );

  if (!MAPS_API_KEY) {
    return tree;
  }

  return (
    <APIProvider
      apiKey={MAPS_API_KEY}
      libraries={['routes', 'marker']}
      language="en"
      region="US"
    >
      {tree}
    </APIProvider>
  );
}
