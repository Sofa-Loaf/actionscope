'use strict';

const assert = require('assert');
const {
  OS_MULTIPLIERS,
  PRODUCT_SITE,
  inferOs,
  multiplierForOs,
  jobDurationMs,
  billableMinutes,
  formatDuration,
  estimateRun,
  renderSummary,
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

test('applies quota multipliers without changing rates', () => {
  assert.strictEqual(OS_MULTIPLIERS.linux, 1);
  assert.strictEqual(OS_MULTIPLIERS.windows, 2);
  assert.strictEqual(OS_MULTIPLIERS.macos, 10);
  assert.strictEqual(multiplierForOs('linux'), 1);
  assert.strictEqual(multiplierForOs('windows'), 2);
  assert.strictEqual(multiplierForOs('macos'), 10);
  assert.strictEqual(multiplierForOs('unknown'), 1);
  assert.strictEqual(multiplierForOs('custom'), 1);
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

test('rounds each started job up to the next minute before multiplying', () => {
  assert.strictEqual(billableMinutes(12_000, 1, true), 1);
  assert.strictEqual(billableMinutes(60_000, 1, true), 1);
  assert.strictEqual(billableMinutes(60_001, 1, true), 2);
  assert.strictEqual(billableMinutes(12_000, 10, true), 10);
  assert.strictEqual(billableMinutes(61_000, 10, true), 20);
  assert.strictEqual(billableMinutes(0, 1, false), 0);
  assert.strictEqual(billableMinutes(12_000, 2, false), 0);
});

test('zero-duration started jobs still consume one rounded minute times the OS multiplier', () => {
  assert.strictEqual(billableMinutes(0, 1, true), 1);
  assert.strictEqual(billableMinutes(0, 2, true), 2);
  assert.strictEqual(billableMinutes(0, 10, true), 10);
});

test('formats durations for the summary table', () => {
  assert.strictEqual(formatDuration(0), '—');
  assert.strictEqual(formatDuration(-1), '—');
  assert.strictEqual(formatDuration(5_000), '5s');
  assert.strictEqual(formatDuration(65_000), '1m 5s');
  assert.strictEqual(formatDuration(60_000), '1m 0s');
  assert.strictEqual(formatDuration(499), '0s');
});

test('estimates a mixed-OS run and attributes minutes', () => {
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
  assert.strictEqual(estimate.rows[0].minutes, 1);
  assert.strictEqual(estimate.rows[1].minutes, 10);
  assert.strictEqual(estimate.rows[1].os, 'macos');
  assert.strictEqual(estimate.rows[1].multiplier, 10);
  assert.strictEqual(estimate.rows[1].inProgress, true);
  assert.strictEqual(estimate.rows[2].minutes, 0);
  assert.strictEqual(estimate.estimatedMinutes, 11);
});

test('macos multiplier applies to short, exact-minute, and over-minute jobs', () => {
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
    estimate.rows.map((row) => [row.name, row.os, row.multiplier, row.minutes]),
    [
      ['ios-short', 'macos', 10, 10],
      ['ios-exact', 'macos', 10, 10],
      ['ios-over', 'macos', 10, 20],
    ],
  );
  assert.strictEqual(estimate.estimatedMinutes, 40);
});

test('missing or empty job lists produce a zero estimate', () => {
  const empty = estimateRun({ jobs: [] });
  assert.strictEqual(empty.jobCount, 0);
  assert.strictEqual(empty.estimatedMinutes, 0);
  assert.strictEqual(empty.wallSeconds, 0);
  assert.strictEqual(empty.inProgressCount, 0);
  assert.deepStrictEqual(empty.rows, []);

  const missing = estimateRun({});
  assert.strictEqual(missing.jobCount, 0);
  assert.strictEqual(missing.estimatedMinutes, 0);

  const nulled = estimateRun({ jobs: null });
  assert.strictEqual(nulled.jobCount, 0);
});

test('zero-duration completed jobs still count one rounded minute', () => {
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
  assert.strictEqual(estimate.rows[0].minutes, 1);
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
  assert.strictEqual(estimate.rows[1].minutes, 0);
});

test('renders a job summary with estimate, caveats, and site-only CTA', () => {
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
  const md = renderSummary({
    estimate,
    meta: {
      workflow: 'Demo',
      runId: '99',
      runNumber: '7',
      runUrl: 'https://github.com/acme/app/actions/runs/99',
    },
  });

  assert.match(md, /## Actionscope/);
  assert.match(md, /### This run/);
  assert.match(md, /### Jobs/);
  assert.match(md, /Estimated minutes/);
  assert.match(md, /\*\*~1\*\*/);
  assert.match(md, /\[build\]\(https:\/\/github.com\/acme\/app\/actions\/runs\/1\/job\/2\)/);
  assert.match(md, /Linux \*\*1×\*\*/);
  assert.match(md, /macOS \*\*10×\*\*/);
  assert.match(md, /not an invoice/i);
  assert.match(md, /Minutes by runner: 1 min on linux/);
  assert.strictEqual(PRODUCT_SITE, 'https://28to3.me');
  assert.match(md, /\[28to3\.me\]\(https:\/\/28to3\.me\)/);
  assert.match(md, /Invite an org pilot or learn more/);
  assert.doesNotMatch(md, /buy\.stripe\.com/i);
  assert.doesNotMatch(md, /stripe/i);
  assert.doesNotMatch(md, /\$49/);
});

test('renders an empty-job summary and API warning without inventing minutes', () => {
  const md = renderSummary({
    estimate: estimateRun({ jobs: [] }),
    meta: {
      workflow: 'Demo',
      runId: '1',
      apiWarning: 'The Jobs API returned no jobs yet; falling back to the current job only.',
    },
  });

  assert.match(md, /No jobs were returned/);
  assert.match(md, /\*\*~0\*\*/);
  assert.match(md, /Jobs API returned no jobs/);
  assert.match(md, /https:\/\/28to3\.me/);
  assert.doesNotMatch(md, /buy\.stripe\.com/i);
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
  assert.match(md, /Minutes by runner: 2 min on windows, 1 min on linux/);
});

console.log('\nAll estimate tests passed.');
