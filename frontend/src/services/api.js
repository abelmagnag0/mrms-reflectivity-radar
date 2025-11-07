import axios from 'axios';

const client = axios.create({
  baseURL: '/api',
  timeout: 60000, // MRMS endpoints can be slow to respond on first load
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
