import { run } from './cli.js';

// read piped input, or prompt without echo when stdin is a terminal
async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return promptHidden('Paste the token (bhl_…): ');
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function promptHidden(question: string): Promise<string> {
  const stdin = process.stdin;
  process.stderr.write(question);
  stdin.setRawMode(true);
  stdin.setEncoding('utf8');
  stdin.resume();
  let value = '';
  return new Promise((resolve) => {
    const finish = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stderr.write('\n');
      resolve(value);
    };
    const onData = (text: string) => {
      for (const char of text) {
        if (char === '\r' || char === '\n' || char === '\u0004') return finish();
        if (char === '\u0003') {
          value = '';
          return finish();
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ') value += char;
      }
    };
    stdin.on('data', onData);
  });
}

process.exitCode = await run(process.argv.slice(2), {
  env: process.env,
  stdout: (text) => process.stdout.write(`${text}\n`),
  stderr: (text) => process.stderr.write(`${text}\n`),
  readStdin,
});
