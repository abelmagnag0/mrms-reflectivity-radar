import { useEffect, useState } from 'react';

import { fetchLatestRadar, fetchRadarGridBinary, fetchRadarGridMetadata } from '../services/api.js';

const NO_DATA_DBZ_THRESHOLD = -90; // MRMS flag for no coverage is -99 dBZ; anything below this is considered missing

function normaliseEncoding(encoding = {}) {
  const scale = Number.isFinite(Number(encoding.scale)) ? Number(encoding.scale) : 1;
  const offset = Number.isFinite(Number(encoding.offset)) ? Number(encoding.offset) : 0;
  const missing = Number.isFinite(Number(encoding.missing)) ? Number(encoding.missing) : -32768;

  return {
    format: encoding.format || 'int16',
    scale,
    offset,
    missing,
    description: encoding.description,
  };
}

function toArrayBuffer(binary) {
  if (binary instanceof ArrayBuffer) {
    return binary;
  }

  if (ArrayBuffer.isView(binary)) {
    return binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);
  }

  if (binary?.buffer instanceof ArrayBuffer) {
    return binary.buffer.slice(
      binary.byteOffset ?? 0,
      (binary.byteOffset ?? 0) + (binary.byteLength ?? binary.buffer.byteLength)
    );
  }

  throw new TypeError('Unsupported binary grid payload');
}

function buildGrid(metadata, binaryData) {
  const encoding = normaliseEncoding(metadata.dataEncoding);
  const arrayBuffer = toArrayBuffer(binaryData);
  const raw = new Int16Array(arrayBuffer);

  const [rawSouth, rawWest, rawNorth, rawEast] = metadata.bounds;
  const south = Math.min(rawSouth, rawNorth);
  const north = Math.max(rawSouth, rawNorth);
  const west = Math.min(rawWest, rawEast);
  const east = Math.max(rawWest, rawEast);

  const rows = Number(metadata.rows);
  const cols = Number(metadata.cols);
  const latStepSize = Math.abs(Number(metadata.latStep)) || 0;
  const lonStepSize = Math.abs(Number(metadata.lonStep)) || 0;
  const latHalfStep = latStepSize / 2;
  const lonHalfStep = lonStepSize / 2;

  let computedMin = Infinity;
  let computedMax = -Infinity;

  const decodeRaw = (rawValue) => {
    if (rawValue === encoding.missing) {
      return null;
    }

    const value = rawValue * encoding.scale + encoding.offset;

    if (!Number.isFinite(value)) {
      return null;
    }

    if (value <= NO_DATA_DBZ_THRESHOLD) {
      return null;
    }

    return value;
  };

  for (let i = 0; i < raw.length; i += 1) {
    const candidate = decodeRaw(raw[i]);

    if (candidate === null) {
      continue;
    }

    if (candidate < computedMin) {
      computedMin = candidate;
    }

    if (candidate > computedMax) {
      computedMax = candidate;
    }
  }

  const grid = {
    rows,
    cols,
    bounds: { south, west, north, east },
    latStep: latStepSize,
    lonStep: lonStepSize,
    latHalfStep,
    lonHalfStep,
    origin: metadata.origin,
    encoding,
    raw,
    decodeRaw,
    stats:
      computedMin === Infinity || computedMax === -Infinity
        ? null
        : {
            min: computedMin,
            max: computedMax,
          },
    getValueAt(lat, lon) {
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        latStepSize === 0 ||
        lonStepSize === 0 ||
        lat < south - latHalfStep ||
        lat > north + latHalfStep ||
        lon < west - lonHalfStep ||
        lon > east + lonHalfStep
      ) {
        return null;
      }

      const rowFloat = (north - lat) / latStepSize;
      const colFloat = (lon - west) / lonStepSize;

      if (rowFloat < -0.5 || rowFloat > rows - 0.5 || colFloat < -0.5 || colFloat > cols - 0.5) {
        return null;
      }

      const rowIndex = Math.round(rowFloat);
      const colIndex = Math.round(colFloat);

      if (rowIndex < 0 || rowIndex >= rows || colIndex < 0 || colIndex >= cols) {
        return null;
      }

      const index = rowIndex * cols + colIndex;
      const rawValue = raw[index];
      const value = decodeRaw(rawValue);

      if (value === null || Number.isNaN(value)) {
        return null;
      }

      return value;
    },
  };

  return grid;
}

function trimMetadata(latest) {
  return {
    timestamp: latest.timestamp,
    bounds: latest.bounds,
    rows: latest.rows,
    cols: latest.cols,
    latStep: latest.latStep,
    lonStep: latest.lonStep,
    origin: latest.origin,
    minValue: latest.minValue,
    maxValue: latest.maxValue,
    imageUrl: latest.imageUrl,
    gridUrl: latest.gridUrl,
    gridDataUrl: latest.gridDataUrl,
    dataEncoding: latest.dataEncoding,
  };
}

export function useRadarData() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadLatestRadar() {
      setStatus('loading');
      setError(null);

      try {
        const latest = await fetchLatestRadar();
        if (cancelled) {
          return;
        }

        let metadataSource = latest;
        let gridDataUrl = latest.gridDataUrl;

        if (!gridDataUrl && latest.gridUrl) {
          const gridMeta = await fetchRadarGridMetadata(latest.gridUrl);
          if (cancelled) {
            return;
          }

          gridDataUrl = gridMeta.dataUrl;
          metadataSource = {
            ...metadataSource,
            ...gridMeta,
            dataEncoding: gridMeta.dataEncoding || metadataSource.dataEncoding,
            gridDataUrl: gridMeta.dataUrl || metadataSource.gridDataUrl,
          };
        }

        if (!gridDataUrl) {
          throw new Error('Binary grid endpoint not found');
        }

        const arrayBuffer = await fetchRadarGridBinary(gridDataUrl);
        if (cancelled) {
          return;
        }

        const metadata = trimMetadata(metadataSource);
        const grid = buildGrid(metadata, arrayBuffer);

        const metadataMin = Number(metadata.minValue);
        const metadataMax = Number(metadata.maxValue);
        const sanitisedMetadata = {
          ...metadata,
          minValue:
            grid.stats?.min ??
            (Number.isFinite(metadataMin) && metadataMin > NO_DATA_DBZ_THRESHOLD ? metadataMin : null),
          maxValue:
            grid.stats?.max ?? (Number.isFinite(metadataMax) ? metadataMax : null),
        };

        setData({ metadata: sanitisedMetadata, grid });
        setStatus('success');
      } catch (err) {
        if (cancelled) {
          return;
        }
        setError(err);
        setStatus('error');
      }
    }

    loadLatestRadar();

    return () => {
      cancelled = true;
    };
  }, []);

  return { data, status, error };
}
