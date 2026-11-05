import assert from 'node:assert/strict';
import test from 'node:test';
import { clubCrestUrl } from './teamAssets.ts';
import { formatMatchKickoff, pragueCalendarDay } from './matchTime.ts';
import { isFootballKnockoutStage, isGroupStage, requiresFootballWinner } from './matchRules.ts';
import { previewScore } from './rulePreview.ts';
import { calculatePoints } from './scoring.ts';

test('club crests accept only the provider CDN and cannot become API URLs or script sources', () => {
  assert.equal(clubCrestUrl('https://crests.football-data.org/610.png'), 'https://crests.football-data.org/610.png');
  for (const value of [null, 'javascript:alert(1)', 'http://crests.football-data.org/610.png', 'https://evil.invalid/610.png',
    'https://crests.football-data.org/610.png?token=x', 'https://user:secret@crests.football-data.org/610.png']) assert.equal(clubCrestUrl(value), null);
});
test('league phase variants and regular seasons allow draws; only known knockout stages require a winner', () => {
  for (const phase of ['League Phase', 'LEAGUE_STAGE', 'league phase', 'REGULAR_SEASON', 'Group A']) {
    assert.equal(isGroupStage(phase), true); assert.equal(isFootballKnockoutStage(phase), false);
  }
  for (const phase of ['Final', 'Round of 32', 'SEMI_FINALS', 'Quarterfinal']) assert.equal(isFootballKnockoutStage(phase), true);
  assert.equal(isFootballKnockoutStage('unknown phase'), false);
  assert.equal(requiresFootballWinner('Round of 16', 'uefa-champions-league-2026-27'), false);
  assert.equal(requiresFootballWinner('Final', 'uefa-champions-league-2026-27'), true);
  assert.equal(requiresFootballWinner('Round of 16', 'fifa-world-cup-2026'), true);
  assert.equal(requiresFootballWinner('Final', 'fifa-world-cup-2026', 'regulation'), false);
});
test('Czech kickoff display uses Prague in winter and summer, with the calendar date', () => {
  assert.match(formatMatchKickoff('2026-11-24T17:45:00Z'), /24\.\s*11\..*18:45/);
  assert.match(formatMatchKickoff('2026-11-24T20:00:00Z'), /21:00/);
  assert.match(formatMatchKickoff('2026-09-08T16:45:00Z'), /18:45/);
  assert.match(formatMatchKickoff('2026-10-25T00:30:00Z'), /02:30/);
  assert.match(formatMatchKickoff('2026-10-25T01:30:00Z'), /02:30/);
  assert.equal(pragueCalendarDay(new Date('2026-11-24T23:30:00Z')) - pragueCalendarDay(new Date('2026-11-24T22:30:00Z')), 1);
});
test('rule preview separates regulation, extra time and shootout scores using existing points', () => {
  const regular = previewScore('regulation', 'penalties');
  const final = previewScore('final', 'penalties');
  assert.deepEqual(regular, { home: 1, away: 1 });
  assert.deepEqual(final, { home: 4, away: 3 });
  assert.deepEqual(previewScore('final', 'extra_time'), { home: 2, away: 1 });
  assert.deepEqual(previewScore('final', 'draw'), { home: 1, away: 1 });
  assert.equal(calculatePoints(1, 1, regular.home, regular.away), 5);
  assert.equal(calculatePoints(1, 1, final.home, final.away), 0);
  assert.equal(calculatePoints(4, 3, final.home, final.away), 5);
  assert.equal(calculatePoints(2, 1, final.home, final.away), 3);
});
