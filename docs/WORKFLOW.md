# Development Workflow

## Branch-per-Feature

Every feature or fix is developed in a separate git branch. The agent creates the branch before touching any code, works entirely on it, then merges to `main` only after explicit user approval.

### Steps

1. **Agent creates branch** — named after the feature, e.g. `feature/payment-requests` or `fix/pin-stale-closure`.
2. **Agent implements** — all commits land on the feature branch. `main` is never touched during development.
3. **User reviews** — agent presents a summary of changes (diff, test results, manual verification). User either approves or requests changes.
4. **Merge to main** — only after explicit approval. Agent runs `git merge` (or `gh pr merge`) into `main`.

### Naming Convention

```
feature/<short-description>   # new functionality
fix/<short-description>       # bug fix
chore/<short-description>     # tooling, deps, docs
```

### Rules

- Never commit directly to `main` without user approval.
- One branch per logical unit of work — don't bundle unrelated changes.
- Branch stays open until the user says "looks good, merge it."
- If a PR has review comments, address them on the same branch before merging.
