'use strict';

const assert = require('assert');
const {
  LIST_PRICES,
  RATES_SOURCE,
  RATES_AS_OF,
  PRODUCT_SITE,
  COMMENT_MARKER,
  inferOs,
  inferSku,
  includedWeightForSku,
  rateForSku,
  jobDurationMs,
  roundedMinutes,
  includedMinuteBurn,
  listPriceUsd,
  billableMinutes,
  formatDuration,
  formatUsd,
  estimateRun,
  renderSummary,
  renderComment,
  parseBool,
} = require('./estimate');

function test(name, fn) {
  fn();
  console.log(`ok  ${name}`);
}

function linuxJob(overrides = {}) {
  return {
    name: 'lint',
    status: 'completed',
    conclusion: 'success',
    started_at: '2026-01-01T00:00:00.000Z',
    completed_at: '2026-01-01T00:00:20.000Z',
    labels: ['ubuntu-latest'],
    ...overrides,
  };
}

function assertNoQuotaHeadline(md) {
  assert.doesNotMatch(md, /Multiplier/);
  assert.doesNotMatch(md, /quota-equivalent/i);
  assert.doesNotMatch(md, /\b1×\b/);
  assert.doesNotMatch(md, /\b2×\b/);
  assert.doesNotMatch(md, /\b10×\b/);
  assert.doesNotMatch(md, /org pilot/i);
}

test('infers OS from runner labels, runner name, and fallback', () => {
  assert.strictEqual(inferOs({ labels: ['ubuntu-latest'] }), 'linux');
  assert.strictEqual(inferOs({ labels: ['windows-2022'] }), 'windows');
  assert.strictEqual(inferOs({ labels: ['macos-14'] }), 'macos');
  assert.strictEqual(inferOs({ labels: ['macos-latest'] }), 'macos');
  assert.strictEqual(inferOs({ labels: ['self-hosted'] }, 'Linux'), 'linux');
  assert.strictEqual(inferOs({ labels: ['self-hosted'] }, 'Windows'), 'windows');
  assert.strictEqual(inferOs({ labels: ['self-hosted'] }, 'macOS'), 'macos');
  assert.strictEqual(inferOs({ labels: [], runner_name: 'GitHub Actions 2' }, 'linux'), 'linux');
  assert.strictEqual(inferOs({ labels: ['win32'] }), 'windows');
  assert.strictEqual(inferOs({ labels: ['darwin'] }), 'macos');
  assert.strictEqual(inferOs({ labels: ['osx'] }), 'macos');
  assert.strictEqual(inferOs({ labels: ['mac-os'] }), 'macos');
  assert.strictEqual(inferOs({ labels: ['debian-12'] }), 'linux');
  assert.strictEqual(inferOs({ labels: ['self-hosted'] }), 'unknown');
  assert.strictEqual(inferOs({}), 'unknown');
});

test('infers usage-report SKUs including larger and self-hosted runners', () => {
  assert.strictEqual(inferSku({ labels: ['ubuntu-latest'] }), 'actions_linux');
  assert.strictEqual(inferSku({ labels: ['ubuntu-24.04'] }), 'actions_linux');
  assert.strictEqual(inferSku({ labels: ['ubuntu-slim'] }), 'actions_linux_slim');
  assert.strictEqual(inferSku({ labels: ['ubuntu-24.04-arm'] }), 'actions_linux_arm');
  assert.strictEqual(inferSku({ labels: ['windows-latest'] }), 'actions_windows');
  assert.strictEqual(inferSku({ labels: ['windows-2022'] }), 'actions_windows');
  assert.strictEqual(inferSku({ labels: ['macos-14'] }), 'actions_macos');
  assert.strictEqual(inferSku({ labels: ['ubuntu-latest-4-cores'] }), 'linux_4_core');
  assert.strictEqual(inferSku({ labels: ['windows-latest-8-cores'] }), 'windows_8_core');
  assert.strictEqual(inferSku({ labels: ['macos-latest-large'] }), 'macos_l');
  assert.strictEqual(inferSku({ labels: ['macos-latest-xlarge'] }), 'macos_xl');
  assert.strictEqual(inferSku({ labels: ['self-hosted', 'linux'] }), 'self-hosted');
  assert.strictEqual(inferSku({ labels: ['self-hosted'] }, 'Linux'), 'self-hosted');
  assert.strictEqual(inferSku({ labels: ['self-hosted'] }), 'self-hosted');
  assert.strictEqual(inferSku({}), 'unknown');
  assert.strictEqual(inferSku({ labels: ['ubuntu-latest'] }, 'Windows'), 'actions_linux');
});

test('documents GitHub list prices used for estimates', () => {
  assert.strictEqual(LIST_PRICES.actions_linux, 0.006);
  assert.strictEqual(LIST_PRICES.actions_windows, 0.01);
  assert.strictEqual(LIST_PRICES.actions_macos, 0.062);
  assert.strictEqual(LIST_PRICES.actions_linux_slim, 0.002);
  assert.strictEqual(LIST_PRICES.linux_4_core, 0.012);
  assert.strictEqual(rateForSku('actions_linux'), 0.006);
  assert.strictEqual(rateForSku('self-hosted'), null);
  assert.strictEqual(rateForSku('unknown'), null);
  assert.match(RATES_SOURCE, /actions-runner-pricing/);
  assert.strictEqual(RATES_AS_OF, '2026-09-05');
});

test('included-minute burn uses standard hosted weights only', () => {
  assert.strictEqual(includedWeightForSku('actions_linux'), 1);
  assert.strictEqual(includedWeightForSku('actions_windows'), 2);
  assert.strictEqual(includedWeightForSku('actions_macos'), 10);
  assert.strictEqual(includedWeightForSku('linux_4_core'), 0);
  assert.strictEqual(includedWeightForSku('self-hosted'), 0);
  assert.strictEqual(includedWeightForSku('unknown'), 0);
  assert.strictEqual(includedMinuteBurn(1, 'actions_linux'), 1);
  assert.strictEqual(includedMinuteBurn(1, 'actions_windows'), 2);
  assert.strictEqual(includedMinuteBurn(1, 'actions_macos'), 10);
  assert.strictEqual(includedMinuteBurn(2, 'linux_4_core'), 0);
});

test('measures duration and treats in-progress jobs as partial', () => {
  const start = '2026-01-01T00:00:00.000Z';
  const now = Date.parse('2026-01-01T00:00:12.000Z');
  assert.strictEqual(jobDurationMs({ started_at: start, completed_at: '2026-01-01T00:01:05.000Z' }), 65_000);
  assert.strictEqual(jobDurationMs({ started_at: start, completed_at: null }, now), 12_000);
  assert.strictEqual(jobDurationMs({ started_at: null }), 0);
  assert.strictEqual(jobDurationMs({}), 0);
  assert.strictEqual(jobDurationMs({ started_at: start, completed_at: start }), 0);
  assert.strictEqual(jobDurationMs({ started_at: 'not-a-date', completed_at: start }), 0);
  assert.strictEqual(jobDurationMs({ started_at: start, completed_at: 'not-a-date' }), 0);
  assert.strictEqual(
    jobDurationMs({ started_at: '2026-01-01T00:01:00.000Z', completed_at: '2026-01-01T00:00:00.000Z' }),
    0,
  );
});

test('rounds each started job up to the next minute before applying SKU math', () => {
  assert.strictEqual(roundedMinutes(12_000, true), 1);
  assert.strictEqual(roundedMinutes(60_000, true), 1);
  assert.strictEqual(roundedMinutes(60_001, true), 2);
  assert.strictEqual(roundedMinutes(0, false), 0);
  assert.strictEqual(roundedMinutes(12_000, false), 0);
  assert.strictEqual(billableMinutes(12_000, 10, true), 10);
  assert.strictEqual(billableMinutes(61_000, 10, true), 20);
  assert.strictEqual(listPriceUsd(1, 'actions_linux'), 0.006);
  assert.strictEqual(listPriceUsd(1, 'actions_macos'), 0.062);
  assert.strictEqual(listPriceUsd(2, 'actions_windows'), 0.02);
  assert.strictEqual(listPriceUsd(1, 'self-hosted'), null);
});

test('zero-duration started jobs still consume one rounded minute', () => {
  assert.strictEqual(roundedMinutes(0, true), 1);
  assert.strictEqual(includedMinuteBurn(1, 'actions_linux'), 1);
  assert.strictEqual(includedMinuteBurn(1, 'actions_windows'), 2);
  assert.strictEqual(includedMinuteBurn(1, 'actions_macos'), 10);
});

test('formats durations and list-price dollars', () => {
  assert.strictEqual(formatDuration(0), '—');
  assert.strictEqual(formatDuration(-1), '—');
  assert.strictEqual(formatDuration(5_000), '5s');
  assert.strictEqual(formatDuration(65_000), '1m 5s');
  assert.strictEqual(formatDuration(60_000), '1m 0s');
  assert.strictEqual(formatDuration(499), '0s');
  assert.strictEqual(formatUsd(0.006), '$0.0060');
  assert.strictEqual(formatUsd(0.062), '$0.0620');
  assert.strictEqual(formatUsd(0), '$0.0000');
  assert.strictEqual(formatUsd(null), '—');
});

test('estimates a mixed-OS run with SKU, dollars, and included-minute burn', () => {
  const now = Date.parse('2026-01-01T00:10:00.000Z');
  const estimate = estimateRun({
    now,
    jobs: [
      linuxJob(),
      {
        name: 'e2e',
        status: 'in_progress',
        started_at: '2026-01-01T00:09:00.000Z',
        completed_at: null,
        labels: ['macos-latest'],
      },
      {
        name: 'queued',
        status: 'queued',
        started_at: null,
        labels: ['windows-latest'],
      },
    ],
  });

  assert.strictEqual(estimate.jobCount, 3);
  assert.strictEqual(estimate.inProgressCount, 1);
  assert.strictEqual(estimate.rows[0].roundedMinutes, 1);
  assert.strictEqual(estimate.rows[0].includedMinutes, 1);
  assert.strictEqual(estimate.rows[0].sku, 'actions_linux');
  assert.strictEqual(estimate.rows[0].listPriceUsd, 0.006);
  assert.strictEqual(estimate.rows[1].minutes, 10);
  assert.strictEqual(estimate.rows[1].roundedMinutes, 1);
  assert.strictEqual(estimate.rows[1].sku, 'actions_macos');
  assert.strictEqual(estimate.rows[1].listPriceUsd, 0.062);
  assert.strictEqual(estimate.rows[1].os, 'macos');
  assert.strictEqual(estimate.rows[1].inProgress, true);
  assert.strictEqual(estimate.rows[2].roundedMinutes, 0);
  assert.strictEqual(estimate.rows[2].includedMinutes, 0);
  assert.strictEqual(estimate.rows[2].listPriceUsd, 0);
  assert.strictEqual(estimate.estimatedMinutes, 11);
  assert.strictEqual(estimate.roundedMinutes, 2);
  assert.strictEqual(estimate.estimatedUsd, 0.068);
});

test('macos short, exact-minute, and over-minute jobs keep rounding and list price correct', () => {
  const estimate = estimateRun({
    jobs: [
      linuxJob({
        name: 'ios-short',
        started_at: '2026-01-01T00:00:00.000Z',
        completed_at: '2026-01-01T00:00:12.000Z',
        labels: ['macos-14'],
      }),
      linuxJob({
        name: 'ios-exact',
        started_at: '2026-01-01T00:00:00.000Z',
        completed_at: '2026-01-01T00:01:00.000Z',
        labels: ['macos-latest'],
      }),
      linuxJob({
        name: 'ios-over',
        started_at: '2026-01-01T00:00:00.000Z',
        completed_at: '2026-01-01T00:01:01.000Z',
        labels: ['darwin'],
      }),
    ],
  });

  assert.deepStrictEqual(
    estimate.rows.map((row) => [row.name, row.sku, row.roundedMinutes, row.includedMinutes, row.listPriceUsd]),
    [
      ['ios-short', 'actions_macos', 1, 10, 0.062],
      ['ios-exact', 'actions_macos', 1, 10, 0.062],
      ['ios-over', 'actions_macos', 2, 20, 0.124],
    ],
  );
  assert.strictEqual(estimate.estimatedMinutes, 40);
  assert.strictEqual(estimate.roundedMinutes, 4);
  assert.strictEqual(estimate.estimatedUsd, 0.248);
});

test('larger runners bill at list price and do not burn included minutes', () => {
  const estimate = estimateRun({
    jobs: [
      linuxJob({
        name: 'heavy',
        started_at: '2026-01-01T00:00:00.000Z',
        completed_at: '2026-01-01T00:01:01.000Z',
        labels: ['ubuntu-latest-8-cores'],
      }),
    ],
  });

  assert.strictEqual(estimate.rows[0].sku, 'linux_8_core');
  assert.strictEqual(estimate.rows[0].roundedMinutes, 2);
  assert.strictEqual(estimate.rows[0].includedMinutes, 0);
  assert.strictEqual(estimate.rows[0].listPriceUsd, 0.044);
  assert.strictEqual(estimate.estimatedMinutes, 0);
  assert.strictEqual(estimate.estimatedUsd, 0.044);
});

test('missing or empty job lists produce a zero estimate', () => {
  const empty = estimateRun({ jobs: [] });
  assert.strictEqual(empty.jobCount, 0);
  assert.strictEqual(empty.estimatedMinutes, 0);
  assert.strictEqual(empty.roundedMinutes, 0);
  assert.strictEqual(empty.estimatedUsd, 0);
  assert.strictEqual(empty.wallSeconds, 0);
  assert.strictEqual(empty.inProgressCount, 0);
  assert.deepStrictEqual(empty.rows, []);

  const missing = estimateRun({});
  assert.strictEqual(missing.jobCount, 0);
  assert.strictEqual(missing.estimatedMinutes, 0);

  const nulled = estimateRun({ jobs: null });
  assert.strictEqual(nulled.jobCount, 0);
});

test('zero-duration completed jobs still count one rounded minute at list price', () => {
  const estimate = estimateRun({
    jobs: [
      linuxJob({
        name: 'instant',
        started_at: '2026-01-01T00:00:00.000Z',
        completed_at: '2026-01-01T00:00:00.000Z',
      }),
    ],
  });

  assert.strictEqual(estimate.rows[0].durationMs, 0);
  assert.strictEqual(estimate.rows[0].roundedMinutes, 1);
  assert.strictEqual(estimate.rows[0].includedMinutes, 1);
  assert.strictEqual(estimate.rows[0].listPriceUsd, 0.006);
  assert.strictEqual(estimate.estimatedMinutes, 1);
  assert.strictEqual(estimate.wallSeconds, 0);
});

test('unnamed jobs and conclusion-vs-status fall back cleanly', () => {
  const estimate = estimateRun({
    jobs: [
      {
        id: 42,
        started_at: '2026-01-01T00:00:00.000Z',
        completed_at: '2026-01-01T00:00:08.000Z',
        labels: ['ubuntu-latest'],
      },
      {
        started_at: null,
        status: 'queued',
      },
    ],
  });

  assert.strictEqual(estimate.rows[0].name, 42);
  assert.strictEqual(estimate.rows[0].status, 'unknown');
  assert.strictEqual(estimate.rows[1].name, 'unnamed job');
  assert.strictEqual(estimate.rows[1].status, 'queued');
  assert.strictEqual(estimate.rows[1].roundedMinutes, 0);
  assert.strictEqual(estimate.rows[1].sku, 'unknown');
});

test('renders a finance-facing job summary without quota-multiplier headlines', () => {
  const estimate = estimateRun({
    now: Date.parse('2026-01-01T00:00:30.000Z'),
    jobs: [
      {
        name: 'build',
        conclusion: 'success',
        started_at: '2026-01-01T00:00:00.000Z',
        completed_at: '2026-01-01T00:00:08.000Z',
        labels: ['ubuntu-latest'],
        html_url: 'https://github.com/acme/app/actions/runs/1/job/2',
      },
    ],
  });
  const meta = {
    workflow: 'Demo',
    runId: '99',
    runNumber: '7',
    runUrl: 'https://github.com/acme/app/actions/runs/99',
  };
  const md = renderSummary({ estimate, meta });

  assert.match(md, /## Actionscope/);
  assert.match(md, /### This run/);
  assert.match(md, /### Jobs/);
  assert.match(md, /Wall time/);
  assert.match(md, /Rounded min/);
  assert.match(md, /Runner SKU/);
  assert.match(md, /Est\. \$ \(list\)/);
  assert.match(md, /Included min/);
  assert.match(md, /Included-minute burn/);
  assert.match(md, /`actions_linux`/);
  assert.match(md, /\$0\.0060/);
  assert.match(md, /not an invoice/i);
  assert.match(md, /\[build\]\(https:\/\/github.com\/acme\/app\/actions\/runs\/1\/job\/2\)/);
  assert.match(md, /GitHub runner pricing/);
  assert.match(md, /docs\.github\.com\/en\/billing\/reference\/actions-runner-pricing/);
  assert.strictEqual(PRODUCT_SITE, 'https://28to3.me');
  assert.match(md, /\[28to3\.me\]\(https:\/\/28to3\.me\)/);
  assert.match(md, /Org-level reports/);
  assert.doesNotMatch(md, /buy\.stripe\.com/i);
  assert.doesNotMatch(md, /stripe/i);
  assert.doesNotMatch(md, /\$49/);
  assertNoQuotaHeadline(md);

  const comment = renderComment({ estimate, meta });
  assert.match(comment, new RegExp(COMMENT_MARKER));
  assert.match(comment, /\*\*Est\. \$0\.0060\*\*/);
  assert.match(comment, /\*\*1\*\* rounded min/);
  assert.match(comment, /\*\*1\*\* included min/);
  assert.match(comment, /`actions_linux`/);
  assert.match(comment, /\[28to3\.me\]\(https:\/\/28to3\.me\)/);
  assert.doesNotMatch(comment, /buy\.stripe\.com/i);
  assert.doesNotMatch(comment, /stripe/i);
  assertNoQuotaHeadline(comment);
});

test('renders an empty-job summary and API warning without inventing minutes', () => {
  const estimate = estimateRun({ jobs: [] });
  const meta = {
    workflow: 'Demo',
    runId: '1',
    apiWarning: 'The Jobs API returned no jobs yet; falling back to the current job only.',
  };
  const md = renderSummary({ estimate, meta });

  assert.match(md, /No jobs were returned/);
  assert.match(md, /Included-minute burn \| 0/);
  assert.match(md, /Rounded minutes \| 0/);
  assert.match(md, /\$0\.0000/);
  assert.match(md, /Jobs API returned no jobs/);
  assert.match(md, /https:\/\/28to3\.me/);
  assert.doesNotMatch(md, /buy\.stripe\.com/i);
  assertNoQuotaHeadline(md);

  const comment = renderComment({ estimate, meta });
  assert.match(comment, /No jobs were returned/);
  assert.match(comment, /\*\*Est\. \$0\.0000\*\*/);
});

test('marks in-progress rows and pluralizes the partial-duration note', () => {
  const now = Date.parse('2026-01-01T00:10:00.000Z');
  const estimate = estimateRun({
    now,
    jobs: [
      {
        name: 'one',
        status: 'in_progress',
        started_at: '2026-01-01T00:09:00.000Z',
        completed_at: null,
        labels: ['ubuntu-latest'],
      },
      {
        name: 'two',
        status: 'in_progress',
        started_at: '2026-01-01T00:09:30.000Z',
        completed_at: null,
        labels: ['windows-latest'],
      },
    ],
  });
  const md = renderSummary({ estimate, meta: { workflow: 'CI', runId: '3' } });

  assert.match(md, /\(partial\)/);
  assert.match(md, /2 jobs are still running/);
  assert.match(md, /`actions_windows`/);
  assert.match(md, /\$0\.0160/);
  assert.match(md, /Included-minute burn \| 3/);
  assertNoQuotaHeadline(md);
});

test('parseBool accepts GitHub Action truthy strings only', () => {
  assert.strictEqual(parseBool('true'), true);
  assert.strictEqual(parseBool('TRUE'), true);
  assert.strictEqual(parseBool('1'), true);
  assert.strictEqual(parseBool('yes'), true);
  assert.strictEqual(parseBool('false'), false);
  assert.strictEqual(parseBool(''), false);
  assert.strictEqual(parseBool(undefined), false);
});

console.log('\nAll estimate tests passed.');
