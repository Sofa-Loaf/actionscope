# Contributing

Actionscope is at v0: a small GitHub Action that posts a Job Summary. Keep changes lean. No auth, billing, or Marketplace App in this pass.

## Layout

```
action/                 # the reusable Action
  action.yml
  index.js              # GitHub runtime: API + summary
  estimate.js           # pure estimate + markdown
  estimate.test.js
.github/workflows/demo.yml
```

## Develop

Requires Node 20+ locally. The Action runtime on GitHub is Node 24. No npm install — no dependencies.

```bash
node action/estimate.test.js
# or
node --test-reporter=spec -e "require('./action/estimate.test.js')"
```

`package.json` in `action/` exposes the same check as `npm test` if you `cd action`.

## Manual check on GitHub

1. Push a branch (or open a PR). The demo workflow runs automatically.
2. Open the workflow run → **Actionscope estimate** job → **Summary**.
3. Confirm jobs, partial duration on the estimate job itself, and a non-zero minute estimate.

You can also dispatch **Actionscope demo** from the Actions tab.

## Local dry-run of the entrypoint

The entrypoint expects GitHub-provided env (`GITHUB_REPOSITORY`, `GITHUB_RUN_ID`, `GITHUB_TOKEN`, `GITHUB_STEP_SUMMARY`). Without those it falls back to a current-job stub and still prints markdown to stdout:

```bash
GITHUB_WORKFLOW=local GITHUB_JOB=dev node action/index.js
```

## What not to add yet

OAuth, a GitHub App, dollar invoices, org dashboards, or Marketplace packaging. Those are the paid App track.
