import axios from 'axios';

export const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

const client = axios.create({
  baseURL: API_BASE,
  timeout: 60000,
});

export async function fetchLatestRadar() {
  const { data } = await client.get('/radar/latest');
  return data;
}

export async function fetchRadarGridMetadata(gridUrl) {
  const path = sanitisePath(gridUrl ?? '/radar/grid.json');
  const { data } = await client.get(path);
  return data;
}

export async function fetchRadarGridBinary(gridDataUrl) {
  const path = sanitisePath(gridDataUrl ?? '/radar/grid.bin');
  const { data } = await client.get(path, { responseType: 'arraybuffer' });
  return data;
}

export async function fetchRequestMetrics(params = {}) {
  const query = sanitiseParams(params);
  const { data } = await client.get('/admin/metrics', { params: query });
  return data;
}

export async function fetchRecentRequestLogs(params = {}) {
  const query = sanitiseParams(params);
  const { data } = await client.get('/admin/logs', { params: query });
  return data;
}

export async function fetchUserLeaderboard(params = {}) {
  const query = sanitiseParams(params);
  const { data } = await client.get('/admin/users', { params: query });
  return data;
}

function sanitisePath(path) {
  if (!path) {
    return path;
  }

  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  if (path.startsWith('/api/')) {
    return path.slice(4);
  }

  if (!path.startsWith('/')) {
    return `/${path}`;
  }

  return path;
}

function sanitiseParams(params) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
}

// Resolve any backend-provided URL (absolute or relative) into a full URL against the API base.
export function resolveApiUrl(path) {
  if (!path) return path;
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const cleaned = sanitisePath(path);
  // Ensure API_BASE ends without trailing slash and cleaned starts with '/'
  const base = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE;
  const suffix = cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
  return `${base}${suffix}`;
}
