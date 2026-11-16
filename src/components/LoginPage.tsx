import React, { useState, useEffect } from 'react';
import { Lock, User, AlertCircle, ArrowRight } from 'lucide-react';
import { AuthUser } from '../types/bingo';
import { api, getCentralApiUrl, setCentralApiUrl, DbStatusResponse } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeSwitcher } from './ThemeSwitcher';

interface LoginPageProps {
  onLoginSuccess: (user: AuthUser) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const { t } = useLanguage();
  const { isNight } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Server & MongoDB connection states
  const [serverStatus, setServerStatus] = useState<DbStatusResponse | null>(null);
  const [showServerModal, setShowServerModal] = useState(false);
  const [customServerUrl, setCustomServerUrl] = useState('');
  const [testingServer, setTestingServer] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    setCustomServerUrl(getCentralApiUrl());
    checkConnection();
  }, []);

  const checkConnection = async () => {
    try {
      const status = await api.getDbStatus();
      setServerStatus(status);
    } catch {}
  };

  const testServerConnection = async () => {
    setTestingServer(true);
    setTestResult(null);
    try {
      if (customServerUrl) {
        setCentralApiUrl(customServerUrl.trim());
      }
      const res = await api.getDbStatus();
      setServerStatus(res);
      if (res.success && res.mongo?.isConnected) {
        setTestResult({
          success: true,
          message: `Connected successfully! MongoDB Atlas is ONLINE with ${res.localSqlite?.agentsCount || 0} agents synchronized.`,
        });
      } else if (res.success) {
        setTestResult({
          success: true,
          message: `Server connected! Running in Standby / SQLite engine (${res.localSqlite?.agentsCount || 0} cached agents).`,
        });
      } else {
        setTestResult({
          success: false,
          message: res.error || 'Connection failed. Please check server URL or network.',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Cannot reach server at this address.',
      });
    } finally {
      setTestingServer(false);
    }
  };

  const saveServerConfig = () => {
    if (customServerUrl) {
      setCentralApiUrl(customServerUrl.trim());
    }
    setShowServerModal(false);
    checkConnection();
  };

  const performLogin = async (userToLogin: string, passToLogin: string) => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.login({
        username: userToLogin.trim(),
        password: passToLogin.trim(),
      });

      if (res.success && res.user) {
        onLoginSuccess(res.user);
      } else {
        setError(res.error || t('invalidCredentials'));
      }
    } catch (err: any) {
      setError(err?.message || 'Login request failed. Please check network connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError(t('fillBothFields'));
      return;
    }
    await performLogin(username, password);
  };

  return (
    <div
      className={`min-h-screen flex flex-col justify-center items-center px-4 py-8 pt-16 sm:py-12 relative transition-colors duration-200 ${
        isNight ? 'bg-slate-950 text-white' : 'bg-white text-slate-900'
      }`}
    >
      <div className="absolute top-3 sm:top-5 right-3 sm:right-5 z-20 flex items-center gap-1.5 sm:gap-2">
        <ThemeSwitcher variant="pill" />
        <LanguageSwitcher variant="pill" />
      </div>

      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-600 text-white font-black text-2xl shadow-lg shadow-emerald-600/30 mb-3 ring-4 ring-emerald-500/20">
            75
          </div>
          <h1 className={`text-2xl font-black tracking-tight ${isNight ? 'text-white' : 'text-slate-900'}`}>
            {t('appTitle')}
          </h1>
          <p className={`text-xs mt-1 ${isNight ? 'text-slate-400' : 'text-slate-500'}`}>
            {t('signInToContinue')}
          </p>
        </div>

        <div
          className={`rounded-3xl p-6 sm:p-7 shadow-xl border transition-colors ${
            isNight
              ? 'bg-slate-900 border-slate-800'
              : 'bg-white border-slate-200 shadow-slate-200/50'
          }`}
        >
          {error && (
            <div className="mb-5 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-xs text-rose-600 dark:text-rose-300 flex items-start gap-2.5 animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span className="leading-snug">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={`block text-xs font-bold mb-1.5 ${isNight ? 'text-slate-300' : 'text-slate-700'}`}>
                {t('username')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t('enterUsername')}
                  className={`w-full rounded-xl py-3 pl-10 pr-3.5 text-sm transition font-sans outline-none ${
                    isNight
                      ? 'bg-slate-950 border border-slate-800 text-white focus:border-emerald-500'
                      : 'bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 shadow-sm'
                  }`}
                />
              </div>
            </div>

            <div>
              <label className={`block text-xs font-bold mb-1.5 ${isNight ? 'text-slate-300' : 'text-slate-700'}`}>
                {t('password')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('enterPassword')}
                  className={`w-full rounded-xl py-3 pl-10 pr-3.5 text-sm transition font-sans outline-none ${
                    isNight
                      ? 'bg-slate-950 border border-slate-800 text-white focus:border-emerald-500'
                      : 'bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 shadow-sm'
                  }`}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-emerald-600/30 transition flex items-center justify-center gap-2 text-sm disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <span>{t('signingIn')}</span>
              ) : (
                <>
                  <span>{t('signIn')}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Connection Status & Server Setup */}
          <div className="mt-5 pt-4 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${serverStatus?.mongo?.isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span>
                {serverStatus?.mongo?.isConnected
                  ? 'MongoDB Atlas Online'
                  : serverStatus?.localSqlite?.active
                  ? 'Local Engine Active'
                  : 'Checking Connection...'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowServerModal(true)}
              className="hover:text-emerald-400 transition cursor-pointer underline flex items-center gap-1"
            >
              <span>Server Config</span>
            </button>
          </div>
        </div>

        {/* Server Config Modal */}
        {showServerModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm p-4 flex items-center justify-center min-h-screen animate-fadeIn">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 my-auto text-xs text-slate-300">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h3 className="font-bold text-white text-sm">Server & MongoDB Atlas Connection</h3>
                <button
                  onClick={() => setShowServerModal(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
                  <span className="font-bold text-slate-200">Database Engine Status:</span>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">MongoDB Atlas:</span>
                    <span className={`font-bold ${serverStatus?.mongo?.isConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {serverStatus?.mongo?.isConnected ? 'ONLINE & SYNCED' : 'STANDBY / OFFLINE'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Agents in Database:</span>
                    <span className="font-mono text-emerald-400 font-bold">
                      {serverStatus?.localSqlite?.agentsCount ?? 0} Agents
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-slate-300 font-semibold">
                    Central Server API URL (Defaults to Embedded 127.0.0.1:3000):
                  </label>
                  <input
                    type="text"
                    value={customServerUrl}
                    onChange={(e) => setCustomServerUrl(e.target.value)}
                    placeholder="http://127.0.0.1:3000 or http://192.168.1.x:3000"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-[11px]"
                  />
                  <span className="text-[10px] text-slate-500 block">
                    In Desktop App (.exe), leave default http://127.0.0.1:3000 to use the built-in server connected to Atlas.
                  </span>
                </div>

                {testResult && (
                  <div className={`p-2.5 rounded-xl border text-[11px] ${testResult.success ? 'bg-emerald-950/50 border-emerald-800 text-emerald-300' : 'bg-rose-950/50 border-rose-800 text-rose-300'}`}>
                    {testResult.message}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={testServerConnection}
                  disabled={testingServer}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold transition cursor-pointer disabled:opacity-50"
                >
                  {testingServer ? 'Testing...' : 'Test Connection'}
                </button>

                <button
                  type="button"
                  onClick={saveServerConfig}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition cursor-pointer shadow-md"
                >
                  Save & Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
