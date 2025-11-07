import { config } from '../config/env.js';
import { HttpError } from '../errors/httpError.js';
import { createLogger } from '../utils/logger.js';
import { getMongoDb, initMongo, isMongoReady } from './mongoService.js';

const logger = createLogger('analyticsService', config.logLevel);

async function ensureMongo() {
  if (isMongoReady()) {
    return true;
  }

  const ok = await initMongo();
  if (!ok) {
    throw new HttpError(503, 'MongoDB is not available for analytics');
  }

  return true;
}

function buildSinceFilter(sinceMinutes) {
  if (!sinceMinutes || !Number.isFinite(sinceMinutes) || sinceMinutes <= 0) {
    return null;
  }

  const sinceDate = new Date(Date.now() - sinceMinutes * 60_000);
  return { timestamp: { $gte: sinceDate } };
}

export async function fetchRequestSummary({ sinceMinutes = 1_440 } = {}) {
  await ensureMongo();
  const db = await getMongoDb();
  const collection = db.collection(config.mongo.requestLogCollection);

  const match = buildSinceFilter(Number(sinceMinutes));
  const pipeline = [];
  if (match) {
    pipeline.push({ $match: match });
  }

  pipeline.push({
    $facet: {
      summary: [
        {
          $group: {
            _id: null,
            totalRequests: { $sum: 1 },
            avgDurationMs: { $avg: '$durationMs' },
            maxDurationMs: { $max: '$durationMs' },
            minDurationMs: { $min: '$durationMs' },
            totalDurationMs: { $sum: '$durationMs' },
            successCount: {
              $sum: {
                $cond: [{ $lt: ['$status', 400] }, 1, 0],
              },
            },
            userIds: { $addToSet: '$userId' },
          },
        },
        {
          $project: {
            _id: 0,
            totalRequests: 1,
            avgDurationMs: { $ifNull: ['$avgDurationMs', 0] },
            maxDurationMs: { $ifNull: ['$maxDurationMs', 0] },
            minDurationMs: { $ifNull: ['$minDurationMs', 0] },
            totalDurationMs: { $ifNull: ['$totalDurationMs', 0] },
            successRate: {
              $cond: [
                { $gt: ['$totalRequests', 0] },
                { $divide: ['$successCount', '$totalRequests'] },
                0,
              ],
            },
            uniqueUsers: {
              $size: {
                $filter: {
                  input: '$userIds',
                  as: 'uid',
                  cond: {
                    $and: [
                      { $ne: ['$$uid', null] },
                      { $ne: ['$$uid', ''] },
                    ],
                  },
                },
              },
            },
          },
        },
      ],
      topRoutes: [
        {
          $group: {
            _id: { route: '$route', method: '$method' },
            hits: { $sum: 1 },
            avgDurationMs: { $avg: '$durationMs' },
            lastSeenAt: { $max: '$timestamp' },
          },
        },
        { $sort: { hits: -1 } },
        { $limit: 5 },
        {
          $project: {
            _id: 0,
            route: '$_id.route',
            method: '$_id.method',
            hits: 1,
            avgDurationMs: { $ifNull: ['$avgDurationMs', 0] },
            lastSeenAt: 1,
          },
        },
      ],
      statusBuckets: [
        {
          $group: {
            _id: {
              $switch: {
                branches: [
                  {
                    case: { $lt: ['$status', 100] },
                    then: 'unknown',
                  },
                  {
                    case: {
                      $and: [
                        { $gte: ['$status', 100] },
                        { $lt: ['$status', 200] },
                      ],
                    },
                    then: '1xx',
                  },
                  {
                    case: {
                      $and: [
                        { $gte: ['$status', 200] },
                        { $lt: ['$status', 300] },
                      ],
                    },
                    then: '2xx',
                  },
                  {
                    case: {
                      $and: [
                        { $gte: ['$status', 300] },
                        { $lt: ['$status', 400] },
                      ],
                    },
                    then: '3xx',
                  },
                  {
                    case: {
                      $and: [
                        { $gte: ['$status', 400] },
                        { $lt: ['$status', 500] },
                      ],
                    },
                    then: '4xx',
                  },
                  {
                    case: {
                      $and: [
                        { $gte: ['$status', 500] },
                        { $lt: ['$status', 600] },
                      ],
                    },
                    then: '5xx',
                  },
                ],
                default: 'other',
              },
            },
            count: { $sum: 1 },
          },
        },
        { $project: { bucket: '$_id', count: 1, _id: 0 } },
      ],
      recent: [
        { $sort: { timestamp: -1 } },
        { $limit: 10 },
        {
          $project: {
            _id: 0,
            route: 1,
            method: 1,
            status: 1,
            durationMs: 1,
            userId: 1,
            ip: 1,
            timestamp: 1,
          },
        },
      ],
    },
  });

  const [result] = await collection.aggregate(pipeline, { allowDiskUse: true }).toArray();

  const summary = result?.summary?.[0] ?? {
    totalRequests: 0,
    avgDurationMs: 0,
    maxDurationMs: 0,
    minDurationMs: 0,
    totalDurationMs: 0,
    successRate: 0,
    uniqueUsers: 0,
  };

  return {
    summary,
    topRoutes: result?.topRoutes ?? [],
    statusBuckets: result?.statusBuckets ?? [],
    recent: result?.recent ?? [],
    sinceMinutes: Number(sinceMinutes) || null,
  };
}

export async function fetchRecentRequests({ limit = 25, sinceMinutes } = {}) {
  await ensureMongo();
  const db = await getMongoDb();
  const collection = db.collection(config.mongo.requestLogCollection);

  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 200);
  const filter = buildSinceFilter(Number(sinceMinutes));

  const cursor = collection
    .find(filter ?? {})
    .sort({ timestamp: -1 })
    .limit(safeLimit);

  const items = await cursor.toArray();
  return items.map((item) => ({
    route: item.route,
    method: item.method,
    status: item.status,
    durationMs: item.durationMs,
    userId: item.userId ?? null,
    timestamp: item.timestamp,
    ip: item.ip ?? null,
    userAgent: item.userAgent ?? null,
  }));
}

export async function fetchUserLeaderboard({ page = 1, limit = 20, sort = 'requests' } = {}) {
  await ensureMongo();
  const db = await getMongoDb();
  const collection = db.collection(config.mongo.userCollection);

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const skip = (safePage - 1) * safeLimit;

  let sortStage = { requestCount: -1, lastSeenAt: -1 };
  if (sort === 'latency') {
    sortStage = { longestDurationMs: -1, lastSeenAt: -1 };
  } else if (sort === 'recent') {
    sortStage = { lastSeenAt: -1 };
  }

  const cursor = collection
    .find({})
    .sort(sortStage)
    .skip(skip)
    .limit(safeLimit);

  const [items, total] = await Promise.all([
    cursor.toArray(),
    collection.estimatedDocumentCount(),
  ]);

  const transformed = items.map((item) => ({
    userId: item.userId,
    requestCount: item.requestCount ?? 0,
    successBuckets: item.statusBuckets ?? {},
    lastSeenAt: item.lastSeenAt ?? null,
    firstSeenAt: item.firstSeenAt ?? null,
    longestDurationMs: item.longestDurationMs ?? 0,
    averageDurationMs:
      item.requestCount && item.totalDurationMs
        ? item.totalDurationMs / item.requestCount
        : 0,
    lastRoute: item.lastRoute ?? null,
    lastStatus: item.lastStatus ?? null,
  }));

  return {
    page: safePage,
    limit: safeLimit,
    total,
    results: transformed,
  };
}

export async function fetchUserDetail(userId, { limit = 20 } = {}) {
  if (!userId) {
    throw new HttpError(400, 'User ID is required');
  }

  await ensureMongo();
  const db = await getMongoDb();
  const users = db.collection(config.mongo.userCollection);
  const logs = db.collection(config.mongo.requestLogCollection);

  const user = await users.findOne({ userId });
  if (!user) {
    throw new HttpError(404, 'User not found');
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);

  const recentRequests = await logs
    .find({ userId })
    .sort({ timestamp: -1 })
    .limit(safeLimit)
    .project({
      _id: 0,
      route: 1,
      method: 1,
      status: 1,
      durationMs: 1,
      timestamp: 1,
      ip: 1,
      referer: 1,
    })
    .toArray();

  const topRoutes = await logs
    .aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: { route: '$route', method: '$method' },
          hits: { $sum: 1 },
          avgDurationMs: { $avg: '$durationMs' },
          lastSeenAt: { $max: '$timestamp' },
        },
      },
      { $sort: { hits: -1 } },
      { $limit: 5 },
      {
        $project: {
          _id: 0,
          route: '$_id.route',
          method: '$_id.method',
          hits: 1,
          avgDurationMs: { $ifNull: ['$avgDurationMs', 0] },
          lastSeenAt: 1,
        },
      },
    ])
    .toArray();

  return {
    user: {
      userId: user.userId,
      requestCount: user.requestCount ?? 0,
      statusBuckets: user.statusBuckets ?? {},
      firstSeenAt: user.firstSeenAt ?? user.createdAt ?? null,
      lastSeenAt: user.lastSeenAt ?? null,
      averageDurationMs:
        user.requestCount && user.totalDurationMs
          ? user.totalDurationMs / user.requestCount
          : 0,
      longestDurationMs: user.longestDurationMs ?? 0,
      lastRoute: user.lastRoute ?? null,
      lastStatus: user.lastStatus ?? null,
      userAgent: user.userAgent ?? null,
      ip: user.ip ?? null,
    },
    recentRequests,
    topRoutes,
  };
}

export async function purgeOldLogs({ olderThanMinutes = 7 * 24 * 60 } = {}) {
  await ensureMongo();
  const db = await getMongoDb();
  const collection = db.collection(config.mongo.requestLogCollection);

  const minutes = Number(olderThanMinutes);
  if (!minutes || minutes <= 0) {
    return { deletedCount: 0 };
  }

  const cutoff = new Date(Date.now() - minutes * 60_000);

  const result = await collection.deleteMany({ timestamp: { $lt: cutoff } });
  logger.info('Purged old request logs', {
    deletedCount: result.deletedCount,
    cutoff,
  });

  return { deletedCount: result.deletedCount };
}
