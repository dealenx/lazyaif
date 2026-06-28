/**
 * index.ts - Hello, World! entry point.
 *
 * Logging:
 *   - DEBUG messages via console.debug, controlled by LOG_LEVEL / DEBUG env vars.
 *   - Set LOG_LEVEL=info (or higher) to silence DEBUG output without code edits.
 *   - Levels recognized: debug | info | warn | error  (default: debug)
 */

const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
type LogLevel = (typeof LOG_LEVELS)[number];

function currentLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL || (process.env.DEBUG ?? "debug"))
    .toString()
    .toLowerCase() as LogLevel;
  return LOG_LEVELS.includes(raw) ? raw : "debug";
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS.indexOf(level) >= LOG_LEVELS.indexOf(currentLevel());
}

function debug(message: string, data?: unknown): void {
  if (shouldLog("debug")) {
    console.debug(message, data ?? "");
  }
}

/**
 * Считает площадь прямоугольника по ширине и высоте.
 */
export function area(width: number, height: number): number {
  debug(`[area] width=${width}, height=${height}`);
  return width * height;
}

function main(): void {
  debug("[main] starting hello-world");

  debug("[main] printing message");
  console.log("Hello, World!");

  debug("[main] done");
}

main();