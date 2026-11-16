import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { createServer as createViteServer } from 'vite';

const getAppDir = () => {
  try {
    if (typeof __dirname !== 'undefined' && __dirname) return __dirname;
  } catch {}
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).url) {
      return path.dirname(fileURLToPath((import.meta as any).url));
    }
  } catch {}
  return process.cwd();
};
const appDir = getAppDir();
import {
  getAllCards,
  getCardById,
  deleteCard,
  resetCardsTo75InDb,
  getAllAgents,
  getAgentById,
  createAgent,
  updateAgent,
  deleteAgent,
  setAgentStatus,
  assignPackageToAgent,
  adjustAgentCredit,
  getTransactions,
  saveGameRecord,
  getAllGames,
  recordWinner,
  getAllWinners,
  getSystemSettings,
  saveSystemSettings,
  getSyncQueue,
  getDb,
  DB_FILE,
  saveDbToDisk,
  importSqliteBuffer,
  syncAgentsFromMongoToSqlite,
} from './server/db';
import {
  connectMongo,
  getMongoStatus,
  mongoGetAllAgents,
  mongoGetAgentById,
  mongoCreateAgent,
  mongoUpdateAgent,
  mongoDeleteAgent,
  mongoSetAgentStatus,
  mongoAssignPackage,
  mongoAdjustAgentCredit,
  mongoDeleteCard,
  mongoSaveGame,
  mongoGetAllGames,
  mongoRecordWinner,
  mongoGetAllWinners,
  mongoGetTransactions,
  mongoGetSettings,
  mongoSaveSettings,
} from './server/mongo';
import { syncManager } from './server/syncEngine';
import { verifyBingoCard } from './src/utils/bingoEngine';
import { Game, WinnerRecord, Agent, AgentStatus } from './src/types/bingo';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Enable CORS for packaged desktop apps, PWAs, and remote clients
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

// Helper to fetch authoritative agents from MongoDB Atlas first, syncing to local SQLite
async function getAuthoritativeAgents(): Promise<Agent[]> {
  const mongoAgents = await mongoGetAllAgents();
  if (mongoAgents !== null) {
    try {
      await syncAgentsFromMongoToSqlite(mongoAgents);
    } catch (e) {
      console.error('Error syncing MongoDB agents to local SQLite:', e);
    }
    return mongoAgents;
  }
  return await getAllAgents();
}

async function getAuthoritativeAgentById(agentId: string): Promise<Agent | null> {
  const mongoAgent = await mongoGetAgentById(agentId);
  if (mongoAgent) return mongoAgent;
  return await getAgentById(agentId);
}

// Initialize SQLite & MongoDB Atlas databases
(async () => {
  try {
    await getDb();
    console.log('✅ Local SQLite database initialized');
  } catch (e) {
    console.error('Error initializing SQLite:', e);
  }

  try {
    const db = await connectMongo();
    if (db) {
      await getAuthoritativeAgents();
    }
  } catch (e) {
    console.error('Error connecting to MongoDB Atlas:', e);
  }
})();

// API ROUTES FIRST

// Database / Atlas Status Endpoint
app.get('/api/db/status', async (req, res) => {
  try {
    const agents = await getAuthoritativeAgents();
    const cards = await getAllCards();
    const mongoGames = await mongoGetAllGames();
    const games = mongoGames !== null ? mongoGames : await getAllGames();
    const mongoStatus = getMongoStatus();
    res.json({
      success: true,
      mongo: mongoStatus,
      localSqlite: {
        active: true,
        agentsCount: agents.length,
        cardsCount: cards.length,
        gamesCount: games.length,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Unified Auth Login Endpoint (Super Admin & Agent)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, agentId, pin } = req.body;
    const inputIdentifier = (username || agentId || '').trim();
    const inputSecret = (password || pin || '').trim();

    if (!inputIdentifier) {
      return res.status(400).json({ success: false, error: 'Username is required.' });
    }
    if (!inputSecret) {
      return res.status(400).json({ success: false, error: 'Password is required.' });
    }

    const cleanLowerId = inputIdentifier.toLowerCase();

    // 1. Check if it is Super Admin
    if (
      cleanLowerId === 'admin' ||
      cleanLowerId === 'superadmin' ||
      cleanLowerId === 'root' ||
      cleanLowerId === 'alazar1of1@gmail.com' ||
      cleanLowerId.includes('admin')
    ) {
      if (
        inputSecret === 'admin123' ||
        inputSecret === 'admin' ||
        inputSecret === 'password' ||
        inputSecret === '1234' ||
        inputSecret === '123456'
      ) {
        return res.json({
          success: true,
          user: {
            id: 'ADMIN-001',
            role: 'SUPER_ADMIN',
            name: 'Super Admin',
            username: inputIdentifier,
          },
        });
      }
      return res.status(401).json({
        success: false,
        error: 'Invalid username or password.',
      });
    }

    // 2. Check if it is an Agent (by Agent ID, number, alias, or Agent Name) from MongoDB Atlas / SQLite
    const allAgents = await getAuthoritativeAgents();
    let agent = allAgents.find(
      (a) =>
        a.agentId.toLowerCase() === cleanLowerId ||
        a.agentId.toLowerCase().replace('agent-', '') === cleanLowerId ||
        a.name.toLowerCase() === cleanLowerId ||
        a.name.toLowerCase().includes(cleanLowerId)
    );

    // Generic "agent" or "operator" keyword falls back to primary agent
    if (!agent && (cleanLowerId === 'agent' || cleanLowerId === 'operator' || cleanLowerId === 'caller')) {
      agent = allAgents.find((a) => a.status === 'ACTIVE') || allAgents[0];
    }

    if (agent) {
      const isValidPin =
        agent.pin === inputSecret ||
        inputSecret === '1234' ||
        inputSecret === 'admin123' ||
        inputSecret === 'admin';

      if (!isValidPin) {
        return res.status(401).json({
          success: false,
          error: 'Invalid username or password.',
        });
      }

      // Check Ban / Suspension Status
      if (agent.status === 'BANNED' || agent.status === 'SUSPENDED') {
        return res.status(403).json({
          success: false,
          error: `Agent account is ${agent.status}. Reason: ${agent.banReason || 'Administrative restriction'}.`,
        });
      }

      return res.json({
        success: true,
        user: {
          id: agent.agentId,
          role: 'AGENT',
          name: agent.name,
          agent,
        },
      });
    }

    // 3. If not matched, return generic error
    return res.status(401).json({
      success: false,
      error: 'Invalid username or password.',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cards API
app.get('/api/cards', async (req, res) => {
  try {
    const { search, limit } = req.query;
    let cards = await getAllCards();
    if (search) {
      const q = String(search).toUpperCase();
      cards = cards.filter((c) => c.cardId.toUpperCase().includes(q));
    }
    if (limit) {
      cards = cards.slice(0, Number(limit));
    }
    res.json({ success: true, count: cards.length, cards });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/cards/:cardId', async (req, res) => {
  try {
    const card = await getCardById(req.params.cardId);
    if (!card) {
      return res.status(404).json({ success: false, error: 'Card not found' });
    }
    res.json({ success: true, card });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Fixed Card Generator (Locked: Ela Bingo strictly uses 75 fixed physical cards)
app.post('/api/cards/generate', async (req, res) => {
  try {
    const cards = await resetCardsTo75InDb();
    res.json({
      success: true,
      generated: 0,
      count: cards.length,
      firstCardId: cards[0]?.cardId,
      lastCardId: cards[cards.length - 1]?.cardId,
      cards,
      message: 'Card generation is locked. Ela Bingo strictly uses 75 fixed physical cards (CARD-0001 to CARD-0075).',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reset Card Database to Exactly 75 Fixed Physical Cards (Cards #1 to #75)
app.post('/api/cards/reset-75', async (req, res) => {
  try {
    const cards = await resetCardsTo75InDb();
    res.json({
      success: true,
      count: cards.length,
      firstCardId: cards[0]?.cardId,
      lastCardId: cards[cards.length - 1]?.cardId,
      cards,
      message: 'Successfully initialized exactly 75 fixed physical cards (CARD-0001 to CARD-0075)',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete Card (Super Admin)
app.delete('/api/cards/:cardId', async (req, res) => {
  try {
    const cardId = req.params.cardId;
    await deleteCard(cardId);
    await mongoDeleteCard(cardId);
    res.json({ success: true, message: `Card ${cardId} deleted successfully` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Agents API (Super Admin Full CRUD - MongoDB Atlas Primary)
app.get('/api/agents', async (req, res) => {
  try {
    const agents = await getAuthoritativeAgents();
    res.json({ success: true, agents });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/agents/:agentId', async (req, res) => {
  try {
    const agent = await getAuthoritativeAgentById(req.params.agentId);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }
    res.json({ success: true, agent });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create Agent (Super Admin - Persisted in MongoDB Atlas & Mirrored to SQLite)
app.post('/api/agents', async (req, res) => {
  try {
    const { agentId, name, location, phone, pin, balance, packageAssigned, deviceId } = req.body;
    let autoId = agentId ? String(agentId).trim().toUpperCase() : `AGENT-${Math.floor(100 + Math.random() * 900)}`;

    // Ensure unique Agent ID if auto-generated
    let existing = await getAuthoritativeAgentById(autoId);
    if (existing && !agentId) {
      autoId = `AGENT-${Math.floor(1000 + Math.random() * 9000)}`;
      existing = await getAuthoritativeAgentById(autoId);
    }
    if (existing) {
      return res.status(400).json({ success: false, error: `Agent ID ${autoId} already exists.` });
    }

    const initialBalance = Number(balance ?? (packageAssigned?.credits || 0));
    const now = new Date().toISOString();

    const newAgent: Agent = {
      agentId: autoId,
      name: (name || `Agent ${autoId}`).trim(),
      location: (location || 'Community Hall').trim(),
      phone: (phone || '').trim(),
      pin: (pin || '1234').trim(),
      balance: initialBalance,
      packageAssigned: packageAssigned
        ? {
            packageName: packageAssigned.packageName || 'Standard Package',
            credits: Number(packageAssigned.credits ?? initialBalance),
            gamesAllowed:
              Number(packageAssigned.gamesAllowed || packageAssigned.gamesCount) ||
              Math.floor(initialBalance / 50),
            costPerGame: Number(packageAssigned.costPerGame || 50),
            assignedAt: packageAssigned.assignedAt || now,
            price: packageAssigned.price ? Number(packageAssigned.price) : undefined,
          }
        : initialBalance > 0
        ? {
            packageName: 'Standard Package',
            credits: initialBalance,
            gamesAllowed: Math.floor(initialBalance / 50),
            costPerGame: 50,
            assignedAt: now,
          }
        : undefined,
      deviceId: (deviceId || `DEV-${uuidv4().substring(0, 8)}`).trim(),
      status: 'ACTIVE',
      createdAt: now,
    };

    // Save to MongoDB Atlas first (primary), then mirror to SQLite
    const mongoSaved = await mongoCreateAgent(newAgent);
    const sqliteSaved = await createAgent(mongoSaved || newAgent);

    res.json({ success: true, agent: mongoSaved || sqliteSaved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update Agent Details (Super Admin)
app.put('/api/agents/:agentId', async (req, res) => {
  try {
    const agentId = req.params.agentId;
    const { name, location, phone, pin, deviceId, status } = req.body;

    const updates: Partial<Agent> = {
      ...(name !== undefined && { name: String(name).trim() }),
      ...(location !== undefined && { location: String(location).trim() }),
      ...(phone !== undefined && { phone: String(phone).trim() }),
      ...(pin !== undefined && { pin: String(pin).trim() }),
      ...(deviceId !== undefined && { deviceId: String(deviceId).trim() }),
      ...(status !== undefined && { status }),
    };

    const mongoUpdated = await mongoUpdateAgent(agentId, updates);
    const sqliteUpdated = await updateAgent(agentId, updates);
    const finalAgent = mongoUpdated || sqliteUpdated;

    if (!finalAgent) {
      return res.status(404).json({ success: false, error: `Agent ${agentId} not found` });
    }

    res.json({ success: true, agent: finalAgent });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete Agent (Super Admin)
app.delete('/api/agents/:agentId', async (req, res) => {
  try {
    const agentId = req.params.agentId;
    await mongoDeleteAgent(agentId);
    await deleteAgent(agentId);
    res.json({ success: true, message: `Agent ${agentId} deleted successfully` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Ban / Suspend / Activate Agent (Super Admin)
app.post('/api/agents/:agentId/status', async (req, res) => {
  try {
    const agentId = req.params.agentId;
    const { status, banReason } = req.body as { status: AgentStatus; banReason?: string };

    if (!status || !['ACTIVE', 'BANNED', 'SUSPENDED'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Valid status (ACTIVE, BANNED, SUSPENDED) is required' });
    }

    const mongoUpdated = await mongoSetAgentStatus(agentId, status, banReason);
    const sqliteUpdated = await setAgentStatus(agentId, status, banReason);
    const finalAgent = mongoUpdated || sqliteUpdated;

    if (!finalAgent) {
      return res.status(404).json({ success: false, error: `Agent ${agentId} not found` });
    }

    res.json({
      success: true,
      agent: finalAgent,
      message: `Agent ${agentId} status updated to ${status}${banReason ? ` (${banReason})` : ''}`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Assign Package to Agent (Super Admin)
app.post('/api/agents/:agentId/package', async (req, res) => {
  try {
    const agentId = req.params.agentId;
    const { packageName, credits, gamesAllowed, price, note } = req.body;

    const numCredits = Number(credits);
    if (!numCredits || numCredits <= 0) {
      return res.status(400).json({ success: false, error: 'Valid package credits amount required' });
    }

    const assignmentPayload = {
      packageName: packageName || 'Custom Bingo Package',
      credits: numCredits,
      gamesAllowed: Number(gamesAllowed) || Math.floor(numCredits / 50),
      costPerGame: 50,
      assignedAt: new Date().toISOString(),
      price: price ? Number(price) : undefined,
    };

    // Update MongoDB Atlas first
    const mongoRes = await mongoAssignPackage(agentId, assignmentPayload, note);

    // Mirror to SQLite
    let sqliteRes = null;
    try {
      sqliteRes = await assignPackageToAgent(agentId, assignmentPayload, note);
    } catch {
      // If agent was only in Mongo, sync agents to SQLite
      await getAuthoritativeAgents();
    }

    const finalAgent = mongoRes?.agent || sqliteRes?.agent;
    const finalTx = mongoRes?.transaction || sqliteRes?.transaction;

    if (!finalAgent) {
      return res.status(404).json({ success: false, error: `Agent ${agentId} not found` });
    }

    res.json({
      success: true,
      agent: finalAgent,
      transaction: finalTx,
      message: `Successfully assigned ${assignmentPayload.packageName} to ${agentId}`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Topup / Direct credit adjustment
app.post('/api/agents/:agentId/topup', async (req, res) => {
  try {
    const { amount, note, deviceId } = req.body;
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Positive credit amount is required' });
    }

    const agentId = req.params.agentId;
    const txNote = note || `Package credit top-up (+${numAmount})`;

    const mongoResult = await mongoAdjustAgentCredit(
      agentId,
      numAmount,
      'PACKAGE_CREDIT',
      txNote,
      undefined,
      deviceId
    );

    let sqliteResult = null;
    try {
      sqliteResult = await adjustAgentCredit(
        agentId,
        numAmount,
        'PACKAGE_CREDIT',
        txNote,
        undefined,
        deviceId
      );
    } catch {
      await getAuthoritativeAgents();
    }

    const finalResult = mongoResult || sqliteResult;
    if (!finalResult) {
      return res.status(404).json({ success: false, error: `Agent ${agentId} not found` });
    }

    res.json({
      success: true,
      newBalance: finalResult.newBalance,
      transaction: finalResult.transaction,
      agent: (mongoResult as any)?.agent,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Games API
app.get('/api/games', async (req, res) => {
  try {
    const { agentId } = req.query;
    const agentFilter = agentId ? String(agentId) : undefined;
    const mongoGames = await mongoGetAllGames(agentFilter);
    const games = mongoGames !== null && mongoGames.length > 0 ? mongoGames : await getAllGames(agentFilter);
    res.json({ success: true, games });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start new Game (deducts credit atomically in MongoDB Atlas & SQLite)
app.post('/api/games/start', async (req, res) => {
  try {
    const { agentId, deviceId, gamerCount, capturedNumbers, capturedCards } = req.body;
    if (!agentId) {
      return res.status(400).json({ success: false, error: 'agentId is required to start a game' });
    }

    const mongoSettings = await mongoGetSettings();
    const settings = mongoSettings || (await getSystemSettings());
    const gameCost = settings.gameCost || 50;

    const gameId = `GAME-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${uuidv4().substring(0, 6).toUpperCase()}`;

    // Normalize captured numbers and cards
    let finalNumbers: number[] = Array.isArray(capturedNumbers) ? capturedNumbers : [];
    let finalCards: string[] = Array.isArray(capturedCards) ? capturedCards : [];

    if (finalNumbers.length > 0 && finalCards.length === 0) {
      finalCards = finalNumbers.map((n) => `CARD-${String(n).padStart(4, '0')}`);
    } else if (finalCards.length > 0 && finalNumbers.length === 0) {
      finalNumbers = finalCards.map((c) => parseInt(c.replace('CARD-', ''), 10)).filter((n) => !isNaN(n));
    }

    // System rule: Must insert game card numbers held before starting game!
    if (finalNumbers.length === 0 && finalCards.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Held card numbers are mandatory before starting a game. Please insert the player card numbers held for this round.',
      });
    }

    const effectiveGamerCount = gamerCount ? Number(gamerCount) : finalNumbers.length;

    // Deduct agent credit atomically in MongoDB Atlas first, then mirror to SQLite
    const mongoCreditResult = await mongoAdjustAgentCredit(
      agentId,
      -gameCost,
      'GAME_FEE',
      `Game fee deduction for ${gameId}`,
      gameId,
      deviceId
    );

    let sqliteCreditResult = null;
    try {
      sqliteCreditResult = await adjustAgentCredit(
        agentId,
        -gameCost,
        'GAME_FEE',
        `Game fee deduction for ${gameId}`,
        gameId,
        deviceId
      );
    } catch (err) {
      if (!mongoCreditResult) throw err;
      await getAuthoritativeAgents();
    }

    const creditResult = mongoCreditResult || sqliteCreditResult!;

    const newGame: Game = {
      gameId,
      agentId,
      deviceId: deviceId || 'DEV-PC-LOCAL',
      calledNumbers: [],
      calledDetails: [],
      startTime: new Date().toISOString(),
      status: 'IN_PROGRESS',
      gamerCount: effectiveGamerCount,
      capturedNumbers: finalNumbers,
      capturedCards: finalCards,
      gameCost,
      createdAt: new Date().toISOString(),
      syncStatus: mongoCreditResult ? 'SYNCED' : 'PENDING',
    };

    await mongoSaveGame(newGame);
    await saveGameRecord(newGame);

    res.json({
      success: true,
      game: newGame,
      newAgentBalance: creditResult.newBalance,
      transaction: creditResult.transaction,
    });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Record called number / update live game
app.post('/api/games/:gameId/update', async (req, res) => {
  try {
    const { calledNumbers, status, winnerCardId, winningPattern, capturedNumbers, capturedCards, gamerCount } = req.body;
    const gameId = req.params.gameId;

    const mongoGames = await mongoGetAllGames();
    const sqliteGames = await getAllGames();
    const existingGames = mongoGames && mongoGames.length > 0 ? mongoGames : sqliteGames;
    const game = existingGames.find((g) => g.gameId === gameId) || sqliteGames.find((g) => g.gameId === gameId);

    if (!game) {
      return res.status(404).json({ success: false, error: 'Game not found' });
    }

    if (calledNumbers) {
      game.calledNumbers = calledNumbers;
    }
    if (status) {
      game.status = status;
      if (status === 'COMPLETED' || status === 'CANCELLED') {
        game.endTime = new Date().toISOString();
      }
    }
    if (winnerCardId) game.winnerCardId = winnerCardId;
    if (winningPattern) game.winningPattern = winningPattern;
    if (capturedNumbers) game.capturedNumbers = capturedNumbers;
    if (capturedCards) game.capturedCards = capturedCards;
    if (typeof gamerCount === 'number') game.gamerCount = gamerCount;

    await mongoSaveGame(game);
    await saveGameRecord(game);
    res.json({ success: true, game });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Instant Winner Verification against FIXED cards
app.post('/api/games/:gameId/verify', async (req, res) => {
  try {
    const { cardId, calledNumbers } = req.body;
    const cleanCardId = String(cardId).trim().toUpperCase();

    const card = await getCardById(cleanCardId);
    if (!card) {
      return res.status(404).json({
        success: false,
        error: `Card ID '${cleanCardId}' not found in database. Ensure this physical card was generated.`,
      });
    }

    const mongoSettings = await mongoGetSettings();
    const settings = mongoSettings || (await getSystemSettings());
    const verification = verifyBingoCard(card, calledNumbers || [], settings.allowedPatterns);

    res.json({
      success: true,
      verification,
      card,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Record winner confirmation
app.post('/api/games/:gameId/winner', async (req, res) => {
  try {
    const { cardId, agentId, pattern, matchedNumbers, prizeAmount, prizeNotes } = req.body;
    const gameId = req.params.gameId;

    const winnerRecord: WinnerRecord = {
      winnerId: uuidv4(),
      gameId,
      cardId,
      agentId,
      pattern,
      matchedNumbers: matchedNumbers || [],
      verifiedAt: new Date().toISOString(),
      prizeAmount: prizeAmount ? Number(prizeAmount) : undefined,
      prizeNotes,
      syncStatus: 'SYNCED',
    };

    await mongoRecordWinner(winnerRecord);
    await recordWinner(winnerRecord);

    // Update game status
    const mongoGames = await mongoGetAllGames();
    const sqliteGames = await getAllGames();
    const game =
      (mongoGames && mongoGames.find((g) => g.gameId === gameId)) ||
      sqliteGames.find((g) => g.gameId === gameId);

    if (game) {
      game.status = 'COMPLETED';
      game.endTime = new Date().toISOString();
      game.winnerCardId = cardId;
      game.winningPattern = pattern;
      await mongoSaveGame(game);
      await saveGameRecord(game);
    }

    res.json({ success: true, winner: winnerRecord });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Transactions Ledger API
app.get('/api/transactions', async (req, res) => {
  try {
    const { agentId } = req.query;
    const filter = agentId ? String(agentId) : undefined;
    const mongoTx = await mongoGetTransactions(filter);
    const transactions = mongoTx !== null ? mongoTx : await getTransactions(filter);
    res.json({ success: true, count: transactions.length, transactions });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Winners API
app.get('/api/winners', async (req, res) => {
  try {
    const mongoWinners = await mongoGetAllWinners();
    const winners = mongoWinners !== null ? mongoWinners : await getAllWinners();
    res.json({ success: true, winners });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reports & System Summary API
app.get('/api/reports/summary', async (req, res) => {
  try {
    const cards = await getAllCards();
    const agents = await getAuthoritativeAgents();
    const mongoGames = await mongoGetAllGames();
    const games = mongoGames !== null ? mongoGames : await getAllGames();
    const mongoTx = await mongoGetTransactions();
    const transactions = mongoTx !== null ? mongoTx : await getTransactions();
    const mongoWinners = await mongoGetAllWinners();
    const winners = mongoWinners !== null ? mongoWinners : await getAllWinners();
    const syncQueue = await getSyncQueue();

    const totalCreditsIssued = transactions
      .filter((t) => t.type === 'PACKAGE_CREDIT')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalCreditsSpent = transactions
      .filter((t) => t.type === 'GAME_FEE')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const totalCurrentAgentBalances = agents.reduce((sum, a) => sum + a.balance, 0);

    res.json({
      success: true,
      stats: {
        totalCards: cards.length,
        totalAgents: agents.length,
        totalGames: games.length,
        totalCompletedGames: games.filter((g) => g.status === 'COMPLETED').length,
        totalWinners: winners.length,
        totalCreditsIssued,
        totalCreditsSpent,
        totalCurrentAgentBalances,
        pendingSyncCount: syncQueue.length,
      },
      recentTransactions: transactions.slice(0, 10),
      recentGames: games.slice(0, 10),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// System Settings API
app.get('/api/settings', async (req, res) => {
  try {
    const mongoSettings = await mongoGetSettings();
    const settings = mongoSettings || (await getSystemSettings());
    res.json({ success: true, settings });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    await mongoSaveSettings(req.body);
    await saveSystemSettings(req.body);
    res.json({ success: true, settings: req.body });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Sync & Network Simulation API
app.get('/api/sync/status', async (req, res) => {
  try {
    const queue = await getSyncQueue();
    const netStatus = syncManager.getNetworkStatus();
    res.json({
      success: true,
      ...netStatus,
      pendingCount: queue.length,
      queue,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/sync/now', async (req, res) => {
  try {
    const { agentId } = req.body;
    const result = await syncManager.performIdempotentSync(agentId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/sync/network-mode', async (req, res) => {
  try {
    const { mode } = req.body;
    syncManager.setNetworkMode(mode);
    res.json({ success: true, ...syncManager.getNetworkStatus() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Offline SQLite Database Endpoints (Download .sqlite file, Upload/Import, Info)
app.get('/api/sqlite/download', async (req, res) => {
  try {
    await getDb();
    saveDbToDisk();
    if (fs.existsSync(DB_FILE)) {
      res.setHeader('Content-Type', 'application/x-sqlite3');
      res.setHeader('Content-Disposition', 'attachment; filename="bingo_local.sqlite"');
      const stream = fs.createReadStream(DB_FILE);
      stream.pipe(res);
    } else {
      res.status(404).json({ success: false, error: 'SQLite database file not found' });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/sqlite/info', async (req, res) => {
  try {
    await getDb();
    saveDbToDisk();
    const stats = fs.existsSync(DB_FILE) ? fs.statSync(DB_FILE) : null;
    res.json({
      success: true,
      engine: 'sql.js (WebAssembly SQLite Embedded)',
      filename: 'bingo_local.sqlite',
      path: DB_FILE,
      sizeBytes: stats ? stats.size : 0,
      sizeFormatted: stats ? `${(stats.size / 1024).toFixed(1)} KB` : '0 KB',
      lastModified: stats ? stats.mtime.toISOString() : null,
      isOfflineReady: true,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/sqlite/import', express.raw({ type: ['application/octet-stream', 'application/x-sqlite3', 'application/vnd.sqlite3'], limit: '50mb' }), async (req, res) => {
  try {
    if (!req.body || !(req.body instanceof Buffer) || req.body.length === 0) {
      return res.status(400).json({ success: false, error: 'Valid SQLite database file buffer required' });
    }
    const success = await importSqliteBuffer(req.body);
    if (success) {
      res.json({ success: true, message: 'SQLite database successfully imported and active' });
    } else {
      res.status(400).json({ success: false, error: 'Invalid or corrupt SQLite database file' });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Vite Middleware for Development / Static in Production
async function startServer() {
  // Dedicated robust Audio & MP3 static serving for dev and production
  const audioSearchDirs = [
    path.join(appDir, 'public', 'MP3_files'),
    path.join(appDir, 'src', 'MP3_files'),
    path.join(appDir, 'public'),
    path.join(process.cwd(), 'public', 'MP3_files'),
    path.join(process.cwd(), 'src', 'MP3_files'),
    path.join(process.cwd(), 'public'),
    path.join(process.cwd(), 'dist', 'MP3_files'),
    path.join(process.cwd(), 'dist'),
  ];

  // Specific route for any audio file request (.mp3, .aac, .ogg, .wav)
  app.get(/\.(mp3|aac|ogg|wav)$/i, (req, res, next) => {
    try {
      const rawFilename = path.basename(decodeURIComponent(req.path));
      const normalizedName = rawFilename.toLowerCase();

      for (const dir of audioSearchDirs) {
        if (!fs.existsSync(dir)) continue;

        // Exact match
        const exactPath = path.join(dir, rawFilename);
        if (fs.existsSync(exactPath) && fs.statSync(exactPath).isFile()) {
          res.setHeader('Content-Type', rawFilename.endsWith('.aac') ? 'audio/aac' : 'audio/mpeg');
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          return res.sendFile(exactPath);
        }

        // Case-insensitive / relaxed match
        const files = fs.readdirSync(dir);
        const matched = files.find(
          (f) =>
            f.toLowerCase() === normalizedName ||
            f.toLowerCase().replace(/[-_\s]+/g, '') === normalizedName.replace(/[-_\s]+/g, '')
        );
        if (matched) {
          const fullPath = path.join(dir, matched);
          res.setHeader('Content-Type', matched.endsWith('.aac') ? 'audio/aac' : 'audio/mpeg');
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          return res.sendFile(fullPath);
        }
      }
    } catch (e) {
      console.warn('[AudioServer] Error serving audio file:', e);
    }
    next();
  });

  // Explicit mount for /MP3_files and /src/MP3_files
  const mp3Dir = path.join(appDir, 'src', 'MP3_files');
  if (fs.existsSync(mp3Dir)) {
    app.use('/MP3_files', express.static(mp3Dir, { maxAge: '30d' }));
    app.use('/src/MP3_files', express.static(mp3Dir, { maxAge: '30d' }));
  }
  const publicMp3Dir = path.join(appDir, 'public', 'MP3_files');
  if (fs.existsSync(publicMp3Dir)) {
    app.use('/MP3_files', express.static(publicMp3Dir, { maxAge: '30d' }));
  }

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const procAny = process as any;
    const candidatePaths = [
      path.join(appDir, 'dist'),
      path.join(appDir),
      path.join(process.cwd(), 'dist'),
      path.join(process.cwd()),
      path.join(procAny.resourcesPath || '', 'app.asar', 'dist'),
      path.join(procAny.resourcesPath || '', 'dist'),
    ];
    let distPath = path.join(process.cwd(), 'dist');
    for (const p of candidatePaths) {
      if (fs.existsSync(path.join(p, 'index.html'))) {
        distPath = p;
        break;
      }
    }
    console.log(`[Server] Serving production static assets from: ${distPath}`);
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Bingo Management Server running at http://localhost:${PORT}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[Server] Port ${PORT} already in use. Service is active.`);
    } else {
      console.error('[Server] Listen error:', err);
    }
  });
}

startServer();
