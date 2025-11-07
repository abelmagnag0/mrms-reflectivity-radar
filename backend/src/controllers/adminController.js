
import { HttpError } from '../errors/httpError.js';
import {
  fetchRecentRequests,
  fetchRequestSummary,
  fetchUserDetail,
  fetchUserLeaderboard,
  purgeOldLogs,
} from '../services/analyticsService.js';

export async function getRequestMetrics(req, res) {
  const sinceMinutes = req.query.sinceMinutes ? Number(req.query.sinceMinutes) : undefined;
  const data = await fetchRequestSummary({ sinceMinutes });
  res.json(data);
}

export async function getRecentRequestLogs(req, res) {
  const sinceMinutes = req.query.sinceMinutes ? Number(req.query.sinceMinutes) : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  const data = await fetchRecentRequests({ limit, sinceMinutes });
  res.json({ results: data });
}

export async function getUsersLeaderboard(req, res) {
  const page = req.query.page ? Number(req.query.page) : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  const sort = typeof req.query.sort === 'string' ? req.query.sort : undefined;
  const data = await fetchUserLeaderboard({ page, limit, sort });
  res.json(data);
}

export async function getUserInsight(req, res) {
  const { userId } = req.params;
  if (!userId) {
    throw new HttpError(400, 'User ID is required');
  }

  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  const data = await fetchUserDetail(userId, { limit });
  res.json(data);
}

export async function deleteOldRequestLogs(req, res) {
  const olderThanMinutes = req.query.olderThanMinutes ? Number(req.query.olderThanMinutes) : undefined;
  const result = await purgeOldLogs({ olderThanMinutes });
  res.json(result);
}
