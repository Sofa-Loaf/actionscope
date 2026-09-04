# Actionscope

See where your GitHub Actions minutes go.

## The problem

GitHub Actions spend is easy to run up and hard to explain. The invoice (or the monthly quota) is a lump sum. A 12-second job still burns a full minute. A macOS job can consume **10×** a Linux job. Teams find out after finance asks, or after a workflow quietly eats the plan’s included minutes.

There is no built-in “which job did this?” view that is useful at the moment a run finishes.

## Who it’s for

**Engineering teams that already burn Actions dollars** — or are about to — on private repos: startups and mid-size companies with a real CI matrix, not a dedicated FinOps team watching the billing dashboard.

If you have one Linux lint job on a public repo, you don’t need this. If you have Windows + macOS jobs, flaky retries, and a surprise quota reset, you do.

## Free Action now, paid App later

| | **Free Action (v0, this repo)** | **Paid App (later)** |
| --- | --- | --- |
| What | A step you add to a workflow | Org-level product |
| Output | Job Summary for **this run**: jobs, durations, rough minute attribution | History, trends, “this workflow costs X / month”, budget alerts |
| Auth | None — uses the workflow `GITHUB_TOKEN` | OAuth / GitHub App |
| Billing | None. Estimates only. | Paid plan (not built) |

v0 is the free Action only. No Marketplace App, no org dashboard, no invoices.

## How to use

Add a last step to a workflow (after checkout if you are pointing at this repo path):

```yaml
- name: Actionscope
  uses: Sofa-Loaf/actionscope/action@main
```

Or, from this repository’s checkout:

```yaml
- uses: ./action
```

The Action reads jobs for the current workflow run from the GitHub API, estimates **quota-equivalent minutes**, and writes a [Job Summary](https://docs.github.com/en/actions/using-workflows/workflow-commands-for-github-actions#adding-a-job-summary).

**Estimate rules (v0):**

- Each job is rounded **up to the next whole minute**.
- OS multipliers for included minutes: Linux **1×**, Windows **2×**, macOS **10×**.
- Jobs still running show a **partial** duration.
- Public repos and typical self-hosted runners are often not billed the same way — treat the number as a lens, not a bill.

Optional outputs: `estimated-minutes`, `job-count`, `wall-seconds`.

The default `GITHUB_TOKEN` is enough. If a repo has locked down token permissions, grant `actions: read` so the Jobs API can be called.

## Try it here

This repo’s [demo workflow](.github/workflows/demo.yml) runs unit tests, two short fake jobs, then the Action so you can open the run and read the summary.

## Status

Scaffold. Working free Action first. App, Marketplace listing, and real billing come later — see [CONTRIBUTING.md](CONTRIBUTING.md).
