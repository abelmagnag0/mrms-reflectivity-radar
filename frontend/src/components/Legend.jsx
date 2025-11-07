import PropTypes from 'prop-types';

const COLOR_SCALE = [
  { label: '5 – 15 dBZ', color: 'linear-gradient(90deg, rgba(26,72,171,0.8), rgba(26,72,171,0.4))' },
  { label: '15 – 25 dBZ', color: 'linear-gradient(90deg, rgba(40,113,203,0.85), rgba(40,113,203,0.4))' },
  { label: '25 – 35 dBZ', color: 'linear-gradient(90deg, rgba(29,149,197,0.9), rgba(29,149,197,0.45))' },
  { label: '35 – 45 dBZ', color: 'linear-gradient(90deg, rgba(33,171,144,0.9), rgba(33,171,144,0.45))' },
  { label: '45 – 55 dBZ', color: 'linear-gradient(90deg, rgba(144,202,94,0.95), rgba(144,202,94,0.5))' },
  { label: '55 – 65 dBZ', color: 'linear-gradient(90deg, rgba(233,186,63,0.95), rgba(233,186,63,0.5))' },
  { label: '65 – 75 dBZ', color: 'linear-gradient(90deg, rgba(220,94,36,0.96), rgba(220,94,36,0.55))' },
  { label: '≥ 75 dBZ', color: 'linear-gradient(90deg, rgba(180,36,36,1), rgba(180,36,36,0.6))' },
];

function Legend({ status }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-xl shadow-slate-200/60 backdrop-blur transition-colors dark:border-slate-800/70 dark:bg-slate-900/50 dark:shadow-slate-950/30">
      <header className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">Reflectivity Scale</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">Gradient applied to the MRMS composite.</p>
        </div>
        <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700 transition-colors dark:bg-slate-800 dark:text-slate-300">
          {status === 'loading' && 'Updating'}
          {status === 'success' && 'Synced'}
          {status === 'error' && 'Offline'}
          {status === 'idle' && 'Starting up'}
          {!['loading', 'success', 'error', 'idle'].includes(status) && '—'}
        </span>
      </header>

      <div className="space-y-3">
        {COLOR_SCALE.map((step) => (
          <div key={step.label} className="flex items-center gap-3">
            <div
              className="h-4 w-14 rounded-full border border-slate-200/60 transition-colors dark:border-white/10"
              style={{ background: step.color }}
            />
            <span className="text-sm text-slate-700 transition-colors dark:text-slate-200">{step.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

Legend.propTypes = {
  status: PropTypes.string.isRequired,
};

export default Legend;
