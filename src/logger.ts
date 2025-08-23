import { appendFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LoggerConfig {
  level: LogLevel;
  logDir: string;
  maxFileSize: number; // in bytes
  enableConsole: boolean; // for development
}

export class Logger {
  private config: LoggerConfig;
  private static instance: Logger;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: LogLevel.INFO,
      logDir: "logs",
      maxFileSize: 10 * 1024 * 1024, // 10MB
      enableConsole: process.env.NODE_ENV === "development",
      ...config,
    };

    // Ensure log directory exists
    this.ensureLogDirectory();
  }

  static getInstance(config?: Partial<LoggerConfig>): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(config);
    }
    return Logger.instance;
  }

  private ensureLogDirectory(): void {
    if (!existsSync(this.config.logDir)) {
      mkdirSync(this.config.logDir, { recursive: true });
    }
  }

  private getLogFileName(level: LogLevel): string {
    const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const levelName = LogLevel[level].toLowerCase();
    return join(this.config.logDir, `${levelName}-${date}.log`);
  }

  private formatMessage(
    level: LogLevel,
    message: string,
    ...args: any[]
  ): string {
    const timestamp = new Date().toISOString();
    const levelName = LogLevel[level].padEnd(5);

    // Combine message and args, sanitizing any potential sensitive data
    const fullMessage =
      args.length > 0
        ? `${message} ${args.map((arg) => this.sanitizeArg(arg)).join(" ")}`
        : message;

    return `[${timestamp}] [${levelName}] ${fullMessage}`;
  }

  private sanitizeArg(arg: any): string {
    if (typeof arg === "object") {
      try {
        // Remove potential sensitive fields from objects
        const sanitized = this.sanitizeObject(arg);
        return JSON.stringify(sanitized);
      } catch {
        return "[Object]";
      }
    }
    return String(arg);
  }

  private sanitizeObject(obj: any): any {
    if (obj === null || typeof obj !== "object") {
      return obj;
    }

    const sensitiveKeys = [
      "password",
      "apikey",
      "api_key",
      "token",
      "secret",
      "credential",
      "resendapikey",
      "resend_api_key",
      "auth",
      "authorization",
    ];

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeObject(item));
    }

    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const keyLower = key.toLowerCase();
      if (sensitiveKeys.some((sensitive) => keyLower.includes(sensitive))) {
        sanitized[key] = "[REDACTED]";
      } else if (typeof value === "object") {
        sanitized[key] = this.sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.config.level;
  }

  private writeToFile(level: LogLevel, formattedMessage: string): void {
    const logFile = this.getLogFileName(level);

    try {
      // Check file size and rotate if needed
      if (existsSync(logFile)) {
        const stats = require("fs").statSync(logFile);
        if (stats.size > this.config.maxFileSize) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const backupFile = logFile.replace(".log", `-${timestamp}.log`);
          require("fs").renameSync(logFile, backupFile);
        }
      }

      appendFileSync(logFile, formattedMessage + "\n", "utf8");
    } catch (error) {
      // Fallback to console if file writing fails
      console.error(`Failed to write to log file: ${error}`);
      console.log(formattedMessage);
    }
  }

  private log(level: LogLevel, message: string, ...args: any[]): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const formattedMessage = this.formatMessage(level, message, ...args);

    // Write to file
    this.writeToFile(level, formattedMessage);

    // Also log to console in development or if explicitly enabled
    if (this.config.enableConsole) {
      const consoleMethod =
        level === LogLevel.ERROR
          ? console.error
          : level === LogLevel.WARN
          ? console.warn
          : console.log;
      consoleMethod(formattedMessage);
    }
  }

  debug(message: string, ...args: any[]): void {
    this.log(LogLevel.DEBUG, message, ...args);
  }

  info(message: string, ...args: any[]): void {
    this.log(LogLevel.INFO, message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.log(LogLevel.WARN, message, ...args);
  }

  error(message: string, ...args: any[]): void {
    this.log(LogLevel.ERROR, message, ...args);
  }

  // Convenience methods for specific use cases
  success(message: string, ...args: any[]): void {
    this.info(`✅ ${message}`, ...args);
  }

  failure(message: string, ...args: any[]): void {
    this.error(`❌ ${message}`, ...args);
  }

  warning(message: string, ...args: any[]): void {
    this.warn(`⚠️  ${message}`, ...args);
  }

  progress(message: string, ...args: any[]): void {
    this.info(`🔄 ${message}`, ...args);
  }

  // Method to log structured data
  logStructured(
    level: LogLevel,
    event: string,
    data: Record<string, any>
  ): void {
    const sanitizedData = this.sanitizeObject(data);
    this.log(level, `[${event}]`, sanitizedData);
  }
}

// Create and export default logger instance
export const logger = Logger.getInstance({
  level: process.env.LOG_LEVEL
    ? LogLevel[process.env.LOG_LEVEL as keyof typeof LogLevel]
    : LogLevel.INFO,
  enableConsole: process.env.NODE_ENV === "development",
});

// Export convenience functions for easy migration
export const log = {
  debug: (message: string, ...args: any[]) => logger.debug(message, ...args),
  info: (message: string, ...args: any[]) => logger.info(message, ...args),
  warn: (message: string, ...args: any[]) => logger.warn(message, ...args),
  error: (message: string, ...args: any[]) => logger.error(message, ...args),
  success: (message: string, ...args: any[]) =>
    logger.success(message, ...args),
  failure: (message: string, ...args: any[]) =>
    logger.failure(message, ...args),
  warning: (message: string, ...args: any[]) =>
    logger.warning(message, ...args),
  progress: (message: string, ...args: any[]) =>
    logger.progress(message, ...args),
};
