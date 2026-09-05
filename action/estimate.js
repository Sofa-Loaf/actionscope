'use strict';

/**
 * GitHub-hosted runner list prices (USD per minute).
 * Source: https://docs.github.com/en/billing/reference/actions-runner-pricing
 * Documented in this Action as of 2026-09-05. Estimates only — not an invoice.
 */
const RATES_SOURCE = 'https://docs.github.com/en/billing/reference/actions-runner-pricing';
const RATES_AS_OF = '2026-09-05';

const LIST_PRICES = {
  actions_linux_slim: 0.002,
  actions_linux: 0.006,
  actions_linux_arm: 0.005,
  actions_windows: 0.01,
  actions_windows_arm: 0.01,
  actions_macos: 0.062,
  linux_2_core_advanced: 0.006,
  linux_4_core: 0.012,
  linux_8_core: 0.022,
  linux_16_core: 0.042,
  linux_32_core: 0.082,
  linux_64_core: 0.162,
  linux_96_core: 0.252,
  windows_4_core: 0.022,
  windows_8_core: 0.042,
  windows_16_core: 0.082,
  windows_32_core: 0.162,
  windows_64_core: 0.322,
  windows_96_core: 0.552,
  macos_l: 0.077,
  linux_2_core_arm: 0.005,
  linux_4_core_arm: 0.008,
  linux_8_core_arm: 0.014,
  linux_16_core_arm: 0.026,
  linux_32_core_arm: 0.05,
  linux_64_core_arm: 0.098,
  windows_2_core_arm: 0.008,
  windows_4_core_arm: 0.014,
  windows_8_core_arm: 0.026,
  windows_16_core_arm: 0.05,
  windows_32_core_arm: 0.098,
  windows_64_core_arm: 0.194,
  macos_xl: 0.102,
  linux_4_core_gpu: 0.052,
  windows_4_core_gpu: 0.102,
};

/** Standard hosted SKUs that can consume plan included minutes. */
const STANDARD_INCLUDED_WEIGHTS = {
  actions_linux_slim: 1,
  actions_linux: 1,
  actions_linux_arm: 1,
  actions_windows: 2,
  actions_windows_arm: 2,
  actions_macos: 10,
};

/** Public product site. Checkout lives here — never Stripe URLs in this repo. */
const PRODUCT_SITE = 'https://28to3.me';

const COMMENT_MARKER = '<!-- actionscope -->';

const LARGER_CORE_SKUS = {
  linux: {
    4: 'linux_4_core',
    8: 'linux_8_core',
    16: 'linux_16_core',
    32: 'linux_32_core',
    64: 'linux_64_core',
    96: 'linux_96_core',
  },
  windows: {
    4: 'windows_4_core',
    8: 'windows_8_core',
    16: 'windows_16_core',
    32: 'windows_32_core',
    64: 'windows_64_core',
    96: 'windows_96_core',
  },
  linux_arm: {
    2: 'linux_2_core_arm',
    4: 'linux_4_core_arm',
    8: 'linux_8_core_arm',
    16: 'linux_16_core_arm',
    32: 'linux_32_core_arm',
    64: 'linux_64_core_arm',
  },
  windows_arm: {
    2: 'windows_2_core_arm',
    4: 'windows_4_core_arm',
    8: 'windows_8_core_arm',
    16: 'windows_16_core_arm',
    32: 'windows_32_core_arm',
    64: 'windows_64_core_arm',
  },
};

function osFromText(text) {
  const haystack = String(text || '').toLowerCase();
  if (/\b(windows|win32)\b/.test(haystack)) return 'windows';
  if (/\b(macos|mac-os|darwin|osx)\b/.test(haystack)) return 'macos';
  if (/\b(ubuntu|linux|debian)\b/.test(haystack)) return 'linux';
  return 'unknown';
}

/**
 * Infer a billing OS from job labels, then runner name, then a fallback like RUNNER_OS.
 * @param {{ labels?: string[], runner_name?: string }} job
 * @param {string} [fallbackOs]
 * @returns {'linux' | 'windows' | 'macos' | 'unknown'}
 */
function inferOs(job, fallbackOs) {
  const fromLabels = osFromText((job.labels || []).join(' '));
  if (fromLabels !== 'unknown') return fromLabels;
  const fromRunner = osFromText(job.runner_name || '');
  if (fromRunner !== 'unknown') return fromRunner;
  return osFromText(fallbackOs || '');
}

function jobHaystack(job, fallbackOs) {
  return [
    ...(job.labels || []),
    job.runner_name || '',
    fallbackOs || '',
  ]
    .join(' ')
    .toLowerCase();
}

function isSelfHosted(haystack) {
  return /\bself-hosted\b/.test(haystack);
}

function isArm(haystack) {
  return /\b(arm64|aarch64|linux-arm|windows-arm|ubuntu-.*-arm)\b/.test(haystack);
}

function largerCoreCount(haystack) {
  const match = haystack.match(/\b(\d+)\s*-?\s*cores?\b/);
  return match ? Number(match[1]) : null;
}

/**
 * Infer the GitHub usage-report SKU from job labels / runner name.
 * @param {{ labels?: string[], runner_name?: string }} job
 * @param {string} [fallbackOs]
 * @returns {string}
 */
function inferSku(job, fallbackOs) {
  const haystack = jobHaystack(job, fallbackOs);
  if (!haystack.trim()) return 'unknown';
  if (isSelfHosted(haystack)) return 'self-hosted';

  const os = inferOs(job, fallbackOs);
  if (/\b(macos[_-]?xl|macos-latest-xlarge|xlarge|m2 pro|5-core)\b/.test(haystack) && os === 'macos') {
    return 'macos_xl';
  }
  if (/\b(macos[_-]?l\b|macos-latest-large|12-core)\b/.test(haystack) && os === 'macos') {
    return 'macos_l';
  }
  if (/\bgpu\b/.test(haystack)) {
    if (os === 'windows') return 'windows_4_core_gpu';
    if (os === 'linux') return 'linux_4_core_gpu';
  }

  const cores = largerCoreCount(haystack);
  const arm = isArm(haystack);
  if (cores && cores !== 2 && os === 'linux') {
    const table = arm ? LARGER_CORE_SKUS.linux_arm : LARGER_CORE_SKUS.linux;
    if (table[cores]) return table[cores];
  }
  if (cores && cores !== 2 && os === 'windows') {
    const table = arm ? LARGER_CORE_SKUS.windows_arm : LARGER_CORE_SKUS.windows;
    if (table[cores]) return table[cores];
  }
  if (cores === 2 && arm && os === 'linux') return 'linux_2_core_arm';
  if (cores === 2 && arm && os === 'windows') return 'windows_2_core_arm';

  if (os === 'windows') return arm ? 'actions_windows_arm' : 'actions_windows';
  if (os === 'macos') return 'actions_macos';
  if (os === 'linux') {
    if (/\b(ubuntu-slim|linux_slim|linux-slim)\b/.test(haystack)) return 'actions_linux_slim';
    if (arm) return 'actions_linux_arm';
    return 'actions_linux';
  }
  return 'unknown';
}

function rateForSku(sku) {
  if (sku === 'self-hosted' || sku === 'unknown') return null;
  return Object.prototype.hasOwnProperty.call(LIST_PRICES, sku) ? LIST_PRICES[sku] : null;
}

/**
 * Included-minute weight for standard hosted SKUs (Linux 1, Windows 2, macOS 10).
 * Larger runners cannot use included minutes. Self-hosted / unknown contribute 0.
 * @param {string} sku
 * @returns {number}
 */
function includedWeightForSku(sku) {
  return STANDARD_INCLUDED_WEIGHTS[sku] || 0;
}

/**
 * GitHub rounds each started job up to the next whole minute.
 * A job that never started contributes 0.
 * @param {number} durationMs
 * @param {boolean} started
 * @returns {number}
 */
function roundedMinutes(durationMs, started) {
  if (!started) return 0;
  return Math.max(1, Math.ceil(durationMs / 60_000));
}

function includedMinuteBurn(rounded, sku) {
  return rounded * includedWeightForSku(sku);
}

function listPriceUsd(rounded, sku) {
  const rate = rateForSku(sku);
  if (rate == null) return null;
  return roundUsd(rounded * rate);
}

function roundUsd(amount) {
  return Math.round(amount * 10000) / 10000;
}

/**
 * @deprecated Prefer roundedMinutes + includedMinuteBurn. Kept for internal calc.
 */
function billableMinutes(durationMs, multiplier, started) {
  return roundedMinutes(durationMs, started) * multiplier;
}

function multiplierForOs(os) {
  if (os === 'windows') return 2;
  if (os === 'macos') return 10;
  if (os === 'linux') return 1;
  return 0;
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

function formatDuration(ms) {
  if (ms <= 0) return '—';
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function formatUsd(amount) {
  if (amount == null || Number.isNaN(amount)) return '—';
  return `$${roundUsd(amount).toFixed(4)}`;
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
    const sku = inferSku(job, fallbackOs);
    const started = Boolean(job.started_at);
    const durationMs = jobDurationMs(job, now);
    const rounded = roundedMinutes(durationMs, started);
    const includedMinutes = includedMinuteBurn(rounded, sku);
    const rateUsd = rateForSku(sku);
    const usd = listPriceUsd(rounded, sku);
    const inProgress = started && !job.completed_at;

    return {
      name: job.name || job.id || 'unnamed job',
      status: jobStatus(job),
      os,
      sku,
      multiplier: includedWeightForSku(sku),
      durationMs,
      roundedMinutes: rounded,
      minutes: includedMinutes,
      includedMinutes,
      rateUsd,
      listPriceUsd: usd,
      inProgress,
      labels: job.labels || [],
      htmlUrl: job.html_url || '',
    };
  });

  const estimatedMinutes = rows.reduce((sum, row) => sum + row.includedMinutes, 0);
  const totalRoundedMinutes = rows.reduce((sum, row) => sum + row.roundedMinutes, 0);
  const estimatedUsd = roundUsd(rows.reduce((sum, row) => sum + (row.listPriceUsd || 0), 0));
  const wallSeconds = Math.round(rows.reduce((sum, row) => sum + row.durationMs, 0) / 1000);
  const inProgressCount = rows.filter((row) => row.inProgress).length;
  const unknownPriceCount = rows.filter((row) => row.roundedMinutes > 0 && row.listPriceUsd == null).length;

  return {
    rows,
    estimatedMinutes,
    roundedMinutes: totalRoundedMinutes,
    estimatedUsd,
    wallSeconds,
    jobCount: rows.length,
    inProgressCount,
    unknownPriceCount,
  };
}

function skuRatesUsed(rows) {
  const seen = new Map();
  for (const row of rows) {
    if (!seen.has(row.sku)) {
      seen.set(row.sku, row.rateUsd);
    }
  }
  return [...seen.entries()].map(([sku, rateUsd]) => ({ sku, rateUsd }));
}

function jobDisplayName(row) {
  return row.htmlUrl ? `[${row.name}](${row.htmlUrl})` : row.name;
}

function jobWallLabel(row) {
  return `${formatDuration(row.durationMs)}${row.inProgress ? ' (partial)' : ''}`;
}

function renderJobTable(rows, { compact = false } = {}) {
  const header = compact
    ? '| Job | Wall | Rounded min | SKU | Est. $ | Included min |'
    : '| Job | Status | Wall time | Rounded min | Runner SKU | Est. $ (list) | Included min |';
  const align = compact
    ? '| --- | --- | ---: | --- | ---: | ---: |'
    : '| --- | --- | --- | ---: | --- | ---: | ---: |';
  const lines = [header, align];

  for (const row of rows) {
    const name = jobDisplayName(row);
    const wall = jobWallLabel(row);
    const sku = `\`${row.sku}\``;
    const usd = formatUsd(row.listPriceUsd);
    if (compact) {
      lines.push(
        `| ${name} | ${wall} | ${row.roundedMinutes} | ${sku} | ${usd} | ${row.includedMinutes} |`,
      );
    } else {
      lines.push(
        `| ${name} | ${row.status} | ${wall} | ${row.roundedMinutes} | ${sku} | ${usd} | ${row.includedMinutes} |`,
      );
    }
  }
  return lines;
}

function renderTotalRow(estimate, { compact = false } = {}) {
  const wall = formatDuration(estimate.wallSeconds * 1000);
  const usd = formatUsd(estimate.estimatedUsd);
  if (compact) {
    return `| **Total** | **${wall}** | **${estimate.roundedMinutes}** | | **${usd}** | **${estimate.estimatedMinutes}** |`;
  }
  return `| **Total** | | **${wall}** | **${estimate.roundedMinutes}** | | **${usd}** | **${estimate.estimatedMinutes}** |`;
}

function renderRatesFootnote(rows) {
  const used = skuRatesUsed(rows);
  if (used.length === 0) return [];
  const parts = used.map(({ sku, rateUsd }) => {
    if (rateUsd == null) return `\`${sku}\` n/a`;
    return `\`${sku}\` ${formatUsd(rateUsd)}/min`;
  });
  return [
    `List prices used (${RATES_AS_OF}, [GitHub runner pricing](${RATES_SOURCE})): ${parts.join(', ')}.`,
    '',
  ];
}

/**
 * @param {object} input
 * @param {ReturnType<typeof estimateRun>} input.estimate
 * @param {object} input.meta
 */
function renderSummary({ estimate, meta }) {
  const { rows, estimatedMinutes, roundedMinutes: rounded, estimatedUsd, wallSeconds, inProgressCount } = estimate;
  const runLink = meta.runUrl
    ? `[#${meta.runNumber || meta.runId}](${meta.runUrl})`
    : `#${meta.runNumber || meta.runId || '?'}`;
  const lines = [
    '## Actionscope',
    '',
    'Per-job **estimate** for this workflow run at GitHub list price. **Not an invoice.** Finance can paste the job table next to GitHub’s usage report (SKU, rounded minutes, $).',
    '',
    '### This run',
    '',
    `| | |`,
    `| --- | --- |`,
    `| Workflow | ${meta.workflow || 'unknown'} |`,
    `| Run | ${runLink} |`,
    `| Jobs included | ${estimate.jobCount} |`,
    `| Combined wall time | ${formatDuration(wallSeconds * 1000)} |`,
    `| Rounded minutes | ${rounded} |`,
    `| **Est. $ (list price)** | **${formatUsd(estimatedUsd)}** |`,
    `| Included-minute burn | ${estimatedMinutes} |`,
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
    lines.push('### Jobs', '', ...renderJobTable(rows), renderTotalRow(estimate), '');
  }

  lines.push(
    '### How these columns are calculated',
    '',
    '1. **Wall time** is observed `completed_at − started_at` (jobs still running use now).',
    '2. **Rounded minutes** follow GitHub billing: each started job rounds **up to the next whole minute**.',
    '3. **Runner SKU** is inferred from job labels / runner name so it can be matched to the usage-report SKU.',
    '4. **Est. $ (list)** = rounded minutes × the documented per-minute rate for that SKU.',
    '5. **Included-minute burn** is plan-minute consumption for standard hosted runners only. Larger runners cannot use included minutes.',
    '',
    'Jobs that never started contribute **0**. Public repositories and typical self-hosted runners are often not billed the same way. Custom images and storage are out of scope.',
    '',
    ...renderRatesFootnote(rows),
  );

  if (estimate.unknownPriceCount > 0) {
    lines.push(
      `**Note:** ${estimate.unknownPriceCount} started job${estimate.unknownPriceCount === 1 ? '' : 's'} used a SKU without a documented list price; those rows show $ as —.`,
      '',
    );
  }
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
    `Org-level reports: **[${PRODUCT_SITE.replace(/^https:\/\//, '')}](${PRODUCT_SITE})**.`,
    '',
  );
  return lines.join('\n');
}

/**
 * Compact, screenshot-forwardable PR comment. Same numbers as the Job Summary.
 * @param {object} input
 * @param {ReturnType<typeof estimateRun>} input.estimate
 * @param {object} input.meta
 */
function renderComment({ estimate, meta }) {
  const runLink = meta.runUrl
    ? `[#${meta.runNumber || meta.runId}](${meta.runUrl})`
    : `#${meta.runNumber || meta.runId || '?'}`;
  const lines = [
    COMMENT_MARKER,
    '## Actionscope',
    '',
    `**Est. ${formatUsd(estimate.estimatedUsd)}** list · **${estimate.roundedMinutes}** rounded min · **${estimate.estimatedMinutes}** included min · ${formatDuration(estimate.wallSeconds * 1000)} wall`,
    '',
    `${meta.workflow || 'This run'} · ${runLink}`,
    '',
  ];

  if (estimate.rows.length === 0) {
    lines.push('_No jobs were returned for this run._', '');
  } else {
    lines.push(
      ...renderJobTable(estimate.rows, { compact: true }),
      renderTotalRow(estimate, { compact: true }),
      '',
    );
  }

  lines.push(
    `Estimates at [GitHub list price](${RATES_SOURCE}). **Not an invoice.**`,
    '',
    ...renderRatesFootnote(estimate.rows),
  );

  if (estimate.inProgressCount > 0) {
    lines.push('_Includes a partial duration for jobs still running._', '');
  }
  if (meta.apiWarning) {
    lines.push(`_Note: ${meta.apiWarning}_`, '');
  }

  lines.push(`[28to3.me](${PRODUCT_SITE})`, '');
  return lines.join('\n');
}

function parseBool(value) {
  return /^(true|1|yes|on)$/i.test(String(value == null ? '' : value).trim());
}

module.exports = {
  LIST_PRICES,
  RATES_SOURCE,
  RATES_AS_OF,
  PRODUCT_SITE,
  COMMENT_MARKER,
  inferOs,
  inferSku,
  rateForSku,
  includedWeightForSku,
  multiplierForOs,
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
};
