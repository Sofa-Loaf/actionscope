'use strict';

/** Quota multipliers GitHub has long used for included Actions minutes. */
const OS_MULTIPLIERS = {
  linux: 1,
  windows: 2,
  macos: 10,
};

/**
 * Infer a billing OS from job labels, runner name, or a fallback like RUNNER_OS.
 * @param {{ labels?: string[], runner_name?: string }} job
 * @param {string} [fallbackOs]
 * @returns {'linux' | 'windows' | 'macos' | 'unknown'}
 */
function inferOs(job, fallbackOs) {
  const haystack = [
    ...(job.labels || []),
    job.runner_name || '',
    fallbackOs || '',
  ]
    .join(' ')
    .toLowerCase();

  if (/\b(windows|win32)\b/.test(haystack)) return 'windows';
  if (/\b(macos|mac-os|darwin|osx)\b/.test(haystack)) return 'macos';
  if (/\b(ubuntu|linux|debian)\b/.test(haystack)) return 'linux';
  return 'unknown';
}

/**
 * @param {'linux' | 'windows' | 'macos' | 'unknown'} os
 * @returns {number}
 */
function multiplierForOs(os) {
  return OS_MULTIPLIERS[os] || 1;
}

/**
 * Wall-clock duration in milliseconds. In-progress jobs use `now`.
 * @param {{ started_at?: string | null, completed_at?: string | null }} job
 * @param {number} [now]
 * @returns {number}
 */
function jobDurationMs(job, now = Date.now()) {
  if (!job.started_at) return 0;
  const start = Date.parse(job.started_at);
  if (Number.isNaN(start)) return 0;
  const end = job.completed_at ? Date.parse(job.completed_at) : now;
  if (Number.isNaN(end)) return 0;
  return Math.max(0, end - start);
}

/**
 * GitHub rounds each job up to the next whole minute, then applies the OS multiplier.
 * A job that never started contributes 0.
 * @param {number} durationMs
 * @param {number} multiplier
 * @param {boolean} started
 * @returns {number}
 */
function billableMinutes(durationMs, multiplier, started) {
  if (!started) return 0;
  const wallMinutes = Math.max(1, Math.ceil(durationMs / 60_000));
  return wallMinutes * multiplier;
}

function formatDuration(ms) {
  if (ms <= 0) return '—';
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function jobStatus(job) {
  if (job.conclusion) return job.conclusion;
  return job.status || 'unknown';
}

/**
 * @param {object} options
 * @param {Array<object>} options.jobs
 * @param {string} [options.fallbackOs]
 * @param {number} [options.now]
 */
function estimateRun({ jobs, fallbackOs, now = Date.now() }) {
  const rows = (jobs || []).map((job) => {
    const os = inferOs(job, fallbackOs);
    const multiplier = multiplierForOs(os);
    const started = Boolean(job.started_at);
    const durationMs = jobDurationMs(job, now);
    const minutes = billableMinutes(durationMs, multiplier, started);
    const inProgress = started && !job.completed_at;

    return {
      name: job.name || job.id || 'unnamed job',
      status: jobStatus(job),
      os,
      multiplier,
      durationMs,
      minutes,
      inProgress,
      labels: job.labels || [],
      htmlUrl: job.html_url || '',
    };
  });

  const estimatedMinutes = rows.reduce((sum, row) => sum + row.minutes, 0);
  const wallSeconds = Math.round(rows.reduce((sum, row) => sum + row.durationMs, 0) / 1000);
  const inProgressCount = rows.filter((row) => row.inProgress).length;

  return {
    rows,
    estimatedMinutes,
    wallSeconds,
    jobCount: rows.length,
    inProgressCount,
  };
}

function attributionHint(rows) {
  if (rows.length === 0) return '';
  const byOs = {};
  for (const row of rows) {
    byOs[row.os] = (byOs[row.os] || 0) + row.minutes;
  }
  const parts = Object.entries(byOs)
    .sort((a, b) => b[1] - a[1])
    .map(([os, minutes]) => `${minutes} on ${os}`);
  return parts.join(', ');
}

/**
 * @param {object} input
 * @param {ReturnType<typeof estimateRun>} input.estimate
 * @param {object} input.meta
 */
function renderSummary({ estimate, meta }) {
  const { rows, estimatedMinutes, wallSeconds, inProgressCount } = estimate;
  const runLink = meta.runUrl ? `[#${meta.runNumber || meta.runId}](${meta.runUrl})` : `#${meta.runNumber || meta.runId || '?'}`;
  const lines = [
    '## Actionscope — minute estimate',
    '',
    `| | |`,
    `| --- | --- |`,
    `| Workflow | ${meta.workflow || 'unknown'} |`,
    `| Run | ${runLink} |`,
    `| Jobs visible | ${estimate.jobCount} |`,
    `| Wall-clock (sum) | ${formatDuration(wallSeconds * 1000)} |`,
    `| **Estimated billable minutes** | **~${estimatedMinutes}** |`,
    '',
  ];

  if (rows.length === 0) {
    lines.push('_No jobs were returned for this run. The estimate could not be computed._', '');
  } else {
    lines.push(
      '| Job | Status | Duration | Runner | Multiplier | Billable min (est.) |',
      '| --- | --- | --- | --- | --- | ---: |',
    );
    for (const row of rows) {
      const name = row.htmlUrl ? `[${row.name}](${row.htmlUrl})` : row.name;
      const duration = `${formatDuration(row.durationMs)}${row.inProgress ? ' (partial)' : ''}`;
      lines.push(
        `| ${name} | ${row.status} | ${duration} | ${row.os} | ${row.multiplier}× | ${row.minutes} |`,
      );
    }
    lines.push('');
    const hint = attributionHint(rows);
    if (hint) {
      lines.push(`Rough attribution: ${hint}.`, '');
    }
  }

  lines.push(
    '### How this is calculated',
    '',
    '- Each job is rounded **up to the next whole minute**, then multiplied by OS: Linux **1×**, Windows **2×**, macOS **10×**.',
    '- That matches how included-minute quota is typically consumed on private repos. Public repos and most self-hosted runners are not billed the same way.',
    '- This is **not an invoice**. Larger runners, custom SKUs, storage, and GitHub’s current per-minute price table are out of scope for v0.',
  );

  if (inProgressCount > 0) {
    lines.push(`- ${inProgressCount} job${inProgressCount === 1 ? ' is' : 's are'} still running; those durations are partial.`);
  }
  if (meta.apiWarning) {
    lines.push(`- ${meta.apiWarning}`);
  }

  lines.push('');
  return lines.join('\n');
}

module.exports = {
  OS_MULTIPLIERS,
  inferOs,
  multiplierForOs,
  jobDurationMs,
  billableMinutes,
  formatDuration,
  estimateRun,
  renderSummary,
};
