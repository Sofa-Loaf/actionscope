# Contributing

Actionscope v0.1.3 is a small GitHub Action that posts a finance-facing Job Summary. Keep changes lean. No GitHub App, payment checkout, or org dashboard in this repo.

The Actions Marketplace listing is **free-only**. Org-level product belongs on [28to3.me](https://28to3.me) and the App track — see [docs/GO_TO_MARKET.md](docs/GO_TO_MARKET.md). Do not add payment URLs here. Do not sell vague pilots in Action copy (Job Summary, PR comment, `action.yml` description).

## Layout

```
action.yml              # Marketplace + uses: Sofa-Loaf/actionscope@vX
action/                 # shared runtime (also uses: .../action@vX)
  action.yml
  index.js              # GitHub runtime: API + summary + optional PR comment
  estimate.js           # pure estimate + markdown
  estimate.test.js
  index.integration.test.js
CHANGELOG.md
docs/GO_TO_MARKET.md
docs/FUNNEL.md          # three overnight metrics (not a dashboard)
docs/funnel-metrics.js  # optional GitHub/Stripe pull
.github/workflows/demo.yml
```

Root `action.yml` and `action/action.yml` must stay aligned (name, description, branding, inputs, outputs, `runs.using`). Only `runs.main` differs (`action/index.js` vs `index.js`). Marketplace listing `name` is **28to3-actionscope** (product brand stays Actionscope; `Actionscope` is not unique on Marketplace).

## Develop

Requires Node 20+ locally. The GitHub-hosted runtime is **Node 24** (`runs.using: node24`). No npm install — the Action has no dependencies.

```bash
node action/estimate.test.js
node action/index.integration.test.js
```

`package.json` in `action/` exposes both as `npm test` if you `cd action`.

## Manual check on GitHub

1. Push a branch (or open a PR). The demo workflow runs automatically.
2. Open the workflow run → **Actionscope estimate** job → **Summary**.
3. Confirm wall time, rounded minutes, runner SKU, list-price $, and included-minute burn. On a PR with `comment-on-pr: true`, confirm the comment matches the summary.

You can also dispatch **Actionscope demo** from the Actions tab.

## Local dry-run of the entrypoint

The entrypoint expects GitHub-provided env (`GITHUB_REPOSITORY`, `GITHUB_RUN_ID`, `GITHUB_TOKEN`, `GITHUB_STEP_SUMMARY`). Without those it falls back to a current-job stub and still prints markdown to stdout:

```bash
GITHUB_WORKFLOW=local GITHUB_JOB=dev node action/index.js
```

## What not to add yet

OAuth, a GitHub App, payment checkout URLs, or org dashboards. Those are the paid App track. List-price **estimates** in the Job Summary are in scope; do not present them as invoices. Do not put paid Marketplace metadata or payment links on the Action listing. Point org-level interest at [28to3.me](https://28to3.me) only.
