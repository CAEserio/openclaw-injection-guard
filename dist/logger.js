import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
const MAX_PAYLOAD_CHARS = 500;
function logBlockedEvent(logFilePath, event) {
  const record = {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    ...event,
    payload: event.payload.slice(0, MAX_PAYLOAD_CHARS)
  };
  mkdirSync(dirname(logFilePath), { recursive: true });
  appendFileSync(logFilePath, JSON.stringify(record) + "\n", "utf8");
}
export {
  logBlockedEvent
};
