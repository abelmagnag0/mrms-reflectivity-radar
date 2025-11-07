import compression from 'compression';
import cors from 'cors';
import express from 'express';

import { config } from './config/env.js';
import { requestLogger } from './middleware/requestLogger.js';
import adminRouter from './routes/adminRoutes.js';
import radarRouter from './routes/radarRoutes.js';
import { closeMongo, flushLogBuffer, getLogBufferSize, initMongo } from './services/mongoService.js';
import {
  hydrateCacheFromPersistence,
  scheduleLatestArtifactRefresh,
  warmLatestArtifact,
  warmLatestArtifactInBackground,
} from './services/radarService.js';
import { createLogger } from './utils/logger.js';

const app = express();
const logger = createLogger('server', config.logLevel);
const port = config.port;

app.use(cors());
app.use(compression());
app.use(express.json());
app.use(requestLogger);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/admin', adminRouter);
app.use('/api/radar', radarRouter);

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  const message = err.message || 'Internal server error';
  const payload = { error: message };

  if (err.details) {
    payload.details = err.details;
  }

  logger.error('Request failed', { status, message, stack: err.stack });

  res.status(status).json(payload);
});


async function bootstrap() {
  let hydrated = false;
  let mongoReady = false;

  try {
    hydrated = await hydrateCacheFromPersistence();
  } catch (error) {
    logger.warn('Failed to hydrate cache on startup', {
      message: error.message,
    });
  }

  try {
    mongoReady = await initMongo();
  } catch (error) {
    logger.warn('MongoDB init failed during bootstrap', {
      message: error.message,
    });
  }

  if (!mongoReady) {
    logger.warn('Proceeding without MongoDB connection; request logging will be disabled');
  }

  if (config.warmupOnStart) {
    if (!hydrated) {
      try {
        logger.info('Priming radar cache before accepting traffic');
        await warmLatestArtifact();
      } catch (error) {
        logger.warn('Initial radar warmup failed', {
          message: error.message,
        });
      }
    } else {
      warmLatestArtifactInBackground();
    }
  } else {
    warmLatestArtifactInBackground();
  }

  const cancelRefresh = scheduleLatestArtifactRefresh();

  const server = app.listen(port, () => {
    logger.info(`Backend listening on port ${port}`);
  });

  const shutdown = async (signal) => {
    logger.info('Received shutdown signal, draining...', {
      signal,
      pendingLogs: getLogBufferSize(),
    });

    try {
      cancelRefresh?.();
    } catch (error) {
      logger.warn('Failed to cancel radar refresh timer', {
        message: error.message,
      });
    }

    try {
      await flushLogBuffer({ force: true });
    } catch (error) {
      logger.warn('Failed to flush log buffer during shutdown', {
        message: error.message,
      });
    }

    server.close(async (closeError) => {
      if (closeError) {
        logger.error('Error while closing HTTP server', {
          message: closeError.message,
        });
      }

      await closeMongo();
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Force exiting after timeout');
      process.exit(1);
    }, 10_000).unref();
  };

  ['SIGINT', 'SIGTERM'].forEach((signal) => {
    process.once(signal, () => {
      shutdown(signal).catch((error) => {
        logger.error('Shutdown failed', {
          message: error.message,
        });
        process.exit(1);
      });
    });
  });

  process.on('beforeExit', () => {
    flushLogBuffer({ force: true }).catch((error) => {
      logger.warn('beforeExit log flush failed', {
        message: error.message,
      });
    });
  });
}

bootstrap().catch((error) => {
  logger.error('Failed to bootstrap backend', {
    message: error.message,
  });
  process.exitCode = 1;
});
