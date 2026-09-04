'use strict';

const assert = require('assert');
const {
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

test('infers OS from runner labels', () => {
  assert.strictEqual(inferOs({ labels: ['ubuntu-latest'] }), 'linux');
  assert.strictEqual(inferOs({ labels: ['windows-2022'] }), 'windows');
  assert.strictEqual(inferOs({ labels: ['macos-14'] }), 'macos');
  assert.strictEqual(inferOs({ labels: ['self-hosted'] }, 'Linux'), 'linux');
});

test('applies quota multipliers', () => {
  assert.strictEqual(multiplierForOs('linux'), 1);
  assert.strictEqual(multiplierForOs('windows'), 2);
  assert.strictEqual(multiplierForOs('macos'), 10);
  assert.strictEqual(multiplierForOs('unknown'), 1);
});

test('measures duration and treats in-progress jobs as partial', () => {
  const start = '2026-01-01T00:00:00.000Z';
  const now = Date.parse('2026-01-01T00:00:12.000Z');
  assert.strictEqual(jobDurationMs({ started_at: start, completed_at: '2026-01-01T00:01:05.000Z' }), 65_000);
  assert.strictEqual(jobDurationMs({ started_at: start, completed_at: null }, now), 12_000);
  assert.strictEqual(jobDurationMs({ started_at: null }), 0);
});

test('rounds each started job up to the next minute before multiplying', () => {
  assert.strictEqual(billableMinutes(12_000, 1, true), 1);
  assert.strictEqual(billableMinutes(60_000, 1, true), 1);
  assert.strictEqual(billableMinutes(60_001, 1, true), 2);
  assert.strictEqual(billableMinutes(12_000, 10, true), 10);
  assert.strictEqual(billableMinutes(0, 1, false), 0);
});

test('formats durations for the summary table', () => {
  assert.strictEqual(formatDuration(0), '—');
  assert.strictEqual(formatDuration(5_000), '5s');
  assert.strictEqual(formatDuration(65_000), '1m 5s');
});

test('estimates a mixed-OS run and attributes minutes', () => {
  const now = Date.parse('2026-01-01T00:10:00.000Z');
  const estimate = estimateRun({
    now,
    jobs: [
      {
        name: 'lint',
        status: 'completed',
        conclusion: 'success',
        started_at: '2026-01-01T00:00:00.000Z',
        completed_at: '2026-01-01T00:00:20.000Z',
        labels: ['ubuntu-latest'],
      },
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
  assert.strictEqual(estimate.rows[2].minutes, 0);
  assert.strictEqual(estimate.estimatedMinutes, 11);
});

test('renders a job summary with estimate and caveats', () => {
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

  assert.match(md, /Estimated billable minutes/);
  assert.match(md, /\*\*~1\*\*/);
  assert.match(md, /build/);
  assert.match(md, /Linux \*\*1×\*\*/);
  assert.match(md, /not an invoice/i);
});

console.log('\nAll estimate tests passed.');
