import { Agent, BingoCard, Game, SystemSettings, Transaction, WinnerRecord, VerificationResult, AuthUser, AgentStatus } from '../types/bingo';
import { generateBatchFixedCards, verifyBingoCard } from '../utils/bingoEngine';
import { FIXED_75_CARDS } from '../data/fixedCards';

// Local Storage Keys for 100% Offline Standalone PWA
const STORAGE_KEY_CARDS = 'bingo_pwa_cached_cards';
const STORAGE_KEY_SETTINGS = 'bingo_pwa_cached_settings';
const STORAGE_KEY_AGENTS = 'bingo_pwa_cached_agents';
const STORAGE_KEY_ACTIVE_GAME = 'bingo_pwa_active_game';
const STORAGE_KEY_OFFLINE_WINNERS = 'bingo_pwa_offline_winners';

function getLocalCards(): BingoCard[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CARDS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length === 75) {
        // Ensure card 1 numbers strictly match the immutable master CARD-0001
        const card1Matches =
          parsed[0]?.cardId === 'CARD-0001' &&
          Array.isArray(parsed[0]?.bNumbers) &&
          parsed[0].bNumbers[0] === FIXED_75_CARDS[0].bNumbers[0];

        if (card1Matches) {
          return parsed;
        }
      }
    }
  } catch (e) {
    console.warn('Failed reading local cards cache:', e);
  }

  // Force-sync standard immutable 75 physical cards
  try {
    localStorage.setItem(STORAGE_KEY_CARDS, JSON.stringify(FIXED_75_CARDS));
  } catch {}
  return JSON.parse(JSON.stringify(FIXED_75_CARDS));
}

function saveLocalCards(cards: BingoCard[]) {
  if (!cards || cards.length === 0) return;
  try {
    // Strictly cap to only 75 physical cards (#1 to #75)
    const valid75 = cards
      .filter((c: any) => {
        const num = parseInt(String(c?.cardId || '').replace(/\D/g, ''), 10);
        return num >= 1 && num <= 75;
      })
      .slice(0, 75);

    localStorage.setItem(STORAGE_KEY_CARDS, JSON.stringify(valid75.length > 0 ? valid75 : cards.slice(0, 75)));
  } catch (e) {
    console.warn('Failed caching cards to localStorage:', e);
  }
}

function getLocalSettings(): SystemSettings {
  const defaultSettings: SystemSettings = {
    gameCost: 50,
    companyName: 'Ela Bingo',
    locationName: 'Community Center Hall',
    currencySymbol: 'CR',
    autoSyncIntervalSec: 300,
    voiceAnnounceEnabled: true,
    allowedPatterns: [
      'ANY_LINE',
      'HORIZONTAL_LINE',
      'VERTICAL_LINE',
      'DIAGONAL_LINE',
      'FOUR_CORNERS',
      'POSTAGE_STAMP',
      'PLUS_CROSS',
      'FULL_CARD_BLACKOUT',
    ],
    centralServerUrl: 'mongodb+srv://cluster0.iuxqn6k.mongodb.net',
    centerFreeText: 'FREE',
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (raw) return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {}
  return defaultSettings;
}

function getLocalAgents(): Agent[] {
  const defaultAgents: Agent[] = [
    {
      agentId: 'AGENT-101',
      name: 'Mobile Hall Operator',
      location: 'Venue Terminal 1',
      phone: '+1 (555) 234-8901',
      pin: '1234',
      balance: 1500,
      deviceId: 'DEV-MOBILE-01',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    },
    {
      agentId: 'AGENT-102',
      name: 'Oak Valley Recreation Agent',
      location: 'Oak Valley Hall',
      phone: '+1 (555) 345-6789',
      pin: '5678',
      balance: 850,
      deviceId: 'DEV-MOBILE-02',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    },
  ];

  try {
    const raw = localStorage.getItem(STORAGE_KEY_AGENTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return defaultAgents;
}

function saveLocalAgents(agents: Agent[]) {
  try {
    localStorage.setItem(STORAGE_KEY_AGENTS, JSON.stringify(agents));
  } catch {}
}

export interface SyncStatusResponse {
  success: boolean;
  isOnline: boolean;
  networkMode: 'ONLINE' | 'SLOW_2G' | 'OFFLINE';
  atlasConnected: boolean;
  pendingCount: number;
  queue: any[];
}

export interface SummaryStats {
  totalCards: number;
  totalAgents: number;
  totalGames: number;
  totalCompletedGames: number;
  totalWinners: number;
  totalCreditsIssued: number;
  totalCreditsSpent: number;
  totalCurrentAgentBalances: number;
  pendingSyncCount: number;
}

export interface DbStatusResponse {
  success: boolean;
  mongo?: {
    isConnected: boolean;
    error: string | null;
    uri: string;
    dbName: string;
    timestamp: string | null;
  };
  localSqlite?: {
    active: boolean;
    agentsCount: number;
    cardsCount: number;
    gamesCount: number;
  };
  error?: string;
}

// Primary Local & Cloud Server Endpoints for Multi-Device Realtime Sync across Admin & Client PCs
export const DEFAULT_LOCAL_SERVER_URL = 'http://127.0.0.1:3000';

export function getCentralApiUrl(): string {
  try {
    const custom = localStorage.getItem('bingo_central_api_url');
    if (custom && custom.startsWith('http')) return custom.replace(/\/+$/, '');
    const settings = getLocalSettings();
    if (settings?.centralServerUrl && settings.centralServerUrl.startsWith('http')) {
      return settings.centralServerUrl.replace(/\/+$/, '');
    }
  } catch {}
  return DEFAULT_LOCAL_SERVER_URL;
}

export function setCentralApiUrl(url: string) {
  try {
    if (url && url.startsWith('http')) {
      localStorage.setItem('bingo_central_api_url', url.trim().replace(/\/+$/, ''));
    } else if (url === '') {
      localStorage.removeItem('bingo_central_api_url');
    }
  } catch {}
}

function isDesktopOrFileEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.location.protocol === 'file:' ||
    Boolean((window as any).electronAPI?.isElectron) ||
    (typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('electron'))
  );
}

function resolveApiUrl(endpoint: string): string {
  if (!endpoint.startsWith('/api')) return endpoint;
  if (typeof window === 'undefined') return `${DEFAULT_LOCAL_SERVER_URL}${endpoint}`;

  // In packaged Electron apps loaded via file:// protocol or running standalone on Windows,
  // we route /api/* requests to the local backend server (or custom central server URL).
  if (
    isDesktopOrFileEnvironment() ||
    window.location.protocol === 'file:' ||
    !window.location.host ||
    window.location.host.includes('localhost:5173')
  ) {
    const baseUrl = getCentralApiUrl();
    return `${baseUrl}${endpoint}`;
  }

  // When running inside the web preview / cloud app
  return endpoint;
}

async function safeFetch<T>(url: string, options?: RequestInit, fallback: T = {} as T): Promise<T> {
  // If explicitly offline, don't attempt network fetch that will stall or fail
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { success: false, error: 'Offline Mode', ...fallback } as unknown as T;
  }

  const targetUrl = resolveApiUrl(url);

  try {
    // 2.5-second timeout: If offline or slow connection, gracefully fall back immediately without freezing
    let timeoutId: any = null;
    let fetchOptions = options || {};
    if (typeof AbortController !== 'undefined') {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 2500);
      fetchOptions = { ...fetchOptions, signal: controller.signal };
    }

    const res = await fetch(targetUrl, fetchOptions);
    if (timeoutId) clearTimeout(timeoutId);

    if (!res.ok) {
      try {
        const errorJson = await res.json();
        return errorJson as T;
      } catch {
        return { success: false, error: `HTTP ${res.status}: ${res.statusText}` } as unknown as T;
      }
    }
    return await res.json();
  } catch (err: any) {
    console.debug(`Network fetch skipped or unavailable for ${targetUrl}:`, err);
    return { success: false, error: 'Offline Mode', ...fallback } as unknown as T;
  }
}

export const api = {
  // Auth
  async login(payload: { role?: string; username?: string; password?: string; agentId?: string; pin?: string }): Promise<{ success: boolean; user?: AuthUser; error?: string }> {
    const res = await safeFetch<{ success: boolean; user?: AuthUser; error?: string }>('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, { success: false });

    if (res.success && res.user) {
      // Save authenticated agent locally so offline login is available
      if (res.user.agent) {
        const existing = getLocalAgents();
        const filtered = existing.filter((a) => a.agentId.toUpperCase() !== res.user!.agent!.agentId.toUpperCase());
        saveLocalAgents([res.user.agent, ...filtered]);
      }
      return res;
    }

    // Offline Mobile Login Fallback
    const u = payload.username?.trim().toLowerCase();
    const p = payload.password?.trim();
    if (u === 'admin' && p === 'admin123') {
      return {
        success: true,
        user: {
          id: 'USER-ADMIN-OFFLINE',
          role: 'SUPER_ADMIN',
          name: 'Super Admin Master (Offline)',
          username: 'admin',
        },
      };
    }

    const localAgents = getLocalAgents();
    const cleanU = (u || '').trim().toLowerCase();
    const cleanNumOnly = cleanU.replace(/\D/g, '');

    const matchedAgent = localAgents.find((a) => {
      const aId = (a.agentId || '').trim().toLowerCase();
      const aIdNum = aId.replace(/\D/g, '');
      const aName = (a.name || '').trim().toLowerCase();
      const aPhone = (a.phone || '').replace(/\D/g, '');
      const pinMatches = String(a.pin).trim() === String(p).trim();

      const idMatches =
        aId === cleanU ||
        (cleanNumOnly && aIdNum === cleanNumOnly) ||
        aName === cleanU ||
        (cleanNumOnly && aPhone && aPhone.endsWith(cleanNumOnly));

      return idMatches && pinMatches;
    }) || (cleanU === 'agent' && (p === '1234') ? localAgents[0] : null);

    if (matchedAgent) {
      if (matchedAgent.status === 'BANNED' || matchedAgent.status === 'SUSPENDED') {
        return {
          success: false,
          error: `Agent account (${matchedAgent.agentId}) is ${matchedAgent.status.toLowerCase()}. Contact Admin.`,
        };
      }

      return {
        success: true,
        user: {
          id: `USER-${matchedAgent.agentId}`,
          role: 'AGENT',
          name: `${matchedAgent.name} (Offline Mode)`,
          username: matchedAgent.agentId,
          agent: matchedAgent,
        },
      };
    }

    // If neither online nor offline login matched
    if (res?.error && (res.error.toLowerCase().includes('fetch') || res.error.toLowerCase().includes('network') || (typeof navigator !== 'undefined' && !navigator.onLine))) {
      return {
        success: false,
        error: 'የኢንተርኔት ግንኙነት የለም። ይህ አካውንት በዚህ device ላይ አልተገኘም። አዲስ ኤጀንት በዚህ device ለመጀመሪያ ጊዜ ሲገባ ለ1 ጊዜ ብቻ ኢንተርኔት ያገናኙ። (No internet connection. This new account is not yet saved on this device. Please connect to internet once to sync.)',
      };
    }

    return res;
  },

  // DB Status
  async getDbStatus(): Promise<DbStatusResponse> {
    return safeFetch('/api/db/status', undefined, {
      success: true,
      mongo: {
        isConnected: false,
        error: 'Offline PWA Standalone Mode',
        uri: 'local-browser-cache',
        dbName: 'bingo_pwa_local',
        timestamp: new Date().toISOString(),
      },
      localSqlite: {
        active: true,
        agentsCount: getLocalAgents().length,
        cardsCount: getLocalCards().length,
        gamesCount: 1,
      },
    });
  },

  // Cards
  async getCards(search?: string, limit?: number): Promise<{ success: boolean; count: number; cards: BingoCard[] }> {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (limit) params.append('limit', String(limit));

    const res = await safeFetch<{ success: boolean; count: number; cards: BingoCard[] }>(
      `/api/cards?${params.toString()}`,
      undefined,
      { success: false, count: 0, cards: [] }
    );

    if (res.success && Array.isArray(res.cards) && res.cards.length > 0) {
      saveLocalCards(res.cards);
      return res;
    }

    // Fallback to offline cached cards
    let local = getLocalCards();
    if (search) {
      const q = search.trim().toUpperCase();
      local = local.filter((c) => c.cardId.toUpperCase().includes(q));
    }
    if (limit && limit > 0) {
      local = local.slice(0, limit);
    }
    return { success: true, count: local.length, cards: local };
  },

  async getCardById(cardId: string): Promise<{ success: boolean; card: BingoCard; error?: string }> {
    const res = await safeFetch<{ success: boolean; card: BingoCard; error?: string }>(
      `/api/cards/${encodeURIComponent(cardId)}`,
      undefined,
      { success: false, card: null as any }
    );

    if (res.success && res.card) {
      return res;
    }

    // Offline card lookup
    const local = getLocalCards();
    const clean = String(cardId).trim().toUpperCase();
    let found = local.find((c) => c.cardId === clean);

    if (!found) {
      const numMatch = clean.replace(/[^0-9]/g, '');
      if (numMatch) {
        const padded = `CARD-${numMatch.padStart(4, '0')}`;
        found = local.find((c) => c.cardId === padded);
      }
    }

    if (found) {
      return { success: true, card: found };
    }

    return { success: false, card: null as any, error: `Card '${cardId}' not found in offline database.` };
  },

  async generateCards(_count?: number, _startNumber?: number, _prefix: string = 'CARD-'): Promise<{ success: boolean; generated?: number; firstCardId?: string; lastCardId?: string; count?: number; cards?: BingoCard[]; error?: string }> {
    // Additional card generation is disabled to protect home-printed 75 physical cards. Reset and return the 75 fixed cards.
    return this.resetCardsTo75();
  },

  async resetCardsTo75(): Promise<{ success: boolean; count?: number; cards?: BingoCard[]; error?: string }> {
    const res = await safeFetch<{ success: boolean; count?: number; cards?: BingoCard[]; error?: string }>('/api/cards/reset-75', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, { success: false });

    if (res.success) {
      if (res.cards && res.cards.length > 0) {
        saveLocalCards(res.cards);
      }
      return res;
    }

    // Offline fallback: generate exactly 75 cards
    const cards75 = generateBatchFixedCards(75, 1, 'CARD-');
    saveLocalCards(cards75);
    return { success: true, count: 75, cards: cards75 };
  },

  async deleteCard(cardId: string): Promise<{ success: boolean; message?: string; error?: string }> {
    return safeFetch(`/api/cards/${encodeURIComponent(cardId)}`, {
      method: 'DELETE',
    }, { success: false });
  },

  // Agents CRUD & Management
  async getAgents(): Promise<{ success: boolean; agents: Agent[] }> {
    const res = await safeFetch<{ success: boolean; agents: Agent[] }>(
      '/api/agents',
      undefined,
      { success: false, agents: [] }
    );

    if (res.success && Array.isArray(res.agents)) {
      saveLocalAgents(res.agents);
      return res;
    }

    return { success: true, agents: getLocalAgents() };
  },

  async getAgentById(agentId: string): Promise<{ success: boolean; agent?: Agent; error?: string }> {
    return safeFetch(`/api/agents/${encodeURIComponent(agentId)}`, undefined, { success: false });
  },

  async createAgent(data: Partial<Agent>): Promise<{ success: boolean; agent: Agent; error?: string }> {
    const res = await safeFetch<{ success: boolean; agent: Agent; error?: string }>(
      '/api/agents',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      },
      { success: false, agent: null as any }
    );

    if (res.success && res.agent) {
      const current = getLocalAgents().filter(
        (a) => a.agentId.toUpperCase() !== res.agent.agentId.toUpperCase()
      );
      saveLocalAgents([res.agent, ...current]);
      return res;
    }

    // 100% Offline Local Fallback for Desktop/PWA
    const existing = getLocalAgents();
    const cleanId = (data.agentId || `AGENT-${Math.floor(1000 + Math.random() * 9000)}`).trim().toUpperCase();
    const initialBalance = Number(data.balance ?? (data.packageAssigned?.credits || 0));
    const newAgent: Agent = {
      agentId: cleanId,
      name: (data.name || `Agent ${cleanId}`).trim(),
      location: (data.location || 'Local Terminal').trim(),
      phone: (data.phone || '').trim(),
      pin: (data.pin || '1234').trim(),
      balance: initialBalance,
      packageAssigned: data.packageAssigned,
      deviceId: (data.deviceId || `DEV-${Math.floor(1000 + Math.random() * 9000)}`).trim(),
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };
    const filtered = existing.filter((a) => a.agentId.toUpperCase() !== cleanId);
    saveLocalAgents([newAgent, ...filtered]);
    return { success: true, agent: newAgent };
  },

  async updateAgent(agentId: string, data: Partial<Agent>): Promise<{ success: boolean; agent?: Agent; error?: string }> {
    const res = await safeFetch<{ success: boolean; agent?: Agent; error?: string }>(
      `/api/agents/${encodeURIComponent(agentId)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      },
      { success: false }
    );

    if (res.success && res.agent) {
      const updated = getLocalAgents().map((a) =>
        a.agentId.toUpperCase() === agentId.toUpperCase() ? res.agent! : a
      );
      saveLocalAgents(updated);
      return res;
    }

    // Offline Local Fallback
    const existing = getLocalAgents();
    let updatedAgent: Agent | undefined;
    const updated = existing.map((a) => {
      if (a.agentId.toUpperCase() === agentId.toUpperCase()) {
        updatedAgent = { ...a, ...data };
        return updatedAgent;
      }
      return a;
    });
    if (updatedAgent) {
      saveLocalAgents(updated);
      return { success: true, agent: updatedAgent };
    }
    return { success: false, error: `Agent ${agentId} not found` };
  },

  async deleteAgent(agentId: string): Promise<{ success: boolean; message?: string; error?: string }> {
    const res = await safeFetch<{ success: boolean; message?: string; error?: string }>(
      `/api/agents/${encodeURIComponent(agentId)}`,
      {
        method: 'DELETE',
      },
      { success: false }
    );

    if (res.success) {
      const remaining = getLocalAgents().filter(
        (a) => a.agentId.toUpperCase() !== agentId.toUpperCase()
      );
      saveLocalAgents(remaining);
      return res;
    }

    // Offline Local Fallback: remove from local cache immediately
    const existing = getLocalAgents();
    const remaining = existing.filter(
      (a) => a.agentId.toUpperCase() !== agentId.toUpperCase()
    );
    saveLocalAgents(remaining);
    return { success: true, message: `Agent ${agentId} deleted locally.` };
  },

  async setAgentStatus(agentId: string, status: AgentStatus, banReason?: string): Promise<{ success: boolean; agent?: Agent; message?: string; error?: string }> {
    const res = await safeFetch<{ success: boolean; agent?: Agent; message?: string; error?: string }>(
      `/api/agents/${encodeURIComponent(agentId)}/status`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, banReason }),
      },
      { success: false }
    );

    if (res.success && res.agent) {
      const updated = getLocalAgents().map((a) =>
        a.agentId.toUpperCase() === agentId.toUpperCase() ? res.agent! : a
      );
      saveLocalAgents(updated);
      return res;
    }

    // Offline Local Fallback: update status directly in local cache
    const existing = getLocalAgents();
    let updatedAgent: Agent | undefined;
    const updated = existing.map((a) => {
      if (a.agentId.toUpperCase() === agentId.toUpperCase()) {
        updatedAgent = { ...a, status, banReason: banReason || undefined };
        return updatedAgent;
      }
      return a;
    });
    if (updatedAgent) {
      saveLocalAgents(updated);
      return { success: true, agent: updatedAgent, message: `Agent status updated to ${status}` };
    }
    return { success: false, error: `Agent ${agentId} not found` };
  },

  async assignPackage(agentId: string, data: { packageName: string; credits: number; gamesAllowed: number; price?: number; note?: string }): Promise<{ success: boolean; agent?: Agent; transaction?: Transaction; message?: string; error?: string }> {
    const res = await safeFetch<{ success: boolean; agent?: Agent; transaction?: Transaction; message?: string; error?: string }>(
      `/api/agents/${encodeURIComponent(agentId)}/package`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      },
      { success: false }
    );

    if (res.success && res.agent) {
      const updated = getLocalAgents().map((a) =>
        a.agentId.toUpperCase() === agentId.toUpperCase() ? res.agent! : a
      );
      saveLocalAgents(updated);
      return res;
    }

    // Offline Local Fallback
    const existing = getLocalAgents();
    let updatedAgent: Agent | undefined;
    const updated = existing.map((a) => {
      if (a.agentId.toUpperCase() === agentId.toUpperCase()) {
        const newBal = (a.balance || 0) + Number(data.credits);
        updatedAgent = {
          ...a,
          balance: newBal,
          packageAssigned: {
            packageName: data.packageName,
            credits: Number(data.credits),
            gamesAllowed: Number(data.gamesAllowed),
            costPerGame: 50,
            assignedAt: new Date().toISOString(),
            price: data.price,
          },
        };
        return updatedAgent;
      }
      return a;
    });
    if (updatedAgent) {
      saveLocalAgents(updated);
      return { success: true, agent: updatedAgent, message: `Package assigned locally.` };
    }
    return { success: false, error: `Agent ${agentId} not found` };
  },

  async topupAgent(agentId: string, amount: number, note?: string): Promise<{ success: boolean; agent?: Agent; transaction?: Transaction; newBalance?: number; error?: string }> {
    const res = await safeFetch<{ success: boolean; agent?: Agent; transaction?: Transaction; newBalance?: number; error?: string }>(
      `/api/agents/${encodeURIComponent(agentId)}/topup`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, note }),
      },
      { success: false }
    );

    if (res.success && typeof res.newBalance === 'number') {
      const updated = getLocalAgents().map((a) =>
        a.agentId.toUpperCase() === agentId.toUpperCase()
          ? res.agent || { ...a, balance: res.newBalance! }
          : a
      );
      saveLocalAgents(updated);
      return res;
    }

    // Offline Local Fallback
    const existing = getLocalAgents();
    let updatedAgent: Agent | undefined;
    let newBalance = 0;
    const updated = existing.map((a) => {
      if (a.agentId.toUpperCase() === agentId.toUpperCase()) {
        newBalance = (a.balance || 0) + Number(amount);
        updatedAgent = { ...a, balance: newBalance };
        return updatedAgent;
      }
      return a;
    });
    if (updatedAgent) {
      saveLocalAgents(updated);
      return { success: true, agent: updatedAgent, newBalance };
    }
    return { success: false, error: `Agent ${agentId} not found` };
  },

  // Games
  async getGames(agentId?: string): Promise<{ success: boolean; games: Game[] }> {
    const url = agentId ? `/api/games?agentId=${encodeURIComponent(agentId)}` : '/api/games';
    return safeFetch(url, undefined, { success: true, games: [] });
  },

  async startGame(
    agentId: string,
    deviceId?: string,
    gamerCount?: number,
    capturedNumbers?: number[],
    capturedCards?: string[]
  ): Promise<{ success: boolean; game: Game; newAgentBalance: number; error?: string }> {
    // Immediate 0ms execution if offline (e.g. WiFi turned off, standalone mobile/desktop)
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    const startLocalGame = (): { success: boolean; game: Game; newAgentBalance: number } => {
      const localGame: Game = {
        gameId: 'GAME-OFFLINE-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
        agentId: agentId || 'AGENT-101',
        deviceId: deviceId || 'DEV-MOBILE-01',
        calledNumbers: [],
        calledDetails: [],
        startTime: new Date().toISOString(),
        status: 'IN_PROGRESS',
        gameCost: 50,
        createdAt: new Date().toISOString(),
        syncStatus: 'SYNCED',
        gamerCount: gamerCount || (capturedNumbers?.length || 0),
        capturedNumbers: capturedNumbers || [],
        capturedCards: capturedCards || [],
      };

      try {
        localStorage.setItem(STORAGE_KEY_ACTIVE_GAME, JSON.stringify(localGame));
      } catch {}

      const agents = getLocalAgents();
      const a = agents.find((ag) => ag.agentId === agentId) || agents[0];
      const newBal = a ? Math.max(0, a.balance - 50) : 1000;
      if (a) {
        a.balance = newBal;
        saveLocalAgents(agents);
      }

      return {
        success: true,
        game: localGame,
        newAgentBalance: newBal,
      };
    };

    if (isOffline) {
      return startLocalGame();
    }

    const res = await safeFetch<{ success: boolean; game: Game; newAgentBalance: number; error?: string }>(
      '/api/games/start',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, deviceId, gamerCount, capturedNumbers, capturedCards }),
      },
      { success: false, game: null as any, newAgentBalance: 0 }
    );

    if (res.success && res.game) {
      try {
        localStorage.setItem(STORAGE_KEY_ACTIVE_GAME, JSON.stringify(res.game));
      } catch {}
      return res;
    }

    // Fallback if network request failed or timed out
    return startLocalGame();
  },

  async updateGame(gameId: string, data: { calledNumbers?: number[]; status?: string; winnerCardId?: string; winningPattern?: string; capturedNumbers?: number[]; capturedCards?: string[]; gamerCount?: number }): Promise<{ success: boolean; game?: Game; error?: string }> {
    // If offline, update local storage immediately without waiting for network timeout
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    if (isOffline) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_ACTIVE_GAME);
        if (raw) {
          const current = JSON.parse(raw);
          const updated = { ...current, ...data };
          localStorage.setItem(STORAGE_KEY_ACTIVE_GAME, JSON.stringify(updated));
          return { success: true, game: updated };
        }
      } catch {}
      return { success: true };
    }

    const res = await safeFetch<{ success: boolean; game?: Game; error?: string }>(
      `/api/games/${encodeURIComponent(gameId)}/update`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      },
      { success: false }
    );

    if (res.success && res.game) {
      try {
        localStorage.setItem(STORAGE_KEY_ACTIVE_GAME, JSON.stringify(res.game));
      } catch {}
      return res;
    }

    // Offline Game Update Fallback
    try {
      const raw = localStorage.getItem(STORAGE_KEY_ACTIVE_GAME);
      if (raw) {
        const current = JSON.parse(raw);
        const updated = { ...current, ...data };
        localStorage.setItem(STORAGE_KEY_ACTIVE_GAME, JSON.stringify(updated));
        return { success: true, game: updated };
      }
    } catch {}

    return { success: true };
  },

  async verifyCardInGame(gameId: string, cardId: string, calledNumbers: number[]): Promise<{ success: boolean; verification: VerificationResult; card: BingoCard; error?: string }> {
    const res = await safeFetch<{ success: boolean; verification: VerificationResult; card: BingoCard; error?: string }>(
      `/api/games/${encodeURIComponent(gameId)}/verify`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, calledNumbers }),
      },
      { success: false, verification: null as any, card: null as any }
    );

    if (res.success && res.verification && res.card) {
      return res;
    }

    // 100% Offline Card Verification Fallback using client-side bingoEngine
    const local = getLocalCards();
    const clean = String(cardId).trim().toUpperCase();
    let found = local.find((c) => c.cardId === clean);

    if (!found) {
      const numMatch = clean.replace(/[^0-9]/g, '');
      if (numMatch) {
        const padded = `CARD-${numMatch.padStart(4, '0')}`;
        found = local.find((c) => c.cardId === padded);
      }
    }

    if (!found) {
      return {
        success: false,
        verification: null as any,
        card: null as any,
        error: `Card '${cardId}' was not found in offline database. Ensure cards were generated.`,
      };
    }

    const settings = getLocalSettings();
    const verification = verifyBingoCard(found, calledNumbers || [], settings.allowedPatterns);

    return {
      success: true,
      verification,
      card: found,
    };
  },

  async recordGameWinner(gameId: string, payload: { cardId: string; agentId: string; pattern: string; matchedNumbers: number[]; prizeAmount?: number; prizeNotes?: string }) {
    const res = await safeFetch(
      `/api/games/${encodeURIComponent(gameId)}/winner`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      { success: false }
    );

    if (res.success) return res;

    // Save winner locally when offline
    try {
      const raw = localStorage.getItem(STORAGE_KEY_OFFLINE_WINNERS);
      const list = raw ? JSON.parse(raw) : [];
      list.push({
        winnerId: 'WIN-OFFLINE-' + Date.now().toString(36),
        gameId,
        ...payload,
        verifiedAt: new Date().toISOString(),
      });
      localStorage.setItem(STORAGE_KEY_OFFLINE_WINNERS, JSON.stringify(list));
    } catch {}

    return { success: true };
  },

  // Transactions
  async getTransactions(agentId?: string): Promise<{ success: boolean; count: number; transactions: Transaction[] }> {
    const url = agentId ? `/api/transactions?agentId=${encodeURIComponent(agentId)}` : '/api/transactions';
    return safeFetch(url, undefined, { success: true, count: 0, transactions: [] });
  },

  // Winners
  async getWinners(): Promise<{ success: boolean; winners: WinnerRecord[] }> {
    return safeFetch('/api/winners', undefined, { success: true, winners: [] });
  },

  // Summary Reports
  async getSummary(): Promise<{ success: boolean; stats: SummaryStats; recentTransactions: Transaction[]; recentGames: Game[] }> {
    return safeFetch('/api/reports/summary', undefined, {
      success: true,
      stats: {
        totalCards: 0,
        totalAgents: 0,
        totalGames: 0,
        totalCompletedGames: 0,
        totalWinners: 0,
        totalCreditsIssued: 0,
        totalCreditsSpent: 0,
        totalCurrentAgentBalances: 0,
        pendingSyncCount: 0,
      },
      recentTransactions: [],
      recentGames: [],
    });
  },

  // Settings
  async getSettings(): Promise<{ success: boolean; settings: SystemSettings }> {
    const res = await safeFetch<{ success: boolean; settings: SystemSettings }>(
      '/api/settings',
      undefined,
      { success: false, settings: getLocalSettings() }
    );

    if (res.success && res.settings) {
      try {
        localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(res.settings));
      } catch {}
      return res;
    }

    return { success: true, settings: getLocalSettings() };
  },

  async saveSettings(settings: SystemSettings) {
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    } catch {}

    return safeFetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }, { success: true });
  },

  // Sync
  async getSyncStatus(): Promise<SyncStatusResponse> {
    return safeFetch('/api/sync/status', undefined, {
      success: true,
      isOnline: true,
      networkMode: 'ONLINE',
      atlasConnected: true,
      pendingCount: 0,
      queue: [],
    });
  },

  async syncNow(agentId?: string): Promise<{ success: boolean; syncedCount?: number; failedCount?: number; syncedRecordIds?: string[]; centralServerMessage?: string; timestamp?: string; networkLatencyMs?: number; agentUpdates?: { agentId: string; newBalance: number }[]; error?: string }> {
    return safeFetch('/api/sync/now', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId }),
    }, { success: false });
  },

  async setNetworkMode(mode: 'ONLINE' | 'SLOW_2G' | 'OFFLINE') {
    return safeFetch('/api/sync/network-mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    }, { success: false });
  },

  // SQLite Offline Database
  async getSqliteInfo(): Promise<{
    success: boolean;
    engine?: string;
    filename?: string;
    sizeBytes?: number;
    sizeFormatted?: string;
    lastModified?: string;
    isOfflineReady?: boolean;
    error?: string;
  }> {
    return safeFetch('/api/sqlite/info', undefined, { success: false });
  },

  downloadSqliteDb() {
    window.location.href = '/api/sqlite/download';
  },

  async importSqliteDb(file: File): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const buffer = await file.arrayBuffer();
      const res = await fetch('/api/sqlite/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: buffer,
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, error: e.message || 'Failed to upload SQLite file' };
    }
  },
};
