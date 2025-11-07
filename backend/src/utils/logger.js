const levels = ['debug', 'info', 'warn', 'error'];

function shouldLog(targetLevel, currentLevel) {
  return levels.indexOf(targetLevel) >= levels.indexOf(currentLevel);
}

export function createLogger(scope, level = 'info') {
  const prefix = `[${scope}]`;

  return {
    debug: (...args) => {
      if (shouldLog('debug', level)) {
        console.debug(prefix, ...args);
      }
    },
    info: (...args) => {
      if (shouldLog('info', level)) {
        console.info(prefix, ...args);
      }
    },
    warn: (...args) => {
      if (shouldLog('warn', level)) {
        console.warn(prefix, ...args);
      }
    },
    error: (...args) => {
      if (shouldLog('error', level)) {
        console.error(prefix, ...args);
      }
    },
  };
}
