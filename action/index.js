'use strict';

const fs = require('fs');
const { estimateRun, renderSummary } = require('./estimate');

function input(name, fallback = '') {
  const key = `INPUT_${name.replace(/ /g, '_').toUpperCase()}`;
  const value = process.env[key];
  return value !== undefined && value !== '' ? value : fallback;
}

function writeOutput(name, value) {
  const dest = process.env.GITHUB_OUTPUT;
  if (!dest) return;
  fs.appendFileSync(dest, `${name}=${value}\n`);
}

function writeSummary(markdown) {
  const dest = process.env.GITHUB_STEP_SUMMARY;
  if (dest) {
    fs.appendFileSync(dest, markdown);
  }
  process.stdout.write(markdown);
  if (!markdown.endsWith('\n')) process.stdout.write('\n');
}

async function fetchJobs({ apiUrl, token, owner, repo, runId }) {
  const url = `${apiUrl}/repos/${owner}/${repo}/actions/runs/${runId}/jobs?per_page=100`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'actionscope',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`GitHub API ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  return data.jobs || [];
}

function fallbackJob() {
  return {
    name: process.env.GITHUB_JOB || 'current job',
    status: 'in_progress',
    started_at: null,
    completed_at: null,
    labels: [process.env.RUNNER_OS || 'Linux'],
    runner_name: process.env.RUNNER_NAME || '',
  };
}

async function main() {
  const token = input('github-token', process.env.GITHUB_TOKEN || '');
  const repository = process.env.GITHUB_REPOSITORY || '';
  const [owner, repo] = repository.split('/');
  const runId = process.env.GITHUB_RUN_ID;
  const apiUrl = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
  const serverUrl = (process.env.GITHUB_SERVER_URL || 'https://github.com').replace(/\/$/, '');
  const fallbackOs = (process.env.RUNNER_OS || 'Linux').toLowerCase();

  const meta = {
    workflow: process.env.GITHUB_WORKFLOW || '',
    runId,
    runNumber: process.env.GITHUB_RUN_NUMBER,
    runUrl: owner && repo && runId ? `${serverUrl}/${owner}/${repo}/actions/runs/${runId}` : '',
  };

  let jobs = [];
  if (!token) {
    meta.apiWarning = 'No token available; falling back to the current job only (duration unknown).';
    jobs = [fallbackJob()];
  } else if (!owner || !repo || !runId) {
    meta.apiWarning = 'Missing GITHUB_REPOSITORY or GITHUB_RUN_ID; falling back to the current job only.';
    jobs = [fallbackJob()];
  } else {
    try {
      jobs = await fetchJobs({ apiUrl, token, owner, repo, runId });
      if (jobs.length === 0) {
        meta.apiWarning = 'The Jobs API returned no jobs yet; falling back to the current job only.';
        jobs = [fallbackJob()];
      }
    } catch (err) {
      meta.apiWarning = `Could not read jobs from the API (${err.message}). Falling back to the current job only.`;
      jobs = [fallbackJob()];
    }
  }

  const estimate = estimateRun({ jobs, fallbackOs });
  const markdown = renderSummary({ estimate, meta });

  writeSummary(markdown);
  writeOutput('estimated-minutes', String(estimate.estimatedMinutes));
  writeOutput('job-count', String(estimate.jobCount));
  writeOutput('wall-seconds', String(estimate.wallSeconds));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
