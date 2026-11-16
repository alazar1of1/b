import React, { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import {
  Users,
  Play,
  X,
  Coins,
  Plus,
  Trash2,
  Check,
  Grid,
  Hash,
  SlidersHorizontal,
  AlertTriangle,
} from 'lucide-react';

interface StartGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmStart: (gamerCount: number, capturedNumbers: number[], capturedCards: string[]) => void;
  agentBalance: number;
  gameCost?: number;
  isStarting?: boolean;
}

export const StartGameModal: React.FC<StartGameModalProps> = ({
  isOpen,
  onClose,
  onConfirmStart,
  agentBalance,
  gameCost = 50,
  isStarting = false,
}) => {
  const { t, isAmharic } = useLanguage();
  const { isNight } = useTheme();

  // Starts empty - card numbers held by players MUST be selected from the Card Grid!
  const [capturedNumbers, setCapturedNumbers] = useState<number[]>([]);
  const [inputError, setInputError] = useState<string | null>(null);

  // Reset to empty whenever modal is opened
  useEffect(() => {
    if (isOpen) {
      setCapturedNumbers([]);
      setInputError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Presets of card ranges (Matching 75 physical cards)
  const rangePresets = [
    { label: 'Cards 1-15', range: [1, 15] },
    { label: 'Cards 1-30', range: [1, 30] },
    { label: 'Cards 1-45', range: [1, 45] },
    { label: 'Cards 1-60', range: [1, 60] },
    { label: 'Cards 1-75', range: [1, 75] },
  ];

  const handleApplyPreset = (start: number, end: number) => {
    const nums: number[] = [];
    for (let i = start; i <= end; i++) {
      nums.push(i);
    }
    setCapturedNumbers(nums);
    setInputError(null);
  };

  const handleToggleCardNumber = (num: number) => {
    if (capturedNumbers.includes(num)) {
      setCapturedNumbers(capturedNumbers.filter((n) => n !== num));
    } else {
      setCapturedNumbers([...capturedNumbers, num].sort((a, b) => a - b));
    }
    setInputError(null);
  };

  const handleSelectAll = () => {
    const all = Array.from({ length: 75 }, (_, i) => i + 1);
    setCapturedNumbers(all);
    setInputError(null);
  };

  const handleRemoveNumber = (num: number) => {
    setCapturedNumbers(capturedNumbers.filter((n) => n !== num));
  };

  const handleClearAll = () => {
    setCapturedNumbers([]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (capturedNumbers.length === 0) {
      setInputError(isAmharic ? 'እባክዎ ቢያንስ አንድ የተያዘ የካርድ ቁጥር ከሰሌዳው ይምረጡ' : 'Please select at least one captured card from the grid before starting');
      return;
    }

    const gamerCount = capturedNumbers.length;
    const capturedCards = capturedNumbers.map((n) => `CARD-${String(n).padStart(4, '0')}`);
    onConfirmStart(gamerCount, capturedNumbers, capturedCards);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-xs p-3 sm:p-5 flex items-center justify-center min-h-screen animate-fadeIn">
      <div
        className={`border rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl relative transition-all my-auto max-h-[92vh] flex flex-col overflow-hidden ${
          isNight ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/30 shrink-0">
              <Grid className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black tracking-tight">
                {isAmharic ? 'የተጫዋቾች ካርዶች መረጣ (Card Grid)' : 'Insert Player Cards (Card Grid)'}
              </h3>
              <p className={`text-xs ${isNight ? 'text-slate-400' : 'text-slate-500'}`}>
                {isAmharic
                  ? 'በተጫዋቾች የተያዙትን ካርዶች ከሰሌዳው ላይ በመጫን ይምረጡ'
                  : 'Click card numbers from the grid below to capture cards held by players'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-xl transition cursor-pointer ${
              isNight ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-400 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Selection Toolbar */}
        <div className="flex items-center justify-between gap-2 pt-3 shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleSelectAll}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                isNight
                  ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                  : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {isAmharic ? 'ሁሉንም ምረጥ (1-75)' : 'Select All (1-75)'}
            </button>
          </div>

          {/* Captured count pill & clear */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono px-3 py-1 rounded-full font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700">
              {capturedNumbers.length} {t('capturedCardsCount')}
            </span>
            {capturedNumbers.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="text-xs text-rose-500 hover:text-rose-600 hover:underline flex items-center gap-1 cursor-pointer font-semibold"
                title={t('clearAll')}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('clearAll')}</span>
              </button>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 pr-1 pt-3 space-y-4">
          {/* Mandatory requirement notice if empty */}
          {capturedNumbers.length === 0 && (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" />
              <div>
                <strong className="block font-bold mb-0.5">
                  {isAmharic ? 'የግዴታ መስፈርት' : 'Mandatory Setup'}
                </strong>
                <span>{t('mustInsertHeldCardsWarning')}</span>
              </div>
            </div>
          )}

          {/* Quick Presets / Ranges */}
          <div>
            <span className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${isNight ? 'text-slate-400' : 'text-slate-600'}`}>
              {t('quickRanges')}:
            </span>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {rangePresets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handleApplyPreset(preset.range[0], preset.range[1])}
                  className={`py-1.5 px-2 rounded-xl text-xs font-mono font-bold transition border cursor-pointer ${
                    isNight
                      ? 'bg-slate-950 border-slate-800 text-slate-300 hover:border-emerald-500 hover:text-emerald-400'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-emerald-500 hover:text-emerald-700'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Card Grid (1 to 75) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-bold uppercase tracking-wider ${isNight ? 'text-slate-300' : 'text-slate-700'}`}>
                {isAmharic ? 'የተያዙ ካርዶች ሰሌዳ (ለመምረጥ/ለመሰረዝ ይጫኑ):' : 'Card Grid Selection (Click to capture / release):'}
              </span>
              <span className="text-[11px] font-mono text-emerald-500 font-bold">
                Cards #1 - #75
              </span>
            </div>

            <div className="grid grid-cols-5 sm:grid-cols-10 md:grid-cols-15 gap-1.5 max-h-60 overflow-y-auto p-2 border rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
              {Array.from({ length: 75 }, (_, i) => i + 1).map((n) => {
                const isCaptured = capturedNumbers.includes(n);
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => handleToggleCardNumber(n)}
                    className={`h-10 rounded-xl font-mono text-xs font-black border transition flex flex-col items-center justify-center cursor-pointer select-none ${
                      isCaptured
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-md ring-2 ring-emerald-400/50 scale-[1.02]'
                        : isNight
                        ? 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-600 hover:text-white'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-400 hover:text-slate-900'
                    }`}
                    title={isCaptured ? `Card #${n} Selected (Click to remove)` : `Select Card #${n}`}
                  >
                    <span>{n}</span>
                    {isCaptured && (
                      <span className="text-[9px] font-bold leading-none opacity-90">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Error Message */}
          {inputError && (
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs">
              {inputError}
            </div>
          )}

          {/* Captured Numbers Display List / Badges */}
          <div className={`p-4 rounded-2xl border space-y-2 ${
            isNight ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-emerald-500" />
                <span>{t('inPlayCards')} ({capturedNumbers.length})</span>
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                {isAmharic ? 'የተጫዋቾች ብዛት' : 'Gamer Count'}: {capturedNumbers.length}
              </span>
            </div>

            {capturedNumbers.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pt-1">
                {capturedNumbers.map((num) => (
                  <span
                    key={num}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-600 text-white font-mono font-bold text-xs shadow-xs"
                  >
                    <span>#{num}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveNumber(num)}
                      className="hover:bg-emerald-700 rounded-full p-0.5 transition cursor-pointer"
                      title={`Remove Card #${num}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-xs text-amber-600 dark:text-amber-400/90 font-medium">
                {isAmharic
                  ? '⚠️ እስካሁን ምንም የተያዘ ካርድ አልገባም! እባክዎ ከላይ ያሉትን ክልሎች በመጫን ወይም ቁጥሮችን በመተየብ የተጫዋቾቹን ካርዶች ይመዝግቡ።'
                  : '⚠️ No held card numbers registered yet. You must insert card numbers or select a preset before starting.'}
              </div>
            )}
          </div>

          {/* Session Cost & Balance Overview */}
          <div className="flex items-center justify-between text-xs px-1 text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-amber-500" />
              <span>{isAmharic ? 'የጨዋታ ክፍያ:' : 'Game Cost:'} <strong className="text-rose-500 font-mono font-bold">-{gameCost} CR</strong></span>
            </div>
            <div>
              <span>{isAmharic ? 'የጣቢያ ቀሪ ሂሳብ:' : 'Available:'} <strong className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">{agentBalance} CR</strong></span>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="submit"
              disabled={isStarting || capturedNumbers.length === 0}
              className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black text-sm shadow-xl shadow-emerald-600/30 flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>
                {isStarting
                  ? t('startingGame')
                  : capturedNumbers.length === 0
                  ? t('insertCardsFirst')
                  : `${t('startBingoGame')} (${capturedNumbers.length} ${t('capturedCardsCount')})`}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
