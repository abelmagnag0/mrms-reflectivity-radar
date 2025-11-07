import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from '../config/env.js';
import { HttpError } from '../errors/httpError.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('gridService', config.logLevel);

export async function buildGridPayload(artifact) {
  if (!artifact?.gribBuffer) {
    throw new HttpError(400, 'Invalid artifact received for grid generation');
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mrms-'));
  const gribPath = path.join(tempDir, artifact.fileName || 'latest.grib2');

  try {
    await fs.writeFile(gribPath, artifact.gribBuffer);
    const pythonOutput = await runGribProcessor(gribPath);
    const payload = parseProcessorOutput(pythonOutput);
    payload.timestamp = artifact.timestamp || payload.timestamp;
    return payload;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function runGribProcessor(gribPath) {
  const scriptUrl = new URL('../workers/grib_processor.py', import.meta.url);
  const scriptPath = fileURLToPath(scriptUrl);

  logger.debug('Invoking Python grib processor', { scriptPath, gribPath });

  return new Promise((resolve, reject) => {
    const subprocess = spawn(config.pythonExecutable, [scriptPath, '--grib', gribPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    subprocess.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    subprocess.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    subprocess.on('error', (error) => {
      reject(new HttpError(500, 'Failed to start GRIB processor', { cause: error.message }));
    });

    subprocess.on('close', (code) => {
      if (code !== 0) {
        reject(new HttpError(500, 'GRIB processor exited with error', { stderr }));
        return;
      }

      resolve(stdout);
    });
  });
}

function parseProcessorOutput(rawOutput) {
  try {
    const parsed = JSON.parse(rawOutput);

    if (!parsed?.rows || !parsed?.cols || typeof parsed.data !== 'string' || !parsed.dataEncoding) {
      throw new Error('Incomplete grid payload returned by processor');
    }

    const buffer = Buffer.from(parsed.data, 'base64');
    parsed.data = buffer;

    const encoding = parsed.dataEncoding;
    parsed.dataEncoding = {
      format: encoding.format,
      scale: Number.parseFloat(encoding.scale ?? '1'),
      offset: Number.parseFloat(encoding.offset ?? '0'),
      missing: Number.parseInt(encoding.missing ?? '-32768', 10),
      description: encoding.description,
    };

    parsed.latStep = Number.parseFloat(parsed.latStep ?? '0');
    parsed.lonStep = Number.parseFloat(parsed.lonStep ?? '0');
    parsed.minValue = parsed.minValue === null ? null : Number.parseFloat(parsed.minValue);
    parsed.maxValue = parsed.maxValue === null ? null : Number.parseFloat(parsed.maxValue);

    return parsed;
  } catch (error) {
    logger.error('Failed to parse GRIB processor output', error);
    throw new HttpError(500, 'Unable to parse GRIB processor output', { cause: error.message });
  }
}
