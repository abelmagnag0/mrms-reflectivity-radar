import {
  getLatestGridBinary,
  getLatestGridMetadata,
  getLatestMetadata,
  getLatestTile,
} from '../services/radarService.js';

export async function getLatest(_req, res) {
  const metadata = await getLatestMetadata();
  res.json(metadata);
}

export async function getTile(req, res) {
  const [buffer, metadata] = await Promise.all([
    getLatestTile(),
    getLatestMetadata(),
  ]);

  const timestamp = metadata?.timestamp ? new Date(metadata.timestamp) : null;
  const etag = `W/"tile-${metadata?.timestamp || 'unknown'}-${buffer.length}"`;

  // Normalize ETag header value (curl example shows missing quotes due to incorrect escaping)
  const ifNoneMatch = req.headers['if-none-match'];
  if (ifNoneMatch && ifNoneMatch.replace(/\\"/g, '"') === etag) {
    res.status(304).end();
    return;
  }

  res.setHeader('Content-Type', 'image/png');
  if (timestamp) {
    res.setHeader('Last-Modified', timestamp.toUTCString());
  }
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'public, max-age=60, must-revalidate, stale-while-revalidate=60');
  res.send(buffer);
}

export async function getGrid(_req, res) {
  const grid = await getLatestGridMetadata();
  res.json(grid);
}

export async function getGridBinary(_req, res) {
  const buffer = await getLatestGridBinary();
  res.setHeader('Content-Type', 'application/octet-stream');
  res.send(buffer);
}
