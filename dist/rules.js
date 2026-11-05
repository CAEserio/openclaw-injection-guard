const RULES = [
  // --- Instruction override ---------------------------------------------
  {
    id: "IO-01",
    category: "instruction_override",
    description: `"ignore ... instructions" phrasing`,
    pattern: /ignore\s+(all\s+)?(the\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i
  },
  {
    id: "IO-02",
    category: "instruction_override",
    description: `"disregard ... above/instead" phrasing`,
    pattern: /disregard\s+(the\s+)?(above|previous|prior)[\s\S]{0,40}(instead|and)/i
  },
  {
    id: "IO-03",
    category: "instruction_override",
    description: "explicit instruction to forget prior context",
    pattern: /forget\s+(everything|all)\s+(you\s+)?(were\s+)?told/i
  },
  {
    id: "IO-04",
    category: "instruction_override",
    description: "new/real instructions override claim",
    pattern: /(your|the)\s+(real|actual|true|new)\s+(instructions?|task|goal)\s+(is|are|now)/i
  },
  {
    id: "IO-05",
    category: "instruction_override",
    description: "do not follow / stop following safety rules",
    pattern: /(do\s+not|don'?t|stop)\s+follow(ing)?\s+(your\s+)?(safety|previous|original)\s+(rules?|instructions?|guidelines?)/i
  },
  // --- Fake system / role tags --------------------------------------------
  {
    id: "FS-01",
    category: "fake_system_tag",
    description: "fake <system> tag",
    pattern: /<\s*system\s*>/i
  },
  {
    id: "FS-02",
    category: "fake_system_tag",
    description: "bracketed [SYSTEM]/[ADMIN]/[DEVELOPER] tag",
    pattern: /\[\s*(system|admin|developer|root)\s*\]\s*:/i
  },
  {
    id: "FS-03",
    category: "fake_system_tag",
    description: "claims of developer/debug/god mode",
    pattern: /(developer|debug|god|jailbreak|dan)\s+mode\s+(enabled|activated|on)/i
  },
  {
    id: "FS-04",
    category: "fake_system_tag",
    description: "override safety/guardrail settings",
    pattern: /override\s+(the\s+)?(safety|security|guardrail)\s+(settings?|controls?)/i
  },
  {
    id: "FS-05",
    category: "fake_system_tag",
    description: "claims to BE the system/developer speaking",
    pattern: /i\s+am\s+(the\s+)?(system|your\s+developer|an?\s+admin(istrator)?)/i
  },
  // --- Hidden text ---------------------------------------------------------
  {
    id: "HT-01",
    category: "hidden_text",
    description: "instruction-bearing HTML comment",
    pattern: /<!--[\s\S]{0,400}?(ignore|system|instructions?|secret|api[_ ]?key|password)[\s\S]{0,400}?-->/i
  },
  {
    id: "HT-02",
    category: "hidden_text",
    description: "zero-width / invisible unicode characters (obfuscation)",
    pattern: /[​‌‍﻿]/
  },
  {
    id: "HT-03",
    category: "hidden_text",
    description: "white-text-on-white or display:none styling near instructive text",
    pattern: /(display\s*:\s*none|color\s*:\s*#?fff(fff)?\s*;?\s*)[\s\S]{0,200}?(ignore|system|instructions?)/i
  },
  {
    id: "HT-04",
    category: "hidden_text",
    description: "base64-looking blob adjacent to an instruction keyword (possible encoded payload)",
    pattern: /(ignore|system|instructions?)[\s\S]{0,80}?[A-Za-z0-9+/]{40,}={0,2}/i
  },
  {
    id: "HT-05",
    category: "hidden_text",
    description: "request to exfiltrate secrets to a URL",
    pattern: /(send|post|email|upload)\s+(the\s+)?(api[_ ]?key|password|secret|token|credentials?)[\s\S]{0,60}?(to|at)\s+(this\s+)?(url|address|link)/i
  },
  // --- Command exfiltration ------------------------------------------------
  // "Run this shell command (which reads something sensitive) and report
  // the output back" — no override phrasing, no fake tags, no hidden
  // comment needed. This is the pattern that got past the first three
  // categories (see the "Nightly Environment Audit" runbook fixture):
  // a plain-prose instruction framed as routine, ordinary work.
  {
    id: "CE-01",
    category: "command_exfiltration",
    description: "asks to run a command reading an env var/secret, then report the output",
    pattern: /(run|execute)\s+[\s\S]{0,60}?(printenv|\benv\b|process\.env|cat\s+\.env|getenv)[\s\S]{0,160}?(paste|include|report|return|send|share)[\s\S]{0,40}?(output|result)/i
  },
  {
    id: "CE-02",
    category: "command_exfiltration",
    description: "asks to read/print a secret-like env var name and include its value in a reply",
    pattern: /(secret|api[_ ]?key|token|password|credential)[\s\S]{0,80}?environment\s+variable[\s\S]{0,120}?(include|paste|report|prefix|reply)/i
  },
  {
    id: "CE-03",
    category: "command_exfiltration",
    description: "framing a sensitive lookup as a routine audit/verification/runbook task",
    pattern: /(nightly|routine|standard)\s+(audit|verification|check)[\s\S]{0,200}?(printenv|environment\s+variable|api[_ ]?key|secret|credential)/i
  }
];
export {
  RULES
};
