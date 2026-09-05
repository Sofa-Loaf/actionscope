# Go to market

Actionscope is a **free GitHub Action** (this repo) plus a **paid GitHub App** (later) for org-level cost attribution.

The Actions Marketplace listing is **free-only**. Do not attach paid SKUs, license keys, or payment checkout to the Action. Paid revenue is the App and a separate checkout on the website.

## Offer

| Product | Who pays | What they get | Price |
| --- | --- | --- | --- |
| **Actionscope Action** | Nobody | Per-run Job Summary: wall time, rounded minutes, SKU, list-price $, included-minute burn | Free (Marketplace) |
| **Org pilot** | One engineering/FinOps buyer | Hands-on org attribution before the App is generally available | **$49 / org** (pilot) |
| **Seat** | Same buyer, after pilot | Org dashboard access for people who need history, trends, and alerts | **$19 / seat** |

Checkout for the org pilot is on the product site only:

**[Get an org pilot or learn more](https://28to3.me)**

The $19/seat plan is not sold through the Action; it ships with the GitHub App. Do not put payment URLs in this repository.

## Positioning

**One line:** See where your GitHub Actions minutes go.

**Problem:** The invoice (or monthly quota) is a lump sum. A 12-second job still burns a full minute. macOS list price is an order of magnitude above Linux. Teams find out after finance asks.

**Free Action:** Attribute **this run** before anyone leaves the workflow. The Job Summary is paste-next-to-usage-report (SKU, rounded minutes, $). The footer points at [28to3.me](https://28to3.me). Do not sell vague pilots in Action copy.

**Paid App (later):** History, “this workflow costs X / month”, budgets, and org roll-up. That is the profit motion — not a paid Marketplace Action.

## Who to sell

Engineering teams that already burn Actions dollars on **private** repos: startups and mid-size companies with a real CI matrix (Windows + macOS, retries, monorepos). Not a dedicated FinOps team watching the billing dashboard.

Skip public-repo hobby lint jobs. Those are usually not billed the same way.

## Channels

1. **GitHub Marketplace (Action)** — discovery for the free step. Listing must use the **root** `action.yml`.
2. **README + Job Summary** — every run is a demo; the summary points at [28to3.me](https://28to3.me) for org-level reports. Optional `comment-on-pr` is screenshot-forwardable.
3. **Website** — org-level product and checkout live on [28to3.me](https://28to3.me). Checkout stays on the site, not in this repo.
4. **GitHub App Marketplace (later)** — paid listing when the App exists. Separate from the Action listing.

Overnight we watch **three numbers only** (pins of `@v0.1.3`, orgs with a 7-day run streak, $49 checkouts): [FUNNEL.md](FUNNEL.md).

## Install (what we publish)

```yaml
- name: Actionscope
  uses: Sofa-Loaf/actionscope@v0.1.3
```

The nested path still works if someone already pinned it:

```yaml
- uses: Sofa-Loaf/actionscope/action@v0.1.3
```

## Maintainer clicks: publish the Action to Marketplace

GitHub does not list an Action from a tag or API release alone. An owner with 2FA must publish from the UI.

1. Confirm the repo is **public** and the default branch has `action.yml` at the **repository root** (not only under `action/`).
2. Open [action.yml](https://github.com/Sofa-Loaf/actionscope/blob/main/action.yml) on GitHub.
3. Use the banner **Publish this Action to GitHub Marketplace** (or **Draft a release** from that banner).
4. Accept the **GitHub Marketplace Developer Agreement** if prompted (repo owner or org owner).
5. Check **Publish this Action to the GitHub Marketplace**.
6. Use listing name **28to3-actionscope** (must stay unique vs other Marketplace actions, users, orgs, and reserved feature names). Product brand stays Actionscope.
7. Pick a primary category such as **Continuous integration**. Optional second: **Reporting** or **Project management**.
8. Point the release at tag **`v0.1.3`** (finance-facing summary). Marketplace publish requires a tagged release and 2FA.
9. Click **Publish release**.

Do **not** mark the Action listing as paid. Leave billing and seats on the App/pilot track. Checkout stays on [28to3.me](https://28to3.me).

## Launch checklist

- [x] Root `action.yml` with name, description, and branding (`activity` / `blue`)
- [x] Nested `action/action.yml` still runnable
- [x] README install path `uses: Sofa-Loaf/actionscope@v0.1.3`
- [ ] CI green on the ship PR; merge to `main`
- [ ] GitHub Release **v0.1.3** on `main` (listing name `28to3-actionscope`)
- [ ] Maintainer Marketplace publish clicks (above)
- [x] Org pilot / learn more on [28to3.me](https://28to3.me) (site-only checkout)
- [ ] GitHub App + $19/seat billing (later)
