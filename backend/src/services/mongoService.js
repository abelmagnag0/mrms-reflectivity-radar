import { MongoClient } from 'mongodb';

import { config } from '../config/env.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('mongoService', config.logLevel);

let clientInstance = null;
let dbInstance = null;
let initPromise = null;
let mongoEnabled = false;

function buildClientOptions() {
  return {
    appName: 'mrms-radar-backend',
    serverSelectionTimeoutMS: 5_000,
  };
}

async function connectClient() {
  if (dbInstance) return dbInstance;

  if (!initPromise) {
    initPromise = (async () => {
      try {
        clientInstance = new MongoClient(config.mongo.uri, buildClientOptions());
        await clientInstance.connect();
        dbInstance = clientInstance.db(config.mongo.dbName);
        await ensureIndexes(dbInstance);
        mongoEnabled = true;
        logger.info('Connected to MongoDB', { uri: config.mongo.uri, db: config.mongo.dbName });
      } catch (error) {
        logger.error('Failed to initialise MongoDB connection', { message: error.message });
        throw error;
      }
    })();
  }

  try {
    await initPromise;
  } catch (error) {
    initPromise = null;
    mongoEnabled = false;
    throw error;
  }

  return dbInstance;
}

async function ensureIndexes(db) {
  try {
    const requestLogs = db.collection(config.mongo.requestLogCollection);
    await requestLogs.createIndex({ timestamp: -1 }, { name: 'requestLogs_timestamp_desc' });
    await requestLogs.createIndex({ userId: 1, timestamp: -1 }, { name: 'requestLogs_userId_timestamp' });
    await requestLogs.createIndex({ route: 1, method: 1, timestamp: -1 }, { name: 'requestLogs_route_method_timestamp' });

    const users = db.collection(config.mongo.userCollection);
    await users.createIndex({ userId: 1 }, { name: 'users_userId_unique', unique: true, sparse: true });
    await users.createIndex({ lastSeenAt: -1 }, { name: 'users_lastSeenAt_desc' });
    await users.createIndex({ requestCount: -1 }, { name: 'users_requestCount_desc' });
  } catch (error) {
    logger.warn('Failed to ensure MongoDB indexes', { message: error.message });
  }
}

export async function initMongo() {
  try {
    if (mongoEnabled) return true;
    await connectClient();
    return true;
  } catch {
    mongoEnabled = false;
    return false;
  }
}

function sanitiseLogEntry(entry) {
  const timestampValue = entry?.timestamp instanceof Date ? entry.timestamp : new Date(entry?.timestamp ?? Date.now());
  const route = typeof entry?.route === 'string' ? entry.route : String(entry?.route ?? '/');
  const duration = Number(entry?.durationMs);
  const status = Number(entry?.status);

  const doc = {
    route,
    method: typeof entry?.method === 'string' ? entry.method.toUpperCase() : 'GET',
    status: Number.isFinite(status) ? status : 0,
    durationMs: Number.isFinite(duration) && duration >= 0 ? duration : null,
    ip: entry?.ip ?? null,
    userAgent: entry?.userAgent ?? null,
    referer: entry?.referer ?? null,
    userId: typeof entry?.userId === 'string' && entry.userId.trim() ? entry.userId.trim() : null,
    timestamp: timestampValue,
  };

  if (entry?.metadata && typeof entry.metadata === 'object') {
    doc.metadata = entry.metadata;
  }

  return doc;
}

function getStatusBucket(statusCode) {
  if (!Number.isFinite(statusCode)) return 'unknown';
  const hundred = Math.floor(statusCode / 100);
  if (hundred >= 1 && hundred <= 5) return `${hundred}xx`;
  return 'other';
}

async function updateUserAggregate(db, entry) {
  if (!entry.userId) return;

  const duration = Number(entry.durationMs) || 0;
  const bucket = getStatusBucket(entry.status);
  const timestamp = entry.timestamp instanceof Date ? entry.timestamp : new Date(entry.timestamp ?? Date.now());

  const inc = {
    requestCount: 1,
    totalDurationMs: duration,
    [`statusBuckets.${bucket}`]: 1,
  };

  try {
    await db.collection(config.mongo.userCollection).updateOne(
      { userId: entry.userId },
      {
        $set: {
          userId: entry.userId,
          lastSeenAt: timestamp,
          lastRoute: entry.route,
          lastStatus: entry.status,
          userAgent: entry.userAgent,
          ip: entry.ip,
        },
        $setOnInsert: {
          createdAt: timestamp,
          firstSeenAt: timestamp,
        },
        $min: { firstSeenAt: timestamp },
        $max: { longestDurationMs: duration },
        $inc: inc,
      },
      { upsert: true },
    );
  } catch (error) {
    logger.warn('Failed to update user aggregate', { message: error.message });
  }
}

export async function logRequestEvent(entry) {
  try {
    if (!mongoEnabled) {
      const ok = await initMongo();
      if (!ok) return;
    }

    const db = await connectClient();
    const document = sanitiseLogEntry(entry);
    await db.collection(config.mongo.requestLogCollection).insertOne(document);
    await updateUserAggregate(db, document);
  } catch (error) {
    logger.warn('Failed to write request log', { message: error.message });
  }
}

export function isMongoReady() {
  return mongoEnabled;
}

export async function getMongoDb() {
  if (!mongoEnabled) {
    await initMongo();
  }
  return connectClient();
}

export async function flushLogBuffer() {
  return;
}

export function getLogBufferSize() {
  return 0;
}

export async function closeMongo() {
  if (clientInstance) {
    try {
      await clientInstance.close();
    } catch (error) {
      logger.warn('Failed to close MongoDB client', { message: error.message });
    } finally {
      clientInstance = null;
      dbInstance = null;
      initPromise = null;
      mongoEnabled = false;
    }
  }
}
