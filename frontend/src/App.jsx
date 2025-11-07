import { useEffect, useMemo, useState } from 'react';

import Legend from './components/Legend.jsx';
import MapView from './components/MapView.jsx';
import RadarSummaryCard from './components/RadarSummaryCard.jsx';
import RequestMetricsCard from './components/RequestMetricsCard.jsx';
import { useAdminInsights } from './hooks/useAdminInsights.js';
import { useRadarData } from './hooks/useRadarData.js';

const THEME_STORAGE_KEY = 'mrms-dashboard-theme';

const getInitialTheme = () => {
  if (typeof window === 'undefined') {
    return 'dark';
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }

  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
};

const formatStatus = (value) => {
  if (!value) {
    return 'Unknown';
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
};

function App() {
  const [theme, setTheme] = useState(getInitialTheme);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!hasMounted) {
      return;
    }

    document.documentElement.classList.toggle('dark', theme === 'dark');
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme, hasMounted]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const { data: radar, status: radarStatus, error: radarError } = useRadarData();
  const {
    data: analyticsData,
    status: analyticsStatus,
    error: analyticsError,
    refresh: refreshAnalytics,
    lastUpdated: analyticsLastUpdated,
  } = useAdminInsights({ metricsSinceMinutes: 720, logsLimit: 0, leaderboardLimit: 0 });

  const metadata = radar?.metadata ?? null;
  const metrics = analyticsData?.metrics ?? null;
  const themeLabel = useMemo(() => (theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'), [theme]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-100 text-slate-900 transition-colors dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 bg-white/80 px-6 py-6 shadow-lg shadow-slate-200/60 backdrop-blur dark:border-slate-800/70 dark:bg-slate-950/60 dark:shadow-slate-950/40">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-y-3">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">MRMS Radar + Telemetry</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Integrated MRMS mosaic viewer with production usage metrics powered by the logging pipeline.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/80 px-3 py-1 text-slate-700 shadow-sm shadow-slate-200/60 transition dark:border-slate-800/80 dark:bg-slate-900/70 dark:text-slate-200 dark:shadow-slate-950/30">
                <span className={`h-2 w-2 rounded-full ${radarStatus === 'success' ? 'bg-emerald-500' : radarStatus === 'loading' ? 'bg-amber-400 animate-pulse' : 'bg-rose-500'}`} />
                Radar: {formatStatus(radarStatus)}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/80 px-3 py-1 text-slate-700 shadow-sm shadow-slate-200/60 transition dark:border-slate-800/80 dark:bg-slate-900/70 dark:text-slate-200 dark:shadow-slate-950/30">
                <span className={`h-2 w-2 rounded-full ${analyticsStatus === 'success' ? 'bg-emerald-500' : analyticsStatus === 'loading' || analyticsStatus === 'refreshing' ? 'bg-amber-400 animate-pulse' : analyticsStatus === 'error' ? 'bg-rose-500' : 'bg-slate-500'}`} />
                Analytics: {formatStatus(analyticsStatus)}
              </span>
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={themeLabel}
                className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm shadow-slate-200/60 transition hover:bg-white dark:border-slate-700/80 dark:bg-slate-900/70 dark:text-slate-200 dark:shadow-slate-950/40 dark:hover:bg-slate-800"
              >
                <span aria-hidden="true">{theme === 'dark' ? '🌞' : '🌙'}</span>
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-6 pb-12 pt-8">
        <section className="rounded-3xl border border-slate-200 bg-white/80 px-6 py-6 shadow-lg shadow-slate-200/60 backdrop-blur transition-colors dark:border-slate-800/70 dark:bg-slate-900/60 dark:shadow-slate-950/40">
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">What is radar reflectivity?</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                Reflectivity measures the power returned to the radar after the emitted pulse hits hydrometeors like raindrops or hail. Higher values usually indicate stronger precipitation or larger particles, which helps meteorologists estimate rainfall intensity and identify severe storm cores.
              </p>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">What is MRMS?</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                MRMS (Multi-Radar/Multi-Sensor) combines data from dozens of NOAA radars, satellites, and environmental sensors into high-resolution mosaics that update every few minutes. The product powering this dashboard blends those inputs to deliver a near real-time view of nationwide precipitation trends.
              </p>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
          <div className="order-2 flex flex-col gap-5 xl:order-none">
            <Legend status={radarStatus} />
            <RadarSummaryCard metadata={metadata} status={radarStatus} />
          </div>

          <section className="order-1 xl:order-none">
            <MapView radar={radar} status={radarStatus} error={radarError} />
          </section>

          <div className="order-3 flex flex-col gap-5">
            <RequestMetricsCard
              metrics={metrics}
              status={analyticsStatus}
              lastUpdated={analyticsLastUpdated}
              onRefresh={refreshAnalytics}
              error={analyticsError}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
