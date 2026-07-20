# Solo Owner Issue Workflow

GitHub Issues are lightweight project memory for Tipovačka. They capture bugs, desired changes, research questions, decisions, and context that should not disappear in chat history.

This is a solo-owner workflow with Codex as the main collaborator. There are no sprints, capacity planning, assignee rituals, formal acceptance ceremonies, or GitHub Projects requirements.

## Normal Flow

1. The owner describes a bug, feature, improvement, or research question in normal language.
2. If the owner explicitly asks to create an Issue and GitHub write access is available, Codex searches open Issues for duplicates.
3. If no duplicate exists, Codex creates a concise Issue with an appropriate type and priority.
4. Codex audits the Issue against the real repository state and proposes a solution.
5. For risky work, the owner approves before implementation.
6. Codex implements only after approval when approval is needed.
7. The owner reviews, commits, and pushes.
8. Codex may comment on or close the Issue only after the owner explicitly confirms acceptance, unless a reviewed merged PR closes it with `Closes #123`.

If GitHub write access is unavailable, Codex should return the exact proposed Issue title, body, and labels for the owner to create manually.

## What an Issue Needs

An Issue should be concise but sufficient to reproduce or understand the work.

Good Issue content usually includes:

- root problem or desired outcome,
- relevant evidence or context,
- expected result,
- important constraints such as no DB writes, no scoring changes, no deployment changes,
- links to related docs, screenshots, logs, or prior decisions when useful.

Do not turn Issues into bureaucracy. If a short Issue is enough, keep it short.

## Types

- `type: bug` — existing behavior is wrong.
- `type: feature` — adds a new capability.
- `type: improvement` — improves existing behavior or implementation.
- `type: research` — explores a question before implementation.

## Normal Labels

Use the smallest useful label set in daily work:

- `type: bug`
- `type: feature`
- `type: improvement`
- `type: research`
- `priority: P1` — core flow broken, release blocker, data trust, or serious production issue
- `priority: P2` — important but not blocking
- `priority: P3` — small, cosmetic, or backlog
- `needs: decision` — owner/product/technical decision needed before implementation

Other prepared labels may remain available for exceptional cases, but they are not required for normal work.

## Codex Issue Behavior

When the owner says “create an Issue for this”:

- search existing open Issues first when GitHub tools are available,
- do not create duplicates,
- choose a concise title,
- choose type and priority labels,
- include the root problem, relevant evidence, expected outcome, and implementation constraints,
- keep the body short and useful,
- if GitHub write access is unavailable, return the exact proposed title/body/labels.

Codex must not close an Issue until the owner confirms the fix is accepted, unless a reviewed merged PR explicitly closes it.

## Implementation and Review

Not every trivial fix needs a separate branch or PR. For non-trivial changes, prefer a Pull Request linked to the Issue. Use `Closes #123` only when the PR fully resolves the Issue.

Owner approval is required before risky work, especially changes touching:

- production data,
- database schema or RLS,
- scoring or leaderboard logic,
- locking rules,
- auth or roles,
- result sync or fixture sync,
- deployment.

For UI/product changes, the owner confirms acceptance after reviewing the result. Until then, the Issue can remain open.

## Automation

Do not introduce complex GitHub Projects or roadmap automation for this workflow.

A future small GitHub Actions workflow may be useful if it only:

- checks PR structure,
- reminds about a missing Issue link,
- runs existing checks such as `npm run lint`, `npm run build`, and `git diff --check`.

It must not merge, deploy, mutate production data, close Issues without owner acceptance or a reviewed merge, or mark unverified work as done.
