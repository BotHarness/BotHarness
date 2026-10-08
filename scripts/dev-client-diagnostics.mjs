import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function diagnosticVerdict(report, attempt) {
  const candidates = Array.isArray(report?.attempts) ? report.attempts : [];
  const selected = attempt
    ? candidates.find((value) => value.attempt === attempt)
    : candidates.at(-1);
  const state = selected?.state ?? 'unobserved';
  return {
    state,
    exitCode: state === 'shell-ready' ? 0 : state === 'failed' ? 1 : 2,
    attempt: selected?.attempt ?? null,
    browserVerification: 'Read real CUA console and DOM before accepting UI readiness',
    earlierFailures: candidates
      .filter((value) => value !== selected && value.state === 'failed')
      .map((value) => value.attempt),
  };
}

export async function readClientDiagnostics(launch, fetcher = fetch) {
  const login = new URL(launch.url);
  if (
    login.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(login.hostname) ||
    login.username ||
    login.password ||
    login.pathname !== '/' ||
    !login.searchParams.has('token')
  )
    throw new Error('invalid-local-launch');
  const response = await fetcher(login, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('local-login-refused');
  const result = await fetcher(new URL('/api/botharness/client-diagnostics', login), {
    headers: { cookie },
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
  });
  if (!result.ok) throw new Error('diagnostics-unavailable');
  const body = await result.text();
  if (body.length > 256000) throw new Error('diagnostics-too-large');
  const report = JSON.parse(body);
  if (report.version !== 1 || !Array.isArray(report.attempts))
    throw new Error('invalid-diagnostics');
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  const launchIndex = args.indexOf('--launch');
  const attemptIndex = args.indexOf('--attempt');
  if (launchIndex < 0 || !args[launchIndex + 1]) throw new Error('launch-required');
  const launch = JSON.parse(readFileSync(args[launchIndex + 1], 'utf8'));
  const report = await readClientDiagnostics(launch);
  const verdict = diagnosticVerdict(report, attemptIndex < 0 ? undefined : args[attemptIndex + 1]);
  console.log(JSON.stringify({ ...verdict, report }, null, 2));
  process.exitCode = verdict.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(() => {
    console.error(
      JSON.stringify({
        state: 'unavailable',
        reason: 'diagnostics-read-failed',
        action:
          'Check the private launch file, exact Host process and authenticated diagnostic route; read CUA console/DOM independently',
      }),
    );
    process.exitCode = 2;
  });
