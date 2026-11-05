import { RULES, Rule } from "./rules.js";
import { TaggedContent } from "./trust.js";

export interface ScanResult {
  blocked: boolean;
  matchedRule: Rule | null;
}

/**
 * Screen untrusted content against the rule set. Trusted content is never
 * scanned or blocked — it came from the user, so it's out of scope for
 * this filter by definition (O1's trust model).
 */
export function scan(tagged: TaggedContent): ScanResult {
  if (tagged.trust === "trusted") {
    return { blocked: false, matchedRule: null };
  }

  for (const rule of RULES) {
    if (rule.pattern.test(tagged.text)) {
      return { blocked: true, matchedRule: rule };
    }
  }

  return { blocked: false, matchedRule: null };
}
