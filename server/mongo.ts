import { MongoClient, Db } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import {
  Agent,
  BingoCard,
  Game,
  SystemSettings,
  Transaction,
  WinnerRecord,
  AgentStatus,
  AgentPackageAssignment,
  TransactionType,
} from '../src/types/bingo';
import { generateBatchFixedCards } from '../src/utils/bingoEngine';

const DEFAULT_URI =
  'mongodb+srv://alazar1of1_db_user:QphPyV5OV81xOp72@cluster0.iuxqn6k.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const MONGO_URI = process.env.MONGODB_URI || DEFAULT_URI;
const DB_NAME = 'bingo_system';

let client: MongoClient | null = null;
let db: Db | null = null;
let isConnected = false;
let connectionError: string | null = null;
let connectionTimestamp: string | null = null;
let connectingPromise: Promise<Db | null> | null = null;

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function connectMongo(): Promise<Db | null> {
  if (db && isConnected) return db;
  if (connectingPromise) return connectingPromise;

  connectingPromise = (async () => {
    try {
      const maskedUri = MONGO_URI.replace(/:([^:@]+)@/, ':****@');
      console.log(`Checking MongoDB Atlas connection at ${maskedUri}...`);
      client = new MongoClient(MONGO_URI, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
        tls: true,
        tlsAllowInvalidCertificates: true,
        directConnection: false,
      });

      await client.connect();
      db = client.db(DB_NAME);
      isConnected = true;
      connectionError = null;
      connectionTimestamp = new Date().toISOString();
      console.log('✅ Connected to MongoDB Atlas successfully!');

      // Initialize collections & seeds
      await seedMongoDb(db);
      return db;
    } catch (err: any) {
      isConnected = false;
      connectionError = err?.message || 'Standby mode (Local SQLite Active)';
      console.log('ℹ️ Running in Offline-First Local SQLite Database Engine (MongoDB Atlas standby)');
      return null;
    } finally {
      connectingPromise = null;
    }
  })();

  return connectingPromise;
}

export async function ensureMongoDb(): Promise<Db | null> {
  if (db && isConnected) return db;
  return await connectMongo();
}

export function getMongoDb(): Db | null {
  return isConnected ? db : null;
}

export function getMongoStatus() {
  return {
    isConnected,
    error: connectionError,
    uri: MONGO_URI.replace(/:([^:@]+)@/, ':****@'),
    dbName: DB_NAME,
    timestamp: connectionTimestamp,
    mode: isConnected ? 'ONLINE_ATLAS' : 'OFFLINE_LOCAL_SQLITE',
  };
}

async function seedMongoDb(database: Db) {
  try {
    const adminsCol = database.collection('admins');
    const agentsCol = database.collection('agents');
    const cardsCol = database.collection('cards');
    const settingsCol = database.collection('settings');
    const transactionsCol = database.collection('transactions');

    // 1. Seed Super Admin
    const adminCount = await adminsCol.countDocuments({ username: 'admin' });
    if (adminCount === 0) {
      await adminsCol.insertOne({
        id: 'ADMIN-001',
        username: 'admin',
        password: 'admin123',
        name: 'Super Admin Master',
        role: 'SUPER_ADMIN',
        permissions: ['ALL_CRUD', 'AGENT_MANAGE', 'BAN_AGENT', 'PACKAGE_ASSIGN', 'CARD_GENERATE', 'SYSTEM_SETTINGS'],
        createdAt: new Date().toISOString(),
      });
      console.log('🌱 Seeded default Super Admin into MongoDB');
    }

    // 2. Seed Default Agents ONLY ONCE (respect admin deletions)
    const agentsSeededFlag = await settingsCol.findOne({ key: 'agents_seeded' });
    const agentCount = await agentsCol.countDocuments();
    if (!agentsSeededFlag && agentCount === 0) {
      const now = new Date().toISOString();
      const defaultAgents: Agent[] = [
        {
          agentId: 'AGENT-101',
          name: 'Township Hall Operator',
          location: 'Pine Creek Community Center',
          phone: '+1 (555) 234-8901',
          pin: '1234',
          balance: 1500,
          packageAssigned: {
            packageName: 'Silver Club Package',
            credits: 1500,
            gamesAllowed: 30,
            costPerGame: 50,
            assignedAt: now,
            price: 110,
          },
          deviceId: 'DEV-PC-001',
          status: 'ACTIVE',
          createdAt: now,
        },
        {
          agentId: 'AGENT-102',
          name: 'Oak Valley Recreation Agent',
          location: 'Oak Valley Senior Center',
          phone: '+1 (555) 456-7890',
          pin: '5678',
          balance: 1250,
          packageAssigned: {
            packageName: 'Bronze Host Package',
            credits: 1250,
            gamesAllowed: 25,
            costPerGame: 50,
            assignedAt: now,
            price: 60,
          },
          deviceId: 'DEV-PC-002',
          status: 'ACTIVE',
          createdAt: now,
        },
        {
          agentId: 'AGENT-103',
          name: 'River Bend Club Agent',
          location: 'River Bend Hall',
          phone: '+1 (555) 678-1234',
          pin: '9900',
          balance: 500,
          packageAssigned: {
            packageName: 'Starter Package',
            credits: 500,
            gamesAllowed: 10,
            costPerGame: 50,
            assignedAt: now,
            price: 25,
          },
          deviceId: 'DEV-PC-003',
          status: 'ACTIVE',
          createdAt: now,
        },
      ];

      for (const a of defaultAgents) {
        await agentsCol.insertOne(a);
        await transactionsCol.insertOne({
          transactionId: uuidv4(),
          agentId: a.agentId,
          deviceId: a.deviceId,
          type: 'PACKAGE_CREDIT',
          amount: a.balance,
          balanceAfter: a.balance,
          packageName: a.packageAssigned?.packageName,
          note: 'Initial Seed Package Allocation',
          createdAt: now,
          syncStatus: 'SYNCED',
        });
      }
      await settingsCol.replaceOne(
        { key: 'agents_seeded' },
        { key: 'agents_seeded', value: true, updatedAt: now },
        { upsert: true }
      );
      console.log('🌱 Seeded default Agents & Packages into MongoDB');
    } else if (!agentsSeededFlag && agentCount > 0) {
      await settingsCol.replaceOne(
        { key: 'agents_seeded' },
        { key: 'agents_seeded', value: true, updatedAt: new Date().toISOString() },
        { upsert: true }
      );
    }

    // 3. Seed 75 Fixed Cards
    const cardCount = await cardsCol.countDocuments();
    if (cardCount !== 75) {
      await cardsCol.deleteMany({});
      const cards = generateBatchFixedCards(75, 1, 'CARD-');
      await cardsCol.insertMany(cards);
      console.log(`🌱 Seeded ${cards.length} Fixed Bingo Cards into MongoDB`);
    }

    // 4. Seed Settings
    const settingsCount = await settingsCol.countDocuments({ key: 'app_config' });
    if (settingsCount === 0) {
      const defaultSettings: SystemSettings = {
        gameCost: 50,
        companyName: 'Ela Bingo',
        locationName: 'District Operations Center',
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
        centralServerUrl: MONGO_URI,
        centerFreeText: 'FREE',
      };
      await settingsCol.insertOne({
        key: 'app_config',
        value: defaultSettings,
        updatedAt: new Date().toISOString(),
      });
      console.log('🌱 Seeded System Settings into MongoDB');
    }
  } catch (err) {
    console.error('Error seeding MongoDB:', err);
  }
}

// ----------------------------------------------------
// MONGO DB CRUD METHODS
// ----------------------------------------------------

// AGENTS CRUD
export async function mongoGetAllAgents(): Promise<Agent[] | null> {
  const database = await ensureMongoDb();
  if (!database) return null;
  const col = database.collection<Agent>('agents');
  const docs = await col.find({}, { projection: { _id: 0 } }).sort({ createdAt: -1, agentId: 1 }).toArray();
  return docs.map((a) => ({
    ...a,
    balance: Number(a.balance || 0),
    status: a.status || 'ACTIVE',
  }));
}

export async function mongoGetAgentById(agentId: string): Promise<Agent | null> {
  const database = await ensureMongoDb();
  if (!database) return null;
  const col = database.collection<Agent>('agents');
  const cleanId = agentId.trim();
  const doc = await col.findOne(
    { agentId: { $regex: `^${escapeRegex(cleanId)}$`, $options: 'i' } },
    { projection: { _id: 0 } }
  );
  if (!doc) return null;
  return {
    ...doc,
    balance: Number(doc.balance || 0),
    status: doc.status || 'ACTIVE',
  };
}

export async function mongoCreateAgent(agent: Agent): Promise<Agent | null> {
  const database = await ensureMongoDb();
  if (!database) return null;
  const col = database.collection<Agent>('agents');
  const cleanAgent: Agent = {
    agentId: agent.agentId.trim().toUpperCase(),
    name: agent.name,
    location: agent.location,
    phone: agent.phone || '',
    pin: agent.pin || '1234',
    balance: Number(agent.balance || 0),
    packageAssigned: agent.packageAssigned,
    deviceId: agent.deviceId,
    status: agent.status || 'ACTIVE',
    createdAt: agent.createdAt || new Date().toISOString(),
  };

  await col.replaceOne(
    { agentId: { $regex: `^${escapeRegex(cleanAgent.agentId)}$`, $options: 'i' } },
    { ...cleanAgent },
    { upsert: true }
  );

  if (cleanAgent.balance > 0) {
    const txCol = database.collection<Transaction>('transactions');
    await txCol.insertOne({
      transactionId: uuidv4(),
      agentId: cleanAgent.agentId,
      deviceId: cleanAgent.deviceId,
      type: 'PACKAGE_CREDIT',
      amount: cleanAgent.balance,
      balanceAfter: cleanAgent.balance,
      packageName: cleanAgent.packageAssigned?.packageName || 'Initial Package',
      note: 'Initial Agent Credit Allocation',
      createdAt: cleanAgent.createdAt,
      syncStatus: 'SYNCED',
    });
  }

  return cleanAgent;
}

export async function mongoUpdateAgent(agentId: string, updates: Partial<Agent>): Promise<Agent | null> {
  const database = await ensureMongoDb();
  if (!database) return null;
  const col = database.collection<Agent>('agents');
  const cleanId = agentId.trim();
  const safeUpdates: Record<string, any> = {};
  Object.entries(updates).forEach(([k, v]) => {
    if (v !== undefined && k !== '_id') {
      safeUpdates[k] = v;
    }
  });
  await col.updateOne(
    { agentId: { $regex: `^${escapeRegex(cleanId)}$`, $options: 'i' } },
    { $set: safeUpdates }
  );
  return await mongoGetAgentById(cleanId);
}

export async function mongoDeleteAgent(agentId: string): Promise<boolean> {
  const database = await ensureMongoDb();
  if (!database) return false;
  const col = database.collection<Agent>('agents');
  const cleanId = agentId.trim();
  const res = await col.deleteOne({
    agentId: { $regex: `^${escapeRegex(cleanId)}$`, $options: 'i' },
  });
  return res.deletedCount > 0;
}

export async function mongoSetAgentStatus(
  agentId: string,
  status: AgentStatus,
  banReason?: string
): Promise<Agent | null> {
  const database = await ensureMongoDb();
  if (!database) return null;
  const col = database.collection<Agent>('agents');
  const cleanId = agentId.trim();
  await col.updateOne(
    { agentId: { $regex: `^${escapeRegex(cleanId)}$`, $options: 'i' } },
    {
      $set: {
        status,
        banReason: banReason || (status === 'BANNED' ? 'Administrative Ban' : ''),
      },
    }
  );
  return await mongoGetAgentById(cleanId);
}

export async function mongoAssignPackage(
  agentId: string,
  assignment: AgentPackageAssignment,
  note?: string
): Promise<{ agent: Agent; transaction: Transaction } | null> {
  const database = await ensureMongoDb();
  if (!database) return null;

  const currentAgent = await mongoGetAgentById(agentId);
  if (!currentAgent) return null;

  const newBalance = Number(currentAgent.balance || 0) + Number(assignment.credits || 0);
  const now = new Date().toISOString();
  const txId = uuidv4();

  const transaction: Transaction = {
    transactionId: txId,
    agentId: currentAgent.agentId,
    deviceId: currentAgent.deviceId,
    type: 'PACKAGE_CREDIT',
    amount: assignment.credits,
    balanceAfter: newBalance,
    packageName: assignment.packageName,
    note:
      note ||
      `Assigned Package: ${assignment.packageName} (+${assignment.credits} CR for ${assignment.gamesAllowed} games)`,
    createdAt: now,
    syncStatus: 'SYNCED',
  };

  const agentsCol = database.collection<Agent>('agents');
  const txCol = database.collection<Transaction>('transactions');

  await agentsCol.updateOne(
    { agentId: currentAgent.agentId },
    {
      $set: {
        balance: newBalance,
        packageAssigned: assignment,
        lastSync: now,
      },
    }
  );

  await txCol.insertOne({ ...transaction });

  const updatedAgent = await mongoGetAgentById(currentAgent.agentId);
  return { agent: updatedAgent!, transaction };
}

export async function mongoAdjustAgentCredit(
  agentId: string,
  amount: number,
  type: TransactionType,
  note: string,
  gameId?: string,
  deviceId?: string
): Promise<{ success: boolean; transaction: Transaction; newBalance: number; agent: Agent } | null> {
  const database = await ensureMongoDb();
  if (!database) return null;

  const currentAgent = await mongoGetAgentById(agentId);
  if (!currentAgent) {
    throw new Error(`Agent ${agentId} not found`);
  }

  const newBalance = Number(currentAgent.balance || 0) + Number(amount);
  if (newBalance < 0 && type === 'GAME_FEE') {
    throw new Error(`Insufficient credit. Required: ${Math.abs(amount)}, Current Balance: ${currentAgent.balance}`);
  }

  const transactionId = uuidv4();
  const now = new Date().toISOString();
  const effDeviceId = deviceId || currentAgent.deviceId || 'DEV-PC-LOCAL';

  const transaction: Transaction = {
    transactionId,
    agentId: currentAgent.agentId,
    deviceId: effDeviceId,
    type,
    amount,
    balanceAfter: newBalance,
    gameId,
    note,
    createdAt: now,
    syncStatus: 'SYNCED',
  };

  const agentsCol = database.collection<Agent>('agents');
  const txCol = database.collection<Transaction>('transactions');

  await agentsCol.updateOne(
    { agentId: currentAgent.agentId },
    {
      $set: {
        balance: newBalance,
        lastSync: now,
      },
    }
  );

  await txCol.insertOne({ ...transaction });

  const updatedAgent = (await mongoGetAgentById(currentAgent.agentId)) || {
    ...currentAgent,
    balance: newBalance,
  };

  return {
    success: true,
    newBalance,
    transaction,
    agent: updatedAgent,
  };
}

// CARDS CRUD
export async function mongoGetAllCards(search?: string, limit?: number): Promise<BingoCard[]> {
  const database = await ensureMongoDb();
  if (!database) return [];
  const col = database.collection<BingoCard>('cards');
  let query: any = {};
  if (search) {
    query = { cardId: { $regex: search, $options: 'i' } };
  }
  let cursor = col.find(query, { projection: { _id: 0 } }).sort({ cardId: 1 });
  if (limit) {
    cursor = cursor.limit(limit);
  }
  return await cursor.toArray();
}

export async function mongoGetCardById(cardId: string): Promise<BingoCard | null> {
  const database = await ensureMongoDb();
  if (!database) return null;
  const col = database.collection<BingoCard>('cards');
  return await col.findOne({ cardId: cardId.toUpperCase() }, { projection: { _id: 0 } });
}

export async function mongoInsertCards(cards: BingoCard[]): Promise<number> {
  const database = await ensureMongoDb();
  if (!database) return 0;
  const col = database.collection<BingoCard>('cards');
  try {
    const res = await col.insertMany(cards, { ordered: false });
    return res.insertedCount;
  } catch (err: any) {
    return err.result?.nInserted || 0;
  }
}

export async function mongoDeleteCard(cardId: string): Promise<boolean> {
  const database = await ensureMongoDb();
  if (!database) return false;
  const col = database.collection<BingoCard>('cards');
  const res = await col.deleteOne({ cardId: cardId.toUpperCase() });
  return res.deletedCount > 0;
}

// GAMES & WINNERS
export async function mongoSaveGame(game: Game): Promise<void> {
  const database = await ensureMongoDb();
  if (!database) return;
  const col = database.collection<Game>('games');
  const cleanGame = { ...game, syncStatus: 'SYNCED' as const };
  await col.replaceOne({ gameId: game.gameId }, cleanGame, { upsert: true });
}

export async function mongoGetAllGames(agentId?: string): Promise<Game[] | null> {
  const database = await ensureMongoDb();
  if (!database) return null;
  const col = database.collection<Game>('games');
  const query = agentId ? { agentId: { $regex: `^${escapeRegex(agentId.trim())}$`, $options: 'i' } } : {};
  return await col.find(query, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
}

export async function mongoRecordWinner(winner: WinnerRecord): Promise<void> {
  const database = await ensureMongoDb();
  if (!database) return;
  const col = database.collection<WinnerRecord>('winners');
  await col.insertOne({ ...winner, syncStatus: 'SYNCED' });
}

export async function mongoGetAllWinners(agentId?: string): Promise<WinnerRecord[] | null> {
  const database = await ensureMongoDb();
  if (!database) return null;
  const col = database.collection<WinnerRecord>('winners');
  const query = agentId ? { agentId: { $regex: `^${escapeRegex(agentId.trim())}$`, $options: 'i' } } : {};
  return await col.find(query, { projection: { _id: 0 } }).sort({ verifiedAt: -1 }).toArray();
}

// TRANSACTIONS
export async function mongoGetTransactions(agentId?: string): Promise<Transaction[] | null> {
  const database = await ensureMongoDb();
  if (!database) return null;
  const col = database.collection<Transaction>('transactions');
  const query = agentId ? { agentId: { $regex: `^${escapeRegex(agentId.trim())}$`, $options: 'i' } } : {};
  return await col.find(query, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
}

export async function mongoSaveTransaction(tx: Transaction): Promise<void> {
  const database = await ensureMongoDb();
  if (!database) return;
  const col = database.collection<Transaction>('transactions');
  await col.replaceOne({ transactionId: tx.transactionId }, { ...tx, syncStatus: 'SYNCED' }, { upsert: true });
}

// SETTINGS
export async function mongoGetSettings(): Promise<SystemSettings | null> {
  const database = await ensureMongoDb();
  if (!database) return null;
  const col = database.collection('settings');
  const doc = await col.findOne({ key: 'app_config' });
  return doc?.value || null;
}

export async function mongoSaveSettings(settings: SystemSettings): Promise<void> {
  const database = await ensureMongoDb();
  if (!database) return;
  const col = database.collection('settings');
  await col.replaceOne(
    { key: 'app_config' },
    { key: 'app_config', value: settings, updatedAt: new Date().toISOString() },
    { upsert: true }
  );
}
