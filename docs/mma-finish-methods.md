# MMA optional finish-method predictions

Owner approved on 8 November 2026; [#32](https://github.com/L4Nci/tipovacka-zurich/issues/32).
This extends the [annual UFC league](ufc-season-league.md) without adding another
API, provider request, environment, game currency or prediction of finishing round.

## Player contract

The winner remains required. Under both fighter cards, one shared row offers
**KO/TKO · Submise / Submission · Na body / Decision**. The method is optional;
tap the selected option again to clear it. Saving only a winner is a complete
tip, so the home/missing counters do not require a method.

The winner distribution stays in place. The separate method bar counts only
saved, current-lineup predictions of active members in this lobby that have a
valid selected method. Largest-remainder rounding makes three nonempty shares
sum to 100%; zero selected methods yields a neutral bar with three zero labels.

Changing a method enables Update even when the saved winner stays unchanged.
Clearing sends an explicit null. Replaced opponents invalidate both parts of the
old prediction until the player saves a new current-lineup pick before first bell.
Player lists and own result summaries display the method. Rules, scoring and an
example remain behind the existing information dialog, in CZ/EN.

## Versioned points

`mma-winner-method-v2` scores each settled bout independently:

| Correct prediction | Points |
| --- | --- |
| Winner and method | 5 |
| Winner only, including no method chosen | 3 |
| Method only, wrong winner | 1 |
| Neither | 0 |

This is 3 for winner + 1 for method + 1 for the exact combination. Draws, no
contests, cancellations, unfinished/unknown-winner bouts and stale lineups score
zero. DQ and explicitly unclassified `other` outcomes award winner points only.

The migration preserves all player selections. It upgrades only announced or
scheduled v1 cards whose first-bell lock is still in the future, with no settled
bouts or previously awarded points. The three current cards met these conditions
at audit. Locked or historical cards keep `mma-winner-v1` (correct winner 1 point),
and the UI shows their original rules and winner-only controls. Future imports
default to v2; ordinary sync cannot change an existing card's rules version.

Annual/event leaderboards sum server-managed points under each card's version;
no duplicate predictions or artificial match scores are created.

## Provider and result authority

The existing UFCalendar full-card response supplies `method_normalized`; retain
it alongside the original display text. No extra endpoint or poll is needed.
The [provider contract](https://api.ufcalendar.com/openapi.json) is verified at implementation.

| Provider value | Player category |
| --- | --- |
| `ko_tko` | KO/TKO |
| `submission`, `technical_submission` | Submission |
| `decision`, `decision_unanimous`, `decision_split`, `decision_majority` | Decision |
| `dq`, `other` | No method bonus |
| `draw`, `no_contest` | No points for the bout |

No guessing from free-text labels. A final winner with no normalized method
can earn winner points; the UI says method points await confirmation. When the
provider supplies that classification, the same sync automatically adds the
bonus. A previously verified method must not silently become null: that snapshot
fails closed. A later explicit method/winner correction can regrade all affected
lobbies. Same verified observations repair derived points; older observations
and conflicting equal-time snapshots remain rejected.

`mma_predictions.predicted_method` accepts only three values or null. Normalized
sports methods have a separate vocabulary constraint. The trigger retains
immutable lobby/fight/player identity, membership, active competition, first-bell,
lineup and server-only points checks. Scoring/grouping helpers live in the private
schema with client execution revoked. Existing table RLS/grants stay in place;
players cannot write sports outcomes or assign points.

## Rollout and verification

Pair migration `20261108114411_mma_finish_method_predictions.sql` with the frontend
and worker build. During rollout the loader can read both schemas, and v1 saves
omit the method column. Back up database state and changed functions first.
Review open-card activation and original-pick preservation before committing the
migration. No historical result backfill or manual real prediction is required.

- Unit/parser tests cover categories, contradictory results, 5/3/1/0, optional
  methods, historical v1, invalid lineups and exact percentage totals.
- In one `BEGIN/ROLLBACK`, run `mma_finish_method_before_migration.sql`, the
  candidate migration, then `mma_finish_method_predictions.sql`. The first file
  creates a unique locked v1 card to test activation boundaries. The main suite
  covers clear upserts, permissions/context, corrections, delayed classification,
  lineup changes, v1 preservation and event/year totals.
- Run annual-league and portrait suites after the candidate migration inside
  rollback transactions. Preserve profiles, football/hockey matches and picks;
  compare existing MMA fields excluding the newly added nullable method column.
- Browser fixtures exercise winner-only save, add/clear, shares, stale lineup,
  locking, v1/v2 rules, results/points, CZ/EN and mobile/desktop.
- Run typecheck, relevant tests, both builds and `git diff --check`. After the
  approved release, verify the deployed worker's dry-run/write path and re-check
  schema, permissions, original data, static assets and API budgets.

Changing v2 scores or regrading a locked card is a new rule decision. Do not
downgrade the points constraint or drop method columns after players use them.

Verified before release on 8 November: 77 unit/provider/i18n tests, typecheck,
both builds and three rollback DB suites passed. Original MMA/legacy picks and
profiles matched after the candidate migration and tests. Browser fixture QA
passed save/add/clear, lineup reset, first-bell lock, v1/v2 results and rules,
CZ/EN, 320/390 px mobile and desktop; the final run had no console warnings or
errors. A private local backup includes affected data, functions, constraints
and current MMA policies. These are pre-release checks; deployed verification
and owner acceptance are tracked in [release PR #33](https://github.com/L4Nci/tipovacka-zurich/pull/33).
