import { logRequestEvent } from '../services/mongoService.js';

export function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1_000_000;

    const forwardedFor = req.get('x-forwarded-for');
    const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : req.ip;
    const requestId = req.get('x-request-id') || null;
    const contentLength = res.get('content-length');

    const metadata = {};
    if (requestId) {
      metadata.requestId = requestId;
    }
    if (contentLength) {
      metadata.responseBytes = Number(contentLength) || contentLength;
    }

    const queryKeys = Object.keys(req.query || {});
    if (queryKeys.length > 0) {
      metadata.query = Object.fromEntries(queryKeys.slice(0, 10).map((key) => [key, req.query[key]]));
    }

    const paramKeys = Object.keys(req.params || {});
    if (paramKeys.length > 0) {
      metadata.params = Object.fromEntries(paramKeys.slice(0, 10).map((key) => [key, req.params[key]]));
    }

    const payload = {
      route: req.originalUrl,
      method: req.method,
      status: res.statusCode,
      durationMs,
      ip: clientIp,
      userAgent: req.get('user-agent') || null,
      referer: req.get('referer') || null,
      userId: req.get('x-user-id') || null,
      timestamp: new Date(),
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    };

    logRequestEvent(payload);
  });

  next();
}
