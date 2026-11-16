import React, { useState } from 'react';
import { UserRole, Agent } from '../types/bingo';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeSwitcher } from './ThemeSwitcher';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Shield,
  User,
  Radio,
  Coins,
  FileSpreadsheet,
  LogOut,
  SlidersHorizontal,
  X,
  Laptop,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

interface HeaderProps {
  currentRole: UserRole;
  onSelectRole: (role: UserRole) => void;
  currentAgent: Agent | null;
  onSelectAgent: (agent: Agent) => void;
  agents: Agent[];
  networkMode: 'ONLINE' | 'SLOW_2G' | 'OFFLINE';
  onChangeNetworkMode: (mode: 'ONLINE' | 'SLOW_2G' | 'OFFLINE') => void;
  pendingSyncCount: number;
  isSyncing: boolean;
  onTriggerSync: () => void;
  onOpenPdfModal: () => void;
  onOpenElectronInfo: () => void;
  currentUser?: {
    role: 'SUPER_ADMIN' | 'AGENT';
    name: string;
    username?: string;
    agent?: Agent;
  } | null;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentRole,
  onSelectRole,
  currentAgent,
  onSelectAgent,
  agents,
  networkMode,
  onChangeNetworkMode,
  pendingSyncCount,
  isSyncing,
  onTriggerSync,
  onOpenPdfModal,
  onOpenElectronInfo,
  currentUser,
  onLogout,
}) => {
  const { t, isAmharic } = useLanguage();
  const { isNight } = useTheme();
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <>
      {/* Top Header Bar */}
      <header
        className={`backdrop-blur sticky top-0 z-40 px-3 sm:px-4 py-2.5 sm:py-3 transition-colors duration-200 ${
          isNight
            ? 'bg-slate-900/95 border-b border-slate-800'
            : 'bg-white border-b border-slate-200 shadow-sm'
        }`}
      >
        {/* DESKTOP & TABLET HEADER (sm:flex) */}
        <div className="hidden sm:flex max-w-7xl mx-auto items-center justify-between gap-3">
          {/* Brand & App Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-600/30 ring-2 ring-emerald-400/40 shrink-0">
              <span className="font-black font-mono text-xl">75</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className={`font-extrabold tracking-tight text-base sm:text-lg ${isNight ? 'text-white' : 'text-slate-900'}`}>
                  {t('appTitle')}
                </h1>
                <span
                  className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border ${
                    isNight
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}
                >
                  {t('offlinePcBadge')}
                </span>
              </div>
              <p className={`text-xs ${isNight ? 'text-slate-400' : 'text-slate-500'}`}>
                {t('appDescription')}
              </p>
            </div>
          </div>

          {/* Role Switcher */}
          <div
            className={`flex items-center p-1 rounded-xl border text-xs font-semibold ${
              isNight ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
            }`}
          >
            {isSuperAdmin && (
              <button
                onClick={() => onSelectRole('ADMIN')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  currentRole === 'ADMIN'
                    ? 'bg-emerald-600 text-white shadow-md font-bold'
                    : isNight
                    ? 'text-slate-400 hover:text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>{t('superAdmin')}</span>
              </button>
            )}

            <button
              onClick={() => onSelectRole('AGENT')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                currentRole === 'AGENT'
                  ? 'bg-emerald-600 text-white shadow-md font-bold'
                  : isNight
                  ? 'text-slate-400 hover:text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>{t('agentTerminal')}</span>
            </button>

            <button
              onClick={() => onSelectRole('CALLER')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                currentRole === 'CALLER'
                  ? 'bg-emerald-600 text-white shadow-md font-bold ring-2 ring-emerald-400/50'
                  : isNight
                  ? 'text-slate-400 hover:text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              <span>{t('callerBoard')}</span>
            </button>
          </div>

          {/* Indicators, Switchers & Actions */}
          <div className="flex items-center flex-wrap gap-2 text-xs">
            <ThemeSwitcher variant="pill" />
            <LanguageSwitcher variant="pill" />

            {/* Active Agent Selector if Admin is viewing */}
            {isSuperAdmin && (currentRole === 'AGENT' || currentRole === 'CALLER') && (
              <div
                className={`flex items-center gap-1 border rounded-lg px-2.5 py-1.5 ${
                  isNight ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
                }`}
              >
                <span className={`text-[11px] ${isNight ? 'text-slate-400' : 'text-slate-500'}`}>
                  {t('activeAgent')}
                </span>
                <select
                  value={currentAgent?.agentId || ''}
                  onChange={(e) => {
                    const found = agents.find((a) => a.agentId === e.target.value);
                    if (found) onSelectAgent(found);
                  }}
                  className={`bg-transparent font-bold outline-none cursor-pointer text-xs ${
                    isNight ? 'text-emerald-400' : 'text-emerald-700'
                  }`}
                >
                  {agents.map((a) => (
                    <option
                      key={a.agentId}
                      value={a.agentId}
                      className={isNight ? 'bg-slate-900 text-slate-200' : 'bg-white text-slate-800'}
                    >
                      {a.name} ({a.agentId}) - {a.balance} CR
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Active Balance Pill */}
            {currentAgent && (
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono font-bold ${
                  currentAgent.balance < 100
                    ? isNight
                      ? 'bg-rose-950/40 border-rose-600/40 text-rose-400 animate-pulse'
                      : 'bg-rose-50 border-rose-300 text-rose-600 animate-pulse'
                    : isNight
                    ? 'bg-emerald-950/40 border-emerald-600/40 text-emerald-400'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-700'
                }`}
                title={t('balance')}
              >
                <Coins className="w-3.5 h-3.5" />
                <span>{currentAgent.balance} CR</span>
              </div>
            )}

            {/* Print Cards Shortcut */}
            {currentRole !== 'AGENT' && (
              <button
                onClick={onOpenPdfModal}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition cursor-pointer ${
                  isNight
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                    : 'bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 text-slate-700 border-slate-200'
                }`}
                title={t('printCards')}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                <span className="hidden sm:inline">{t('printCards')}</span>
              </button>
            )}

            {/* Network Mode Simulator */}
            <div
              className={`flex items-center border rounded-lg p-0.5 ${
                isNight ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
              }`}
            >
              <button
                onClick={() => onChangeNetworkMode('ONLINE')}
                className={`px-2 py-1 rounded text-[11px] font-medium flex items-center gap-1 transition cursor-pointer ${
                  networkMode === 'ONLINE'
                    ? 'bg-emerald-600 text-white font-bold shadow-sm'
                    : isNight
                    ? 'text-slate-400 hover:text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Wifi className="w-3 h-3" />
                <span className="hidden md:inline">{t('online')}</span>
              </button>
              <button
                onClick={() => onChangeNetworkMode('SLOW_2G')}
                className={`px-2 py-1 rounded text-[11px] font-medium flex items-center gap-1 transition cursor-pointer ${
                  networkMode === 'SLOW_2G'
                    ? 'bg-amber-600 text-white font-bold shadow-sm'
                    : isNight
                    ? 'text-slate-400 hover:text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>{t('slow2g')}</span>
              </button>
              <button
                onClick={() => onChangeNetworkMode('OFFLINE')}
                className={`px-2 py-1 rounded text-[11px] font-medium flex items-center gap-1 transition cursor-pointer ${
                  networkMode === 'OFFLINE'
                    ? 'bg-rose-600 text-white font-bold shadow-sm'
                    : isNight
                    ? 'text-slate-400 hover:text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <WifiOff className="w-3 h-3" />
                <span className="hidden md:inline">{t('offline')}</span>
              </button>
            </div>

            {/* 1-Click Sync Trigger */}
            <button
              onClick={onTriggerSync}
              disabled={isSyncing || networkMode === 'OFFLINE'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-medium transition cursor-pointer ${
                networkMode === 'OFFLINE'
                  ? isNight
                    ? 'bg-slate-800/40 border-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-md shadow-emerald-600/20 border-emerald-500'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{t('sync')}</span>
              {pendingSyncCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-white text-[10px] font-black">
                  {pendingSyncCount}
                </span>
              )}
            </button>

            {/* User Account / Logout */}
            {currentUser && (
              <div className={`flex items-center gap-2 pl-2 border-l ${isNight ? 'border-slate-800' : 'border-slate-200'}`}>
                <div className="hidden lg:block text-right">
                  <div className={`font-bold text-xs truncate max-w-[120px] ${isNight ? 'text-slate-200' : 'text-slate-800'}`}>
                    {currentUser.name}
                  </div>
                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-bold">
                    {currentUser.role === 'SUPER_ADMIN' ? t('superAdmin') : currentUser.agent?.agentId}
                  </div>
                </div>
                <button
                  onClick={onLogout}
                  className={`p-1.5 rounded-lg border transition cursor-pointer ${
                    isNight
                      ? 'bg-slate-800 hover:bg-rose-950 hover:text-rose-300 text-slate-400 border-slate-700'
                      : 'bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600 border-slate-200'
                  }`}
                  title={t('logOut')}
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* SMARTPHONE TOP BAR (sm:hidden) */}
        <div className="flex sm:hidden items-center justify-between gap-2">
          {/* Brand & Compact Title */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black font-mono text-sm shadow-md shadow-emerald-600/30">
              75
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className={`font-extrabold text-sm tracking-tight ${isNight ? 'text-white' : 'text-slate-900'}`}>
                  Ela Bingo
                </span>
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase">
                  75
                </span>
              </div>
            </div>
          </div>

          {/* Quick Mobile Status & Controls */}
          <div className="flex items-center gap-1.5">
            {/* Balance Pill */}
            {currentAgent && (
              <div
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border font-mono text-xs font-bold ${
                  currentAgent.balance < 100
                    ? 'bg-rose-950/40 border-rose-600/40 text-rose-400'
                    : isNight
                    ? 'bg-slate-950 border-slate-800 text-emerald-400'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                }`}
              >
                <Coins className="w-3 h-3 text-amber-500" />
                <span>{currentAgent.balance} CR</span>
              </div>
            )}

            {/* Quick 1-Tap Sync Button on Mobile */}
            <button
              type="button"
              onClick={onTriggerSync}
              disabled={isSyncing || networkMode === 'OFFLINE'}
              className={`p-1.5 rounded-lg border transition cursor-pointer relative ${
                networkMode === 'OFFLINE'
                  ? 'opacity-40 cursor-not-allowed bg-slate-800 text-slate-500 border-slate-700'
                  : 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
              }`}
              title="Sync with Central Server"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              {pendingSyncCount > 0 && (
                <span className="absolute -top-1 -right-1 px-1 rounded-full bg-rose-500 text-white text-[8px] font-black">
                  {pendingSyncCount}
                </span>
              )}
            </button>

            {/* Mobile Settings Drawer Button */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isNight
                  ? 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
              }`}
              title="Open smartphone settings"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* SMARTPHONE ACTION DRAWER / BOTTOM SHEET (sm:hidden) */}
      {isMobileMenuOpen && (
        <div className="sm:hidden fixed inset-0 z-50 overflow-hidden flex flex-col justify-end animate-fadeIn">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
          />

          {/* Slide-Up Bottom Sheet */}
          <div
            className={`relative rounded-t-3xl border-t p-5 shadow-2xl max-h-[85vh] overflow-y-auto pb-safe ${
              isNight ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            {/* Sheet Drag Indicator & Header */}
            <div className="w-12 h-1.5 bg-slate-400/40 rounded-full mx-auto mb-4" />
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-emerald-500" />
                <h3 className="font-extrabold text-sm">{isAmharic ? 'የስልክ ቅንብሮች' : 'Smartphone Quick Settings'}</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Account Profile Card */}
              {currentUser && (
                <div
                  className={`p-3 rounded-2xl border flex items-center justify-between ${
                    isNight ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div>
                    <div className="font-black text-sm">{currentUser.name}</div>
                    <div className="text-[11px] font-mono text-emerald-500 font-bold">
                      {currentUser.role === 'SUPER_ADMIN' ? t('superAdmin') : currentUser.agent?.agentId}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      if (onLogout) onLogout();
                    }}
                    className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white border border-rose-500/30 transition flex items-center gap-1.5 font-bold cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>{t('logOut')}</span>
                  </button>
                </div>
              )}

              {/* Theme & Language Bar */}
              <div className="grid grid-cols-2 gap-2">
                <div className={`p-2.5 rounded-xl border flex items-center justify-between ${
                  isNight ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                  <span className="font-semibold">{isAmharic ? 'ገጽታ:' : 'Theme:'}</span>
                  <ThemeSwitcher variant="pill" />
                </div>
                <div className={`p-2.5 rounded-xl border flex items-center justify-between ${
                  isNight ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}>
                  <span className="font-semibold">{isAmharic ? 'ቋንቋ:' : 'Lang:'}</span>
                  <LanguageSwitcher variant="pill" />
                </div>
              </div>

              {/* Network Mode Simulation */}
              <div>
                <label className="block font-bold text-slate-400 mb-1.5">
                  {isAmharic ? 'የኔትወርክ ሁኔታ (Network Mode):' : 'Network Mode Simulator:'}
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onChangeNetworkMode('ONLINE');
                    }}
                    className={`py-2 rounded-xl font-bold flex flex-col items-center justify-center gap-1 border transition ${
                      networkMode === 'ONLINE'
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                        : isNight
                        ? 'bg-slate-950 border-slate-800 text-slate-400'
                        : 'bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                  >
                    <Wifi className="w-3.5 h-3.5" />
                    <span className="text-[10px]">{t('online')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onChangeNetworkMode('SLOW_2G');
                    }}
                    className={`py-2 rounded-xl font-bold flex flex-col items-center justify-center gap-1 border transition ${
                      networkMode === 'SLOW_2G'
                        ? 'bg-amber-600 text-white border-amber-500 shadow-sm'
                        : isNight
                        ? 'bg-slate-950 border-slate-800 text-slate-400'
                        : 'bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                  >
                    <span className="font-mono text-xs">2G</span>
                    <span className="text-[10px]">{t('slow2g')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onChangeNetworkMode('OFFLINE');
                    }}
                    className={`py-2 rounded-xl font-bold flex flex-col items-center justify-center gap-1 border transition ${
                      networkMode === 'OFFLINE'
                        ? 'bg-rose-600 text-white border-rose-500 shadow-sm'
                        : isNight
                        ? 'bg-slate-950 border-slate-800 text-slate-400'
                        : 'bg-slate-100 border-slate-200 text-slate-700'
                    }`}
                  >
                    <WifiOff className="w-3.5 h-3.5" />
                    <span className="text-[10px]">{t('offline')}</span>
                  </button>
                </div>
              </div>

              {/* Active Agent Selector if Admin */}
              {isSuperAdmin && (
                <div>
                  <label className="block font-bold text-slate-400 mb-1.5">
                    {t('activeAgent')}:
                  </label>
                  <select
                    value={currentAgent?.agentId || ''}
                    onChange={(e) => {
                      const found = agents.find((a) => a.agentId === e.target.value);
                      if (found) onSelectAgent(found);
                    }}
                    className={`w-full py-2.5 px-3 rounded-xl border font-bold text-xs ${
                      isNight ? 'bg-slate-950 border-slate-800 text-emerald-400' : 'bg-slate-50 border-slate-300 text-emerald-700'
                    }`}
                  >
                    {agents.map((a) => (
                      <option key={a.agentId} value={a.agentId}>
                        {a.name} ({a.agentId}) - {a.balance} CR
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Extra Shortcuts (Print Cards & Desktop Docs) */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-2">
                {currentRole !== 'AGENT' && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      onOpenPdfModal();
                    }}
                    className={`w-full py-2.5 px-3 rounded-xl border font-bold flex items-center justify-center gap-2 ${
                      isNight ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'
                    }`}
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                    <span>{t('printCards')}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenElectronInfo();
                  }}
                  className={`w-full py-2.5 px-3 rounded-xl border font-bold flex items-center justify-center gap-2 ${
                    isNight ? 'bg-slate-950 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  <Laptop className="w-4 h-4 text-emerald-500" />
                  <span>{t('desktopDocs')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SMARTPHONE BOTTOM NAVIGATION BAR (sm:hidden) */}
      <nav
        className={`sm:hidden fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur-md pb-safe transition-colors ${
          isNight ? 'bg-slate-950/95 border-slate-800' : 'bg-white/95 border-slate-200 shadow-lg'
        }`}
      >
        <div className="grid grid-cols-3 sm:grid-cols-4 max-w-md mx-auto items-center py-1">
          {/* Caller Board Tab */}
          <button
            type="button"
            onClick={() => onSelectRole('CALLER')}
            className={`flex flex-col items-center justify-center py-1.5 px-1 relative transition-all cursor-pointer ${
              currentRole === 'CALLER'
                ? 'text-emerald-500 font-bold scale-105'
                : isNight
                ? 'text-slate-400 hover:text-slate-200'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <div className="relative">
              <Radio className="w-5 h-5" />
              <span className="w-2 h-2 rounded-full bg-emerald-500 absolute -top-0.5 -right-0.5 animate-ping" />
            </div>
            <span className="text-[10px] tracking-tight mt-0.5">{t('callerBoard')}</span>
          </button>

          {/* Agent Station Tab */}
          <button
            type="button"
            onClick={() => onSelectRole('AGENT')}
            className={`flex flex-col items-center justify-center py-1.5 px-1 transition-all cursor-pointer ${
              currentRole === 'AGENT'
                ? 'text-emerald-500 font-bold scale-105'
                : isNight
                ? 'text-slate-400 hover:text-slate-200'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <User className="w-5 h-5" />
            <span className="text-[10px] tracking-tight mt-0.5">{t('agentTerminal')}</span>
          </button>

          {/* Admin Tab (If Super Admin) OR Quick Settings */}
          {isSuperAdmin ? (
            <button
              type="button"
              onClick={() => onSelectRole('ADMIN')}
              className={`flex flex-col items-center justify-center py-1.5 px-1 transition-all cursor-pointer ${
                currentRole === 'ADMIN'
                  ? 'text-emerald-500 font-bold scale-105'
                  : isNight
                  ? 'text-slate-400 hover:text-slate-200'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Shield className="w-5 h-5" />
              <span className="text-[10px] tracking-tight mt-0.5">{t('superAdmin')}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className={`flex flex-col items-center justify-center py-1.5 px-1 transition-all cursor-pointer ${
                isNight ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <SlidersHorizontal className="w-5 h-5" />
              <span className="text-[10px] tracking-tight mt-0.5">Settings</span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
};
