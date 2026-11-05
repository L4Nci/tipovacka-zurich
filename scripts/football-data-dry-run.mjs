import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { analyzeSeason, createProviderReader } from '../server/lib/footballDataProvider.mjs';
export { analyzeSeason, createProviderReader, readFinalScore } from '../server/lib/footballDataProvider.mjs';

async function main() {
  const args = process.argv.slice(2);
  const competition = args[0] ?? 'CL';
  const season = Number(args[1] ?? new Date().getUTCFullYear());
  if (args.length > 2 || !['CL', 'PL'].includes(competition) || !Number.isInteger(season) || season < 2000 || season > 2100) {
    throw new Error('Usage: npm run football-data:dry-run -- [CL|PL] [season-start-year]');
  }
  const reader = createProviderReader(process.env.FOOTBALL_DATA_API_TOKEN);
  // Deliberately sequential; the free plan has a small per-minute request budget.
  const metadata = await reader.competition(competition);
  if (metadata.code !== competition) throw new Error('Provider metadata does not match the requested competition.');
  const payload = await reader.matches(competition, season);
  const report = analyzeSeason(payload, { competition, season });
  const directory = mkdtempSync(join(tmpdir(), 'tipovacka-football-data-'));
  for (const [name, value] of Object.entries({ metadata, matches: payload, report })) {
    writeFileSync(join(directory, `${name}.json`), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  }
  console.log(JSON.stringify({
    competition, season, validationPassed: report.validationPassed, matches: report.matches, teams: report.teams,
    pilotReady: report.pilotReady, candidatePilotRounds: report.candidatePilotRounds,
    candidatePilotMatches: report.candidatePilotMatches, issues: report.issues,
    report: join(directory, 'report.json'), databaseWrites: 0,
  }, null, 2));
  if (!report.validationPassed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
