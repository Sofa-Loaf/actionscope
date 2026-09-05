# Contributing

Actionscope v0.1 is a small GitHub Action that posts a Job Summary. Keep changes lean. No GitHub App, Stripe charges, or org dashboard in this repo.

The Actions Marketplace listing is **free-only**. Paid pilots ($49 / org) and seats ($19) belong to the App track — see [docs/GO_TO_MARKET.md](docs/GO_TO_MARKET.md).

## Layout

```
action.yml              # Marketplace + uses: Sofa-Loaf/actionscope@vX
action/                 # shared runtime (also uses: .../action@vX)
  action.yml
  index.js              # GitHub runtime: API + summary
  estimate.js           # pure estimate + markdown
  estimate.test.js
docs/GO_TO_MARKET.md
.github/workflows/demo.yml
```

Root `action.yml` and `action/action.yml` must stay aligned (name, description, branding, inputs, outputs, `runs.using`). Only `runs.main` differs (`action/index.js` vs `index.js`). Marketplace listing `name` is **28to3-actionscope** (product brand stays Actionscope; `Actionscope` is not unique on Marketplace).

## Develop

Requires Node 20+ locally. The GitHub-hosted runtime is **Node 24** (`runs.using: node24`). No npm install — the Action has no dependencies.

```bash
node action/estimate.test.js
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

OAuth, a GitHub App, live Stripe webhooks, dollar invoices, or org dashboards. Those are the paid App track. Do not put paid Marketplace metadata on the Action listing.
