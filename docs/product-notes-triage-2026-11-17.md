# Product notes triage - 17 November 2026

This document turns the supplied product screenshots into a decision list. It
records the current repository state; it is not a new roadmap and does not
authorize deployment or product-scope changes.

## Fixed in this pass

| Note | Decision | Evidence |
| --- | --- | --- |
| Tournament rules feel crowded | Keep one read-only tournament-rules text block. Remove the duplicate generic rules explanation and nested panel. | `src/components/LobbyView.tsx` |
| Home says a schedule is pending although known matches exist | The current classifier already treats a partly published schedule as ready. Keep that behavior protected by a regression scenario. | `src/lib/homeDashboard_scenarios.ts` |
| Wrong team, bonus or champion in tournament standings | Use each player's stored pick and awarded points, and resolve the champion only within the selected tournament. A finished primary tournament must not supply a champion to another tournament. | `src/lib/db.ts`, `src/lib/leaderboard.test.ts` |

## Already implemented or superseded

| Note | Current state |
| --- | --- |
| Larger lobby cover, lower CTA, no large top-right trophy, community member count | Living Lobby cards use full-card system covers, an anchored single CTA and Czech `tipér/tipéři/tipérů` copy. The former large decorative trophy is gone. |
| Tournament progress on Home | Shown only where the Home read model has authoritative match totals. Completed cards intentionally omit duplicate `100%` progress. |
| Invitations between friends | Secure invite links, QR, Web Share/copy fallback and approval-aware join flows exist. |
| Public competition architecture | Public CL, PL and annual UFC entry reuses dedicated system-organizer lobbies and the existing prediction/scoring paths. The abandoned Official Events 020-023 model must not be revived. |
| Profile/account ownership | Clerk is the active identity source. Profile and account concerns are separated in the current product; legacy Supabase-login proposals are obsolete. |
| Blank Home states | Living Lobby Home and current empty states provide an action instead of rendering an empty dashboard. Remaining blank states should be reported with a concrete screen and account context. |

## Verify with a reproducible case

| Note | Required evidence before changing code |
| --- | --- |
| MMA and hockey should use the same product language as football | Compare the current match, results, standings and leaderboard screens at 390 px. Preserve sport-specific prediction controls while sharing hierarchy and feedback patterns. |
| Day filters (`Dnes`, `Zítra`, date) | Validate that the active competition has enough matches per day to make the extra control reduce work rather than add another navigation layer. |
| More concrete scoring examples | Check the current in-product scoring preview first. Use real upcoming teams/fighters only when they are authoritative and available; never hard-code an example that can become misleading. |

## Operational blockers, not frontend fixes

| Topic | Current state / next gate |
| --- | --- |
| MMA fighter thumbnails | Automatic portrait refresh exists and preserves the last good image. The monthly provider budget is currently exhausted, so no additional safe refresh is due until the next quota window. |
| Clerk development mode | Requires the final production domain and production Clerk configuration. Do not hide the development banner with CSS. |
| Public landing page | A private Sites v1 exists. Public release still needs the final domain, production Clerk path, final legal/privacy/contact content, real product media and owner acceptance. |
| Landing benefits and automatic results | The draft already communicates automatic fixtures/results. Final copy and evidence belong in the landing source, not the game repository. |
| Public competition launch | CL, PL and UFC pools are provisioned behind a disabled global gate. Enabling them needs a separate controlled acceptance; it is not a visual quick fix. |

## Product decisions to retain

- The game remains lobby-first. Public competitions are another entry path,
  not a second dashboard.
- System covers are deterministic fallbacks. Future custom lobby branding can
  add avatar/cover/theme fields, but entitlement must not become an
  authorization boundary.
- Do not show decorative metadata that competes with the next action.
- Do not change scoring, locks, result sync or winner calculations to solve a
  presentation report without first proving the stored data is wrong.

## Suggested next review order

1. Review the leaderboard fix in a lobby with both a finished and an open tournament.
2. Review MMA and hockey presentation side by side at mobile width.
3. Decide the production domain, then finish Clerk and landing release gates.
4. Run the separate public-pool acceptance before enabling the global gate.
