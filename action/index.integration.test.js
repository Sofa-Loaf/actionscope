'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { main, fallbackJob } = require('./index');

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
    assert.match(result.stdout, /Invite an org pilot or learn more/);
    assert.match(result.stdout, /https:\/\/28to3\.me/);
    assert.doesNotMatch(result.stdout, /buy\.stripe\.com/i);
    assert.doesNotMatch(result.stdout, /stripe/i);
    assert.doesNotMatch(result.stdout, /\$49/);
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

    const outputs = fs.readFileSync(output, 'utf8');
    assert.match(outputs, /estimated-minutes=0/);
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
    assert.strictEqual(missingCtx.estimate.estimatedMinutes, 0);
  });

  await test('successful job list estimates macos and linux without changing multipliers', async () => {
    const result = await main({
      env: {
        GITHUB_TOKEN: 'test-token',
        GITHUB_REPOSITORY: 'acme/app',
        GITHUB_RUN_ID: '12',
        GITHUB_WORKFLOW: 'CI',
        RUNNER_OS: 'Linux',
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
    assert.strictEqual(result.estimate.estimatedMinutes, 11);
    assert.strictEqual(result.estimate.rows[1].multiplier, 10);
    assert.match(result.markdown, /Minutes by runner: 10 min on macos, 1 min on linux/);
    assert.match(result.markdown, /\[28to3\.me\]\(https:\/\/28to3\.me\)/);
    assert.doesNotMatch(result.markdown, /buy\.stripe\.com|stripe|\$49/i);
  });

  await test('fallback job uses the current runner OS label', () => {
    const job = fallbackJob({ GITHUB_JOB: 'estimate', RUNNER_OS: 'macOS', RUNNER_NAME: 'Mac-1' });
    assert.strictEqual(job.name, 'estimate');
    assert.deepStrictEqual(job.labels, ['macOS']);
    assert.strictEqual(job.started_at, null);
  });

  console.log('\nAll integration tests passed.');
}

runAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
