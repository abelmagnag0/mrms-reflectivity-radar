import PropTypes from 'prop-types';

import { formatDurationMs, formatRelativeTime } from '../utils/formatters.js';

function RequestLogList({ logs, status, error }) {
  const emptyMessage =
    status === 'loading'
      ? 'Collecting entries...'
      : status === 'error'
        ? `Failed to sync logs (${error?.message ?? 'unknown error'})`
        : 'No access events during this window.';

  return (
    <section className="rounded-2xl border border-slate-800/70 bg-slate-900/70 p-5 shadow-lg shadow-slate-950/30">
      <header className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-100">Recent access</h2>
          <p className="text-sm text-slate-400">Logs persisted in MongoDB, streamed in real time.</p>
        </div>
        <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300">
          {status === 'loading' && 'Collecting'}
          {status === 'refreshing' && 'Refreshing'}
          {status === 'success' && 'Synced'}
          {status === 'error' && 'Error'}
          {status === 'idle' && 'Idle'}
          {!['loading', 'refreshing', 'success', 'error', 'idle'].includes(status) && '—'}
        </span>
      </header>

      {status === 'error' && error ? (
        <div className="mb-4 rounded-xl border border-rose-900/60 bg-rose-950/30 px-4 py-3 text-xs text-rose-200">
          Failed to load logs: {error.message}
        </div>
      ) : null}

      {logs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-800/70 bg-slate-900/40 px-4 py-6 text-center text-xs text-slate-400">
          {emptyMessage}
        </p>
      ) : (
        <ul className="space-y-3 text-sm">
          {logs.map((log, index) => (
            <li
              key={`${log.timestamp}-${log.route}-${log.userId ?? index}`}
              className="rounded-xl border border-slate-800/60 bg-slate-900/80 px-3 py-3 shadow-sm shadow-slate-950/20"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
                  <span className={`rounded-full px-2 py-0.5 ${methodChip(log.method)}`}>{log.method}</span>
                  <span className={`rounded-full px-2 py-0.5 ${statusChip(log.status)}`}>{log.status}</span>
                  <span className="text-slate-300">{log.route}</span>
                </div>
                <span className="text-xs text-slate-400">{log.timestamp ? formatRelativeTime(log.timestamp) : '—'}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-300">
                <span>Latency {formatDurationMs(log.durationMs)}</span>
                {log.userId ? <span>User {log.userId}</span> : null}
                {log.ip ? <span>IP {log.ip}</span> : null}
                {log.userAgent ? <span className="truncate" title={log.userAgent}>UA {log.userAgent}</span> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function methodChip(method) {
  switch (method) {
    case 'GET':
      return 'bg-emerald-500/80 text-emerald-950';
    case 'POST':
      return 'bg-blue-500/80 text-blue-950';
    case 'PUT':
      return 'bg-amber-500/80 text-amber-950';
    case 'DELETE':
      return 'bg-rose-500/80 text-rose-950';
    default:
      return 'bg-slate-500/80 text-slate-950';
  }
}

function statusChip(status) {
  if (typeof status !== 'number') {
    return 'bg-slate-600/80 text-slate-100';
  }

  if (status >= 500) {
    return 'bg-rose-500/80 text-rose-950';
  }

  if (status >= 400) {
    return 'bg-amber-500/80 text-amber-950';
  }

  if (status >= 300) {
    return 'bg-blue-500/80 text-blue-950';
  }

  if (status >= 200) {
    return 'bg-emerald-500/80 text-emerald-950';
  }

  return 'bg-slate-600/80 text-slate-100';
}

RequestLogList.propTypes = {
  logs: PropTypes.arrayOf(
    PropTypes.shape({
      route: PropTypes.string,
      method: PropTypes.string,
      status: PropTypes.number,
      durationMs: PropTypes.number,
      userId: PropTypes.string,
      timestamp: PropTypes.string,
      ip: PropTypes.string,
      userAgent: PropTypes.string,
    })
  ),
  status: PropTypes.string.isRequired,
  error: PropTypes.shape({
    message: PropTypes.string,
  }),
};

RequestLogList.defaultProps = {
  logs: [],
  error: null,
};

export default RequestLogList;
