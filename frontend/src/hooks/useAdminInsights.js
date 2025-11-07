import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchRecentRequestLogs,
  fetchRequestMetrics,
  fetchUserLeaderboard,
} from '../services/api.js';

const DEFAULT_REFRESH_INTERVAL = 45_000;

export function useAdminInsights({
  refreshInterval = DEFAULT_REFRESH_INTERVAL,
  metricsSinceMinutes = 1440,
  logsLimit = 20,
  leaderboardLimit = 5,
} = {}) {
  const [data, setData] = useState({
    metrics: null,
    logs: [],
    leaderboard: null,
  });
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const lastUpdatedRef = useRef(null);
  const isMountedRef = useRef(false);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  const loadData = useCallback(async () => {
    if (!isMountedRef.current) {
      setStatus('loading');
    } else {
      setStatus((prev) => (prev === 'success' ? 'refreshing' : prev));
    }

    setError(null);

    try {
      const [metrics, logs, leaderboard] = await Promise.all([
        fetchRequestMetrics({ sinceMinutes: metricsSinceMinutes }),
        fetchRecentRequestLogs({ limit: logsLimit }),
        fetchUserLeaderboard({ limit: leaderboardLimit }),
      ]);

      if (activeRef.current) {
        setData({
          metrics,
          logs: Array.isArray(logs?.results) ? logs.results : [],
          leaderboard,
        });
        lastUpdatedRef.current = new Date();
        setStatus('success');
        isMountedRef.current = true;
      }
    } catch (err) {
      if (activeRef.current) {
        setError(err);
        setStatus('error');
      }
    }
  }, [leaderboardLimit, logsLimit, metricsSinceMinutes]);

  useEffect(() => {
    let cancelled = false;

    async function initialise() {
      await loadData();
    }

    initialise();

    if (refreshInterval > 0) {
      const interval = setInterval(() => {
        if (!cancelled) {
          loadData();
        }
      }, refreshInterval);

      return () => {
        cancelled = true;
        clearInterval(interval);
      };
    }

    return () => {
      cancelled = true;
    };
  }, [loadData, refreshInterval]);

  const refresh = useCallback(() => {
    return loadData();
  }, [loadData]);

  return {
    data,
    status,
    error,
    refresh,
    lastUpdated: lastUpdatedRef.current,
  };
}
