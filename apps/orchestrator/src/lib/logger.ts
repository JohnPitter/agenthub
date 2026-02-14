type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

function formatEntry(entry: LogEntry): string {
  const { level, message, context, data, timestamp } = entry;
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  const ctx = context ? ` [${context}]` : "";
  const extra = data ? ` ${JSON.stringify(data)}` : "";
  return `${prefix}${ctx} ${message}${extra}`;
}

function createEntry(level: LogLevel, message: string, context?: string, data?: Record<string, unknown>): LogEntry {
  return {
    level,
    message,
    context,
    data,
    timestamp: new Date().toISOString(),
  };
}

export const logger = {
  info(message: string, context?: string, data?: Record<string, unknown>) {
    const entry = createEntry("info", message, context, data);
    console.log(formatEntry(entry));
  },

  warn(message: string, context?: string, data?: Record<string, unknown>) {
    const entry = createEntry("warn", message, context, data);
    console.warn(formatEntry(entry));
  },

  error(message: string, context?: string, data?: Record<string, unknown>) {
    const entry = createEntry("error", message, context, data);
    console.error(formatEntry(entry));
  },

  debug(message: string, context?: string, data?: Record<string, unknown>) {
    if (process.env.NODE_ENV === "development" || process.env.DEBUG === "true") {
      const entry = createEntry("debug", message, context, data);
      console.debug(formatEntry(entry));
    }
  },
};
