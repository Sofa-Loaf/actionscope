'use strict';

const fs = require('fs');
const { estimateRun, renderSummary } = require('./estimate');

function input(name, fallback = '', env = process.env) {
  const upper = name.toUpperCase();
  const keys = [
    `INPUT_${upper.replace(/[-\s]/g, '_')}`,
    `INPUT_${upper.replace(/ /g, '_')}`,
  ];
  for (const key of keys) {
    const value = env[key];
    if (value !== undefined && value !== '') return value;
  }
  return fallback;
}

function writeOutput(name, value, env = process.env) {
  const dest = env.GITHUB_OUTPUT;
  if (!dest) return;
  fs.appendFileSync(dest, `${name}=${value}\n`);
}

function writeSummary(markdown, env = process.env) {
  const dest = env.GITHUB_STEP_SUMMARY;
  if (dest) {
    fs.appendFileSync(dest, markdown);
  }
  process.stdout.write(markdown);
  if (!markdown.endsWith('\n')) process.stdout.write('\n');
}

async function fetchJobs({ apiUrl, token, owner, repo, runId, fetchImpl = globalThis.fetch }) {
  const url = `${apiUrl}/repos/${owner}/${repo}/actions/runs/${runId}/jobs?per_page=100`;
  const res = await fetchImpl(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'actionscope',
    },
  });

  if (!res.ok) {
    const body = typeof res.text === 'function' ? await res.text() : '';
    const err = new Error(`GitHub API ${res.status} ${res.statusText}: ${String(body).slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  return data.jobs || [];
}

function fallbackJob(env = process.env) {
  return {
    name: env.GITHUB_JOB || 'current job',
    status: 'in_progress',
    started_at: null,
    completed_at: null,
    labels: [env.RUNNER_OS || 'Linux'],
    runner_name: env.RUNNER_NAME || '',
  };
}

async function main({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const token = input('github-token', env.GITHUB_TOKEN || '', env);
  const repository = env.GITHUB_REPOSITORY || '';
  const [owner, repo] = repository.split('/');
  const runId = env.GITHUB_RUN_ID;
  const apiUrl = (env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
  const serverUrl = (env.GITHUB_SERVER_URL || 'https://github.com').replace(/\/$/, '');
  const fallbackOs = (env.RUNNER_OS || 'Linux').toLowerCase();

  const meta = {
    workflow: env.GITHUB_WORKFLOW || '',
    runId,
    runNumber: env.GITHUB_RUN_NUMBER,
    runUrl: owner && repo && runId ? `${serverUrl}/${owner}/${repo}/actions/runs/${runId}` : '',
  };

  let jobs = [];
  if (!token) {
    meta.apiWarning = 'No token available; falling back to the current job only (duration unknown).';
    jobs = [fallbackJob(env)];
  } else if (!owner || !repo || !runId) {
    meta.apiWarning = 'Missing GITHUB_REPOSITORY or GITHUB_RUN_ID; falling back to the current job only.';
    jobs = [fallbackJob(env)];
  } else {
    try {
      jobs = await fetchJobs({ apiUrl, token, owner, repo, runId, fetchImpl });
      if (jobs.length === 0) {
        meta.apiWarning = 'The Jobs API returned no jobs yet; falling back to the current job only.';
        jobs = [fallbackJob(env)];
      }
    } catch (err) {
      meta.apiWarning = `Could not read jobs from the API (${err.message}). Falling back to the current job only.`;
      jobs = [fallbackJob(env)];
    }
  }

  const estimate = estimateRun({ jobs, fallbackOs });
  const markdown = renderSummary({ estimate, meta });

  writeSummary(markdown, env);
  writeOutput('estimated-minutes', String(estimate.estimatedMinutes), env);
  writeOutput('job-count', String(estimate.jobCount), env);
  writeOutput('wall-seconds', String(estimate.wallSeconds), env);

  return { estimate, markdown, meta, jobs };
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  main,
  fetchJobs,
  fallbackJob,
};
