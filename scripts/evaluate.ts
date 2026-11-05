/**
 * Standalone evaluation harness — no OpenClaw install required.
 *
 * Runs every file in fixtures/ through the same tag+scan logic the real
 * plugin uses, compares the result against what the filename prefix says
 * should happen, and reports a block rate / false positive rate. This is
 * the O6 evaluation, just pointed at a local fixtures folder for now
 * instead of self-hosted test pages.
 *
 * File naming convention: clean-*.html and deceptive-*.html should NOT
 * be blocked; injected-*.html SHOULD be blocked.
 *
 * Run with:
 *   npx tsx scripts/evaluate.ts
 */
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tagContent } from "../src/trust.js";
import { scan } from "../src/scan.js";
import { logBlockedEvent } from "../src/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "..", "fixtures");
const LOG_FILE_PATH = join(__dirname, "..", "injection-guard-blocked.log.txt");

function expectedBlocked(filename: string): boolean {
  return filename.startsWith("injected-");
}

async function main() {
  const files = (await readdir(FIXTURES_DIR)).filter((f) => f.endsWith(".html"));
  let truePositives = 0; // injected, correctly blocked
  let falseNegatives = 0; // injected, missed
  let falsePositives = 0; // clean/deceptive, wrongly blocked
  let trueNegatives = 0; // clean/deceptive, correctly left alone

  console.log(`Running ${files.length} fixtures through the filter...\n`);

  for (const filename of files.sort()) {
    const text = await readFile(join(FIXTURES_DIR, filename), "utf8");
    const tagged = tagContent(text, "tool_result");
    const result = scan(tagged);
    const expected = expectedBlocked(filename);

    const correct = result.blocked === expected;
    const tag = correct ? "PASS" : "FAIL";
    const ruleInfo = result.matchedRule ? ` (rule ${result.matchedRule.id}: ${result.matchedRule.description})` : "";
    console.log(`[${tag}] ${filename} — blocked=${result.blocked}, expected=${expected}${ruleInfo}`);

    if (expected && result.blocked) truePositives++;
    else if (expected && !result.blocked) falseNegatives++;
    else if (!expected && result.blocked) falsePositives++;
    else trueNegatives++;

    if (result.blocked && result.matchedRule) {
      await logBlockedEvent(LOG_FILE_PATH, {
        payload: text,
        sourceUrl: filename,
        requestingAgent: "eval-harness",
        ruleId: result.matchedRule.id,
        ruleCategory: result.matchedRule.category,
        ruleDescription: result.matchedRule.description,
      });
    }
  }

  const injectedTotal = truePositives + falseNegatives;
  const cleanTotal = falsePositives + trueNegatives;
  const blockRate = injectedTotal ? (truePositives / injectedTotal) * 100 : 0;
  const falsePositiveRate = cleanTotal ? (falsePositives / cleanTotal) * 100 : 0;

  console.log("\n--- Summary ---");
  console.log(`Block rate on injected pages:     ${blockRate.toFixed(1)}% (${truePositives}/${injectedTotal})`);
  console.log(`False positive rate on clean+deceptive: ${falsePositiveRate.toFixed(1)}% (${falsePositives}/${cleanTotal})`);
  console.log(`\nBlocked events appended to: ${LOG_FILE_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
