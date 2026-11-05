import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { tagContent } from "./trust.js";
import { scan } from "./scan.js";
import { logBlockedEvent } from "./logger.js";
const LOG_FILE_PATH = process.env.INJECTION_GUARD_LOG_PATH ?? "./injection-guard-blocked.log.txt";
const DEBUG = process.env.INJECTION_GUARD_DEBUG === "1";
const SCANNED_TOOL_NAMES = /* @__PURE__ */ new Set(["read", "read_file", "fs_read", "web_fetch"]);
function resolveFilePath(rawPath) {
  if (isAbsolute(rawPath)) return rawPath;
  const workspaceDir = process.env.OPENCLAW_WORKSPACE_DIR ?? "/home/node/.openclaw/workspace";
  return join(workspaceDir, rawPath);
}
function extractCandidatePath(params) {
  const candidate = params?.path ?? params?.filePath ?? params?.file ?? params?.file_path ?? params?.url ?? params?.uri ?? null;
  return typeof candidate === "string" ? candidate : null;
}
function isUrl(candidate) {
  return /^https?:\/\//i.test(candidate);
}
async function fetchUrlText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1e4);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
var index_default = definePluginEntry({
  id: "injection-guard",
  name: "Prompt Injection Guard",
  description: "Tags tool-read content as untrusted, screens it against a rule set, and blocks the tool call (not just the transcript) + logs anything that matches.",
  register(api) {
    api.on(
      "before_tool_call",
      async (event, ctx) => {
        if (DEBUG) {
          console.warn(
            "[injection-guard] before_tool_call saw tool:",
            event?.toolName,
            "params keys:",
            event?.params ? Object.keys(event.params) : null
          );
        }
        if (!SCANNED_TOOL_NAMES.has(event?.toolName)) return;
        const rawPath = extractCandidatePath(event?.params);
        if (!rawPath) {
          if (DEBUG) {
            console.warn(
              "[injection-guard] before_tool_call: no recognized path field on params for tool",
              event?.toolName,
              "raw params follow:",
              JSON.stringify(event?.params, null, 2)
            );
          }
          return;
        }
        let text;
        if (isUrl(rawPath)) {
          const fetched = await fetchUrlText(rawPath);
          if (fetched === null) {
            if (DEBUG) {
              console.warn("[injection-guard] before_tool_call: could not fetch", rawPath);
            }
            return;
          }
          text = fetched;
        } else {
          try {
            text = readFileSync(resolveFilePath(rawPath), "utf8");
          } catch (error) {
            if (DEBUG) {
              console.warn(
                "[injection-guard] before_tool_call: could not read",
                rawPath,
                String(error)
              );
            }
            return;
          }
        }
        const tagged = tagContent(text, "tool_result");
        const result = scan(tagged);
        if (!result.blocked || !result.matchedRule) return;
        logBlockedEvent(LOG_FILE_PATH, {
          payload: text,
          sourceUrl: rawPath,
          requestingAgent: ctx?.agentId ?? null,
          ruleId: result.matchedRule.id,
          ruleCategory: result.matchedRule.category,
          ruleDescription: result.matchedRule.description
        });
        return {
          block: true,
          blockReason: `[blocked by injection-guard: content matched rule ${result.matchedRule.id} \u2014 ${result.matchedRule.description}. Original content withheld and logged.]`
        };
      },
      { priority: 100 }
    );
    api.on(
      "tool_result_persist",
      // IMPORTANT: this hook is synchronous in OpenClaw. An async handler
      // returns a Promise, which the gateway logs a warning about and
      // ignores entirely. Do not add `async`/`await` here.
      (event, ctx) => {
        const content = event?.message?.content ?? event?.message?.details?.content;
        const parts = [];
        if (typeof content === "string") parts.push(content);
        else if (Array.isArray(content)) {
          for (const item of content) {
            if (typeof item === "string") parts.push(item);
            else if (item && typeof item.text === "string") parts.push(item.text);
          }
        }
        const text = parts.join("\n");
        if (DEBUG) {
          console.warn(
            "[injection-guard] tool_result_persist saw tool:",
            event?.toolName,
            "extracted text length:",
            text.length
          );
        }
        if (!text) return;
        const tagged = tagContent(text, "tool_result");
        const result = scan(tagged);
        if (!result.blocked || !result.matchedRule) return;
        logBlockedEvent(LOG_FILE_PATH, {
          payload: text,
          sourceUrl: null,
          requestingAgent: ctx?.agentId ?? null,
          ruleId: result.matchedRule.id,
          ruleCategory: result.matchedRule.category,
          ruleDescription: `[persist-stage, post-hoc] ${result.matchedRule.description}`
        });
        return {
          message: {
            ...event.message,
            content: [
              {
                type: "text",
                text: `[blocked by injection-guard: content matched rule ${result.matchedRule.id} \u2014 ${result.matchedRule.description}. Original content withheld and logged.]`
              }
            ]
          }
        };
      },
      { priority: 100 }
    );
  }
});
export {
  index_default as default
};
