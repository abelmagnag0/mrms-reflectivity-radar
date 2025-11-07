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

export async function getTile(_req, res) {
  const buffer = await getLatestTile();
  res.setHeader('Content-Type', 'image/png');
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
