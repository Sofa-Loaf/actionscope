# Overnight funnel (three metrics)

Ops card for **Mr Toad / John**. Not a dashboard, not an analytics product, not telemetry in the Action.

Fill the card once per night (UTC). Use the [manual checklist](#manual-checklist) and/or:

```bash
# GitHub code search needs a token. Stripe is optional.
export GITHUB_TOKEN="$(gh auth token)"          # or a PAT with public_repo
# export STRIPE_SECRET_KEY=sk_live_...          # Dashboard → Developers → API keys
# export STRIPE_PAYMENT_LINK_ID=plink_...       # Dashboard → Payment links → Org Pilot
# export FUNNEL_KNOWN_REPOS=acme/api,acme/web   # private/pilot repos the token can read

node docs/funnel-metrics.js
```

Checkout stays on [28to3.me](https://28to3.me). Do **not** paste Stripe Payment Link URLs into this repository.

---

## Overnight card

```
Date (UTC):
1. Pins of Sofa-Loaf/actionscope@v0.1.3
   unique repos: ____    workflow files: ____
   (public search; first-party excluded)
2. Orgs that ran Actionscope 7 UTC days in a row
   qualifying orgs: ____
   (lookback ____ days; public + known/pilot)
3. $49 Org Pilot checkouts (paid)
   lifetime: ____    last 24h: ____    last 7d: ____
Notes / names:
```

---

## 1. Pins of `Sofa-Loaf/actionscope@v0.1.3`

**Definition.** Count of **distinct GitHub repositories** whose default-branch code contains an install pin of tag `v0.1.3`:

- `uses: Sofa-Loaf/actionscope@v0.1.3`
- or the nested path `uses: Sofa-Loaf/actionscope/action@v0.1.3`

Also record **workflow files** (paths under `.github/workflows/`) as a secondary number. One repo with two workflows = 1 repo, 2 files.

**In.** A public (or token-visible) file that mentions those exact strings.

**Out.** This repo, [Sofa-Loaf/28to3](https://github.com/Sofa-Loaf/28to3) (site copy), archived hits if you notice them, SHA pins, `@v0` / `@v0.1` / `@v0.1.2`, and Marketplace “used by” guesses.

### Data sources

| Source | What it measures | Auth |
| --- | --- | --- |
| [GitHub code search](https://github.com/search?q=%22Sofa-Loaf%2Factionscope%40v0.1.3%22+OR+%22Sofa-Loaf%2Factionscope%2Faction%40v0.1.3%22&type=code) | Public file hits (best public proxy) | Signed-in browser; API needs `GITHUB_TOKEN` |
| `node docs/funnel-metrics.js` | Deduped repos + workflow files | `GITHUB_TOKEN` |
| Known/pilot repos (`FUNNEL_KNOWN_REPOS`) | Private pins the token can read | Token with `repo` + those orgs |

There is no GitHub API for “repos that pin this Action.” Traffic clones and Marketplace listing views are **not** this metric.

### Caveats

- **Private repos are invisible** unless you pass `FUNNEL_KNOWN_REPOS` (or search those orgs in the UI while logged in). The ICP is private CI — public pins will undercount.
- Code search **lags** (often minutes, sometimes longer) and is rate-limited (~10 req/min).
- A pin is not a run. A README mention counts as a pin if it has the tag string; the script still counts the repo, and only `.github/workflows/` paths increment the workflow-file number.

---

## 2. Orgs that ran it 7 days in a row

**Definition.** Count of **GitHub Organizations** (not user accounts) that have at least one **7-consecutive-UTC-day** stretch with ≥1 workflow run per day of a workflow file that pins Actionscope (any `Sofa-Loaf/actionscope@…` tag, not only `v0.1.3`).

Default lookback: **14 days** (`FUNNEL_LOOKBACK_DAYS`). A streak anywhere in that window counts — “habitual after install,” not “must still be on a streak tonight.”

**In.** Org-owned repos. A day counts if a matching workflow **started** (`run_started_at` or `created_at`, UTC date). Failed/cancelled runs still count as “ran it.”

**Out.** User-owned repos. Orgs whose only Actionscope files are docs/README. Orgs with 7 runs on one day and silence after. This repo’s own demo workflow.

### Data sources

| Source | What it measures | Auth |
| --- | --- | --- |
| Public pin search → Actions runs API | Public-org proxy | `GITHUB_TOKEN` |
| `FUNNEL_KNOWN_REPOS` | Pilot/private orgs you can read | Token the org granted (`actions:read`) |
| Org **Actions** tab (manual) | Same check by eye for one org | Org membership |

The Action does **not** phone home. Do not add telemetry to measure this.

### Caveats

- This is the **weakest** of the three numbers. Private habitual use (the real ICP) only shows up via known/pilot repos or a human with org access.
- We count **workflow runs of files that pin the Action**, not a confirmed Action step execution (an early-step failure may never reach Actionscope).
- Busy repos: the script caps runs pulled per repo (300) so an overnight job cannot wander.

---

## 3. $49 checkouts

**Definition.** Count of **paid** Stripe Checkout Sessions for the **Actionscope Org Pilot** Payment Link — **$49 USD** booking fee, seller **28to3.me**.

- **Lifetime** paid sessions (primary).
- **Last 24h** and **last 7d** (so a quiet night is obvious).

**In.** `payment_status=paid` (script) or a succeeded $49 payment on that Payment Link (Dashboard).

**Out.** Incomplete/abandoned Checkout, $19/seat (later), refunds you have not subtracted, test-mode (`sk_test_`) mixed into live.

### Data sources

| Source | What it measures | Auth |
| --- | --- | --- |
| Stripe Dashboard → **Payment links** → Org Pilot | Human count of successful payments | Stripe login for 28to3.me |
| Stripe Dashboard → **Payments**, amount `$49.00` | Same, plus refunds/disputes | Stripe login |
| `STRIPE_SECRET_KEY` + `STRIPE_PAYMENT_LINK_ID` | Paid Checkout Sessions for that link | Restricted key: `checkout_session` + `payment_link` read |
| Fallback if no `plink_…` | Paid sessions with `amount_total=4900` + `usd` | Same key |

The Payment Link URL lives on **28to3.me** and in Stripe. Copy the `plink_…` id from the Dashboard; do not commit Payment Link URLs here.

### Caveats

- A paid $49 is a **booking fee**, not an App seat and not proof they pinned `v0.1.3`.
- Prefer `STRIPE_PAYMENT_LINK_ID`. Amount-only fallback will also count any other $49 USD Checkout you add later.
- Refunds: if lifetime looks high, open the Payment Link in Stripe and subtract refunds by hand. The script does not net refunds.

---

## Manual checklist (no script)

1. **Pins.** Open [code search for `@v0.1.3`](https://github.com/search?q=%22Sofa-Loaf%2Factionscope%40v0.1.3%22+OR+%22Sofa-Loaf%2Factionscope%2Faction%40v0.1.3%22&type=code). Dedup by repository. Ignore `Sofa-Loaf/actionscope` and `Sofa-Loaf/28to3`. Write repos and workflow-file counts on the card.
2. **7-day orgs.** For each **org** from that search (and any pilot org on the night’s list): Actions tab → the workflow that pins Actionscope → last two weeks. Tick a UTC day if it ran. If you can tick seven in a row, the org counts. User accounts do not.
3. **$49.** Stripe (28to3.me account) → Payment links → Org Pilot → successful payments. Jot lifetime / last 24h / last 7d.

That is the whole funnel. Stop.

---

## Script notes

`docs/funnel-metrics.js` — Node 20+, no npm install.

| Env | Purpose |
| --- | --- |
| `GITHUB_TOKEN` or `GH_TOKEN` | Code search + runs + (optional) known repos |
| `STRIPE_SECRET_KEY` | List Checkout Sessions |
| `STRIPE_PAYMENT_LINK_ID` | Restrict to the Org Pilot link (`plink_…`) |
| `FUNNEL_KNOWN_REPOS` | Comma-separated `owner/repo` the token can read |
| `FUNNEL_LOOKBACK_DAYS` | Default `14` |
| `FUNNEL_EXCLUDE_REPOS` | Extra `owner/repo` to skip (first-party already skipped) |

```bash
node docs/funnel-metrics.js --help
node docs/funnel-metrics.js --self-test
```

---

## What this is not

- Not Marketplace republish, not a PDF, not a website dashboard.
- Not Action telemetry, OAuth, or a GitHub App.
- Not more than these three numbers.
