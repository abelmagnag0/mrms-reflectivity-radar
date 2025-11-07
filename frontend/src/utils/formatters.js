const defaultNumberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

export function formatNumber(value, options = {}) {
  if (!Number.isFinite(value)) {
    return '—';
  }

  if (!options.maximumFractionDigits && !options.notation && !options.compact) {
    return defaultNumberFormatter.format(value);
  }

  const formatter = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: options.maximumFractionDigits ?? 0,
    notation: options.notation,
  });

  return formatter.format(value);
}

export function formatPercentage(value, maximumFractionDigits = 1) {
  if (!Number.isFinite(value)) {
    return '—';
  }

  const formatter = new Intl.NumberFormat('en-US', {
    style: 'percent',
    maximumFractionDigits,
  });

  return formatter.format(value);
}

export function formatDurationMs(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)} s`;
  }

  return `${Math.round(value)} ms`;
}

const relativeFormatter = new Intl.RelativeTimeFormat('en-US', {
  numeric: 'auto',
});

export function formatRelativeTime(value) {
  if (!value) {
    return '—';
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  const diffMs = date.getTime() - Date.now();
  const diffSeconds = Math.round(diffMs / 1000);

  if (Math.abs(diffSeconds) < 60) {
    return relativeFormatter.format(diffSeconds, 'second');
  }

  const diffMinutes = Math.round(diffSeconds / 60);
  if (Math.abs(diffMinutes) < 60) {
    return relativeFormatter.format(diffMinutes, 'minute');
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return relativeFormatter.format(diffHours, 'hour');
  }

  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 7) {
    return relativeFormatter.format(diffDays, 'day');
  }

  const diffWeeks = Math.round(diffDays / 7);
  if (Math.abs(diffWeeks) < 5) {
    return relativeFormatter.format(diffWeeks, 'week');
  }

  const diffMonths = Math.round(diffDays / 30);
  if (Math.abs(diffMonths) < 12) {
    return relativeFormatter.format(diffMonths, 'month');
  }

  const diffYears = Math.round(diffDays / 365);
  return relativeFormatter.format(diffYears, 'year');
}

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'short',
  timeStyle: 'short',
});

export function formatDateTime(value) {
  if (!value) {
    return '—';
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return dateTimeFormatter.format(date);
}

export function formatBytes(value) {
  if (!Number.isFinite(value) || value < 0) {
    return '—';
  }

  if (value < 1024) {
    return `${value} B`;
  }

  const units = ['KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = -1;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}
