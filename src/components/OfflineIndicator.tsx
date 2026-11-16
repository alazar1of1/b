import React, { useEffect, useState } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useLanguage } from '../context/LanguageContext';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const [wasOffline, setWasOffline] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);
  const { language } = useLanguage();
  const isAmharic = language === 'am';

  useEffect(() => {
    if (!isOnline) {
      setWasOffline(true);
    } else if (wasOffline) {
      setShowReconnected(true);
      const timer = setTimeout(() => setShowReconnected(false), 3500);
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline]);

  if (!isOnline) {
    return (
      <div
        id="pwa-offline-banner"
        className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-2xl bg-amber-600/95 text-white px-3.5 py-2 text-xs font-bold shadow-xl backdrop-blur-xs border border-amber-400/40 animate-slideUp"
      >
        <WifiOff className="w-4 h-4 text-amber-200 animate-pulse" />
        <span>
          {isAmharic
            ? 'ከመስመር ውጭ (Offline) • በስልክዎ ማህደረ-ትውስታ ይሰራል'
            : 'Offline Mode • Running Standalone from Local Storage'}
        </span>
      </div>
    );
  }

  if (showReconnected) {
    return (
      <div
        id="pwa-online-banner"
        className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-2xl bg-emerald-600/95 text-white px-3.5 py-2 text-xs font-bold shadow-xl backdrop-blur-xs border border-emerald-400/40 animate-slideUp"
      >
        <Wifi className="w-4 h-4 text-emerald-200" />
        <span>
          {isAmharic ? 'የበይነመረብ ግንኙነት ተመልሷል' : 'Internet Connected • Online Sync Available'}
        </span>
      </div>
    );
  }

  return null;
};
