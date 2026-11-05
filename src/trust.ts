/**
 * Trust tagging (O1).
 *
 * Rule: content that comes directly from the user's own chat message is
 * trusted. Content the agent fetches itself (a web page, a tool result,
 * a file read from disk) is untrusted until screened.
 *
 * This is deliberately a pure function with no OpenClaw imports, so it can
 * be unit-tested and demoed on its own before it's wired into any hook.
 */

export type TrustSource = "user_message" | "tool_result";
export type TrustLabel = "trusted" | "untrusted";

export interface TaggedContent {
  text: string;
  source: TrustSource;
  trust: TrustLabel;
}

export function tagContent(text: string, source: TrustSource): TaggedContent {
  // This is the whole trust model for now: only the user's own message is
  // trusted. Everything that arrives through a tool (browsing a page,
  // reading a file, calling an API) is untrusted by default, regardless of
  // what it claims to be.
  const trust: TrustLabel = source === "user_message" ? "trusted" : "untrusted";
  return { text, source, trust };
}
