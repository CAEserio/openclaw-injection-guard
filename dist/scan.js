import { RULES } from "./rules.js";
function scan(tagged) {
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
export {
  scan
};
