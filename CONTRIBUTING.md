# Contributing

Actionscope v0.1 is a small GitHub Action that posts a Job Summary. Keep changes lean. No GitHub App, payment checkout, or org dashboard in this repo.

The Actions Marketplace listing is **free-only**. Org pilots and seats belong on [28to3.me](https://28to3.me) and the App track — see [docs/GO_TO_MARKET.md](docs/GO_TO_MARKET.md). Do not add payment URLs here.

## Layout

```
action.yml              # Marketplace + uses: Sofa-Loaf/actionscope@vX
action/                 # shared runtime (also uses: .../action@vX)
  action.yml
  index.js              # GitHub runtime: API + summary
  estimate.js           # pure estimate + markdown
  estimate.test.js
  index.integration.test.js
docs/GO_TO_MARKET.md
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
3. Confirm jobs, partial duration on the estimate job itself, and a non-zero minute estimate.

You can also dispatch **Actionscope demo** from the Actions tab.

## Local dry-run of the entrypoint

The entrypoint expects GitHub-provided env (`GITHUB_REPOSITORY`, `GITHUB_RUN_ID`, `GITHUB_TOKEN`, `GITHUB_STEP_SUMMARY`). Without those it falls back to a current-job stub and still prints markdown to stdout:

```bash
GITHUB_WORKFLOW=local GITHUB_JOB=dev node action/index.js
```

## What not to add yet

OAuth, a GitHub App, payment checkout URLs, dollar invoices, or org dashboards. Those are the paid App track. Do not put paid Marketplace metadata or payment links on the Action listing. Point org-pilot interest at [28to3.me](https://28to3.me) only.
