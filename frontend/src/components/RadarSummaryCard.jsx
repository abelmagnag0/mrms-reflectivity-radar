import PropTypes from 'prop-types';

import { formatDateTime, formatRelativeTime } from '../utils/formatters.js';

function RadarSummaryCard({ metadata, status }) {
  const minValue = Number.isFinite(Number(metadata?.minValue)) ? metadata.minValue : null;
  const maxValue = Number.isFinite(Number(metadata?.maxValue)) ? metadata.maxValue : null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-lg shadow-slate-200/60 backdrop-blur transition-colors dark:border-slate-800/70 dark:bg-slate-900/60 dark:shadow-slate-950/30">
      <header className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">Radar Summary</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">Latest MRMS sweep synchronized by the backend.</p>
        </div>
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 transition-colors dark:bg-emerald-900/40 dark:text-emerald-200">
          {status === 'success' ? 'Operational' : status === 'loading' ? 'Rebuilding' : 'Offline'}
        </span>
      </header>

      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Minimum reflectivity</dt>
          <dd className="text-slate-900 dark:text-slate-100">{minValue !== null ? `${minValue.toFixed(1)} dBZ` : '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Maximum reflectivity</dt>
          <dd className="text-slate-900 dark:text-slate-100">{maxValue !== null ? `${maxValue.toFixed(1)} dBZ` : '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Updated</dt>
          <dd className="text-slate-900 dark:text-slate-100">
            {metadata?.timestamp ? formatRelativeTime(metadata.timestamp) : '—'}
            <span className="block text-xs text-slate-500 dark:text-slate-500/80">
              {metadata?.timestamp ? formatDateTime(metadata.timestamp) : 'timestamp unknown'}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Source</dt>
          <dd className="text-slate-900 dark:text-slate-100">
            {metadata?.origin?.source ? metadata.origin.source : 'MRMS / NOAA'}
            <span className="block text-xs text-slate-500 dark:text-slate-500/80">
              {metadata?.origin?.dataset ?? 'composite reflectivity (dBZ)'}
            </span>
          </dd>
        </div>
      </dl>
    </section>
  );
}

RadarSummaryCard.propTypes = {
  metadata: PropTypes.shape({
    timestamp: PropTypes.string,
    rows: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    cols: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    latStep: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    lonStep: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    minValue: PropTypes.number,
    maxValue: PropTypes.number,
    origin: PropTypes.shape({
      source: PropTypes.string,
      dataset: PropTypes.string,
    }),
  }),
  status: PropTypes.string.isRequired,
};

export default RadarSummaryCard;
