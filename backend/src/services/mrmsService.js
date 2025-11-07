import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { basename, dirname } from 'node:path';
import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';

import { config } from '../config/env.js';
import { HttpError } from '../errors/httpError.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('mrmsService', config.logLevel);

const BUCKET = config.mrms.bucket;

function createUnsignedS3Client() {
  const client = new S3Client({ region: config.mrms.awsRegion });

  try {
    client.middlewareStack.remove('awsAuthMiddleware');
    return client;
  } catch (error) {
    logger.warn('Failed to disable request signing; falling back to default credentials chain', {
      message: error.message,
    });
    return new S3Client({ region: config.mrms.awsRegion });
  }
}

const s3Client = createUnsignedS3Client();
const gunzipAsync = promisify(gunzip);

export async function fetchLatestProductMetadata() {
  const prefixes = buildCandidatePrefixes();

  let latestObject = null;

  const concurrency = 5;

  for (let index = 0; index < prefixes.length; index += concurrency) {
    const batch = prefixes.slice(index, index + concurrency);

    const results = await Promise.all(
      batch.map(async (prefix) => {
        const newest = await findMostRecentObject(prefix);
        return newest ? { prefix, object: newest } : null;
      })
    );

    let freshCandidate = null;

    for (const result of results) {
      if (!result) {
        continue;
      }

      const candidate = { ...result.object, prefix: result.prefix };

      if (!latestObject || candidate.LastModified > latestObject.LastModified) {
        latestObject = candidate;
      }

      const candidateAgeMinutes = (Date.now() - candidate.LastModified.getTime()) / (1000 * 60);

      if (
        candidateAgeMinutes <= config.mrms.maxDataAgeMinutes / 4 &&
        (!freshCandidate || candidate.LastModified > freshCandidate.LastModified)
      ) {
        freshCandidate = candidate;
      }
    }

    if (freshCandidate) {
      logger.debug('Accepting MRMS object early based on freshness', {
        prefix: freshCandidate.prefix,
        key: freshCandidate.Key,
        candidateAgeMinutes: (Date.now() - freshCandidate.LastModified.getTime()) / (1000 * 60),
      });
      latestObject = freshCandidate;
      break;
    }
  }

  if (!latestObject) {
    logger.warn('No MRMS objects found with prefixes', prefixes);
    return null;
  }

  const timestamp = extractTimestamp(latestObject.Key) || latestObject.LastModified.toISOString();

  const objectAgeMinutes = (Date.now() - latestObject.LastModified.getTime()) / (1000 * 60);
  if (objectAgeMinutes > config.mrms.maxDataAgeMinutes) {
    logger.warn('Latest MRMS object is older than max allowed age', {
      key: latestObject.Key,
      objectAgeMinutes,
    });
    throw new HttpError(503, 'Latest MRMS product is too old');
  }

  return {
    bucket: BUCKET,
    key: latestObject.Key,
    size: latestObject.Size,
    lastModified: latestObject.LastModified,
    timestamp,
  };
}

export async function downloadProductArtifact(metadata) {
  if (!metadata?.key) {
    throw new HttpError(400, 'Invalid metadata for MRMS download');
  }

  logger.info('Downloading MRMS object', { key: metadata.key });

  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: metadata.key,
  });

  const response = await s3Client.send(command);
  const compressedBuffer = await streamToBuffer(response.Body);
  const isGzip = metadata.key.endsWith('.gz');
  const gribBuffer = isGzip ? await gunzipAsync(compressedBuffer) : compressedBuffer;

  const fileName = basename(metadata.key).replace(/\.gz$/, '');

  return {
    ...metadata,
    fileName,
    directory: dirname(metadata.key),
    gribBuffer,
  };
}

function buildCandidatePrefixes() {
  const regionSegment = normalizeSegment(config.mrms.region);
  const productSegment = normalizeSegment(config.mrms.product);

  if (!productSegment) {
    return [];
  }

  const productContainsSlash = productSegment.includes('/');
  const baseSegments = [];
  const addSegment = (segment) => {
    const normalized = normalizePath(segment);
    if (normalized && !baseSegments.includes(normalized)) {
      baseSegments.push(normalized);
    }
  };

  if (productContainsSlash) {
    addSegment(productSegment);
  } else {
    if (regionSegment) {
      addSegment(`${regionSegment}/${productSegment}`);
    }
    addSegment(productSegment);
    if (regionSegment) {
      addSegment(`${productSegment}/${regionSegment}`);
    }
  }

  if (regionSegment) {
    addSegment(`prod/${regionSegment}/${productSegment}`);
    if (!productContainsSlash) {
      addSegment(`prod/${productSegment}/${regionSegment}`);
    }
  }

  addSegment(`prod/${productSegment}`);

  const today = new Date();
  const offsets = [0, 1, 2];

  const prefixes = [];
  for (const base of baseSegments) {
    for (const offset of offsets) {
      prefixes.push(formatDatePrefix(subtractDays(today, offset), base));
    }
  }

  return prefixes;
}

function formatDatePrefix(date, baseSegment) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const daySegment = `${yyyy}${mm}${dd}`;
  const normalized = normalizePath(`${baseSegment}/${daySegment}`);
  return `${normalized}/`;
}

async function findMostRecentObject(prefix) {
  let continuationToken;
  let newest = null;

  do {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    });

    const response = await s3Client.send(command);

    for (const object of response.Contents ?? []) {
      if (!newest || object.LastModified > newest.LastModified) {
        newest = object;
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return newest;
}

function extractTimestamp(key) {
  const match = key.match(/(\d{8})-(\d{4,6})/);
  if (!match) {
    return null;
  }

  const [, datePart, timePart] = match;
  const yyyy = datePart.slice(0, 4);
  const mm = datePart.slice(4, 6);
  const dd = datePart.slice(6, 8);

  const hh = timePart.slice(0, 2);
  const min = timePart.slice(2, 4);
  const ss = timePart.slice(4, 6) || '00';

  return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}Z`;
}

function subtractDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() - days);
  return result;
}

function normalizeSegment(segment) {
  return (segment ?? '').trim().replace(/^\/+|\/+$/g, '');
}

function normalizePath(path) {
  return path
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/');
}

function streamToBuffer(stream) {
  if (!stream) {
    throw new HttpError(500, 'Empty stream received from MRMS object download');
  }

  if (stream instanceof Buffer) {
    return Promise.resolve(stream);
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', (error) => reject(new HttpError(500, 'Failed to download MRMS artifact', { cause: error.message })));
    stream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
  });
}
