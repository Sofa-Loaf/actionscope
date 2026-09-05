# Actionscope

See where your GitHub Actions minutes go.

**[Install the free Action](#how-to-use)** · **[Org-level reports](https://28to3.me)**

**Free Action** (this repo) estimates this workflow run and writes a [Job Summary](https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#adding-a-job-summary) finance can paste next to GitHub’s usage report: wall time, rounded minutes, runner SKU, list-price $, and included-minute burn. Org-level history lives on **[28to3.me](https://28to3.me)** — not a paid Marketplace Action.

```yaml
- name: Actionscope
  uses: Sofa-Loaf/actionscope@v0.1.3
```

## The problem

GitHub Actions spend is easy to run up and hard to explain. The invoice (or the monthly quota) is a lump sum. A 12-second job still burns a full minute. macOS list price is an order of magnitude above Linux. Teams find out after finance asks, or after a workflow quietly eats the plan’s included minutes.

There is no built-in “which job did this?” view that is useful at the moment a run finishes.

## Who it’s for

**Engineering teams that already burn Actions dollars** — or are about to — on private repos: startups and mid-size companies with a real CI matrix, not a dedicated FinOps team watching the billing dashboard.

If you have one Linux lint job on a public repo, you don’t need this. If you have Windows + macOS jobs, flaky retries, and a surprise quota reset, you do.

## Free Action now, paid App later

| | **Free Action (Marketplace)** | **Paid App (later)** |
| --- | --- | --- |
| What | A step you add to a workflow | Org-level product |
| Output | Job Summary for **this run**: wall time, rounded minutes, SKU, list-price $, included-minute burn | History, trends, “this workflow costs X / month”, budget alerts |
| Auth | None — uses the workflow `GITHUB_TOKEN` | GitHub App |
| Billing | Free. Estimates only. Actions Marketplace listings cannot be paid. | See [28to3.me](https://28to3.me) |

v0.1.3 is the free Action. The App, invoices, and org dashboard are not in this repo. Positioning notes: [docs/GO_TO_MARKET.md](docs/GO_TO_MARKET.md).

## Pricing

The Action is free. Org-level product and seats are offered on the website, not as a paid Marketplace listing.

| Plan | Price | Status |
| --- | --- | --- |
| Action | $0 | Available — pin `@v0.1.3` |
| Org-level product | See site | [28to3.me](https://28to3.me) |

Checkout stays on **[28to3.me](https://28to3.me)**. This repository does not host payment links.

## How to use

Add a last step so other jobs have finished (or accept a partial estimate for jobs still running):

```yaml
- name: Actionscope
  uses: Sofa-Loaf/actionscope@v0.1.3
```

Optional PR comment (same numbers as the summary, compact enough to screenshot):

```yaml
- name: Actionscope
  uses: Sofa-Loaf/actionscope@v0.1.3
  with:
    comment-on-pr: true
```

`comment-on-pr` defaults to `false`. When enabled, the Action comments only if the run is a pull request (or the event payload has a PR number). Grant `pull-requests: write` so the comment can be created or updated:

```yaml
permissions:
  contents: read
  actions: read
  pull-requests: write
```

From this repository’s checkout (what CI here uses):

```yaml
- uses: ./
```

The nested path still works if you already pinned it:

```yaml
- uses: Sofa-Loaf/actionscope/action@v0.1.3
# or, locally:
- uses: ./action
```

GitHub Marketplace can only list a repository that has `action.yml` at the **root**. That file runs the same `action/` implementation. The Marketplace listing name is **28to3-actionscope**; the product brand remains Actionscope.

The Action reads jobs for the current workflow run from the GitHub API and writes a Job Summary with columns that line up with GitHub’s usage report.

**Estimate rules:**

- **Wall time** is observed `completed_at − started_at` (jobs still running use now).
- **Rounded minutes** follow GitHub billing: each started job rounds **up to the next whole minute**.
- **Runner SKU** is inferred from job labels / runner name (`actions_linux`, `actions_windows`, `actions_macos`, larger-runner SKUs when the label includes a core count).
- **Est. $ (list)** = rounded minutes × the documented GitHub list price for that SKU. Labeled as an estimate, not an invoice.
- **Included-minute burn** is plan-minute consumption for standard hosted runners only. Larger runners cannot use included minutes. Self-hosted / unknown SKUs contribute 0.

Public repos and typical self-hosted runners are often not billed the same way — treat the number as a lens, not a bill.

### GitHub list prices used

Documented **2026-09-05** from [Actions runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing). Standard hosted SKUs:

| Runner SKU | Per-minute rate (USD) |
| --- | ---: |
| `actions_linux_slim` | $0.002 |
| `actions_linux` | $0.006 |
| `actions_linux_arm` | $0.005 |
| `actions_windows` | $0.010 |
| `actions_windows_arm` | $0.010 |
| `actions_macos` | $0.062 |

Larger-runner rates from the same GitHub page are included in the Action (for example `linux_4_core` $0.012, `linux_8_core` $0.022, `macos_l` $0.077). Included-minute burn for standard hosted runners uses GitHub’s published plan weights (Linux 1, Windows 2, macOS 10 per rounded minute). That weight is not the headline of the summary.

Optional outputs: `estimated-minutes` (included-minute burn), `rounded-minutes`, `estimated-usd`, `job-count`, `wall-seconds`.

The default `GITHUB_TOKEN` is enough to read jobs. If a repo has locked down token permissions, grant `actions: read` so the Jobs API can be called. PR comments also need `pull-requests: write`.

### Inputs

| Input | Default | Description |
| --- | --- | --- |
| `github-token` | `${{ github.token }}` | Token used to list jobs for this run (and to comment when enabled) |
| `comment-on-pr` | `false` | If `true`, post or update a compact PR comment with the same numbers as the Job Summary. Skipped when the run is not a pull request. |

### Outputs

| Output | Description |
| --- | --- |
| `estimated-minutes` | Estimated included-minute burn for jobs visible in this run |
| `rounded-minutes` | Sum of GitHub-rounded minutes (each started job rounded up) |
| `estimated-usd` | Estimated USD at documented GitHub list prices (4 decimal places) |
| `job-count` | Number of jobs included in the estimate |
| `wall-seconds` | Sum of observed wall-clock seconds |

## Try it here

This repo’s [demo workflow](.github/workflows/demo.yml) runs unit tests, two short fake jobs, then the **root** Action so you can open the run and read the summary. On pull requests it also posts the optional comment.

## Status

Public **v0.1.3**: finance-facing Job Summary (wall time, rounded minutes, runner SKU, list-price $, included-minute burn) plus optional `comment-on-pr`. Marketplace listing name remains **28to3-actionscope**. Org-level reports: [28to3.me](https://28to3.me). See [CHANGELOG.md](CHANGELOG.md), [CONTRIBUTING.md](CONTRIBUTING.md), and [docs/GO_TO_MARKET.md](docs/GO_TO_MARKET.md).
