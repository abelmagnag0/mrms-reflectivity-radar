import PropTypes from 'prop-types';

import {
  formatDurationMs,
  formatNumber,
  formatPercentage,
  formatRelativeTime,
} from '../utils/formatters.js';

const STATUS_LABELS = {
  idle: 'Idle',
  loading: 'Loading',
  refreshing: 'Refreshing',
  success: 'Synced',
  error: 'Error',
};

const STATUS_COLORS = {
  idle: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  loading: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200',
  refreshing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200',
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
  error: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200',
};

const METHOD_COLORS = {
  GET: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/80 dark:text-emerald-950',
  POST: 'bg-blue-100 text-blue-700 dark:bg-blue-500/80 dark:text-blue-950',
  PUT: 'bg-amber-100 text-amber-700 dark:bg-amber-400/80 dark:text-amber-950',
  DELETE: 'bg-rose-100 text-rose-700 dark:bg-rose-500/80 dark:text-rose-950',
};

const BUCKET_COLORS = {
  '2xx': 'bg-emerald-500/70',
  '3xx': 'bg-blue-500/70',
  '4xx': 'bg-amber-500/70',
  '5xx': 'bg-rose-500/70',
  other: 'bg-slate-500/70',
  unknown: 'bg-slate-500/70',
  '1xx': 'bg-slate-400/70',
};

function RequestMetricsCard({ metrics, status, lastUpdated, onRefresh, error }) {
  const summary = metrics?.summary ?? null;
  const topRoutes = metrics?.topRoutes ?? [];
  const statusBuckets = metrics?.statusBuckets ?? [];
  const sinceMinutes = metrics?.sinceMinutes ?? null;
  const totalBucketCount = statusBuckets.reduce((total, bucket) => total + (bucket.count ?? 0), 0);

  const statusLabel = STATUS_LABELS[status] ?? '—';
  const statusClass = STATUS_COLORS[status] ?? STATUS_COLORS.idle;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-lg shadow-slate-200/60 backdrop-blur transition-colors dark:border-slate-800/70 dark:bg-slate-900/60 dark:shadow-slate-950/30">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">Route Telemetry</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Request statistics persisted in MongoDB over the last {sinceMinutes ?? '—'} minutes.
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusClass}`}>{statusLabel}</span>
          <button
            type="button"
            onClick={onRefresh}
            disabled={!onRefresh || status === 'loading' || status === 'refreshing'}
            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm shadow-slate-200/60 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700/60 dark:bg-slate-800/60 dark:text-slate-200 dark:shadow-slate-950/30 dark:hover:bg-slate-800"
          >
            <span className={`h-2 w-2 rounded-full ${status === 'loading' || status === 'refreshing' ? 'animate-pulse bg-amber-400' : 'bg-emerald-400'}`} aria-hidden="true" />
            Refresh
          </button>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {lastUpdated ? `Synced ${formatRelativeTime(lastUpdated)}` : 'Waiting for first update'}
          </span>
        </div>
      </header>

      {status === 'error' && error ? (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
          Failed to update metrics: {error.message}
        </div>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-4 text-sm">
        <MetricItem label="Total requests" value={formatNumber(summary?.totalRequests)} />
        <MetricItem label="Success rate" value={formatPercentage(summary?.successRate)} />
        <MetricItem label="Average latency" value={formatDurationMs(summary?.avgDurationMs)} />
        <MetricItem label="Peak latency" value={formatDurationMs(summary?.maxDurationMs)} />
        <MetricItem label="Unique users" value={formatNumber(summary?.uniqueUsers)} />
        <MetricItem label="Processing time" value={formatDurationMs(summary?.totalDurationMs)} />
      </div>

      <section className="mb-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Featured routes</h3>
        <div className="space-y-3">
          {topRoutes.length === 0 ? (
            <EmptyState message="No requests during this window." />
          ) : (
            topRoutes.map((route) => (
              <article key={`${route.method}-${route.route}`} className="rounded-xl border border-slate-200 bg-white/90 px-3 py-3 text-sm shadow-sm shadow-slate-200/50 transition-colors dark:border-slate-800/70 dark:bg-slate-900/80 dark:shadow-slate-950/40">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${METHOD_COLORS[route.method] ?? 'bg-slate-200 text-slate-900 dark:bg-slate-500/70 dark:text-slate-950'}`}>
                      {route.method}
                    </span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">{route.route}</span>
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{route.lastSeenAt ? formatRelativeTime(route.lastSeenAt) : '—'}</span>
                </div>
                <div className="mt-2 flex items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
                  <span>{formatNumber(route.hits)} hits</span>
                  <span>Avg latency {formatDurationMs(route.avgDurationMs)}</span>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Status distribution</h3>
        {totalBucketCount === 0 ? (
          <EmptyState message="No responses recorded." />
        ) : (
          <div className="space-y-2 text-xs text-slate-700 dark:text-slate-200">
            {statusBuckets
              .filter((bucket) => bucket.count > 0)
              .sort((a, b) => (a.bucket > b.bucket ? 1 : -1))
              .map((bucket) => {
                const width = Math.max((bucket.count / totalBucketCount) * 100, 4);
                return (
                  <div key={bucket.bucket}>
                    <div className="mb-1 flex justify-between">
                      <span>{bucket.bucket}</span>
                      <span className="font-medium">{formatNumber(bucket.count)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800">
                      <div
                        className={`h-full rounded-full ${BUCKET_COLORS[bucket.bucket] ?? BUCKET_COLORS.other}`}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </section>
    </section>
  );
}

function MetricItem({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white/90 px-3 py-3 shadow-sm shadow-slate-200/60 transition-colors dark:border-slate-800/60 dark:bg-slate-900/80 dark:shadow-slate-950/40">
      <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">{value ?? '—'}</dd>
    </div>
  );
}

MetricItem.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string,
};

function EmptyState({ message }) {
  return <p className="rounded-xl border border-dashed border-slate-300 bg-white/70 px-4 py-5 text-center text-xs text-slate-500 transition-colors dark:border-slate-800/70 dark:bg-slate-900/40 dark:text-slate-400">{message}</p>;
}

EmptyState.propTypes = {
  message: PropTypes.string.isRequired,
};

RequestMetricsCard.propTypes = {
  metrics: PropTypes.shape({
    summary: PropTypes.shape({
      totalRequests: PropTypes.number,
      successRate: PropTypes.number,
      avgDurationMs: PropTypes.number,
      maxDurationMs: PropTypes.number,
      totalDurationMs: PropTypes.number,
      uniqueUsers: PropTypes.number,
    }),
    topRoutes: PropTypes.arrayOf(
      PropTypes.shape({
        route: PropTypes.string,
        method: PropTypes.string,
        hits: PropTypes.number,
        avgDurationMs: PropTypes.number,
        lastSeenAt: PropTypes.string,
      })
    ),
    statusBuckets: PropTypes.arrayOf(
      PropTypes.shape({
        bucket: PropTypes.string,
        count: PropTypes.number,
      })
    ),
    sinceMinutes: PropTypes.number,
  }),
  status: PropTypes.string.isRequired,
  lastUpdated: PropTypes.instanceOf(Date),
  onRefresh: PropTypes.func,
  error: PropTypes.shape({
    message: PropTypes.string,
  }),
};

RequestMetricsCard.defaultProps = {
  metrics: null,
  lastUpdated: null,
  onRefresh: undefined,
  error: null,
};

export default RequestMetricsCard;
