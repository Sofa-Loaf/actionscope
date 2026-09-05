# Actionscope

See where your GitHub Actions minutes go.

**Free Action** (this repo) estimates quota-equivalent minutes for the current workflow run and writes a [Job Summary](https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#adding-a-job-summary). **Paid org attribution** is a GitHub App later — not a paid Marketplace Action.

```yaml
- name: Actionscope
  uses: Sofa-Loaf/actionscope@v0.1.0
```

## The problem

GitHub Actions spend is easy to run up and hard to explain. The invoice (or the monthly quota) is a lump sum. A 12-second job still burns a full minute. A macOS job can consume **10×** a Linux job. Teams find out after finance asks, or after a workflow quietly eats the plan’s included minutes.

There is no built-in “which job did this?” view that is useful at the moment a run finishes.

## Who it’s for

**Engineering teams that already burn Actions dollars** — or are about to — on private repos: startups and mid-size companies with a real CI matrix, not a dedicated FinOps team watching the billing dashboard.

If you have one Linux lint job on a public repo, you don’t need this. If you have Windows + macOS jobs, flaky retries, and a surprise quota reset, you do.

## Free Action now, paid App later

| | **Free Action (Marketplace)** | **Paid App (later)** |
| --- | --- | --- |
| What | A step you add to a workflow | Org-level product |
| Output | Job Summary for **this run**: jobs, durations, rough minute attribution | History, trends, “this workflow costs X / month”, budget alerts |
| Auth | None — uses the workflow `GITHUB_TOKEN` | GitHub App |
| Billing | Free. Estimates only. Actions Marketplace listings cannot be paid. | **$49 / org pilot**, then **$19 / seat** |

v0.1 is the free Action. The App, invoices, and org dashboard are not in this repo. Go-to-market and checkout notes: [docs/GO_TO_MARKET.md](docs/GO_TO_MARKET.md).

## Pricing

The Action is free. Revenue is the App and pilots, not a paid Marketplace listing.

| Plan | Price | Status |
| --- | --- | --- |
| Action | $0 | Available — pin `@v0.1.0` |
| Org pilot | **$49 / org** | [$49 Actionscope Org Pilot (live Stripe)](https://buy.stripe.com/8x2dRa7woa65dOA6uz0co00) |
| Seat | **$19 / seat** | Ships with the GitHub App |

This is the live **$49 Actionscope Org Pilot** Stripe Payment Link. The $19/seat plan ships with the GitHub App.

## How to use

Add a last step so other jobs have finished (or accept a partial estimate for jobs still running):

```yaml
- name: Actionscope
  uses: Sofa-Loaf/actionscope@v0.1.0
```

From this repository’s checkout (what CI here uses):

```yaml
- uses: ./
```

The nested path still works if you already pinned it:

```yaml
- uses: Sofa-Loaf/actionscope/action@v0.1.0
# or, locally:
- uses: ./action
```

GitHub Marketplace can only list a repository that has `action.yml` at the **root**. That file runs the same `action/` implementation.

The Action reads jobs for the current workflow run from the GitHub API, estimates **quota-equivalent minutes**, and writes a Job Summary.

**Estimate rules:**

- Each job is rounded **up to the next whole minute**.
- OS multipliers for included minutes: Linux **1×**, Windows **2×**, macOS **10×**.
- Jobs still running show a **partial** duration.
- Public repos and typical self-hosted runners are often not billed the same way — treat the number as a lens, not a bill.

Optional outputs: `estimated-minutes`, `job-count`, `wall-seconds`.

The default `GITHUB_TOKEN` is enough. If a repo has locked down token permissions, grant `actions: read` so the Jobs API can be called.

### Inputs

| Input | Default | Description |
| --- | --- | --- |
| `github-token` | `${{ github.token }}` | Token used to list jobs for this run |

### Outputs

| Output | Description |
| --- | --- |
| `estimated-minutes` | Estimated quota-equivalent billable minutes |
| `job-count` | Number of jobs included in the estimate |
| `wall-seconds` | Sum of observed wall-clock seconds |

## Try it here

This repo’s [demo workflow](.github/workflows/demo.yml) runs unit tests, two short fake jobs, then the **root** Action so you can open the run and read the summary.

## Status

Public v0.1.0: Marketplace-ready free Action. The **$49 Actionscope Org Pilot** Stripe link is live; App billing ($19/seat) comes next — see [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/GO_TO_MARKET.md](docs/GO_TO_MARKET.md).
