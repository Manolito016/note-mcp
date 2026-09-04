type LogLevel = "debug" | "info" | "warn" | "error";

class Logger {
    private level: LogLevel;
    private levels: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

    constructor(level: LogLevel = "info") {
        this.level = level;
    }

    setLevel(level: LogLevel) {
        this.level = level;
    }

    private shouldLog(level: LogLevel): boolean {
        return this.levels[level] >= this.levels[this.level];
    }

    private formatMessage(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
        const timestamp = new Date().toISOString();
        const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
        return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
    }

    debug(message: string, meta?: Record<string, unknown>) {
        if (this.shouldLog("debug")) {
            console.error(this.formatMessage("debug", message, meta));
        }
    }

    info(message: string, meta?: Record<string, unknown>) {
        if (this.shouldLog("info")) {
            console.error(this.formatMessage("info", message, meta));
        }
    }

    warn(message: string, meta?: Record<string, unknown>) {
        if (this.shouldLog("warn")) {
            console.error(this.formatMessage("warn", message, meta));
        }
    }

    error(message: string, meta?: Record<string, unknown>) {
        if (this.shouldLog("error")) {
            console.error(this.formatMessage("error", message, meta));
        }
    }
}

export const logger = new Logger((process.env.LOG_LEVEL as LogLevel) || "info");
