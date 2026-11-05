import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * O3, minimal version: append one JSON line per blocked event to a local
 * text file instead of a dashboard/database. Swap this out for the real
 * audit-log store later — nothing else in the plugin needs to change,
 * since this is the only place that writes a log line.
 *
 * Synchronous on purpose: the OpenClaw `tool_result_persist` hook is
 * itself synchronous (an async handler's return value is silently
 * ignored), so nothing in this call chain can use await.
 */

export interface BlockedEvent {
  timestamp: string; // ISO 8601
  payload: string; // the content that triggered the block (truncated)
  sourceUrl: string | null;
  requestingAgent: string | null;
  ruleId: string;
  ruleCategory: string;
  ruleDescription: string;
}

const MAX_PAYLOAD_CHARS = 500;

export function logBlockedEvent(
  logFilePath: string,
  event: Omit<BlockedEvent, "timestamp" | "payload"> & { payload: string },
): void {
  const record: BlockedEvent = {
    timestamp: new Date().toISOString(),
    ...event,
    payload: event.payload.slice(0, MAX_PAYLOAD_CHARS),
  };

  mkdirSync(dirname(logFilePath), { recursive: true });
  appendFileSync(logFilePath, JSON.stringify(record) + "\n", "utf8");
}
