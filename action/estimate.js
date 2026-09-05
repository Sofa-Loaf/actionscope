'use strict';

/** Quota multipliers GitHub has long used for included Actions minutes. */
const OS_MULTIPLIERS = {
  linux: 1,
  windows: 2,
  macos: 10,
};

/** Public product site. Checkout lives here — never Stripe URLs in this repo. */
const PRODUCT_SITE = 'https://28to3.me';

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
    .map(([os, minutes]) => `${minutes} min on ${os}`);
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
    '## Actionscope',
    '',
    'Estimated **quota-equivalent minutes** for this workflow run. This is a lens on where included minutes go — **not an invoice**.',
    '',
    '### This run',
    '',
    `| | |`,
    `| --- | --- |`,
    `| Workflow | ${meta.workflow || 'unknown'} |`,
    `| Run | ${runLink} |`,
    `| Jobs included | ${estimate.jobCount} |`,
    `| Combined wall-clock | ${formatDuration(wallSeconds * 1000)} |`,
    `| **Estimated minutes** | **~${estimatedMinutes}** |`,
    '',
  ];

  if (rows.length === 0) {
    lines.push(
      '### Jobs',
      '',
      '_No jobs were returned for this run, so there is nothing to attribute yet._',
      '',
    );
  } else {
    lines.push(
      '### Jobs',
      '',
      '| Job | Status | Duration | Runner | Multiplier | Est. minutes |',
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
      lines.push(`Minutes by runner: ${hint}.`, '');
    }
  }

  lines.push(
    '### How this estimate is calculated',
    '',
    '1. Each job’s wall-clock time is rounded **up to the next whole minute** (a 12-second job counts as 1).',
    '2. That minute count is multiplied by the runner OS used for included-minute quota: Linux **1×**, Windows **2×**, macOS **10×**.',
    '3. Jobs that never started contribute **0**. Jobs still running use a **partial** duration through now.',
    '',
    'Public repositories and typical self-hosted runners are often not billed the same way. Larger runners, custom SKUs, and storage are out of scope.',
    '',
  );

  if (inProgressCount > 0) {
    const verb = inProgressCount === 1 ? 'is' : 'are';
    lines.push(
      `**Note:** ${inProgressCount} job${inProgressCount === 1 ? '' : 's'} ${verb} still running; those rows show a partial duration.`,
      '',
    );
  }
  if (meta.apiWarning) {
    lines.push(`**Note:** ${meta.apiWarning}`, '');
  }

  lines.push(
    '---',
    '',
    `Invite an org pilot or learn more at **[${PRODUCT_SITE.replace(/^https:\/\//, '')}](${PRODUCT_SITE})**.`,
    '',
  );
  return lines.join('\n');
}

module.exports = {
  OS_MULTIPLIERS,
  PRODUCT_SITE,
  inferOs,
  multiplierForOs,
  jobDurationMs,
  billableMinutes,
  formatDuration,
  estimateRun,
  renderSummary,
};
