# Go to market

Actionscope is a **free GitHub Action** (this repo) plus a **paid GitHub App** (later) for org-level cost attribution.

The Actions Marketplace listing is **free-only**. Do not attach paid SKUs, license keys, or Stripe checkout to the Action. Paid revenue is the App and a separate checkout for pilots.

## Offer

| Product | Who pays | What they get | Price |
| --- | --- | --- | --- |
| **Actionscope Action** | Nobody | Per-run Job Summary: jobs, durations, quota-equivalent minutes | Free (Marketplace) |
| **Org pilot** | One engineering/FinOps buyer | Hands-on org attribution before the App is generally available | **$49 / org** (pilot) |
| **Seat** | Same buyer, after pilot | Org dashboard access for people who need history, trends, and alerts | **$19 / seat** |

Checkout for the $49 org pilot is the live Stripe Payment Link:

**[Pay $49 Actionscope Org Pilot](https://buy.stripe.com/8x2dRa7woa65dOA6uz0co00)**

This is the live **$49 Actionscope Org Pilot** Stripe Payment Link. The $19/seat plan is not sold through the Action; it ships with the GitHub App.

## Positioning

**One line:** See where your GitHub Actions minutes go.

**Problem:** The invoice (or monthly quota) is a lump sum. A 12-second job still burns a full minute. macOS can consume **10×** Linux. Teams find out after finance asks.

**Free Action:** Attribute **this run** before anyone leaves the workflow.

**Paid App (later):** History, “this workflow costs X / month”, budgets, and org roll-up. That is the profit motion — not a paid Marketplace Action.

## Who to sell

Engineering teams that already burn Actions dollars on **private** repos: startups and mid-size companies with a real CI matrix (Windows + macOS, retries, monorepos). Not a dedicated FinOps team watching the billing dashboard.

Skip public-repo hobby lint jobs. Those are usually not billed the same way.

## Channels

1. **GitHub Marketplace (Action)** — discovery for the free step. Listing must use the **root** `action.yml`.
2. **README + Job Summary** — every run is a demo; the summary points at the App/pilot when those exist.
3. **Direct / Stripe** — $49 Actionscope Org Pilot via the live Payment Link above.
4. **GitHub App Marketplace (later)** — paid listing when the App exists. Separate from the Action listing.

## Install (what we publish)

```yaml
- name: Actionscope
  uses: Sofa-Loaf/actionscope@v0.1.0
```

The nested path still works if someone already pinned it:

```yaml
- uses: Sofa-Loaf/actionscope/action@v0.1.0
```

## Maintainer clicks: publish the Action to Marketplace

GitHub does not list an Action from a tag or API release alone. An owner with 2FA must publish from the UI.

1. Confirm the repo is **public** and the default branch has `action.yml` at the **repository root** (not only under `action/`).
2. Open [action.yml](https://github.com/Sofa-Loaf/actionscope/blob/main/action.yml) on GitHub.
3. Use the banner **Publish this Action to GitHub Marketplace** (or **Draft a release** from that banner).
4. Accept the **GitHub Marketplace Developer Agreement** if prompted (repo owner or org owner).
5. Check **Publish this Action to the GitHub Marketplace**.
6. Keep the listing name **Actionscope** (must stay unique vs other Marketplace actions, users, orgs, and reserved feature names).
7. Pick a primary category such as **Continuous integration**. Optional second: **Reporting** or **Project management**.
8. Point the release at tag **`v0.1.0`** if GitHub offers the existing tag; otherwise cut a follow-up tag (for example `v0.1.1`) with the same notes. Marketplace publish requires a tagged release and 2FA.
9. Click **Publish release**.

Do **not** mark the Action listing as paid. Leave billing, seats, and Stripe on the App/pilot track.

## Launch checklist

- [x] Root `action.yml` with name, description, and branding (`activity` / `blue`)
- [x] Nested `action/action.yml` still runnable
- [x] README install path `uses: Sofa-Loaf/actionscope@v0.1.0`
- [ ] CI green on the ship PR; merge to `main`
- [ ] GitHub Release **v0.1.0** on `main`
- [ ] Maintainer Marketplace publish clicks (above)
- [x] Live $49 Actionscope Org Pilot Stripe Payment Link
- [ ] GitHub App + $19/seat billing (later)
