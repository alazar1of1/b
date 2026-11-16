import React, { useState, useEffect, useRef } from 'react';
import { Game, BingoCard, Agent, VerificationResult } from '../types/bingo';
import { api } from '../services/api';
import { getBingoLetter } from '../utils/bingoEngine';
import { playNumberSound, playSpecialSound, playGameStartSound } from '../utils/numberSound';
import { WinnerVerificationModal } from './WinnerVerificationModal';
import { BingoWinnerOverlay, WinnerOverlayData } from './BingoWinnerOverlay';
import { StartGameModal } from './StartGameModal';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { translatePattern, getAmharicLetterPhonetic } from '../i18n/translations';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Trophy,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Maximize2,
  Radio,
  Coins,
  Search,
  PartyPopper,
  Users,
  SearchCheck,
  Timer,
  Minus,
  Plus,
  Zap,
  Grid,
  X,
} from 'lucide-react';

interface CallerViewProps {
  currentAgent: Agent | null;
  onRefreshAgent: () => void;
  onOpenPdfModal?: () => void;
}

export const CallerView: React.FC<CallerViewProps> = ({
  currentAgent,
  onRefreshAgent,
}) => {
  const { t, language, isAmharic } = useLanguage();
  const { isNight } = useTheme();

  const [activeGame, setActiveGame] = useState<Game | null>(null);
  const [latestCompletedGame, setLatestCompletedGame] = useState<Game | null>(null);
  const [currentNumber, setCurrentNumber] = useState<number | null>(null);
  const [isAutoCalling, setIsAutoCalling] = useState<boolean>(false);
  const [autoIntervalSec, setAutoIntervalSec] = useState<number>(4);
  const [secondsUntilNextCall, setSecondsUntilNextCall] = useState<number>(4);
  const [autoProgressPercent, setAutoProgressPercent] = useState<number>(0);
  const [isBallDropping, setIsBallDropping] = useState<boolean>(false);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(true);

  // Modals
  const [isStartModalOpen, setIsStartModalOpen] = useState<boolean>(false);
  const [isVerifyOpen, setIsVerifyOpen] = useState<boolean>(false);
  const [selectedVerifyCardId, setSelectedVerifyCardId] = useState<string>('');
  const [isAfterGameCheckOpen, setIsAfterGameCheckOpen] = useState<boolean>(false);
  const [isStartingGame, setIsStartingGame] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [holdFilter, setHoldFilter] = useState<string>('');
  const [isAddHoldModalOpen, setIsAddHoldModalOpen] = useState<boolean>(false);
  const [pendingHoldNumbers, setPendingHoldNumbers] = useState<number[]>([]);

  // Smartphone View Modes
  const [mobileTab, setMobileTab] = useState<'STAGE' | 'BOARD' | 'HOLD'>('STAGE');
  const [mobileLetterFilter, setMobileLetterFilter] = useState<'ALL' | 'B' | 'I' | 'N' | 'G' | 'O'>('ALL');

  // Winner Celebration Overlays
  const [winnerNotice, setWinnerNotice] = useState<{ cardId: string; pattern: string; prize?: number } | null>(null);
  const [winnerOverlayData, setWinnerOverlayData] = useState<WinnerOverlayData | null>(null);
  const [isWinnerOverlayOpen, setIsWinnerOverlayOpen] = useState<boolean>(false);

  const autoCallTimerRef = useRef<any>(null);
  const nextCallTimestampRef = useRef<number>(0);
  const activeGameRef = useRef<Game | null>(activeGame);
  activeGameRef.current = activeGame;
  const isCallingNextRef = useRef<boolean>(false);

  // Load active game or latest in-progress game on mount
  useEffect(() => {
    loadGames();
  }, [currentAgent]);

  const loadGames = async () => {
    try {
      const res = await api.getGames(currentAgent?.agentId);
      if (res.success && res.games.length > 0) {
        const inProgress = res.games.find((g) => g.status === 'IN_PROGRESS' || g.status === 'PAUSED');
        if (inProgress) {
          setActiveGame(inProgress);
          if (inProgress.calledNumbers.length > 0) {
            setCurrentNumber(inProgress.calledNumbers[inProgress.calledNumbers.length - 1]);
          }
        } else {
          setActiveGame(null);
        }

        const completed = res.games.find((g) => g.status === 'COMPLETED');
        if (completed) {
          setLatestCompletedGame(completed);
        }
      }
    } catch (e) {
      console.error('Error loading games:', e);
    }
  };

  // Voice & MP3 Sound announcement using recorded MP3 files in src/MP3_files/
  const speakNumber = (letter: string, num: number) => {
    if (!voiceEnabled) return;
    const played = playNumberSound(letter, num);
    if (!played && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        let phrase = `Letter ${letter}, ${num}`;
        if (isAmharic) {
          const amLetter = getAmharicLetterPhonetic(letter);
          phrase = `ፊደል ${amLetter}፣ ${num}`;
        }
        const utterance = new SpeechSynthesisUtterance(phrase);
        if (isAmharic) {
          utterance.lang = 'am-ET';
        }
        utterance.rate = autoIntervalSec <= 2 ? 1.3 : autoIntervalSec <= 4 ? 1.1 : 0.95;
        utterance.pitch = 1.05;
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.error('Speech synthesis error:', e);
      }
    }
  };

  // Start new game with Gamer Count
  const handleStartGame = async (
    gamerCount: number,
    capturedNumbers?: number[],
    capturedCards?: string[]
  ) => {
    if (!currentAgent) {
      setErrorMessage(t('selectAgentPrompt'));
      return;
    }

    if (currentAgent.balance < 50) {
      setErrorMessage(t('insufficientBalance') + ` (${currentAgent.balance} CR).`);
      return;
    }

    setIsStartingGame(true);
    setErrorMessage(null);
    setWinnerNotice(null);

    try {
      playGameStartSound();
      const res = await api.startGame(
        currentAgent.agentId,
        currentAgent.deviceId,
        gamerCount,
        capturedNumbers,
        capturedCards
      );
      if (!res.success) {
        setErrorMessage(res.error || t('failedToStartGame'));
      } else {
        setActiveGame(res.game);
        setCurrentNumber(null);
        setIsAutoCalling(false);
        setIsStartModalOpen(false);
        onRefreshAgent();
      }
    } catch (err: any) {
      setErrorMessage(err.message || t('failedToStartGame'));
    } finally {
      setIsStartingGame(false);
    }
  };

  // Hold Number List Handlers
  const handleCheckHoldCard = (num: number) => {
    const cardId = `CARD-${String(num).padStart(4, '0')}`;
    setSelectedVerifyCardId(cardId);
    setIsVerifyOpen(true);
  };

  const handleOpenAddHoldModal = () => {
    setPendingHoldNumbers([...(activeGame?.capturedNumbers || [])]);
    setIsAddHoldModalOpen(true);
  };

  const handleTogglePendingHoldCard = (num: number) => {
    if (pendingHoldNumbers.includes(num)) {
      setPendingHoldNumbers(pendingHoldNumbers.filter((n) => n !== num));
    } else {
      setPendingHoldNumbers([...pendingHoldNumbers, num].sort((a, b) => a - b));
    }
  };

  const handleSaveUpdatedHoldCards = async () => {
    if (!activeGame) return;
    const sorted = [...pendingHoldNumbers].sort((a, b) => a - b);
    const sortedCards = sorted.map((n) => `CARD-${String(n).padStart(4, '0')}`);
    try {
      const res = await api.updateGame(activeGame.gameId, {
        capturedNumbers: sorted,
        capturedCards: sortedCards,
        gamerCount: sorted.length,
      });
      if (res.success && res.game) {
        setActiveGame(res.game);
        setIsAddHoldModalOpen(false);
      }
    } catch (e) {
      console.error('Failed to update held numbers:', e);
    }
  };

  const handleRemoveHoldCard = async (numToRemove: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeGame) return;
    const updated = (activeGame.capturedNumbers || []).filter((n) => n !== numToRemove);
    const updatedCards = updated.map((n) => `CARD-${String(n).padStart(4, '0')}`);
    try {
      const res = await api.updateGame(activeGame.gameId, {
        capturedNumbers: updated,
        capturedCards: updatedCards,
        gamerCount: updated.length,
      });
      if (res.success && res.game) {
        setActiveGame(res.game);
      }
    } catch (e) {
      console.error('Failed to remove held number:', e);
    }
  };

  // When a player says "BINGO!": Pause game immediately and open verification
  const handleBingoCalledPause = async () => {
    // Immediately stop auto caller
    setIsAutoCalling(false);

    if (activeGame && activeGame.status === 'IN_PROGRESS') {
      try {
        const res = await api.updateGame(activeGame.gameId, { status: 'PAUSED' });
        if (res.success && res.game) {
          setActiveGame(res.game);
        }
      } catch (e) {
        console.error('Error pausing game for bingo verification:', e);
      }
    }

    setIsVerifyOpen(true);
  };

  // Call Next Random Number
  const handleCallNextNumber = async () => {
    const currentG = activeGameRef.current;
    if (!currentG || currentG.status !== 'IN_PROGRESS') {
      setIsAutoCalling(false);
      return;
    }

    if (isCallingNextRef.current) return;
    isCallingNextRef.current = true;

    try {
      const called = currentG.calledNumbers;
      if (called.length >= 75) {
        setIsAutoCalling(false);
        setErrorMessage('All 75 Bingo numbers have been called!');
        return;
      }

      // Uncalled numbers pool (1 to 75)
      const calledSet = new Set(called);
      const uncalled: number[] = [];
      for (let i = 1; i <= 75; i++) {
        if (!calledSet.has(i)) {
          uncalled.push(i);
        }
      }

      if (uncalled.length === 0) {
        setIsAutoCalling(false);
        return;
      }

      // Pick random uncalled
      const randomIndex = Math.floor(Math.random() * uncalled.length);
      const pickedNum = uncalled[randomIndex];
      const letter = getBingoLetter(pickedNum);

      const updatedCalled = [...called, pickedNum];
      setCurrentNumber(pickedNum);
      setIsBallDropping(true);
      setTimeout(() => setIsBallDropping(false), 450);

      speakNumber(letter, pickedNum);

      if (uncalled.length <= 1) {
        setIsAutoCalling(false);
      }

      // Optimistically update game state immediately for zero-lag offline calling
      setActiveGame((prev) => (prev ? { ...prev, calledNumbers: updatedCalled } : prev));

      // Save to local database
      api.updateGame(currentG.gameId, {
        calledNumbers: updatedCalled,
      }).then((res) => {
        if (res.success && res.game) {
          setActiveGame(res.game);
        }
      }).catch((e) => {
        console.error('Error updating game called numbers:', e);
      });
    } catch (e) {
      console.error('Error updating game called numbers:', e);
    } finally {
      isCallingNextRef.current = false;
      nextCallTimestampRef.current = Date.now() + autoIntervalSec * 1000;
      setAutoProgressPercent(0);
      setSecondsUntilNextCall(autoIntervalSec);
    }
  };

  // Manual / Progressive Single Ball Entry
  const handleAddManualNumber = async (pickedNum: number) => {
    if (!activeGame || (activeGame.status !== 'IN_PROGRESS' && activeGame.status !== 'PAUSED')) return;
    if (pickedNum < 1 || pickedNum > 75) return;
    if (activeGame.calledNumbers.includes(pickedNum)) return;

    const letter = getBingoLetter(pickedNum);
    const updatedCalled = [...activeGame.calledNumbers, pickedNum];
    setCurrentNumber(pickedNum);
    speakNumber(letter, pickedNum);

    try {
      const res = await api.updateGame(activeGame.gameId, {
        calledNumbers: updatedCalled,
      });
      if (res.success && res.game) {
        setActiveGame(res.game);
      }
    } catch (e) {
      console.error('Error adding drawn number to session:', e);
      throw e;
    }
  };

  // Master Auto-Caller Toggle with auto-resume and first ball draw
  const handleToggleAutoCaller = async () => {
    // If no active game, or game has ended/completed, start a new game!
    if (!activeGame || activeGame.status === 'COMPLETED' || activeGame.calledNumbers.length >= 75) {
      playGameStartSound();
      setIsStartModalOpen(true);
      return;
    }

    if (isAutoCalling) {
      setIsAutoCalling(false);
      return;
    }

    // Play "Game start.mp3" when starting auto caller
    playGameStartSound();

    // Auto-resume if game was paused
    if (activeGame.status === 'PAUSED') {
      try {
        const res = await api.updateGame(activeGame.gameId, { status: 'IN_PROGRESS' });
        if (res.success && res.game) {
          setActiveGame(res.game);
        }
      } catch (e) {
        console.error('Error unpausing game for auto caller:', e);
      }
    }

    // If starting a fresh game with 0 called balls, delay first ball call so "Game start.mp3" finishes
    if (activeGame.calledNumbers.length === 0) {
      setIsAutoCalling(true);
      setSecondsUntilNextCall(Math.max(autoIntervalSec, 3));
      nextCallTimestampRef.current = Date.now() + 2700;
      setTimeout(() => {
        handleCallNextNumber();
      }, 2500);
      return;
    }

    nextCallTimestampRef.current = Date.now() + autoIntervalSec * 1000;
    setAutoProgressPercent(0);
    setSecondsUntilNextCall(autoIntervalSec);
    setIsAutoCalling(true);
  };

  // Speed Setter: 1s to 8s
  const handleSetSpeed = (sec: number) => {
    const clamped = Math.max(1, Math.min(8, sec));
    setAutoIntervalSec(clamped);
    if (isAutoCalling) {
      nextCallTimestampRef.current = Date.now() + clamped * 1000;
      setAutoProgressPercent(0);
      setSecondsUntilNextCall(clamped);
    } else {
      setSecondsUntilNextCall(clamped);
    }
  };

  // Auto-caller precision countdown & smooth progress execution (1s - 8s)
  useEffect(() => {
    if (!isAutoCalling || !activeGame || activeGame.status !== 'IN_PROGRESS') {
      if (autoCallTimerRef.current) {
        clearInterval(autoCallTimerRef.current);
        autoCallTimerRef.current = null;
      }
      setAutoProgressPercent(0);
      setSecondsUntilNextCall(autoIntervalSec);
      return;
    }

    if (!nextCallTimestampRef.current || nextCallTimestampRef.current <= Date.now()) {
      nextCallTimestampRef.current = Date.now() + autoIntervalSec * 1000;
    }

    const intervalDurationMs = autoIntervalSec * 1000;

    autoCallTimerRef.current = setInterval(() => {
      const now = Date.now();
      const remainingMs = Math.max(0, nextCallTimestampRef.current - now);
      const elapsedMs = intervalDurationMs - remainingMs;
      const progress = Math.min(100, Math.max(0, (elapsedMs / intervalDurationMs) * 100));

      setAutoProgressPercent(progress);
      setSecondsUntilNextCall(Math.max(1, Math.ceil(remainingMs / 1000)));

      if (remainingMs <= 60) {
        // Reset timestamp for the next cycle
        nextCallTimestampRef.current = Date.now() + intervalDurationMs;
        setAutoProgressPercent(0);
        handleCallNextNumber();
      }
    }, 50);

    return () => {
      if (autoCallTimerRef.current) {
        clearInterval(autoCallTimerRef.current);
        autoCallTimerRef.current = null;
      }
    };
  }, [isAutoCalling, activeGame?.gameId, activeGame?.status, autoIntervalSec]);

  // Toggle Pause / Resume
  const handleTogglePause = async () => {
    if (!activeGame) return;
    const newStatus = activeGame.status === 'IN_PROGRESS' ? 'PAUSED' : 'IN_PROGRESS';
    setIsAutoCalling(false);

    try {
      const res = await api.updateGame(activeGame.gameId, { status: newStatus });
      if (res.success) {
        setActiveGame(res.game);
      }
    } catch (e) {
      console.error('Error toggling pause:', e);
    }
  };

  // End Game
  const handleEndGame = async () => {
    if (!activeGame) return;
    setIsAutoCalling(false);
    try {
      const res = await api.updateGame(activeGame.gameId, { status: 'COMPLETED' });
      if (res.success) {
        setLatestCompletedGame(res.game);
        setActiveGame(null);
        setCurrentNumber(null);
      }
    } catch (e) {
      console.error('Error ending game:', e);
    }
  };

  // Board Columns for B-I-N-G-O (1-15, 16-30, etc.)
  const boardColumns = [
    { letter: 'B', range: [1, 15], bg: 'bg-blue-600', border: 'border-blue-500' },
    { letter: 'I', range: [16, 30], bg: 'bg-rose-600', border: 'border-rose-500' },
    { letter: 'N', range: [31, 45], bg: 'bg-amber-500', border: 'border-amber-400' },
    { letter: 'G', range: [46, 60], bg: 'bg-emerald-600', border: 'border-emerald-500' },
    { letter: 'O', range: [61, 75], bg: 'bg-purple-600', border: 'border-purple-500' },
  ];

  const calledSet = new Set(activeGame ? activeGame.calledNumbers : (latestCompletedGame?.calledNumbers || []));
  const currentLetter = currentNumber ? getBingoLetter(currentNumber) : null;

  return (
    <div className="space-y-4">
      {/* Top Banner with Game Status & Controls */}
      <div
        className={`border rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-md transition-colors ${
          isNight ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black font-mono shadow-md shadow-emerald-600/30">
            {activeGame ? 'ON' : 'OFF'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className={`font-extrabold text-base tracking-tight ${isNight ? 'text-white' : 'text-slate-900'}`}>
                {t('liveBingoStage')}
              </h2>
              {activeGame && (
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold font-mono uppercase ${
                    activeGame.status === 'IN_PROGRESS'
                      ? 'bg-emerald-600 text-white animate-pulse'
                      : 'bg-amber-500 text-slate-950 font-bold'
                  }`}
                >
                  {activeGame.status === 'IN_PROGRESS' ? t('live') : t('paused')}
                </span>
              )}
            </div>
            <p className={`text-xs ${isNight ? 'text-slate-400' : 'text-slate-500'}`}>
              {activeGame
                ? `${t('gameSession')}: ${activeGame.gameId} • ${activeGame.gamerCount || 10} ${t('gamerCountLabel')}`
                : t('noActiveGameDesc')}
            </p>

            {/* Display Captured Numbers for active game */}
            {activeGame && activeGame.capturedNumbers && activeGame.capturedNumbers.length > 0 && (
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  <span>{t('capturedCardsCount')} ({activeGame.capturedNumbers.length}):</span>
                </span>
                <div className="flex items-center gap-1 flex-wrap max-h-12 overflow-y-auto">
                  {activeGame.capturedNumbers.map((num) => (
                    <span
                      key={num}
                      className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 font-mono text-[10px] font-bold"
                    >
                      #{num}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-2">
          {activeGame ? (
            <div className="flex items-center gap-2">
              {/* BIG BINGO VERIFY BUTTON (Immediately pauses game and opens checker) */}
              <button
                onClick={handleBingoCalledPause}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/30 flex items-center gap-2 transition cursor-pointer"
              >
                <Trophy className="w-4 h-4" />
                <span>{isAmharic ? 'ቢንጎ! አሸናፊ ፈትሽ (አቁም)' : 'Bingo! Pause & Check Winner'}</span>
              </button>

              <button
                onClick={handleEndGame}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition cursor-pointer"
              >
                {t('endGame')}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {/* After Game Check Number */}
              {latestCompletedGame && (
                <button
                  onClick={() => setIsAfterGameCheckOpen(true)}
                  className={`px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                    isNight
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                  }`}
                >
                  <SearchCheck className="w-3.5 h-3.5 text-emerald-500" />
                  <span>{t('afterGameCheck')}</span>
                </button>
              )}

              {/* Start Bingo Game Button -> Prompts for gamer quantity! */}
              <button
                onClick={() => setIsStartModalOpen(true)}
                disabled={isStartingGame || !currentAgent || currentAgent.balance < 50}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black text-xs shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>{isStartingGame ? t('startingGame') : t('startBingoGame')}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Error alert if any */}
      {errorMessage && (
        <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs flex items-center justify-between gap-2 animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-xs p-1 opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* Smartphone Segmented Navigation Switcher */}
      <div className="lg:hidden flex items-center p-1 rounded-2xl border text-xs font-bold gap-1 bg-slate-900 border-slate-800">
        <button
          type="button"
          onClick={() => setMobileTab('STAGE')}
          className={`flex-1 py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
            mobileTab === 'STAGE'
              ? 'bg-emerald-600 text-white shadow-md font-black'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span>{isAmharic ? 'የጥሪ መድረክ' : 'Caller Stage'}</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab('BOARD')}
          className={`flex-1 py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
            mobileTab === 'BOARD'
              ? 'bg-emerald-600 text-white shadow-md font-black'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Grid className="w-3.5 h-3.5" />
          <span>{isAmharic ? '75 ሰሌዳ' : '75 Board'}</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20 font-mono">
            {calledSet.size}
          </span>
        </button>

        {activeGame && (
          <button
            type="button"
            onClick={() => setMobileTab('HOLD')}
            className={`flex-1 py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
              mobileTab === 'HOLD'
                ? 'bg-emerald-600 text-white shadow-md font-black'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>{isAmharic ? 'የተያዙ' : 'Held'}</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20 font-mono">
              {activeGame.capturedNumbers?.length || 0}
            </span>
          </button>
        )}
      </div>

      {/* Main Caller Stage Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Big Screen Projector & Controls (5 Cols) */}
        <div className={`lg:col-span-5 space-y-4 ${mobileTab === 'STAGE' || mobileTab === 'HOLD' ? 'block' : 'hidden lg:block'}`}>
          {/* Projector & Auto Caller Deck Container (Visible in STAGE tab on mobile, always on desktop) */}
          <div className={`${mobileTab === 'STAGE' ? 'block' : 'hidden lg:block'} space-y-4`}>
            {/* Large Current Number Display */}
            <div
              className={`border rounded-3xl p-6 relative overflow-hidden flex flex-col items-center justify-center text-center min-h-[280px] transition-colors ${
              isNight
                ? 'bg-slate-900 border-slate-800 shadow-2xl text-white'
                : 'bg-white border-slate-200 shadow-xl text-slate-900'
            }`}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/10 via-transparent to-transparent pointer-events-none"></div>

            {activeGame ? (
              <>
                <div className="flex items-center justify-between w-full mb-3 text-xs">
                  <span className={`font-mono flex items-center gap-1.5 ${isNight ? 'text-slate-400' : 'text-slate-500'}`}>
                    <Radio className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                    <span>{activeGame.gameId}</span>
                  </span>

                  <div className="flex items-center gap-1.5">
                    {activeGame.gamerCount && (
                      <span className={`px-2 py-0.5 rounded-full font-bold font-mono text-[11px] flex items-center gap-1 ${
                        isNight ? 'bg-slate-800 text-amber-400' : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        <Users className="w-3 h-3" />
                        <span>{activeGame.gamerCount} {t('gamerCountLabel')}</span>
                      </span>
                    )}
                    <span className={`px-2.5 py-0.5 rounded-full font-bold font-mono text-xs ${
                      isNight ? 'bg-slate-800 text-emerald-400' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}>
                      {activeGame.calledNumbers.length} / 75 {t('calledCount')}
                    </span>
                  </div>
                </div>

                {currentNumber ? (
                  <div className={`my-2 transition-all duration-300 transform ${isBallDropping ? 'scale-110' : 'scale-100 animate-scaleIn'}`}>
                    <div className="text-6xl sm:text-7xl font-black font-mono tracking-wider flex items-center justify-center gap-3">
                      <span
                        className={`px-4 py-1 rounded-2xl text-white shadow-md ${
                          currentLetter === 'B'
                            ? 'bg-blue-600'
                            : currentLetter === 'I'
                            ? 'bg-rose-600'
                            : currentLetter === 'N'
                            ? 'bg-amber-600'
                            : currentLetter === 'G'
                            ? 'bg-emerald-600'
                            : 'bg-purple-600'
                        }`}
                      >
                        {currentLetter}
                      </span>
                      <span className={`drop-shadow-lg ${isNight ? 'text-white' : 'text-slate-900'}`}>{currentNumber}</span>
                    </div>
                    <div className={`text-xs font-mono mt-2 uppercase tracking-widest font-semibold ${isNight ? 'text-slate-400' : 'text-slate-500'}`}>
                      {isAmharic ? `ፊደል ${getAmharicLetterPhonetic(currentLetter)} • ቁጥር ${currentNumber}` : `Letter ${currentLetter} • Number ${currentNumber}`}
                    </div>
                  </div>
                ) : (
                  <div className="my-6 text-center">
                    <div className={`w-16 h-16 rounded-full border flex items-center justify-center mx-auto mb-2 animate-pulse ${
                      isNight ? 'bg-slate-800 border-slate-700 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-600'
                    }`}>
                      <Radio className="w-8 h-8" />
                    </div>
                    <h3 className={`font-bold text-base ${isNight ? 'text-slate-200' : 'text-slate-800'}`}>{t('gameReady')}</h3>
                    <p className={`text-xs ${isNight ? 'text-slate-500' : 'text-slate-400'}`}>
                      {t('clickToStartInstruction')}
                    </p>
                  </div>
                )}

                {/* Last 5 Numbers Ticker */}
                <div className={`w-full pt-4 mt-2 border-t ${isNight ? 'border-slate-800' : 'border-slate-200'}`}>
                  <div className={`text-[10px] uppercase font-bold tracking-wider text-left mb-1.5 ${isNight ? 'text-slate-500' : 'text-slate-400'}`}>
                    {t('recentBalls')}:
                  </div>
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    {activeGame.calledNumbers.slice(-5).reverse().map((num, i) => {
                      const lettr = getBingoLetter(num);
                      return (
                        <div
                          key={num}
                          className={`px-2.5 py-1 rounded-lg font-mono text-xs font-bold border shrink-0 ${
                            i === 0
                              ? 'bg-emerald-600 text-white border-emerald-500 ring-2 ring-emerald-400/50 shadow-md'
                              : isNight
                              ? 'bg-slate-800 text-slate-300 border-slate-700'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {lettr}-{num}
                        </div>
                      );
                    })}
                    {activeGame.calledNumbers.length === 0 && (
                      <span className="text-xs text-slate-400 italic">{t('noBallsCalled')}</span>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <div className={`w-16 h-16 rounded-2xl border flex items-center justify-center mx-auto mb-3 ${
                  isNight ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-600'
                }`}>
                  <Radio className="w-8 h-8" />
                </div>
                <h3 className={`font-bold text-lg mb-1 ${isNight ? 'text-slate-100' : 'text-slate-900'}`}>{t('noActiveGame')}</h3>
                <p className={`text-xs max-w-xs mb-4 ${isNight ? 'text-slate-400' : 'text-slate-500'}`}>
                  {t('gameFeeNotice')}
                </p>
                <button
                  onClick={() => setIsStartModalOpen(true)}
                  disabled={isStartingGame || !currentAgent || currentAgent.balance < 50}
                  className="px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-sm shadow-xl shadow-emerald-600/30 transition flex items-center gap-2 mx-auto disabled:opacity-50 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>{isStartingGame ? t('startingGame') : t('startBingoGame')}</span>
                </button>
              </div>
            )}
          </div>

          {/* Game Controls & Auto-Caller Bar */}
          {activeGame && (
            <div
              className={`border rounded-2xl p-4 shadow-xl space-y-3 transition-colors ${
                isNight ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
              }`}
            >
              {/* Unified Auto-Caller Command Deck */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                {/* Master Auto-Caller Toggle Button */}
                <button
                  onClick={handleToggleAutoCaller}
                  disabled={activeGame.calledNumbers.length >= 75}
                  className={`relative overflow-hidden flex-1 py-3.5 px-4 sm:px-5 rounded-2xl font-black text-sm sm:text-base shadow-lg transition-all flex items-center justify-center gap-3 cursor-pointer group disabled:opacity-50 ${
                    isAutoCalling
                      ? 'bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white shadow-rose-600/30 ring-4 ring-rose-500/25 animate-pulse'
                      : 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white shadow-emerald-600/30 hover:scale-[1.01]'
                  }`}
                  title={isAutoCalling ? 'Pause Auto Caller' : 'Start Auto Caller'}
                >
                  {/* Subtle live countdown bar embedded right inside the button when auto-calling */}
                  {isAutoCalling && (
                    <div
                      className="absolute bottom-0 left-0 h-1.5 bg-white/40 transition-all duration-75"
                      style={{ width: `${autoProgressPercent}%` }}
                    />
                  )}
                  <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                    {isAutoCalling ? (
                      <Pause className="w-4 h-4 fill-white text-white" />
                    ) : (
                      <Play className="w-4 h-4 fill-white text-white translate-x-0.5" />
                    )}
                  </div>
                  <div className="text-left leading-tight">
                    <div className="font-black tracking-wide">
                      {isAutoCalling
                        ? t('pauseAutoCaller')
                        : activeGame.status === 'PAUSED'
                        ? t('resumeAutoCaller')
                        : t('startAutoCaller')}
                    </div>
                    <div className="text-[11px] font-mono opacity-90 flex items-center gap-1.5 font-normal">
                      {isAutoCalling ? (
                        <>
                          <span className="w-2 h-2 rounded-full bg-white inline-block animate-ping" />
                          <span>{t('autoRunning')} ({secondsUntilNextCall}s)</span>
                        </>
                      ) : (
                        <span>{autoIntervalSec}s {t('secondsPerBall')}</span>
                      )}
                    </div>
                  </div>
                </button>

                {/* Bingo Check Button - Immediately Pauses Auto Caller & Game */}
                <button
                  onClick={handleBingoCalledPause}
                  className="py-3.5 px-5 rounded-2xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black text-sm sm:text-base shadow-lg shadow-amber-500/30 transition-all flex items-center justify-center gap-2.5 cursor-pointer shrink-0 hover:scale-[1.01]"
                  title="Player yelled Bingo! Pauses auto caller immediately and opens verification"
                >
                  <Trophy className="w-5 h-5 fill-slate-950 text-slate-950" />
                  <span className="tracking-wide">{isAmharic ? 'ቢንጎ! ፈትሽ' : 'Bingo! Check'}</span>
                </button>
              </div>

              {/* Quick Hall Celebration Replay button if winner verified */}
              {winnerNotice && (
                <button
                  onClick={() => setIsWinnerOverlayOpen(true)}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md transition flex items-center justify-center gap-2 animate-pulse cursor-pointer"
                >
                  <PartyPopper className="w-4 h-4" />
                  <span>{t('showRoomCelebration')} ({winnerNotice.cardId})</span>
                </button>
              )}

              {/* Speed Controls (1s to 8s) & Session Actions */}
              <div className={`pt-3 border-t space-y-2.5 text-xs ${isNight ? 'border-slate-800' : 'border-slate-200'}`}>
                {/* 1s to 8s Speed Selector */}
                <div className={`p-2.5 rounded-2xl border flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 ${
                  isNight ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-100 border-slate-200'
                }`}>
                  {/* Speed Label with Pace Description */}
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-bold flex items-center gap-1 shrink-0 ${
                      isNight ? 'text-slate-300' : 'text-slate-700'
                    }`}>
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                      <span>{t('callingSpeed')}:</span>
                    </span>
                    <span className={`text-[11px] font-mono px-2 py-0.5 rounded-md font-bold ${
                      isNight ? 'bg-slate-800 text-amber-400' : 'bg-white text-amber-700 border border-slate-200'
                    }`}>
                      {autoIntervalSec === 1 ? '1s (Express)' : autoIntervalSec === 4 ? '4s (Standard)' : autoIntervalSec === 8 ? '8s (Relaxed)' : `${autoIntervalSec}s`}
                    </span>
                  </div>

                  {/* Stepper + 1s-8s Pill Buttons */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Faster / Minus */}
                    <button
                      type="button"
                      onClick={() => handleSetSpeed(autoIntervalSec - 1)}
                      disabled={autoIntervalSec <= 1}
                      className={`w-7 h-7 rounded-lg border flex items-center justify-center transition disabled:opacity-30 cursor-pointer ${
                        isNight ? 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 shadow-sm'
                      }`}
                      title="Faster (-1s)"
                    >
                      <Minus className="w-3 h-3" />
                    </button>

                    {/* 1s to 8s buttons */}
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((sec) => {
                        const isSelected = autoIntervalSec === sec;
                        return (
                          <button
                            key={sec}
                            type="button"
                            onClick={() => handleSetSpeed(sec)}
                            className={`w-7 h-7 rounded-lg font-mono text-xs font-bold transition cursor-pointer border flex items-center justify-center ${
                              isSelected
                                ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow-sm shadow-amber-500/30 ring-2 ring-amber-400/40'
                                : isNight
                                ? 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800 hover:text-white'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 shadow-sm'
                            }`}
                            title={`${sec} second${sec > 1 ? 's' : ''} auto-call interval`}
                          >
                            {sec}s
                          </button>
                        );
                      })}
                    </div>

                    {/* Slower / Plus */}
                    <button
                      type="button"
                      onClick={() => handleSetSpeed(autoIntervalSec + 1)}
                      disabled={autoIntervalSec >= 8}
                      className={`w-7 h-7 rounded-lg border flex items-center justify-center transition disabled:opacity-30 cursor-pointer ${
                        isNight ? 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 shadow-sm'
                      }`}
                      title="Slower (+1s)"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Session Actions (Voice, Pause/Resume, End Game) */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  {/* Voice Toggle */}
                  <button
                    onClick={() => setVoiceEnabled(!voiceEnabled)}
                    className={`px-3 py-1.5 rounded-xl border font-bold flex items-center gap-2 transition cursor-pointer ${
                      voiceEnabled
                        ? isNight
                          ? 'bg-slate-800 text-emerald-400 border-emerald-500/40'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-300'
                        : isNight
                        ? 'bg-slate-950 text-slate-500 border-slate-800'
                        : 'bg-slate-100 text-slate-400 border-slate-200'
                    }`}
                    title={voiceEnabled ? 'Voice Callout Enabled' : 'Voice Callout Muted'}
                  >
                    {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                    <span>{voiceEnabled ? t('voiceOn') : t('voiceOff')}</span>
                  </button>

                  <div className="flex items-center gap-2 ml-auto">
                    {/* Pause/Resume Game */}
                    <button
                      onClick={handleTogglePause}
                      className={`px-3.5 py-1.5 rounded-xl border font-semibold transition cursor-pointer ${
                        isNight
                          ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                      }`}
                    >
                      {activeGame.status === 'IN_PROGRESS' ? t('pause') : t('resume')}
                    </button>

                    {/* End Game */}
                    <button
                      onClick={handleEndGame}
                      className={`px-3.5 py-1.5 rounded-xl border font-semibold transition cursor-pointer ${
                        isNight
                          ? 'bg-rose-950/60 hover:bg-rose-900 text-rose-300 border-rose-800/40'
                          : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                      }`}
                    >
                      {t('endGame')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          </div>

          {/* Hold Number List Container (Visible in HOLD tab on mobile, always on desktop) */}
          <div className={`${mobileTab === 'HOLD' ? 'block' : 'hidden lg:block'}`}>
            {activeGame && (
              <div
                className={`border rounded-3xl p-4 sm:p-5 shadow-2xl space-y-3 transition-colors ${
                  isNight ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
                }`}
              >
                {/* Header */}
                <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-600/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold shrink-0">
                      <Users className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-black text-xs sm:text-sm tracking-tight flex items-center gap-1.5">
                        <span>{t('holdNumberList')}</span>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded-full font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700">
                          {activeGame.capturedNumbers?.length || 0}
                        </span>
                      </h4>
                      <p className={`text-[10px] sm:text-[11px] ${isNight ? 'text-slate-400' : 'text-slate-500'}`}>
                        {t('holdNumberListDesc')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleOpenAddHoldModal}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 shadow-xs ${
                        isNight
                          ? 'bg-slate-800 border-slate-700 text-emerald-400 hover:bg-slate-700'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                      }`}
                      title={isAmharic ? 'የተያዙ ካርዶች ጨምር ወይም አስተካክል' : 'Add or edit held player cards for this active round'}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{t('addHoldCard')}</span>
                    </button>
                  </div>
                </div>

                {/* Search/Filter if more than 6 cards */}
                {activeGame.capturedNumbers && activeGame.capturedNumbers.length > 6 && (
                  <div className="relative">
                    <input
                      type="text"
                      value={holdFilter}
                      onChange={(e) => setHoldFilter(e.target.value)}
                      placeholder={isAmharic ? 'የተያዘ ካርድ ፈልግ (ለምሳሌ 12)...' : 'Search held card number (e.g. 12)...'}
                      className={`w-full py-1.5 px-3 pl-8 rounded-xl text-xs font-mono border outline-none ${
                        isNight
                          ? 'bg-slate-950 border-slate-800 text-white focus:border-emerald-500'
                          : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-emerald-600'
                      }`}
                    />
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
                    {holdFilter && (
                      <button
                        type="button"
                        onClick={() => setHoldFilter('')}
                        className="absolute right-2.5 top-1.5 text-xs text-slate-400 hover:text-slate-200"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )}

                {/* Cards Grid / List */}
                {activeGame.capturedNumbers && activeGame.capturedNumbers.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 max-h-52 overflow-y-auto p-1">
                    {activeGame.capturedNumbers
                      .filter((n) => !holdFilter || String(n).includes(holdFilter))
                      .map((num) => (
                        <div
                          key={num}
                          className="inline-flex items-center rounded-xl overflow-hidden border border-emerald-300 dark:border-emerald-800/80 shadow-xs group"
                        >
                          <button
                            type="button"
                            onClick={() => handleCheckHoldCard(num)}
                            className={`px-2.5 py-1.5 text-xs font-mono font-bold transition flex items-center gap-1.5 cursor-pointer select-none ${
                              isNight
                                ? 'bg-slate-950 text-emerald-300 hover:bg-emerald-950/70 hover:text-white'
                                : 'bg-emerald-50/80 text-emerald-900 hover:bg-emerald-100 hover:text-emerald-950'
                            }`}
                            title={`Card #${num} • Click to verify card`}
                          >
                            <span className="text-[10px] text-slate-400 font-normal">CARD</span>
                            <span className="text-xs font-black">#{num}</span>
                            <SearchCheck className="w-3 h-3 text-emerald-500 opacity-60 group-hover:opacity-100 transition-opacity" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleRemoveHoldCard(num, e)}
                            className={`px-1.5 py-1.5 transition cursor-pointer text-slate-400 hover:text-rose-500 ${
                              isNight ? 'bg-slate-950 hover:bg-rose-950/40' : 'bg-emerald-50/80 hover:bg-rose-50'
                            }`}
                            title={`Remove Card #${num} from this round`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className={`p-4 rounded-2xl border text-center space-y-2 ${
                    isNight ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <p className="text-xs text-amber-500 font-medium">
                      {isAmharic
                        ? 'በዚህ ዙር የተያዙ ካርዶች አልተመዘገቡም'
                        : 'No player cards registered in the Hold List for this round.'}
                    </p>
                    <button
                      type="button"
                      onClick={handleOpenAddHoldModal}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow transition inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{isAmharic ? 'የተያዙ ካርዶችን ከሰሌዳው ምረጥ' : 'Select Held Cards from Grid'}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: 1-75 Master Board (Visible in BOARD tab on mobile, always on desktop) */}
        <div
          className={`lg:col-span-7 border rounded-3xl p-3.5 sm:p-5 shadow-2xl space-y-3 transition-colors ${
            mobileTab === 'BOARD' ? 'block' : 'hidden lg:block'
          } ${
            isNight
              ? 'bg-slate-900 border-slate-800 text-white'
              : 'bg-white border-slate-200 shadow-xl text-slate-900'
          }`}
        >
          <div className={`flex items-center justify-between pb-2 border-b ${isNight ? 'border-slate-800' : 'border-slate-200'}`}>
            <div className="flex items-center gap-2">
              <span className={`font-bold text-sm sm:text-base ${isNight ? 'text-slate-100' : 'text-slate-900'}`}>
                {t('ballMasterBoard')}
              </span>
              <span className={`text-[11px] font-mono hidden sm:inline ${isNight ? 'text-slate-400' : 'text-slate-500'}`}>
                ({t('standardGrid')})
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span> {t('calledCount')} ({calledSet.size})
              </span>
              <span className={`flex items-center gap-1 font-medium text-[11px] ${isNight ? 'text-slate-500' : 'text-slate-400'}`}>
                <span className={`w-2 h-2 rounded-full ${isNight ? 'bg-slate-700' : 'bg-slate-300'}`}></span> {t('remainingCount')} ({75 - calledSet.size})
              </span>
            </div>
          </div>

          {/* Smartphone Letter Quick Filter: ALL | B | I | N | G | O */}
          <div className="lg:hidden flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {(['ALL', 'B', 'I', 'N', 'G', 'O'] as const).map((letter) => {
              const isSelected = mobileLetterFilter === letter;
              return (
                <button
                  key={letter}
                  type="button"
                  onClick={() => setMobileLetterFilter(letter)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition shrink-0 cursor-pointer border ${
                    isSelected
                      ? 'bg-emerald-600 text-white border-emerald-500 shadow-md font-black'
                      : isNight
                      ? 'bg-slate-950 border-slate-800 text-slate-300'
                      : 'bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  {letter === 'ALL'
                    ? (isAmharic ? 'ሁሉም (1-75)' : 'All 1-75')
                    : `${letter} (${letter === 'B' ? '1-15' : letter === 'I' ? '16-30' : letter === 'N' ? '31-45' : letter === 'G' ? '46-60' : '61-75'})`}
                </button>
              );
            })}
          </div>

          {/* If a specific letter is filtered on mobile, show large touch-friendly grid */}
          {mobileLetterFilter !== 'ALL' && (
            <div className="lg:hidden space-y-2">
              {(() => {
                const col = boardColumns.find((c) => c.letter === mobileLetterFilter);
                if (!col) return null;
                const [start, end] = col.range;
                const nums: number[] = [];
                for (let i = start; i <= end; i++) nums.push(i);

                return (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-black font-mono text-base border ${col.bg} text-slate-950`}>
                        {col.letter}
                      </span>
                      <span className="font-bold text-xs text-slate-400">
                        {isAmharic ? `ፊደል ${col.letter} (ቁጥሮች ${start}-${end})` : `Letter ${col.letter} (Balls ${start}-${end})`}
                      </span>
                    </div>

                    <div className="grid grid-cols-5 gap-2">
                      {nums.map((n) => {
                        const isCalled = calledSet.has(n);
                        const isJustCalled = currentNumber === n;

                        let style = isNight
                          ? 'bg-slate-950/80 text-slate-400 border-slate-800'
                          : 'bg-slate-50 text-slate-500 border-slate-200';

                        if (isJustCalled) {
                          style = 'bg-emerald-500 text-white font-black border-emerald-300 ring-2 ring-emerald-400 shadow-lg animate-pulse';
                        } else if (isCalled) {
                          style = 'bg-emerald-600 text-white font-bold border-emerald-500 shadow-sm';
                        } else if (activeGame) {
                          style += ' hover:border-emerald-500 hover:text-emerald-500 hover:bg-emerald-500/10 cursor-pointer active:scale-95';
                        }

                        return (
                          <button
                            key={n}
                            type="button"
                            onClick={() => {
                              if (activeGame && !isCalled && !isAutoCalling) {
                                handleAddManualNumber(n);
                              }
                            }}
                            className={`h-12 rounded-xl border flex flex-col items-center justify-center font-mono text-base font-bold transition-all select-none shadow-xs cursor-pointer ${style}`}
                          >
                            <span>{n}</span>
                            {isCalled && <span className="text-[9px] font-sans opacity-90">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* 5 Rows for B, I, N, G, O (ALL mode or Desktop) */}
          <div className={`space-y-2 ${mobileLetterFilter !== 'ALL' ? 'hidden lg:block' : 'block'}`}>
            {boardColumns.map((col) => {
              const [start, end] = col.range;
              const nums: number[] = [];
              for (let i = start; i <= end; i++) {
                nums.push(i);
              }

              return (
                <div key={col.letter} className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                  {/* Letter Header Pill */}
                  <div
                    className={`w-9 sm:w-11 h-9 sm:h-10 rounded-xl flex items-center justify-center font-black font-mono text-sm sm:text-base border ${col.bg} text-slate-950 shadow shrink-0 sticky left-0 z-10`}
                  >
                    {col.letter}
                  </div>

                  {/* 15 Numbers in this Column */}
                  <div className="flex md:grid md:grid-cols-15 gap-1 flex-1">
                    {nums.map((n) => {
                      const isCalled = calledSet.has(n);
                      const isJustCalled = currentNumber === n;

                      let style = isNight
                        ? 'bg-slate-950/80 text-slate-500 border-slate-800'
                        : 'bg-slate-50 text-slate-400 border-slate-200';

                      if (isJustCalled) {
                        style = 'bg-emerald-500 text-white font-black border-emerald-300 ring-2 ring-emerald-400 shadow-lg animate-pulse';
                      } else if (isCalled) {
                        style = 'bg-emerald-600 text-white font-bold border-emerald-500 shadow-sm';
                      } else if (activeGame) {
                        style += ' hover:border-emerald-500 hover:text-emerald-500 hover:bg-emerald-500/10 cursor-pointer hover:scale-105 active:scale-95';
                      }

                      return (
                        <div
                          key={n}
                          onClick={() => {
                            if (activeGame && !isCalled && !isAutoCalling) {
                              handleAddManualNumber(n);
                            }
                          }}
                          title={!isCalled && activeGame ? `${t('drawBallButton')}: ${col.letter}-${n}` : undefined}
                          className={`min-w-[34px] sm:min-w-[38px] md:min-w-0 h-9 sm:h-10 rounded-lg border flex items-center justify-center font-mono text-xs sm:text-sm transition-all select-none shrink-0 md:shrink cursor-pointer ${style}`}
                        >
                          {n}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick instructions for caller */}
          <div className={`p-2.5 rounded-xl border text-[11px] flex items-center justify-between ${
            isNight ? 'bg-slate-950 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
          }`}>
            <span>
              💡 <strong>{t('operatorTip')}:</strong> {t('clickBoardToDraw')}. {isAmharic ? 'ተጫዋች "ቢንጎ!" ሲል "ቢንጎ! አሸናፊ ፈትሽ" የሚለውን ይጫኑ፤ ጨዋታው ቆሞ ካርዱ ይመረመራል።' : 'When a player calls "Bingo!", click "Bingo! Pause & Check Winner" to immediately pause the game and verify.'}
            </span>
          </div>
        </div>
      </div>

      {/* Start Game Modal (with Gamer Quantity input) */}
      <StartGameModal
        isOpen={isStartModalOpen}
        onClose={() => setIsStartModalOpen(false)}
        onConfirmStart={handleStartGame}
        agentBalance={currentAgent?.balance || 0}
        isStarting={isStartingGame}
      />

      {/* Winner Verification Modal for ACTIVE game */}
      {activeGame && (
        <WinnerVerificationModal
          isOpen={isVerifyOpen}
          onClose={() => {
            setIsVerifyOpen(false);
            setSelectedVerifyCardId('');
          }}
          gameId={activeGame.gameId}
          calledNumbers={activeGame.calledNumbers}
          agentId={activeGame.agentId}
          capturedNumbers={activeGame.capturedNumbers}
          capturedCards={activeGame.capturedCards}
          initialCardId={selectedVerifyCardId}
          onWinnerVerified={(data) => {
            setIsAutoCalling(false);
            setWinnerOverlayData(data);
            setIsWinnerOverlayOpen(true);
            setWinnerNotice({
              cardId: data.cardId,
              pattern: data.pattern,
              prize: data.prize,
            });
          }}
          onWinnerConfirmed={(cardId, pattern, prize, extraData) => {
            setIsAutoCalling(false);
            setWinnerNotice({ cardId, pattern, prize });
            if (extraData) {
              setWinnerOverlayData({
                cardId,
                pattern,
                prize,
                gameId: activeGame.gameId,
                calledNumbers: activeGame.calledNumbers,
                ...extraData,
              });
            } else {
              setWinnerOverlayData({
                cardId,
                pattern,
                prize,
                gameId: activeGame.gameId,
                calledNumbers: activeGame.calledNumbers,
              });
            }
            setIsWinnerOverlayOpen(true);
            loadGames();
          }}
        />
      )}

      {/* Modal for Managing/Adding Hold Cards During Live Game */}
      {isAddHoldModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-xs p-3 sm:p-5 flex items-center justify-center min-h-screen animate-fadeIn">
          <div
            className={`border rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl relative transition-all my-auto max-h-[92vh] flex flex-col overflow-hidden ${
              isNight ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold">
                  <Grid className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black">
                    {isAmharic ? 'የተያዙ ካርዶችን አዘምን (Card Grid)' : 'Update Hold Number List (Card Grid)'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {isAmharic
                      ? 'በተጫዋቾች የተያዙትን ካርዶች ለመጨመር ወይም ለመሰረዝ ሰሌዳውን ይጠቀሙ'
                      : 'Click card numbers to add or remove them from active play'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddHoldModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Presets & Counter */}
            <div className="flex items-center justify-between gap-2 py-3 shrink-0">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const all = Array.from({ length: 75 }, (_, i) => i + 1);
                    setPendingHoldNumbers(all);
                  }}
                  className={`px-3 py-1 rounded-xl text-xs font-bold border transition cursor-pointer ${
                    isNight ? 'bg-slate-800 border-slate-700 text-slate-200' : 'bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  {isAmharic ? 'ሁሉንም ምረጥ (1-75)' : 'Select All (1-75)'}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingHoldNumbers([])}
                  className="px-3 py-1 rounded-xl text-xs font-bold text-rose-500 hover:text-rose-600 transition cursor-pointer"
                >
                  {t('clearAll')}
                </button>
              </div>

              <span className="text-xs font-mono px-2.5 py-1 rounded-full font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700">
                {pendingHoldNumbers.length} {t('capturedCardsCount')}
              </span>
            </div>

            {/* Card Grid (1 to 75) */}
            <div className="overflow-y-auto flex-1 p-1">
              <div className="grid grid-cols-5 sm:grid-cols-10 md:grid-cols-15 gap-1.5 max-h-60 overflow-y-auto p-2 border rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                {Array.from({ length: 75 }, (_, i) => i + 1).map((n) => {
                  const isSelected = pendingHoldNumbers.includes(n);
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => handleTogglePendingHoldCard(n)}
                      className={`h-10 rounded-xl font-mono text-xs font-black border transition flex flex-col items-center justify-center cursor-pointer select-none ${
                        isSelected
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow-md ring-2 ring-emerald-400/50 scale-[1.02]'
                          : isNight
                          ? 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-600 hover:text-white'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-slate-400 hover:text-slate-900'
                      }`}
                    >
                      <span>{n}</span>
                      {isSelected && (
                        <span className="text-[9px] font-bold leading-none">✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setIsAddHoldModalOpen(false)}
                className={`px-4 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                  isNight ? 'border-slate-800 text-slate-400 hover:text-white' : 'border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={handleSaveUpdatedHoldCards}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/30 transition cursor-pointer"
              >
                {isAmharic ? 'የተያዙ ካርዶችን አስቀምጥ' : 'Save Hold Numbers'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* After Game Card Checker (for latest completed game) */}
      {latestCompletedGame && !activeGame && (
        <WinnerVerificationModal
          isOpen={isAfterGameCheckOpen}
          onClose={() => setIsAfterGameCheckOpen(false)}
          gameId={latestCompletedGame.gameId}
          calledNumbers={latestCompletedGame.calledNumbers}
          agentId={latestCompletedGame.agentId}
          capturedNumbers={latestCompletedGame.capturedNumbers}
          capturedCards={latestCompletedGame.capturedCards}
          isAfterGameCheck={true}
          onWinnerConfirmed={() => {
            loadGames();
            onRefreshAgent();
          }}
        />
      )}

      {/* Animated Bingo Winner Overlay for Caller Screen / Room Projector */}
      <BingoWinnerOverlay
        isOpen={isWinnerOverlayOpen}
        onClose={() => setIsWinnerOverlayOpen(false)}
        winner={winnerOverlayData}
        onConfirmEndGame={handleEndGame}
        voiceEnabled={voiceEnabled}
      />

      {/* Mobile Sticky Floating Game Controller (Thumb accessible during active game) */}
      {activeGame && (
        <div className="lg:hidden fixed bottom-14 left-0 right-0 z-30 px-3 py-2 bg-slate-950/95 backdrop-blur-md border-t border-slate-800 shadow-2xl flex items-center gap-2 animate-fadeIn pb-safe">
          {/* Current Ball Badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 font-mono text-xs shrink-0">
            <span className="text-[10px] text-slate-400 font-bold">BALL:</span>
            <span className="font-black text-emerald-400 text-sm">
              {currentNumber ? `${currentLetter}-${currentNumber}` : '--'}
            </span>
          </div>

          {/* Auto-Caller Toggle */}
          <button
            type="button"
            onClick={handleToggleAutoCaller}
            disabled={activeGame.calledNumbers.length >= 75}
            className={`flex-1 py-2 px-3 rounded-xl font-black text-xs shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 ${
              isAutoCalling
                ? 'bg-rose-600 text-white animate-pulse'
                : 'bg-emerald-600 text-white'
            }`}
          >
            {isAutoCalling ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-white" />}
            <span className="truncate">
              {isAutoCalling ? `${t('pauseAutoCaller')} (${secondsUntilNextCall}s)` : t('startAutoCaller')}
            </span>
          </button>

          {/* Big Bingo Check */}
          <button
            type="button"
            onClick={handleBingoCalledPause}
            className="py-2 px-3 rounded-xl bg-amber-500 active:bg-amber-600 text-slate-950 font-black text-xs shadow-md shadow-amber-500/30 transition flex items-center justify-center gap-1 cursor-pointer shrink-0"
          >
            <Trophy className="w-4 h-4 fill-slate-950" />
            <span>{isAmharic ? 'ቢንጎ!' : 'Bingo!'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
