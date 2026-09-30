import { currentContext } from "@/framework/async_context";

let timeZone = "Asia/Kolkata";

/** Sets the timezone log timestamps are formatted in. The environment belongs to
 *  the app, so the app reads its own key and calls this once at startup. */
export function setLogTimeZone(zone: string | undefined): void {
  if (zone !== undefined) {
    timeZone = zone;
  }
}

function formatDateTime(date: Date): string {
  const datePart = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(date);
  const timePart = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).format(date);
  return `${datePart}, ${timePart}`;
}
type LogLevel = "Info" | "Error" | "Warn";

const LOG_ORDER_KEY = "logOrder";

function formatEntry(level: LogLevel, values: unknown[]): string {
  let executionId = "none";
  let order = 0;

  try {
    const manager = currentContext().manager;
    executionId = manager.executionId;
    order = (manager.getExtras<number>(LOG_ORDER_KEY) ?? 0) + 1;
    manager.setExtras(LOG_ORDER_KEY, order);
  } catch {
    // outside request context
  }

  const content = values
    .map((v) =>
      typeof v === "object" && v !== null
        ? v instanceof Error
          ? v.toString()
          : JSON.stringify(v)
        : String(v),
    )
    .join("\n");

  return `---------------------\nExecution ID: ${executionId}\nOrder: ${order}\nLevel: ${level}\nCreated At: ${formatDateTime(new Date())}\nContent:\n${content}\n---------------------`;
}

export const logger = {
  info(...values: unknown[]): void {
    console.log(formatEntry("Info", values));
  },
  error(...values: unknown[]): void {
    console.error(formatEntry("Error", values));
  },
  warn: (...values: unknown[]): void => {
    console.log(formatEntry("Warn", values));
  },
};
