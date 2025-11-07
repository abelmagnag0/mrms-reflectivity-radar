import 'dotenv/config';

const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;

export const config = {
  port: Number.parseInt(process.env.PORT || '8080', 10),
  mrms: {
    bucket: process.env.MRMS_S3_BUCKET || 'noaa-mrms-pds',
    awsRegion: process.env.MRMS_S3_REGION || 'us-east-1',
    region: process.env.MRMS_REGION || 'CONUS',
    product: process.env.MRMS_PRODUCT || 'ReflectivityAtLowestAltitude_00.50',
    maxDataAgeMinutes: Number.parseInt(process.env.MRMS_MAX_DATA_AGE_MINUTES || '20', 10),
  },
  cacheTtlMs: Number.parseInt(process.env.CACHE_TTL_MS || `${FIVE_MINUTES_IN_MS}`, 10),
  logLevel: process.env.LOG_LEVEL || 'info',
  pythonExecutable: process.env.PYTHON_EXECUTABLE || 'python3',
  warmupOnStart: process.env.RADAR_WARMUP_ON_START !== 'false',
  refreshIntervalMs: Number.parseInt(process.env.RADAR_REFRESH_INTERVAL_MS || '60000', 10),
  cachePersistDir: process.env.CACHE_PERSIST_DIR || '',
  mongo: {
    uri: process.env.MONGO_URI || 'mongodb://localhost:27017',
    dbName: process.env.MONGO_DB || 'radar',
    requestLogCollection: process.env.MONGO_REQUEST_LOG_COLLECTION || 'requestLogs',
    userCollection: process.env.MONGO_USER_COLLECTION || 'users',
  },
};
