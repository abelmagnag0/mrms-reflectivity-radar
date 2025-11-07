import { MongoClient } from 'mongodb';

import { config } from '../config/env.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('mongoService', config.logLevel);

let clientInstance = null;
let dbInstance = null;
let initPromise = null;
let flushPromise = null;
let mongoEnabled = false;
let lastInitAttempt = 0;

const INIT_RETRY_INTERVAL_MS = 30_000;
const MAX_BUFFER_SIZE = 100;
const FLUSH_INTERVAL_MS = 2_000;
const MAX_REQUEUE_SIZE = 1_000;

const logBuffer = [];
let flushTimer = null;

function buildClientOptions() {
  return {
    appName: 'mrms-radar-backend',
    serverSelectionTimeoutMS: 5_000,
  };
}

async function connectClient() {
  if (dbInstance) {
    return dbInstance;
  }

  if (!initPromise) {
    initPromise = (async () => {
      try {
        clientInstance = new MongoClient(config.mongo.uri, buildClientOptions());
        await clientInstance.connect();
        dbInstance = clientInstance.db(config.mongo.dbName);
        mongoEnabled = true;
        logger.info('Connected to MongoDB', {
          uri: config.mongo.uri,
          db: config.mongo.dbName,
        });

        await ensureIndexes(dbInstance);
      } catch (error) {
        logger.error('Failed to initialise MongoDB connection', {
          message: error.message,
        });
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
    logger.warn('Failed to ensure MongoDB indexes', {
      message: error.message,
    });
  }
}

export async function initMongo() {
  try {
    if (mongoEnabled) {
      return true;
    }

    const now = Date.now();
    if (now - lastInitAttempt < INIT_RETRY_INTERVAL_MS && initPromise === null) {
      return false;
    }

    lastInitAttempt = now;
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

function scheduleFlush(immediate = false) {
  if (flushTimer) {
    return;
  }

  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushLogBuffer().catch((error) => {
      logger.warn('Scheduled log flush failed', {
        message: error.message,
      });
    });
  }, immediate ? 0 : FLUSH_INTERVAL_MS);

  if (typeof flushTimer.unref === 'function') {
    flushTimer.unref();
  }
}

function getStatusBucket(statusCode) {
  if (!Number.isFinite(statusCode)) {
    return 'unknown';
  }

  const hundred = Math.floor(statusCode / 100);
  if (hundred >= 1 && hundred <= 5) {
    return `${hundred}xx`;
  }

  return 'other';
}

function aggregateUserEntries(entries) {
  const aggregates = new Map();

  for (const entry of entries) {
    if (!entry.userId) {
      continue;
    }

    const existing = aggregates.get(entry.userId);
    const duration = Number(entry.durationMs) || 0;
    const timestamp = entry.timestamp instanceof Date ? entry.timestamp : new Date(entry.timestamp ?? Date.now());

    if (!existing) {
      aggregates.set(entry.userId, {
        userId: entry.userId,
        requestCount: 1,
        totalDurationMs: duration,
        firstSeenAt: timestamp,
        lastSeenAt: timestamp,
        lastRoute: entry.route,
        lastStatus: entry.status,
        userAgent: entry.userAgent,
        ip: entry.ip,
        longestDurationMs: duration,
        statusBuckets: {
          [getStatusBucket(entry.status)]: 1,
        },
      });
      continue;
    }

    existing.requestCount += 1;
    existing.totalDurationMs += duration;

    if (timestamp < existing.firstSeenAt) {
      existing.firstSeenAt = timestamp;
    }

    if (timestamp > existing.lastSeenAt) {
      existing.lastSeenAt = timestamp;
      existing.lastRoute = entry.route;
      existing.lastStatus = entry.status;
      existing.userAgent = entry.userAgent;
      existing.ip = entry.ip;
    }

    if (duration > existing.longestDurationMs) {
      existing.longestDurationMs = duration;
    }

    const bucket = getStatusBucket(entry.status);
    existing.statusBuckets[bucket] = (existing.statusBuckets[bucket] ?? 0) + 1;
  }

  return [...aggregates.values()];
}

async function applyUserAggregates(db, entries) {
  const aggregates = aggregateUserEntries(entries);
  if (aggregates.length === 0) {
    return;
  }

  const bulkOps = aggregates.map((aggregate) => {
    const inc = {
      requestCount: aggregate.requestCount,
      totalDurationMs: aggregate.totalDurationMs,
    };

    for (const [bucket, count] of Object.entries(aggregate.statusBuckets)) {
      if (count > 0) {
        inc[`statusBuckets.${bucket}`] = count;
      }
    }

    return {
      updateOne: {
        filter: { userId: aggregate.userId },
        update: {
          $set: {
            userId: aggregate.userId,
            lastSeenAt: aggregate.lastSeenAt,
            lastRoute: aggregate.lastRoute,
            lastStatus: aggregate.lastStatus,
            userAgent: aggregate.userAgent,
            ip: aggregate.ip,
          },
          $setOnInsert: {
            createdAt: aggregate.firstSeenAt,
            firstSeenAt: aggregate.firstSeenAt,
          },
          $min: {
            firstSeenAt: aggregate.firstSeenAt,
          },
          $max: {
            longestDurationMs: aggregate.longestDurationMs,
          },
          $inc: inc,
        },
        upsert: true,
      },
    };
  });

  try {
    await db.collection(config.mongo.userCollection).bulkWrite(bulkOps, { ordered: false });
  } catch (error) {
    logger.warn('Failed to update user aggregates', {
      message: error.message,
    });
  }
}

async function flushBufferInternal(entries) {
  if (entries.length === 0) {
    return;
  }

  const db = await connectClient();
  const collection = db.collection(config.mongo.requestLogCollection);

  await collection.insertMany(entries, { ordered: false });
  await applyUserAggregates(db, entries);
}

export async function flushLogBuffer({ force = false } = {}) {
  if (!force && logBuffer.length === 0) {
    return;
  }

  if (flushPromise) {
    return flushPromise;
  }

  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  const entries = logBuffer.splice(0, logBuffer.length);
  if (entries.length === 0) {
    return;
  }

  flushPromise = (async () => {
    try {
      await flushBufferInternal(entries);
    } catch (error) {
      logger.warn('Failed to flush MongoDB request log buffer', {
        message: error.message,
        count: entries.length,
      });

      const spaceLeft = Math.max(0, MAX_REQUEUE_SIZE - logBuffer.length);
      if (spaceLeft > 0) {
        logBuffer.unshift(...entries.slice(0, spaceLeft));
      }

      if (logBuffer.length > 0) {
        scheduleFlush(true);
      }
    } finally {
      flushPromise = null;
    }
  })();

  return flushPromise;
}

export function getLogBufferSize() {
  return logBuffer.length;
}

export async function logRequestEvent(entry) {
  try {
    if (!mongoEnabled) {
      const initialised = await initMongo();
      if (!initialised) {
        return;
      }
    }

    const document = sanitiseLogEntry(entry);
    logBuffer.push(document);

    if (logBuffer.length >= MAX_BUFFER_SIZE) {
      flushLogBuffer().catch((error) => {
        logger.warn('Immediate log flush failed', {
          message: error.message,
        });
      });
    } else {
      scheduleFlush();
    }
  } catch (error) {
    logger.warn('Failed to queue request log entry', {
      message: error.message,
    });
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

export async function closeMongo() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  try {
    await flushLogBuffer({ force: true });
  } catch (error) {
    logger.warn('Failed to flush logs during shutdown', {
      message: error.message,
    });
  }

  if (clientInstance) {
    try {
      await clientInstance.close();
    } catch (error) {
      logger.warn('Failed to close MongoDB client', {
        message: error.message,
      });
    } finally {
      clientInstance = null;
      dbInstance = null;
      initPromise = null;
      flushPromise = null;
      mongoEnabled = false;
      lastInitAttempt = 0;
    }
  }
}
