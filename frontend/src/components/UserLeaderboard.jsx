import PropTypes from 'prop-types';

import { formatDurationMs, formatNumber, formatRelativeTime } from '../utils/formatters.js';

function UserLeaderboard({ leaderboard }) {
  const users = leaderboard?.results ?? [];

  return (
    <section className="rounded-2xl border border-slate-800/70 bg-slate-900/60 p-5 shadow-lg shadow-slate-950/30">
      <header className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight text-slate-100">Top API consumers</h2>
        <p className="text-sm text-slate-400">Ranking ordered by cumulative request volume.</p>
      </header>

      {users.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-800/70 bg-slate-900/40 px-4 py-6 text-center text-xs text-slate-400">
          No users have been recorded yet.
        </p>
      ) : (
        <ol className="space-y-3">
          {users.map((user, index) => (
            <li key={user.userId ?? index} className="rounded-xl border border-slate-800/60 bg-slate-900/80 px-3 py-3 text-sm">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-slate-300">
                    #{index + 1}
                  </span>
                  <span className="font-semibold text-slate-100">{user.userId ?? 'Unknown user'}</span>
                </div>
                <span className="text-xs text-slate-400">
                  {user.lastSeenAt ? `Seen ${formatRelativeTime(user.lastSeenAt)}` : 'No recent activity'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-300">
                <span>{formatNumber(user.requestCount)} requests</span>
                <span>Avg latency {formatDurationMs(user.averageDurationMs)}</span>
                {user.lastRoute ? <span className="truncate" title={user.lastRoute}>Last route {user.lastRoute}</span> : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

UserLeaderboard.propTypes = {
  leaderboard: PropTypes.shape({
    results: PropTypes.arrayOf(
      PropTypes.shape({
        userId: PropTypes.string,
        requestCount: PropTypes.number,
        averageDurationMs: PropTypes.number,
        lastSeenAt: PropTypes.string,
        lastRoute: PropTypes.string,
      })
    ),
  }),
};

UserLeaderboard.defaultProps = {
  leaderboard: null,
};

export default UserLeaderboard;
