# Changelog

## 0.1.3

Finance-facing Job Summary and optional PR comment. Tag can be cut separately.

- **Job Summary** now leads with wall time, rounded minutes, runner SKU, estimated $ at GitHub list price, and included-minute burn. Quota 1×/2×/10× multipliers are no longer the headline (they still inform included-minute burn for standard hosted runners).
- List prices are documented in the summary and README from [GitHub Actions runner pricing](https://docs.github.com/en/billing/reference/actions-runner-pricing) (as of 2026-09-05). Dollar figures are labeled as estimates.
- Optional input `comment-on-pr` (default `false`) posts or updates a compact PR comment with the same numbers when the run is a pull request.
- New outputs: `rounded-minutes`, `estimated-usd`. `estimated-minutes` remains included-minute burn.
- Action copy points at [28to3.me](https://28to3.me) only. No Stripe / `buy.stripe.com` URLs.

## 0.1.1

Marketplace listing name **28to3-actionscope**. Site-only CTAs.

## 0.1.0

First Marketplace-ready free Action: quota-equivalent minute estimate and Job Summary.
