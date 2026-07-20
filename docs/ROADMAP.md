# Roadmap

This document is a lightweight, agent-readable product direction file. It is not a replacement for GitHub Issues and should not contain detailed implementation task lists.

## Product Direction

Tipovačka is a private sports prediction league app for friends, colleagues, families, and small groups. The current repository supports lobby-based prediction flows, match results, leaderboards, and long-term tournament winner picks.

## Current Focus

Based on repository documentation, the current focus is:

- keep live/beta production data safe,
- maintain trust in scoring and leaderboard totals,
- support FIFA World Cup 2026 football flows,
- keep result and fixture sync guarded and auditable,
- improve the existing UI without changing scoring or lock rules unless explicitly approved.

## Next

Do not treat this section as a priority list until linked Issues exist.

- Create concrete GitHub Issues for known bugs, improvements, and research.
- Keep production safety rules in [AGENTS.md](../AGENTS.md) and [PROJECT_RULES.md](../PROJECT_RULES.md) up to date.
- Add agent-readable summaries when external visual roadmap decisions become stable.

## Later

The README mentions possible future areas such as push notifications, player statistics, season history, public leaderboards, profile/avatar improvements, and PWA/mobile app direction. These are not implementation-ready unless represented by specific GitHub Issues.

## Explicitly Not Planned

Not currently confirmed in repository scope:

- betting or in-app financial settlement,
- enterprise project management workflow,
- complex GitHub Projects automation.

## Open Product Decisions

Open questions already listed in [PROJECT_RULES.md](../PROJECT_RULES.md) include:

- target customer/use case,
- near-term priorities,
- admin role boundaries,
- future data/API strategy.

Do not infer answers without an Issue or explicit owner decision.

## Links to Relevant GitHub Issues

Add links here only for roadmap-level themes or decisions. Keep detailed implementation work in Issues, not in this file.

## Roadmap vs Issues

- `ROADMAP.md` says where the product is heading.
- GitHub Issues say what concrete work should be done.
- Detailed implementation tasks should not be copied into the roadmap.
- A visual roadmap may be maintained externally, but the agent-readable state should be reflected here when decisions become stable.
