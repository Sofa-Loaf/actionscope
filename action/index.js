'use strict';

const fs = require('fs');
const { estimateRun, renderSummary, renderComment, parseBool, COMMENT_MARKER } = require('./estimate');

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

function githubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'actionscope',
  };
}

function readEventPayload(env = process.env) {
  const eventPath = env.GITHUB_EVENT_PATH;
  if (!eventPath) return null;
  try {
    return JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  } catch {
    return null;
  }
}

function getPullRequestNumber(env = process.env) {
  const event = readEventPayload(env);
  if (event?.pull_request?.number) return Number(event.pull_request.number);
  if (event?.issue?.pull_request && event.issue.number) return Number(event.issue.number);
  const ref = env.GITHUB_REF || '';
  const fromRef = ref.match(/^refs\/pull\/(\d+)\//);
  if (fromRef) return Number(fromRef[1]);
  return null;
}

async function findExistingComment({ apiUrl, token, owner, repo, issueNumber, fetchImpl }) {
  const url = `${apiUrl}/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`;
  const res = await fetchImpl(url, { headers: githubHeaders(token) });
  if (!res.ok) {
    const body = typeof res.text === 'function' ? await res.text() : '';
    const err = new Error(`GitHub API ${res.status} ${res.statusText}: ${String(body).slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  const comments = await res.json();
  if (!Array.isArray(comments)) return null;
  return comments.find((comment) => typeof comment.body === 'string' && comment.body.includes(COMMENT_MARKER)) || null;
}

async function upsertPullRequestComment({
  apiUrl,
  token,
  owner,
  repo,
  issueNumber,
  body,
  fetchImpl = globalThis.fetch,
}) {
  const existing = await findExistingComment({ apiUrl, token, owner, repo, issueNumber, fetchImpl });
  if (existing?.id) {
    const url = `${apiUrl}/repos/${owner}/${repo}/issues/comments/${existing.id}`;
    const res = await fetchImpl(url, {
      method: 'PATCH',
      headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    if (!res.ok) {
      const text = typeof res.text === 'function' ? await res.text() : '';
      const err = new Error(`GitHub API ${res.status} ${res.statusText}: ${String(text).slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    return { action: 'updated', id: existing.id };
  }

  const url = `${apiUrl}/repos/${owner}/${repo}/issues/${issueNumber}/comments`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) {
    const text = typeof res.text === 'function' ? await res.text() : '';
    const err = new Error(`GitHub API ${res.status} ${res.statusText}: ${String(text).slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  const created = await res.json();
  return { action: 'created', id: created.id };
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

async function maybeCommentOnPullRequest({
  env,
  token,
  owner,
  repo,
  apiUrl,
  markdown,
  fetchImpl,
  meta,
}) {
  if (!parseBool(input('comment-on-pr', 'false', env))) {
    return { skipped: true, reason: 'disabled' };
  }
  const issueNumber = getPullRequestNumber(env);
  if (!issueNumber) {
    return { skipped: true, reason: 'not-a-pull-request' };
  }
  if (!token || !owner || !repo) {
    meta.commentWarning = 'comment-on-pr is enabled but token or repository context is missing; skipped the PR comment.';
    return { skipped: true, reason: 'missing-context' };
  }
  try {
    const result = await upsertPullRequestComment({
      apiUrl,
      token,
      owner,
      repo,
      issueNumber,
      body: markdown,
      fetchImpl,
    });
    return { skipped: false, issueNumber, ...result };
  } catch (err) {
    meta.commentWarning = `Could not comment on PR #${issueNumber} (${err.message}).`;
    return { skipped: true, reason: 'api-error', error: err };
  }
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
  const commentMarkdown = renderComment({ estimate, meta });

  writeSummary(markdown, env);
  writeOutput('estimated-minutes', String(estimate.estimatedMinutes), env);
  writeOutput('rounded-minutes', String(estimate.roundedMinutes), env);
  writeOutput('estimated-usd', estimate.estimatedUsd.toFixed(4), env);
  writeOutput('job-count', String(estimate.jobCount), env);
  writeOutput('wall-seconds', String(estimate.wallSeconds), env);

  const comment = await maybeCommentOnPullRequest({
    env,
    token,
    owner,
    repo,
    apiUrl,
    markdown: commentMarkdown,
    fetchImpl,
    meta,
  });
  if (meta.commentWarning) {
    process.stdout.write(`Note: ${meta.commentWarning}\n`);
  }

  return { estimate, markdown, commentMarkdown, meta, jobs, comment };
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
  getPullRequestNumber,
  upsertPullRequestComment,
};
