import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { loadConfig } from './config';
import { runPipeline } from './pipeline';
import { createSource } from './sources/createSource';
import { readSeen, writeSeen } from './store/seenStore';

const ROOT = process.cwd();
const CONFIG_PATH = resolve(ROOT, 'config/search.json');
const SEEN_PATH = resolve(ROOT, 'data/seen.json');
const CANDIDATES_PATH = resolve(ROOT, 'data/candidates/latest.json');

async function main(): Promise<void> {
  const config = await loadConfig(CONFIG_PATH);
  const seen = await readSeen(SEEN_PATH);
  const { output, seen: updatedSeen } = await runPipeline(config, createSource(config), seen, new Date());

  await mkdir(dirname(CANDIDATES_PATH), { recursive: true });
  await writeFile(CANDIDATES_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  await writeSeen(SEEN_PATH, updatedSeen);

  const { stats } = output;
  console.log(
    `[${output.runDate}] status=${output.status} fetched=${stats.fetched} skipped=${stats.skipped} ` +
      `hasSite=${stats.hasSite} alreadySeen=${stats.alreadySeen} new=${stats.newCandidates} deferred=${stats.deferred}`,
  );
  for (const error of output.errors) console.error(`  ${error.municipality}: ${error.message}`);

  // Files are written even on failure, so the morning report can explain what went wrong.
  if (output.status === 'failed') process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
