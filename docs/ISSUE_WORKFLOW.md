# GitHub Issue Workflow

GitHub Issues are the source of truth for concrete work in Tipovačka: bugs, technical tasks, feature requests, research, and decisions. Keep the workflow lightweight; there are no sprints, capacity planning, or complex status boards.

## When to Create a Bug

A bug is a difference between expected and actual behavior in an existing feature.

Examples:

- leaderboard total does not match stored/recalculated points,
- a page renders wrong data,
- a guarded endpoint returns the wrong status,
- a production-only route is missing.

## When to Create a Feature or Improvement

- A feature adds a new capability.
- An improvement makes an existing capability clearer, faster, safer, or easier to use without necessarily fixing broken behavior.
- A technical task is implementation work that has a clear target but may not be user-facing.

The Issue should describe the problem and desired outcome. It does not need to prescribe the technical solution unless that solution is already known.

## When to Create Research

Create a research Issue when the correct solution or decision is not clear yet.

The output can be:

- recommendation,
- comparison table,
- proof of concept,
- Architecture Decision Record,
- new technical Issues.

## Recommended Issue Lifecycle

1. Issue is created.
2. Context is added.
3. Priority is assigned.
4. If ready for implementation, it gets `agent: ready`.
5. Agent analyzes the Issue and current code.
6. Agent implements on a separate branch.
7. Agent creates a Pull Request linked to the Issue.
8. Tests and review run.
9. After merge, the Issue closes if it is truly complete.
10. If manual verification is needed, the Issue remains open or gets `needs: verification`.

## Ready for Codex

An Issue may get `agent: ready` only when it includes:

- clear problem or goal,
- acceptance criteria,
- needed context,
- known constraints,
- whether Codex should only analyze or may also implement.

## How Codex Should Respond

If the request is underspecified, Codex should not guess critical product behavior. It should:

- describe the ambiguity,
- ask a concrete question,
- suggest `needs: decision` when appropriate.

If Codex finds a separate problem while working:

- do not fix it silently,
- describe it in the PR or final report,
- propose a separate Issue.

## Labels

Use the minimal label set prepared in [scripts/setup-github-labels.sh](../scripts/setup-github-labels.sh):

- type labels describe the kind of Issue,
- priority labels describe urgency,
- workflow labels describe current state,
- area labels describe the broad system area.

Avoid creating labels for every screen, component, or one-off topic.

## Pull Requests

Every non-trivial PR should reference a concrete Issue. Use `Closes #123` only when the PR fully completes the Issue. For UI/UX, product behavior, scoring, auth, sync, database, and hard-to-automate changes, prefer owner review before merge.

## Automation

No GitHub Projects or roadmap automation is required for the current workflow.

A future GitHub Actions workflow can be useful if it stays small and only:

- checks that a non-trivial PR references an Issue,
- reminds authors to complete the PR template,
- runs existing checks such as `npm run lint`, `npm run build`, and `git diff --check`.

It must not merge, deploy, mutate production data, close Issues without a linked merge, or mark unverified work as done.
