'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { main, fallbackJob, getPullRequestNumber } = require('./index');

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`ok  ${name}`);
    });
}

function jsonResponse(status, body, statusText = 'OK') {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

function withTempFiles() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'actionscope-'));
  const output = path.join(dir, 'github_output');
  const summary = path.join(dir, 'github_step_summary');
  fs.writeFileSync(output, '');
  fs.writeFileSync(summary, '');
  return { dir, output, summary };
}

function writeEvent(dir, payload) {
  const eventPath = path.join(dir, 'event.json');
  fs.writeFileSync(eventPath, JSON.stringify(payload));
  return eventPath;
}

async function runAll() {
  await test('entrypoint dry-run without GitHub env still prints a site-only summary', () => {
    const result = spawnSync(process.execPath, ['index.js'], {
      cwd: __dirname,
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        GITHUB_WORKFLOW: 'local',
        GITHUB_JOB: 'dev',
      },
    });

    assert.strictEqual(result.status, 0, result.stderr);
    assert.match(result.stdout, /## Actionscope/);
    assert.match(result.stdout, /Org-level reports/);
    assert.match(result.stdout, /https:\/\/28to3\.me/);
    assert.match(result.stdout, /Est\. \$ \(list price\)/);
    assert.match(result.stdout, /Included-minute burn/);
    assert.doesNotMatch(result.stdout, /Invite an org pilot/);
    assert.doesNotMatch(result.stdout, /buy\.stripe\.com/i);
    assert.doesNotMatch(result.stdout, /stripe/i);
    assert.doesNotMatch(result.stdout, /\$49/);
    assert.doesNotMatch(result.stdout, /\b1×\b/);
  });

  await test('missing jobs from the API fall back to the current job only', async () => {
    const { output, summary } = withTempFiles();
    const calls = [];
    const result = await main({
      env: {
        INPUT_GITHUB_TOKEN: 'test-token',
        GITHUB_TOKEN: 'test-token',
        GITHUB_REPOSITORY: 'acme/app',
        GITHUB_RUN_ID: '77',
        GITHUB_RUN_NUMBER: '3',
        GITHUB_WORKFLOW: 'Demo',
        GITHUB_JOB: 'estimate',
        GITHUB_OUTPUT: output,
        GITHUB_STEP_SUMMARY: summary,
        RUNNER_OS: 'Linux',
      },
      fetchImpl: async (url) => {
        calls.push(url);
        return jsonResponse(200, { jobs: [] });
      },
    });

    assert.strictEqual(calls.length, 1);
    assert.match(calls[0], /\/repos\/acme\/app\/actions\/runs\/77\/jobs/);
    assert.strictEqual(result.jobs.length, 1);
    assert.strictEqual(result.jobs[0].name, 'estimate');
    assert.match(result.meta.apiWarning, /no jobs yet/i);
    assert.match(result.markdown, /falling back to the current job only/);
    assert.match(result.markdown, /https:\/\/28to3\.me/);
    assert.doesNotMatch(result.markdown, /buy\.stripe\.com/i);
    assert.strictEqual(result.comment.skipped, true);
    assert.strictEqual(result.comment.reason, 'disabled');

    const outputs = fs.readFileSync(output, 'utf8');
    assert.match(outputs, /estimated-minutes=0/);
    assert.match(outputs, /rounded-minutes=0/);
    assert.match(outputs, /estimated-usd=0\.0000/);
    assert.match(outputs, /job-count=1/);
    assert.match(fs.readFileSync(summary, 'utf8'), /## Actionscope/);
  });

  await test('API error and missing run context also fall back instead of crashing', async () => {
    const apiFail = await main({
      env: {
        INPUT_GITHUB_TOKEN: 'test-token',
        GITHUB_TOKEN: 'test-token',
        GITHUB_REPOSITORY: 'acme/app',
        GITHUB_RUN_ID: '9',
        GITHUB_WORKFLOW: 'Demo',
        GITHUB_JOB: 'estimate',
      },
      fetchImpl: async () => jsonResponse(403, { message: 'Forbidden' }, 'Forbidden'),
    });
    assert.match(apiFail.meta.apiWarning, /GitHub API 403/);
    assert.strictEqual(apiFail.jobs[0].name, 'estimate');

    const missingCtx = await main({
      env: {
        INPUT_GITHUB_TOKEN: 'test-token',
        GITHUB_JOB: 'local-dev',
        RUNNER_OS: 'macOS',
      },
    });
    assert.match(missingCtx.meta.apiWarning, /Missing GITHUB_REPOSITORY or GITHUB_RUN_ID/);
    assert.strictEqual(missingCtx.jobs[0].name, 'local-dev');
    assert.strictEqual(missingCtx.estimate.rows[0].os, 'macos');
    assert.strictEqual(missingCtx.estimate.rows[0].sku, 'actions_macos');
    assert.strictEqual(missingCtx.estimate.estimatedMinutes, 0);
    assert.strictEqual(missingCtx.estimate.estimatedUsd, 0);
  });

  await test('successful job list estimates SKU dollars and included minutes without quota headlines', async () => {
    const { output } = withTempFiles();
    const result = await main({
      env: {
        GITHUB_TOKEN: 'test-token',
        GITHUB_REPOSITORY: 'acme/app',
        GITHUB_RUN_ID: '12',
        GITHUB_WORKFLOW: 'CI',
        RUNNER_OS: 'Linux',
        GITHUB_OUTPUT: output,
      },
      fetchImpl: async () =>
        jsonResponse(200, {
          jobs: [
            {
              name: 'lint',
              conclusion: 'success',
              started_at: '2026-01-01T00:00:00.000Z',
              completed_at: '2026-01-01T00:00:12.000Z',
              labels: ['ubuntu-latest'],
            },
            {
              name: 'ios',
              conclusion: 'success',
              started_at: '2026-01-01T00:00:00.000Z',
              completed_at: '2026-01-01T00:00:12.000Z',
              labels: ['macos-14'],
            },
            {
              name: 'never-started',
              status: 'queued',
              started_at: null,
              labels: ['windows-latest'],
            },
          ],
        }),
    });

    assert.strictEqual(result.estimate.jobCount, 3);
    assert.strictEqual(result.estimate.roundedMinutes, 2);
    assert.strictEqual(result.estimate.estimatedMinutes, 11);
    assert.strictEqual(result.estimate.estimatedUsd, 0.068);
    assert.strictEqual(result.estimate.rows[1].sku, 'actions_macos');
    assert.match(result.markdown, /`actions_macos`/);
    assert.match(result.markdown, /\$0\.0680/);
    assert.match(result.markdown, /Included-minute burn \| 11/);
    assert.match(result.markdown, /\[28to3\.me\]\(https:\/\/28to3\.me\)/);
    assert.doesNotMatch(result.markdown, /buy\.stripe\.com|stripe|\$49/i);
    assert.doesNotMatch(result.markdown, /Multiplier|\b1×\b|\b10×\b/);
    assert.match(result.commentMarkdown, /\*\*Est\. \$0\.0680\*\*/);
    assert.match(result.commentMarkdown, /\*\*11\*\* included min/);
    assert.match(fs.readFileSync(output, 'utf8'), /estimated-usd=0\.0680/);
    assert.match(fs.readFileSync(output, 'utf8'), /rounded-minutes=2/);
  });

  await test('comment-on-pr is skipped when context is not a pull request', async () => {
    const result = await main({
      env: {
        INPUT_GITHUB_TOKEN: 'test-token',
        INPUT_COMMENT_ON_PR: 'true',
        GITHUB_REPOSITORY: 'acme/app',
        GITHUB_RUN_ID: '12',
        GITHUB_WORKFLOW: 'CI',
        GITHUB_REF: 'refs/heads/main',
      },
      fetchImpl: async () => jsonResponse(200, { jobs: [linuxish()] }),
    });

    assert.strictEqual(result.comment.skipped, true);
    assert.strictEqual(result.comment.reason, 'not-a-pull-request');
  });

  await test('comment-on-pr posts a new comment and later updates the existing one', async () => {
    const { dir } = withTempFiles();
    const eventPath = writeEvent(dir, { pull_request: { number: 42 } });
    const calls = [];
    let existing = [];

    const fetchImpl = async (url, options = {}) => {
      calls.push({ url, method: options.method || 'GET', body: options.body });
      if (url.includes('/actions/runs/12/jobs')) {
        return jsonResponse(200, { jobs: [linuxish()] });
      }
      if (url.includes('/issues/42/comments') && (options.method || 'GET') === 'GET') {
        return jsonResponse(200, existing);
      }
      if (url.endsWith('/issues/42/comments') && options.method === 'POST') {
        existing = [{ id: 99, body: JSON.parse(options.body).body }];
        return jsonResponse(201, { id: 99 });
      }
      if (url.endsWith('/issues/comments/99') && options.method === 'PATCH') {
        existing = [{ id: 99, body: JSON.parse(options.body).body }];
        return jsonResponse(200, { id: 99 });
      }
      throw new Error(`unexpected fetch ${options.method || 'GET'} ${url}`);
    };

    const created = await main({
      env: {
        INPUT_GITHUB_TOKEN: 'test-token',
        INPUT_COMMENT_ON_PR: 'true',
        GITHUB_REPOSITORY: 'acme/app',
        GITHUB_RUN_ID: '12',
        GITHUB_WORKFLOW: 'CI',
        GITHUB_EVENT_PATH: eventPath,
      },
      fetchImpl,
    });

    assert.strictEqual(created.comment.skipped, false);
    assert.strictEqual(created.comment.action, 'created');
    assert.strictEqual(created.comment.issueNumber, 42);
    assert.match(created.commentMarkdown, /<!-- actionscope -->/);
    assert.match(created.commentMarkdown, /\$0\.0060/);
    assert.strictEqual(created.markdown.includes('$0.0060'), true);

    const updated = await main({
      env: {
        INPUT_GITHUB_TOKEN: 'test-token',
        INPUT_COMMENT_ON_PR: 'true',
        GITHUB_REPOSITORY: 'acme/app',
        GITHUB_RUN_ID: '12',
        GITHUB_WORKFLOW: 'CI',
        GITHUB_EVENT_PATH: eventPath,
      },
      fetchImpl,
    });

    assert.strictEqual(updated.comment.action, 'updated');
    assert.strictEqual(updated.comment.id, 99);
    assert.ok(calls.some((call) => call.method === 'POST'));
    assert.ok(calls.some((call) => call.method === 'PATCH'));
  });

  await test('comment-on-pr API failures do not fail the Action', async () => {
    const { dir } = withTempFiles();
    const eventPath = writeEvent(dir, { pull_request: { number: 7 } });
    const result = await main({
      env: {
        INPUT_GITHUB_TOKEN: 'test-token',
        INPUT_COMMENT_ON_PR: 'true',
        GITHUB_REPOSITORY: 'acme/app',
        GITHUB_RUN_ID: '12',
        GITHUB_WORKFLOW: 'CI',
        GITHUB_EVENT_PATH: eventPath,
      },
      fetchImpl: async (url) => {
        if (url.includes('/jobs')) return jsonResponse(200, { jobs: [linuxish()] });
        return jsonResponse(403, { message: 'Resource not accessible by integration' }, 'Forbidden');
      },
    });

    assert.strictEqual(result.comment.skipped, true);
    assert.strictEqual(result.comment.reason, 'api-error');
    assert.match(result.meta.commentWarning, /Could not comment on PR #7/);
    assert.match(result.markdown, /## Actionscope/);
  });

  await test('getPullRequestNumber reads event payload and pull ref', () => {
    const { dir } = withTempFiles();
    const eventPath = writeEvent(dir, { pull_request: { number: 15 } });
    assert.strictEqual(getPullRequestNumber({ GITHUB_EVENT_PATH: eventPath }), 15);
    assert.strictEqual(getPullRequestNumber({ GITHUB_REF: 'refs/pull/88/merge' }), 88);
    assert.strictEqual(getPullRequestNumber({ GITHUB_REF: 'refs/heads/main' }), null);
  });

  await test('fallback job uses the current runner OS label', () => {
    const job = fallbackJob({ GITHUB_JOB: 'estimate', RUNNER_OS: 'macOS', RUNNER_NAME: 'Mac-1' });
    assert.strictEqual(job.name, 'estimate');
    assert.deepStrictEqual(job.labels, ['macOS']);
    assert.strictEqual(job.started_at, null);
  });

  console.log('\nAll integration tests passed.');
}

function linuxish() {
  return {
    name: 'lint',
    conclusion: 'success',
    started_at: '2026-01-01T00:00:00.000Z',
    completed_at: '2026-01-01T00:00:12.000Z',
    labels: ['ubuntu-latest'],
  };
}

runAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
