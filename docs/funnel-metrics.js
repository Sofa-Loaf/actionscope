#!/usr/bin/env node
'use strict';

/**
 * Overnight pull for the three Actionscope funnel metrics.
 * See docs/FUNNEL.md. No dashboard. No payment URLs.
 *
 *   GITHUB_TOKEN=… node docs/funnel-metrics.js
 *   STRIPE_SECRET_KEY=… STRIPE_PAYMENT_LINK_ID=plink_… node docs/funnel-metrics.js
 */

const PIN_TAG = 'v0.1.3';
const ACTION_REPO = 'Sofa-Loaf/actionscope';
const FIRST_PARTY = new Set(['Sofa-Loaf/actionscope', 'Sofa-Loaf/28to3']);
const PIN_NEEDLES = [
  `Sofa-Loaf/actionscope@${PIN_TAG}`,
  `Sofa-Loaf/actionscope/action@${PIN_TAG}`,
];
const ANY_PIN_RE = /Sofa-Loaf\/actionscope(?:\/action)?@/i;
const DEFAULT_LOOKBACK = 14;
const RUN_CAP_PER_REPO = 300;
const STRIPE_AMOUNT = 4900;
const STRIPE_CURRENCY = 'usd';

const args = new Set(process.argv.slice(2));

if (args.has('--help') || args.has('-h')) {
  printHelp();
  process.exit(0);
}

if (args.has('--self-test')) {
  selfTest();
  process.exit(0);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

async function main() {
  const lookbackDays = positiveInt(process.env.FUNNEL_LOOKBACK_DAYS, DEFAULT_LOOKBACK);
  const exclude = new Set([
    ...FIRST_PARTY,
    ...csv(process.env.FUNNEL_EXCLUDE_REPOS),
  ]);
  const knownRepos = csv(process.env.FUNNEL_KNOWN_REPOS);
  const ghToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  const stripeKey = process.env.STRIPE_SECRET_KEY || '';
  const paymentLink = process.env.STRIPE_PAYMENT_LINK_ID || '';

  const now = new Date();
  const lookbackStart = new Date(now.getTime() - lookbackDays * 86400000);
  const since = lookbackStart.toISOString().slice(0, 10);

  console.log(`Actionscope funnel  ${now.toISOString()}`);
  console.log(`Pin tag ${PIN_TAG}  lookback ${lookbackDays}d from ${since}`);
  console.log('');

  const pins = await measurePins(ghToken, exclude, knownRepos);
  printPins(pins);

  const streaks = await measureStreaks(ghToken, exclude, knownRepos, pins, since);
  printStreaks(streaks);

  const checkouts = await measureCheckouts(stripeKey, paymentLink, now);
  printCheckouts(checkouts);

  console.log('');
  console.log('Fill docs/FUNNEL.md overnight card. Do not paste Stripe URLs into this repo.');
}

// --- pins ---

async function measurePins(token, exclude, knownRepos) {
  const result = {
    skipped: !token,
    reason: token ? '' : 'set GITHUB_TOKEN (code search requires auth)',
    repos: new Map(),
    excludedHits: 0,
    errors: [],
  };

  if (!token) return result;

  const query = PIN_NEEDLES.map((s) => `"${s}"`).join(' OR ');
  try {
    const hits = await searchCode(token, query);
    result.excludedHits = addPinHits(result.repos, hits, exclude, 'public-search');
  } catch (err) {
    result.errors.push(`code search: ${err.message}`);
  }

  for (const full of knownRepos) {
    if (exclude.has(full)) continue;
    try {
      const files = await listPinFiles(token, full, PIN_NEEDLES);
      for (const path of files) {
        addPinRepo(result.repos, full, path, 'known-repo');
      }
    } catch (err) {
      result.errors.push(`${full}: ${err.message}`);
    }
  }

  return result;
}

function addPinHits(repos, hits, exclude, source) {
  let excluded = 0;
  for (const hit of hits) {
    const full = hit.repository && hit.repository.full_name;
    if (!full) continue;
    if (exclude.has(full)) {
      excluded += 1;
      continue;
    }
    addPinRepo(repos, full, hit.path || '', source);
  }
  return excluded;
}

function addPinRepo(repos, full, path, source) {
  let row = repos.get(full);
  if (!row) {
    row = { full, files: new Set(), workflows: new Set(), sources: new Set() };
    repos.set(full, row);
  }
  if (path) {
    row.files.add(path);
    if (isWorkflowPath(path)) row.workflows.add(path);
  }
  row.sources.add(source);
}

function printPins(pins) {
  if (pins.skipped) {
    console.log(`1. Pins @${PIN_TAG}     skipped (${pins.reason})`);
    console.log('   UI: github.com/search → type=code → "Sofa-Loaf/actionscope@v0.1.3"');
    return;
  }
  const repos = [...pins.repos.values()];
  const workflowFiles = repos.reduce((n, r) => n + r.workflows.size, 0);
  console.log(
    `1. Pins @${PIN_TAG}     repos=${repos.length}  workflow_files=${workflowFiles}  excluded_first_party_hits=${pins.excludedHits}`
  );
  for (const r of repos.sort((a, b) => a.full.localeCompare(b.full))) {
    const wf = [...r.workflows].sort().join(', ') || '(no workflow file)';
    console.log(`   - ${r.full}  ${wf}`);
  }
  if (!repos.length) console.log('   (none outside first-party)');
  for (const e of pins.errors) console.log(`   ! ${e}`);
}

// --- 7-day orgs ---

async function measureStreaks(token, exclude, knownRepos, pins, since) {
  const result = {
    skipped: !token,
    reason: token ? '' : 'set GITHUB_TOKEN',
    orgs: new Map(),
    skippedUsers: [],
    errors: [],
  };
  if (!token) return result;

  const candidates = new Map();

  const publicQuery = `"Sofa-Loaf/actionscope@" path:.github/workflows`;
  try {
    const hits = await searchCode(token, publicQuery);
    for (const hit of hits) {
      const full = hit.repository && hit.repository.full_name;
      if (!full || exclude.has(full)) continue;
      addCandidate(candidates, full, hit.path || '');
    }
  } catch (err) {
    result.errors.push(`retention search: ${err.message}`);
  }

  for (const [full, row] of pins.repos) {
    for (const path of row.workflows) addCandidate(candidates, full, path);
  }

  for (const full of knownRepos) {
    if (exclude.has(full)) continue;
    try {
      const files = await listPinFiles(token, full, null);
      for (const path of files.filter(isWorkflowPath)) {
        addCandidate(candidates, full, path);
      }
    } catch (err) {
      result.errors.push(`${full}: ${err.message}`);
    }
  }

  const ownerCache = new Map();
  for (const [full, paths] of candidates) {
    const [owner, repo] = splitRepo(full);
    if (!owner || !repo) continue;
    let ownerType = ownerCache.get(owner);
    if (!ownerType) {
      try {
        ownerType = await githubJson(token, `/users/${owner}`).then((u) => u.type);
      } catch (err) {
        result.errors.push(`${owner}: ${err.message}`);
        continue;
      }
      ownerCache.set(owner, ownerType);
    }
    if (ownerType !== 'Organization') {
      result.skippedUsers.push(full);
      continue;
    }

    try {
      const days = await runDays(token, owner, repo, paths, since);
      const org = result.orgs.get(owner) || { owner, days: new Set(), repos: [] };
      for (const d of days) org.days.add(d);
      org.repos.push({ full, paths: [...paths], days: [...days].sort() });
      result.orgs.set(owner, org);
    } catch (err) {
      result.errors.push(`${full} runs: ${err.message}`);
    }
  }

  return result;
}

function addCandidate(candidates, full, path) {
  if (!isWorkflowPath(path)) return;
  let set = candidates.get(full);
  if (!set) {
    set = new Set();
    candidates.set(full, set);
  }
  set.add(path);
}

async function runDays(token, owner, repo, paths, since) {
  const want = new Set(paths);
  const days = new Set();
  let page = 1;
  let fetched = 0;
  while (fetched < RUN_CAP_PER_REPO) {
    const perPage = Math.min(100, RUN_CAP_PER_REPO - fetched);
    const data = await githubJson(
      token,
      `/repos/${owner}/${repo}/actions/runs?per_page=${perPage}&page=${page}&created=>=${since}`
    );
    const runs = data.workflow_runs || [];
    if (!runs.length) break;
    for (const run of runs) {
      if (want.size && run.path && !want.has(run.path)) continue;
      const stamp = run.run_started_at || run.created_at;
      if (stamp) days.add(utcDay(stamp));
    }
    fetched += runs.length;
    if (runs.length < perPage) break;
    page += 1;
  }
  return days;
}

function printStreaks(streaks) {
  if (streaks.skipped) {
    console.log(`2. 7-day orgs       skipped (${streaks.reason})`);
    return;
  }
  const qualifying = [];
  const short = [];
  for (const org of streaks.orgs.values()) {
    if (hasConsecutiveDays(org.days, 7)) qualifying.push(org);
    else short.push(org);
  }
  console.log(`2. 7-day orgs       orgs=${qualifying.length}`);
  for (const org of qualifying.sort((a, b) => a.owner.localeCompare(b.owner))) {
    console.log(`   - ${org.owner}  days=${[...org.days].sort().join(',')}`);
  }
  if (!qualifying.length) console.log('   (none)');
  if (short.length) {
    console.log('   no-streak (for the log):');
    for (const org of short) {
      const n = org.days.size;
      console.log(`   - ${org.owner}  active_days=${n}`);
    }
  }
  if (streaks.skippedUsers.length) {
    console.log(`   skipped user-owned: ${streaks.skippedUsers.join(', ')}`);
  }
  for (const e of streaks.errors) console.log(`   ! ${e}`);
}

// --- $49 ---

async function measureCheckouts(stripeKey, paymentLink, now) {
  const result = {
    skipped: !stripeKey,
    reason: stripeKey
      ? ''
      : 'set STRIPE_SECRET_KEY (and STRIPE_PAYMENT_LINK_ID=plink_… from Dashboard)',
    usedLink: Boolean(paymentLink),
    lifetime: 0,
    last24h: 0,
    last7d: 0,
    errors: [],
  };
  if (!stripeKey) return result;

  const dayAgo = now.getTime() - 86400000;
  const weekAgo = now.getTime() - 7 * 86400000;

  try {
    const sessions = await listStripeSessions(stripeKey, paymentLink);
    for (const s of sessions) {
      if (s.payment_status !== 'paid') continue;
      if (!paymentLink) {
        if (s.amount_total !== STRIPE_AMOUNT) continue;
        if ((s.currency || '') !== STRIPE_CURRENCY) continue;
      }
      result.lifetime += 1;
      const createdMs = (s.created || 0) * 1000;
      if (createdMs >= dayAgo) result.last24h += 1;
      if (createdMs >= weekAgo) result.last7d += 1;
    }
  } catch (err) {
    result.errors.push(err.message);
  }
  return result;
}

async function listStripeSessions(secret, paymentLink) {
  const out = [];
  let startingAfter = '';
  for (let i = 0; i < 20; i += 1) {
    const params = new URLSearchParams({ limit: '100' });
    if (paymentLink) params.set('payment_link', paymentLink);
    if (startingAfter) params.set('starting_after', startingAfter);
    const data = await stripeJson(secret, `/v1/checkout/sessions?${params}`);
    const batch = data.data || [];
    out.push(...batch);
    if (!data.has_more || !batch.length) break;
    startingAfter = batch[batch.length - 1].id;
  }
  return out;
}

function printCheckouts(c) {
  if (c.skipped) {
    console.log(`3. $49 checkouts    skipped (${c.reason})`);
    console.log('   UI: Stripe → Payment links → Org Pilot (28to3.me). No URLs in this repo.');
    return;
  }
  const how = c.usedLink ? 'payment_link' : 'amount=4900 USD fallback';
  console.log(
    `3. $49 checkouts    paid=${c.lifetime}  last_24h=${c.last24h}  last_7d=${c.last7d}  (${how})`
  );
  for (const e of c.errors) console.log(`   ! ${e}`);
}

// --- GitHub / Stripe HTTP ---

async function searchCode(token, q) {
  const hits = [];
  let page = 1;
  while (page <= 5) {
    const data = await githubJson(
      token,
      `/search/code?q=${encodeURIComponent(q)}&per_page=100&page=${page}`
    );
    const items = data.items || [];
    hits.push(...items);
    if (items.length < 100) break;
    page += 1;
  }
  return hits;
}

async function listPinFiles(token, full, needles) {
  const [owner, repo] = splitRepo(full);
  const listing = await githubJson(token, `/repos/${owner}/${repo}/contents/.github/workflows`);
  if (!Array.isArray(listing)) return [];
  const files = [];
  for (const entry of listing) {
    if (entry.type !== 'file' || !entry.path) continue;
    const body = await githubText(token, entry.path, owner, repo);
    if (!body) continue;
    const ok = needles
      ? needles.some((n) => body.includes(n))
      : ANY_PIN_RE.test(body);
    if (ok) files.push(entry.path);
  }
  return files;
}

async function githubText(token, path, owner, repo) {
  const file = await githubJson(token, `/repos/${owner}/${repo}/contents/${encodeURI(path)}`);
  if (!file.content) return '';
  return Buffer.from(file.content, file.encoding || 'base64').toString('utf8');
}

async function githubJson(token, pathAndQuery, attempt = 0) {
  const res = await fetch(`https://api.github.com${pathAndQuery}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'actionscope-funnel-metrics',
    },
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text.slice(0, 200) };
  }
  if ((res.status === 429 || res.status === 403) && /rate limit|try again/i.test(text) && attempt < 3) {
    const hinted = Number(res.headers.get('retry-after')) || parseRetrySeconds(text) || 2 * (attempt + 1);
    await sleep((hinted + 0.25) * 1000);
    return githubJson(token, pathAndQuery, attempt + 1);
  }
  if (!res.ok) {
    const msg = data.message || res.statusText;
    throw new Error(`GitHub ${res.status} ${msg}`);
  }
  return data;
}

function parseRetrySeconds(text) {
  const m = String(text).match(/try again in ([0-9.]+)s/i);
  return m ? Number(m[1]) : 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stripeJson(secret, pathAndQuery) {
  const res = await fetch(`https://api.stripe.com${pathAndQuery}`, {
    headers: {
      Authorization: `Bearer ${secret}`,
      'User-Agent': 'actionscope-funnel-metrics',
    },
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = (data.error && data.error.message) || res.statusText;
    throw new Error(`Stripe ${res.status} ${msg}`);
  }
  return data;
}

// --- helpers ---

function isWorkflowPath(path) {
  return path.startsWith('.github/workflows/') || path.includes('/.github/workflows/');
}

function utcDay(iso) {
  return String(iso).slice(0, 10);
}

function hasConsecutiveDays(daySet, n) {
  const days = [...daySet].sort();
  if (days.length < n) return false;
  let streak = 1;
  for (let i = 1; i < days.length; i += 1) {
    const prev = Date.parse(`${days[i - 1]}T00:00:00Z`);
    const cur = Date.parse(`${days[i]}T00:00:00Z`);
    if (Number.isNaN(prev) || Number.isNaN(cur)) return false;
    const diff = (cur - prev) / 86400000;
    if (diff === 1) {
      streak += 1;
      if (streak >= n) return true;
    } else if (diff > 0) {
      streak = 1;
    }
  }
  return streak >= n;
}

function splitRepo(full) {
  const i = full.indexOf('/');
  if (i <= 0 || i === full.length - 1) return [null, null];
  return [full.slice(0, i), full.slice(i + 1)];
}

function csv(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function positiveInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function printHelp() {
  console.log(`Usage: node docs/funnel-metrics.js

Overnight pull for the three metrics in docs/FUNNEL.md.

Env:
  GITHUB_TOKEN / GH_TOKEN     GitHub code search + workflow runs
  STRIPE_SECRET_KEY           list paid Checkout Sessions
  STRIPE_PAYMENT_LINK_ID      plink_… from Stripe Dashboard (preferred)
  FUNNEL_KNOWN_REPOS          comma-separated owner/repo the token can read
  FUNNEL_LOOKBACK_DAYS        default ${DEFAULT_LOOKBACK}
  FUNNEL_EXCLUDE_REPOS        extra owner/repo to skip

Flags:
  --help        this text
  --self-test   streak / pin helpers (no network)`);
}

function selfTest() {
  const assert = require('node:assert/strict');

  assert.equal(hasConsecutiveDays(new Set(), 7), false);
  assert.equal(hasConsecutiveDays(new Set(['2026-09-01']), 7), false);
  assert.equal(
    hasConsecutiveDays(
      new Set([
        '2026-09-01',
        '2026-09-02',
        '2026-09-03',
        '2026-09-04',
        '2026-09-05',
        '2026-09-06',
        '2026-09-07',
      ]),
      7
    ),
    true
  );
  assert.equal(
    hasConsecutiveDays(
      new Set([
        '2026-09-01',
        '2026-09-02',
        '2026-09-03',
        '2026-09-05',
        '2026-09-06',
        '2026-09-07',
        '2026-09-08',
      ]),
      7
    ),
    false
  );
  assert.equal(
    hasConsecutiveDays(
      new Set([
        '2026-08-20',
        '2026-09-01',
        '2026-09-02',
        '2026-09-03',
        '2026-09-04',
        '2026-09-05',
        '2026-09-06',
        '2026-09-07',
      ]),
      7
    ),
    true,
    'streak in a noisy window'
  );
  assert.equal(utcDay('2026-09-05T23:15:00Z'), '2026-09-05');
  assert.equal(isWorkflowPath('.github/workflows/ci.yml'), true);
  assert.equal(isWorkflowPath('README.md'), false);
  assert.deepEqual(csv(' acme/api, acme/web ,'), ['acme/api', 'acme/web']);
  assert.deepEqual(splitRepo('acme/api'), ['acme', 'api']);
  assert.equal(parseRetrySeconds('GitHub 429 try again in 1.995511251s'), 1.995511251);

  const repos = new Map();
  const excluded = addPinHits(
    repos,
    [
      { repository: { full_name: 'Sofa-Loaf/actionscope' }, path: 'README.md' },
      { repository: { full_name: 'acme/api' }, path: '.github/workflows/ci.yml' },
      { repository: { full_name: 'acme/api' }, path: 'docs/install.md' },
    ],
    FIRST_PARTY,
    'test'
  );
  assert.equal(excluded, 1);
  assert.equal(repos.size, 1);
  assert.equal(repos.get('acme/api').workflows.size, 1);
  assert.equal(repos.get('acme/api').files.size, 2);

  console.log('self-test ok');
}
