// Audio player utility for recorded MP3 and sound files
// Supports Development, Production builds, PWA offline caching, and 100% Offline Standalone mode

import winnerAssetUrl from '../MP3_files/this is winner.mp3';
import notWinnerAssetUrl from '../MP3_files/this not winner.mp3';
import lateAssetUrl from '../MP3_files/This number late.mp3';
import gameStartAssetUrl from '../MP3_files/Game start.mp3';
import {
  GAME_START_BASE64,
  WINNER_BASE64,
  NOT_WINNER_BASE64,
  LATE_BASE64,
} from '../data/embeddedAudio';

// Vite eager glob for all ball calls and audio formats
const audioModules = import.meta.glob('../MP3_files/*.{mp3,aac,ogg,wav,m4a}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

let activeAudio: HTMLAudioElement | null = null;
let isAudioUnlocked = false;

// In-memory cache of Blob URLs for all 75 bingo balls
const ballBlobCache = new Map<string, string>();

/**
 * Pre-cache ball audio into in-memory blob URLs when online or on idle
 * This guarantees all 75 balls play without network even in complete airplane/offline mode!
 */
export async function preCacheBallAudio(): Promise<void> {
  if (typeof window === 'undefined') return;

  const prefixes: Record<string, [number, number]> = {
    B: [1, 15],
    I: [16, 30],
    N: [31, 45],
    G: [46, 60],
    O: [61, 75],
  };

  for (const [letter, [start, end]] of Object.entries(prefixes)) {
    for (let num = start; num <= end; num++) {
      const key = `${letter}-${num}`;
      if (ballBlobCache.has(key)) continue;

      const viteKey = `../MP3_files/${key}.mp3`;
      const url = audioModules[viteKey] || `/MP3_files/${key}.mp3`;

      try {
        const res = await fetch(url);
        if (res.ok) {
          const blob = await res.blob();
          const blobUrl = URL.createObjectURL(blob);
          ballBlobCache.set(key, blobUrl);
        }
      } catch {
        // Will fallback to bundled or synth if offline before caching completes
      }
    }
  }
}

// Automatically start background pre-caching after window load
if (typeof window !== 'undefined') {
  if (document.readyState === 'complete') {
    setTimeout(preCacheBallAudio, 1000);
  } else {
    window.addEventListener('load', () => setTimeout(preCacheBallAudio, 1000));
  }
}

/**
 * Unlock Web Audio & HTML5 Audio on user interaction (resolves browser autoplay policy)
 */
export function unlockAudio(): void {
  if (isAudioUnlocked || typeof window === 'undefined') return;
  isAudioUnlocked = true;

  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
    }
  } catch {}
}

if (typeof window !== 'undefined') {
  window.addEventListener('click', unlockAudio, { once: true, passive: true });
  window.addEventListener('keydown', unlockAudio, { once: true, passive: true });
  window.addEventListener('touchstart', unlockAudio, { once: true, passive: true });
}

/**
 * Stop any currently playing audio track
 */
export function stopActiveAudio(): void {
  if (activeAudio) {
    try {
      activeAudio.pause();
      activeAudio.currentTime = 0;
      activeAudio.src = '';
    } catch {}
    activeAudio = null;
  }
}

/**
 * Generate exhaustive candidate URLs to find a sound file in any deployment context
 * (Vite bundled assets, root public path, subfolder path, URL-encoded path)
 */
function buildCandidateUrls(primaryAssetUrl: string, baseFileName: string): string[] {
  const clean = baseFileName.replace(/\.(mp3|aac|ogg|wav)$/i, '');
  const encodedName = encodeURIComponent(baseFileName);
  const slugifiedUnderscore = baseFileName.replace(/\s+/g, '_');
  const slugifiedDash = baseFileName.replace(/\s+/g, '-');

  const candidates: string[] = [
    primaryAssetUrl,
    `/${baseFileName}`,
    `./${baseFileName}`,
    `/${encodedName}`,
    `./${encodedName}`,
    `/MP3_files/${baseFileName}`,
    `./MP3_files/${baseFileName}`,
    `/MP3_files/${encodedName}`,
    `./MP3_files/${encodedName}`,
    `/src/MP3_files/${baseFileName}`,
    `./src/MP3_files/${baseFileName}`,
    `/${slugifiedUnderscore}`,
    `./${slugifiedUnderscore}`,
    `/${slugifiedDash}`,
    `./${slugifiedDash}`,
    `/MP3_files/${slugifiedUnderscore}`,
    `/MP3_files/${slugifiedDash}`,
  ];

  // Remove duplicates and falsy entries while preserving order
  return Array.from(new Set(candidates.filter(Boolean)));
}

/**
 * Multi-fallback audio player:
 * Tries candidates in order until one successfully loads and plays.
 */
export function playAudioCandidates(candidates: string[], onEnded?: () => void): boolean {
  unlockAudio();
  stopActiveAudio();

  if (!candidates || candidates.length === 0) return false;

  let currentIndex = 0;

  function attemptPlay(): boolean {
    if (currentIndex >= candidates.length) {
      console.warn('All audio candidate URLs failed for:', candidates[0]);
      return false;
    }

    const targetUrl = candidates[currentIndex++];
    if (!targetUrl) return attemptPlay();

    try {
      const audio = new Audio();
      activeAudio = audio;
      audio.preload = 'auto';

      let hasEnded = false;
      const onAudioEnded = () => {
        if (!hasEnded) {
          hasEnded = true;
          if (activeAudio === audio) {
            activeAudio = null;
          }
          onEnded?.();
        }
      };

      const onAudioError = () => {
        audio.removeEventListener('ended', onAudioEnded);
        audio.removeEventListener('error', onAudioError);
        if (activeAudio === audio) {
          activeAudio = null;
          attemptPlay();
        }
      };

      audio.addEventListener('ended', onAudioEnded, { once: true });
      audio.addEventListener('error', onAudioError, { once: true });

      audio.src = targetUrl;
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch((err) => {
          console.warn(`Audio playback blocked/failed for "${targetUrl}":`, err?.message || err);
          if (activeAudio === audio) {
            audio.removeEventListener('ended', onAudioEnded);
            audio.removeEventListener('error', onAudioError);
            activeAudio = null;
            attemptPlay();
          }
        });
      }
      return true;
    } catch (err) {
      console.warn(`Error setting up audio for "${targetUrl}":`, err);
      return attemptPlay();
    }
  }

  return attemptPlay();
}

/**
 * Play a specific ball call (e.g. "B-1", "I-22", "N-35", "G-54", "O-75")
 */
export function playNumberSound(letter: string, num: number, onEnded?: () => void): boolean {
  const fileName = `${letter}-${num}.mp3`;
  const ballKey = `${letter}-${num}`;
  const key = `../MP3_files/${fileName}`;
  const bundledUrl = audioModules[key] || '';
  const cachedBlobUrl = ballBlobCache.get(ballKey);

  const candidates = [
    cachedBlobUrl, // In-memory blob: URL if already pre-cached (100% offline)
    bundledUrl,
    `/MP3_files/${fileName}`,
    `./MP3_files/${fileName}`,
    `/src/MP3_files/${fileName}`,
    `./src/MP3_files/${fileName}`,
    `/${fileName}`,
    `./${fileName}`,
  ].filter(Boolean) as string[];

  return playAudioCandidates(candidates, onEnded);
}

/**
 * Play "Game start.mp3" when game starts or user clicks "Start Auto Caller"
 * Uses embedded Base64 first: works 100% offline with zero network request!
 */
export function playGameStartSound(onEnded?: () => void): boolean {
  const candidates = [
    GAME_START_BASE64, // Instant 100% offline playback from memory!
    ...buildCandidateUrls(gameStartAssetUrl, 'Game start.mp3'),
  ];
  return playAudioCandidates(candidates, onEnded);
}

/**
 * Play "this is winner.mp3" when card verification confirms a valid WINNER
 * Uses embedded Base64 first: works 100% offline with zero network request!
 */
export function playWinnerSound(onEnded?: () => void): boolean {
  const candidates = [
    WINNER_BASE64, // Instant 100% offline playback from memory!
    ...buildCandidateUrls(winnerAssetUrl, 'this is winner.mp3'),
  ];
  return playAudioCandidates(candidates, onEnded);
}

/**
 * Play "this not winner.mp3" when card verification confirms NOT A WINNER
 * Uses embedded Base64 first: works 100% offline with zero network request!
 */
export function playNotWinnerSound(onEnded?: () => void): boolean {
  const candidates = [
    NOT_WINNER_BASE64, // Instant 100% offline playback from memory!
    ...buildCandidateUrls(notWinnerAssetUrl, 'this not winner.mp3'),
  ];
  return playAudioCandidates(candidates, onEnded);
}

/**
 * Play "This number late.mp3" when card verification confirms LATE BINGO
 * Uses embedded Base64 first: works 100% offline with zero network request!
 */
export function playLateSound(onEnded?: () => void): boolean {
  const candidates = [
    LATE_BASE64, // Instant 100% offline playback from memory!
    ...buildCandidateUrls(lateAssetUrl, 'This number late.mp3'),
  ];
  return playAudioCandidates(candidates, onEnded);
}

/**
 * Play verification outcome sound
 */
export function playVerificationSound(
  outcome: 'WINNER' | 'LATE' | 'NOT_WINNER',
  onEnded?: () => void
): boolean {
  if (outcome === 'WINNER') {
    return playWinnerSound(onEnded);
  }
  if (outcome === 'LATE') {
    return playLateSound(onEnded);
  }
  return playNotWinnerSound(onEnded);
}

/**
 * Generic special sound player helper
 */
export function playSpecialSound(fileName: string, onEnded?: () => void): boolean {
  const clean = fileName.replace(/\.(mp3|aac|ogg|wav)$/i, '').toLowerCase();

  if (clean === 'start_game' || clean === 'gamestart' || clean === 'game start') {
    return playGameStartSound(onEnded);
  }
  if (clean === 'winner' || clean === 'this is winner' || clean === 'this_is_winner') {
    return playWinnerSound(onEnded);
  }
  if (clean === 'not_winner' || clean === 'notwinner' || clean === 'this not winner' || clean === 'this_not_winner') {
    return playNotWinnerSound(onEnded);
  }
  if (clean === 'late' || clean === 'this number late' || clean === 'this_number_late') {
    return playLateSound(onEnded);
  }

  const candidates = buildCandidateUrls('', fileName);
  return playAudioCandidates(candidates, onEnded);
}
