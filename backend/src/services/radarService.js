import { Buffer } from 'node:buffer';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { config } from '../config/env.js';
import { HttpError } from '../errors/httpError.js';
import { createLogger } from '../utils/logger.js';
import { getCache, setCache } from './cacheService.js';
import { buildGridPayload } from './gridService.js';
import { downloadProductArtifact, fetchLatestProductMetadata } from './mrmsService.js';
import { generateOverlayPng } from './rasterService.js';

const logger = createLogger('radarService', config.logLevel);

const CACHE_KEY_METADATA = 'radar:latest:metadata';
const CACHE_KEY_TILE = 'radar:latest:tile';
const CACHE_KEY_GRID = 'radar:latest:grid';

let buildInFlight = null;
let lastSuccessfulBuildTs = 0;
const MIN_REFRESH_INTERVAL_MS = 15000;

const persistentCacheDir = (() => {
  const raw = config.cachePersistDir?.trim();
  if (!raw) {
    return path.joi
    n(os.tmpdir(), 'radar-cache');
  }

  if (raw.toLowerCase() === 'disabled') {
    return null;
  }

  return raw;
})();

const PERSIST_METADATA_FILE = 'radar-metadata.json';
const PERSIST_GRID_FILE = 'radar-grid.json';
const PERSIST_TILE_FILE = 'radar-tile.png';

function buildGridMetadataResponse(gridPayload) {
  return {
    bounds: gridPayload.bounds,
    rows: gridPayload.rows,
    cols: gridPayload.cols,
    latStep: gridPayload.latStep,
    lonStep: gridPayload.lonStep,
    origin: gridPayload.origin,
    minValue: gridPayload.minValue,
    maxValue: gridPayload.maxValue,
    timestamp: gridPayload.timestamp,
    dataEncoding: gridPayload.dataEncoding,
    dataUrl: '/api/radar/grid.bin',
  };
}

export async function getLatestMetadata() {
  return ensureLatestArtifact();
}

export async function getLatestTile() {
  const cached = getCache(CACHE_KEY_TILE);
  if (cached) {
    return cached;
  }

  await ensureLatestArtifact();
  const tileBuffer = getCache(CACHE_KEY_TILE);

  if (!tileBuffer) {
    throw new HttpError(503, 'Radar tile not ready');
  }

  return tileBuffer;
}

export async function getLatestGridMetadata() {
  const cached = getCache(CACHE_KEY_GRID);
  if (cached) {
    return buildGridMetadataResponse(cached);
  }

  await ensureLatestArtifact();
  const grid = getCache(CACHE_KEY_GRID);

  if (!grid) {
    throw new HttpError(503, 'Radar grid not ready');
  }

  return buildGridMetadataResponse(grid);
}

export async function getLatestGridBinary() {
  const cached = getCache(CACHE_KEY_GRID);
  if (cached?.data) {
    return cached.data;
  }

  await ensureLatestArtifact();
  const grid = getCache(CACHE_KEY_GRID);

  if (!grid?.data) {
    throw new HttpError(503, 'Radar grid not ready');
  }

  return grid.data;
}

async function performLatestArtifactBuild() {
  logger.info('Building radar artifact for latest MRMS product');

  try {
    const baseMetadata = await fetchLatestProductMetadata();
    if (!baseMetadata) {
      throw new HttpError(503, 'Unable to locate latest MRMS product');
    }

    const artifact = await downloadProductArtifact(baseMetadata);
    if (!artifact) {
      throw new HttpError(503, 'Unable to download MRMS product artifact');
    }

    const gridPayload = await buildGridPayload(artifact);
    const pngBuffer = await generateOverlayPng(gridPayload);
    const gridMetadata = buildGridMetadataResponse(gridPayload);

    const metadataResponse = {
      timestamp: gridPayload.timestamp || baseMetadata.timestamp,
      bounds: gridMetadata.bounds,
      rows: gridMetadata.rows,
      cols: gridMetadata.cols,
      latStep: gridMetadata.latStep,
      lonStep: gridMetadata.lonStep,
      origin: gridMetadata.origin,
      minValue: gridMetadata.minValue,
      maxValue: gridMetadata.maxValue,
      dataEncoding: gridMetadata.dataEncoding,
      imageUrl: '/api/radar/tile.png',
      gridUrl: '/api/radar/grid.json',
      gridDataUrl: gridMetadata.dataUrl,
    };

    setCache(CACHE_KEY_METADATA, metadataResponse, config.cacheTtlMs);
    setCache(CACHE_KEY_TILE, pngBuffer, config.cacheTtlMs);
    setCache(CACHE_KEY_GRID, gridPayload, config.cacheTtlMs);

    persistArtifacts(metadataResponse, gridPayload, pngBuffer).catch((error) => {
      logger.warn('Failed to persist radar artifacts', {
        message: error.message,
      });
    });

    return metadataResponse;
  } catch (error) {
    logger.error('Failed to build radar artifact', error);

    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError(503, 'Radar data pipeline is not ready', {
      cause: error.message,
    });
  }
}

function serialiseGridPayloadForPersistence(gridPayload) {
  if (!gridPayload) {
    return null;
  }

  const { data, ...rest } = gridPayload;
  return {
    ...rest,
    data: Buffer.isBuffer(data) ? data.toString('base64') : null,
  };
}

function deserialiseGridPayloadFromPersistence(serialised) {
  if (!serialised) {
    return null;
  }

  const { data, ...rest } = serialised;
  return {
    ...rest,
    data: data ? Buffer.from(data, 'base64') : null,
  };
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function persistArtifacts(metadata, gridPayload, tileBuffer) {
  if (!persistentCacheDir) {
    return;
  }

  try {
    await fs.mkdir(persistentCacheDir, { recursive: true });

    const metadataPath = path.join(persistentCacheDir, PERSIST_METADATA_FILE);
    const gridPath = path.join(persistentCacheDir, PERSIST_GRID_FILE);
    const tilePath = path.join(persistentCacheDir, PERSIST_TILE_FILE);

    const serialisedGrid = serialiseGridPayloadForPersistence(gridPayload);

    await Promise.all([
      fs.writeFile(metadataPath, JSON.stringify(metadata)),
      serialisedGrid ? fs.writeFile(gridPath, JSON.stringify(serialisedGrid)) : Promise.resolve(),
      tileBuffer ? fs.writeFile(tilePath, tileBuffer) : Promise.resolve(),
    ]);
  } catch (error) {
    logger.warn('Unable to persist radar artifacts to disk', {
      message: error.message,
    });
  }
}

export async function hydrateCacheFromPersistence() {
  if (!persistentCacheDir) {
    return false;
  }

  try {
    const metadataPath = path.join(persistentCacheDir, PERSIST_METADATA_FILE);
    const gridPath = path.join(persistentCacheDir, PERSIST_GRID_FILE);
    const tilePath = path.join(persistentCacheDir, PERSIST_TILE_FILE);

    const exists = await Promise.all([
      fileExists(metadataPath),
      fileExists(gridPath),
      fileExists(tilePath),
    ]);

    if (exists.some((available) => !available)) {
      return false;
    }

    const [metadataRaw, gridRaw, tileBuffer] = await Promise.all([
      fs.readFile(metadataPath, 'utf8'),
      fs.readFile(gridPath, 'utf8'),
      fs.readFile(tilePath),
    ]);

    const metadata = JSON.parse(metadataRaw);
    const gridSerialised = JSON.parse(gridRaw);
    const gridPayload = deserialiseGridPayloadFromPersistence(gridSerialised);

    const timestampMs = metadata?.timestamp ? Date.parse(metadata.timestamp) : Number.NaN;
    if (Number.isFinite(timestampMs)) {
      const ageMinutes = (Date.now() - timestampMs) / (1000 * 60);
      if (ageMinutes > config.mrms.maxDataAgeMinutes) {
        logger.warn('Persisted radar artifact skipped due to age', {
          timestamp: metadata.timestamp,
          ageMinutes,
        });
        return false;
      }
      lastSuccessfulBuildTs = timestampMs;
    } else {
      lastSuccessfulBuildTs = Date.now();
    }

    setCache(CACHE_KEY_METADATA, metadata, config.cacheTtlMs);
    if (gridPayload) {
      setCache(CACHE_KEY_GRID, gridPayload, config.cacheTtlMs);
    }
    if (tileBuffer) {
      setCache(CACHE_KEY_TILE, tileBuffer, config.cacheTtlMs);
    }

    logger.info('Hydrated radar cache from persisted artifacts', {
      timestamp: metadata?.timestamp,
    });

    return true;
  } catch (error) {
    logger.warn('Failed to hydrate radar cache from disk', {
      message: error.message,
    });
    return false;
  }
}

async function ensureLatestArtifact({ force = false } = {}) {
  const cached = getCache(CACHE_KEY_METADATA);
  if (cached && !force) {
    return cached;
  }

  if (!buildInFlight) {
    buildInFlight = (async () => {
      try {
        const metadata = await performLatestArtifactBuild();
        lastSuccessfulBuildTs = Date.now();
        return metadata;
      } finally {
        buildInFlight = null;
      }
    })();
  }

  return buildInFlight;
}

function getRefreshIntervalMs() {
  const interval = Number.isFinite(config.refreshIntervalMs) ? config.refreshIntervalMs : 0;
  if (interval <= 0) {
    return 0;
  }

  return Math.max(interval, MIN_REFRESH_INTERVAL_MS);
}

export function warmLatestArtifactInBackground() {
  ensureLatestArtifact().catch((error) => {
    logger.warn('Background radar warmup failed', {
      message: error.message,
    });
  });
}

export async function warmLatestArtifact() {
  return ensureLatestArtifact();
}

export function scheduleLatestArtifactRefresh() {
  const intervalMs = getRefreshIntervalMs();
  if (!intervalMs) {
    return () => {};
  }

  const timer = setInterval(() => {
    const age = Date.now() - lastSuccessfulBuildTs;
    const shouldForce = !lastSuccessfulBuildTs || age >= intervalMs;

    if (!shouldForce) {
      return;
    }

    ensureLatestArtifact({ force: true }).catch((error) => {
      logger.warn('Periodic radar refresh failed', {
        message: error.message,
      });
    });
  }, intervalMs);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  return () => clearInterval(timer);
}
