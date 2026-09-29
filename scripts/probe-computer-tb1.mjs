import { randomBytes } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

const VIEWER_PREFIX = '/botharness-computer/viewer';

function parseArgs(argv) {
  const options = { url: '', lifecycle: false, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = argv[index + 1];
    switch (flag) {
      case '--url':
        options.url = next ?? '';
        index += 1;
        break;
      case '--lifecycle':
        options.lifecycle = true;
        break;
      case '--json':
        options.json = true;
        break;
      default:
        throw new Error(`unknown option: ${flag}`);
    }
  }
  if (options.url === '') throw new Error('--url <token-url> is required');
  return options;
}

function splitBase(url) {
  const marker = '/?token=';
  const at = url.indexOf(marker);
  if (at < 0) throw new Error('--url must be the dev-instance token URL (…/?token=…)');
  return { base: url.slice(0, at), token: url.slice(at + marker.length) };
}

async function handshake(base, token) {
  await fetch(`${base}/?token=${token}`, { redirect: 'manual' });
  const login = await fetch(`${base}/?token=${token}`, { redirect: 'manual' });
  const setCookie = login.headers.get('set-cookie');
  if (setCookie === null) throw new Error('token handshake returned no session cookie');
  return setCookie.split(';')[0] ?? '';
}

async function getStatus(base, cookie) {
  const response = await fetch(`${base}/api/computer/status`, {
    signal: AbortSignal.timeout(15_000),
    headers: { cookie },
  });
  const text = await response.text();
  if (response.status === 404) {
    throw new Error(
      'computer routes not registered (HTTP 404): is @botharness/computer in dsh.profile.bundles?',
    );
  }
  if (response.status !== 200) throw new Error(`status route returned HTTP ${response.status}`);
  return JSON.parse(text);
}

async function postJson(base, cookie, path, body) {
  const response = await fetch(`${base}${path}`, {
    signal: AbortSignal.timeout(30_000),
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  return { status: response.status, body: parsed, text };
}

async function waitForState(base, cookie, want, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = '?';
  for (;;) {
    const status = await getStatus(base, cookie);
    last = status?.status?.state ?? '?';
    if (last === want) return status;
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for state=${want} (last=${last})`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
}

function tryUpgrade(url, cookie, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const target = new URL(url);
    if (target.protocol !== 'ws:' && target.protocol !== 'wss:') {
      throw new Error(`unsupported WebSocket protocol: ${target.protocol}`);
    }
    const secure = target.protocol === 'wss:';
    const requestForProtocol = secure ? httpsRequest : httpRequest;
    target.protocol = secure ? 'https:' : 'http:';
    const request = requestForProtocol(target, {
      headers: {
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-version': '13',
        'sec-websocket-key': randomBytes(16).toString('base64'),
        cookie,
      },
    });
    const finish = (ok, detail) => {
      if (done) return;
      done = true;
      request.destroy();
      resolve({ ok, detail });
    };
    request.setTimeout(timeoutMs, () => finish(false, 'timeout'));
    request.on('upgrade', (response, socket) => {
      socket.destroy();
      finish(response.statusCode === 101, `HTTP ${response.statusCode ?? '?'}`);
    });
    request.on('response', (response) => {
      response.resume();
      finish(false, `HTTP ${response.statusCode ?? '?'}`);
    });
    request.on('error', (error) => finish(false, error.message));
    request.end();
  });
}

async function waitForViewerUpgrade(base, cookie, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const wsBase = base.replace(/^http/, 'ws');
  let last = { ok: false, detail: 'not attempted' };
  do {
    for (const socketPath of [
      `${VIEWER_PREFIX}/api/websockets`,
      `${VIEWER_PREFIX}/websockets`,
      `${VIEWER_PREFIX}/websocket`,
    ]) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) return last;
      const attempt = await tryUpgrade(
        `${wsBase}${socketPath}`,
        cookie,
        Math.min(15_000, remaining),
      );
      last = { ...attempt, detail: `${socketPath}: ${attempt.detail}` };
      if (attempt.ok) return last;
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  } while (Date.now() < deadline);
  return last;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { base, token } = splitBase(options.url);
  const checks = [];
  const check = (name, ok, detail = '') => {
    checks.push({ name, ok, detail });
    if (!options.json)
      console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail === '' ? '' : ` — ${detail}`}`);
  };

  const cookie = await handshake(base, token);

  const initial = await getStatus(base, cookie);
  check(
    'status-route',
    initial?.provider === 'docker' && typeof initial?.probe?.available === 'boolean',
    `provider=${initial?.provider ?? '?'} available=${initial?.probe?.available ?? '?'} state=${initial?.status?.state ?? '?'}`,
  );

  const anonymous = await fetch(`${base}${VIEWER_PREFIX}/`, {
    signal: AbortSignal.timeout(15_000),
    redirect: 'manual',
  });
  await anonymous.arrayBuffer();
  check('viewer-rejects-anonymous', anonymous.status === 401, `HTTP ${anonymous.status}`);

  const running = initial?.status?.state === 'running';
  if (!running) {
    const stopped = await fetch(`${base}${VIEWER_PREFIX}/`, {
      signal: AbortSignal.timeout(15_000),
      headers: { cookie },
    });
    const stoppedText = await stopped.text();
    check(
      'viewer-503-when-stopped',
      stopped.status === 503 && stoppedText.includes('not running'),
      `HTTP ${stopped.status}`,
    );
  } else {
    check('viewer-503-when-stopped', true, 'skipped: computer already running');
  }

  const startRefused = await postJson(base, cookie, '/api/computer/start', {});
  check(
    'start-requires-authorize',
    startRefused.status === 400 && startRefused.body?.code === 'authorize-required',
    `HTTP ${startRefused.status}`,
  );
  const stopRefused = await postJson(base, cookie, '/api/computer/stop', {});
  check(
    'stop-requires-authorize',
    stopRefused.status === 400 && stopRefused.body?.code === 'authorize-required',
    `HTTP ${stopRefused.status}`,
  );

  if (options.lifecycle) {
    if (initial?.probe?.available !== true) {
      throw new Error(
        `lifecycle requested but no container runtime: ${initial?.probe?.detail ?? 'unknown'}`,
      );
    }

    const started = await postJson(base, cookie, '/api/computer/start', { authorize: true });
    check(
      'lifecycle-start-accepted',
      started.status === 200 && started.body?.ok === true,
      `HTTP ${started.status}`,
    );
    await waitForState(base, cookie, 'running', 300_000);
    check('lifecycle-reaches-running', true, '');

    const live = await fetch(`${base}${VIEWER_PREFIX}/`, {
      signal: AbortSignal.timeout(30_000),
      headers: { cookie },
    });
    await live.arrayBuffer();
    const framed = live.headers.get('x-frame-options');
    const contentType = live.headers.get('content-type') ?? '';
    check(
      'lifecycle-viewer-live',
      live.status === 200 && framed === null && contentType.includes('text/html'),
      `HTTP ${live.status} content-type=${contentType || '?'}`,
    );

    const upgrade = await waitForViewerUpgrade(base, cookie, 90_000);
    check('lifecycle-viewer-upgrade', upgrade.ok, upgrade.detail);

    const stopped = await postJson(base, cookie, '/api/computer/stop', { authorize: true });
    check(
      'lifecycle-stop-accepted',
      stopped.status === 200 && stopped.body?.ok === true,
      `HTTP ${stopped.status}`,
    );
    await waitForState(base, cookie, 'stopped', 120_000);
    check('lifecycle-reaches-stopped', true, '');
  }

  const failed = checks.filter((entry) => !entry.ok);
  if (options.json) console.log(JSON.stringify({ ok: failed.length === 0, checks }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`probe failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
