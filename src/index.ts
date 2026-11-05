import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { tagContent } from "./trust.js";
import { scan } from "./scan.js";
import { logBlockedEvent } from "./logger.js";

// Where blocked events get appended. Swap for a real log store later (O3);
// nothing else in this file needs to change when you do.
const LOG_FILE_PATH =
  process.env.INJECTION_GUARD_LOG_PATH ?? "./injection-guard-blocked.log.txt";

const DEBUG = process.env.INJECTION_GUARD_DEBUG === "1";

// The real blocking point.
//
// `tool_result_persist` (the first approach, kept below for O3 audit
// logging) only transforms what gets WRITTEN TO THE TRANSCRIPT STORE — it
// runs inside `transformToolResultForPersistence` in OpenClaw's own
// session-tool-result-guard-wrapper. By the time it fires, the model has
// already read the raw tool output and generated its reply from it. That's
// why v0.1.3/v0.1.4 correctly matched and logged the runbook fixture, but
// the agent's actual answer still contained the real file contents: the
// hook was gating the history record, not the model's input.
//
// `before_tool_call` fires BEFORE the tool executes and can return
// `{ block: true, blockReason }`, which stops the tool from running at
// all — so nothing it would have returned ever reaches the model. The
// trade-off: at this point we only have the tool's call parameters (e.g.
// which file to read), not its result text yet. So for file-reading tools,
// this handler reads the same file itself, scans it, and blocks the real
// call if it matches — before the model ever sees a byte of it.
// "read"/"read_file"/"fs_read" cover local workspace file reads.
// "web_fetch" (confirmed via INJECTION_GUARD_DEBUG=1 against the real
// install — its params are { url, extractMode, maxChars }) covers fetching
// a URL. Both are scanned the same way: read/fetch the content ourselves,
// here, before the real tool call runs.
const SCANNED_TOOL_NAMES = new Set(["read", "read_file", "fs_read", "web_fetch"]);

function resolveFilePath(rawPath: string): string {
  if (isAbsolute(rawPath)) return rawPath;
  const workspaceDir =
    process.env.OPENCLAW_WORKSPACE_DIR ?? "/home/node/.openclaw/workspace";
  return join(workspaceDir, rawPath);
}

function extractCandidatePath(params: any): string | null {
  const candidate =
    params?.path ??
    params?.filePath ??
    params?.file ??
    params?.file_path ??
    params?.url ??
    params?.uri ??
    null;
  return typeof candidate === "string" ? candidate : null;
}

function isUrl(candidate: string): boolean {
  return /^https?:\/\//i.test(candidate);
}

// Fetches the same URL the real web_fetch tool is about to fetch, so we can
// scan it before that call runs. Best-effort: a 10s timeout and any network
// error both fail OPEN (return null) rather than blocking a call we
// couldn't independently verify — we'd rather miss a scan than break every
// fetch whenever our own request hits a hiccup the real tool wouldn't.
async function fetchUrlText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export default definePluginEntry({
  id: "injection-guard",
  name: "Prompt Injection Guard",
  description:
    "Tags tool-read content as untrusted, screens it against a rule set, and blocks the tool call (not just the transcript) + logs anything that matches.",
  register(api) {
    // --- The real gate: runs before the tool executes. -------------------
    api.on(
      "before_tool_call",
      async (event: any, ctx: any) => {
        if (DEBUG) {
          // eslint-disable-next-line no-console
          console.warn(
            "[injection-guard] before_tool_call saw tool:",
            event?.toolName,
            "params keys:",
            event?.params ? Object.keys(event.params) : null,
          );
        }
        if (!SCANNED_TOOL_NAMES.has(event?.toolName)) return;

        const rawPath = extractCandidatePath(event?.params);
        if (!rawPath) {
          if (DEBUG) {
            // eslint-disable-next-line no-console
            console.warn(
              "[injection-guard] before_tool_call: no recognized path field on params for tool",
              event?.toolName,
              "raw params follow:",
              JSON.stringify(event?.params, null, 2),
            );
          }
          return;
        }

        let text: string;
        if (isUrl(rawPath)) {
          const fetched = await fetchUrlText(rawPath);
          if (fetched === null) {
            if (DEBUG) {
              // eslint-disable-next-line no-console
              console.warn("[injection-guard] before_tool_call: could not fetch", rawPath);
            }
            return; // couldn't fetch it ourselves; let the real tool call proceed/fail normally
          }
          text = fetched;
        } else {
          try {
            text = readFileSync(resolveFilePath(rawPath), "utf8");
          } catch (error) {
            if (DEBUG) {
              // eslint-disable-next-line no-console
              console.warn(
                "[injection-guard] before_tool_call: could not read",
                rawPath,
                String(error),
              );
            }
            return; // can't scan it ourselves; let the real tool call proceed/fail normally
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
          ruleDescription: result.matchedRule.description,
        });

        // Blocking here means the tool call itself never runs, so the
        // model never receives the file's content in any form.
        return {
          block: true,
          blockReason: `[blocked by injection-guard: content matched rule ${result.matchedRule.id} — ${result.matchedRule.description}. Original content withheld and logged.]`,
        };
      },
      { priority: 100 },
    );

    // --- Kept as a secondary audit record for O3. -------------------------
    // Fires after the fact, on the transcript-persistence path. Even though
    // it's too late to stop the model from having read the content, it's
    // still a useful independent log of anything that reaches persisted
    // history unblocked (e.g. a tool this plugin doesn't scan pre-call, or
    // a bug in the gate above). Synchronous handler is required — see note.
    api.on(
      "tool_result_persist",
      // IMPORTANT: this hook is synchronous in OpenClaw. An async handler
      // returns a Promise, which the gateway logs a warning about and
      // ignores entirely. Do not add `async`/`await` here.
      (event: any, ctx: any) => {
        const content = event?.message?.content ?? event?.message?.details?.content;
        const parts: string[] = [];
        if (typeof content === "string") parts.push(content);
        else if (Array.isArray(content)) {
          for (const item of content) {
            if (typeof item === "string") parts.push(item);
            else if (item && typeof item.text === "string") parts.push(item.text);
          }
        }
        const text = parts.join("\n");
        if (DEBUG) {
          // eslint-disable-next-line no-console
          console.warn(
            "[injection-guard] tool_result_persist saw tool:",
            event?.toolName,
            "extracted text length:",
            text.length,
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
          ruleDescription: `[persist-stage, post-hoc] ${result.matchedRule.description}`,
        });

        return {
          message: {
            ...event.message,
            content: [
              {
                type: "text",
                text: `[blocked by injection-guard: content matched rule ${result.matchedRule.id} — ${result.matchedRule.description}. Original content withheld and logged.]`,
              },
            ],
          },
        };
      },
      { priority: 100 },
    );
  },
});
