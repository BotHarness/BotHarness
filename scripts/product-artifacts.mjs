import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import semver from 'semver';
import { providerRuntimeDigest } from './dev-im-provider.mjs';
import { pnpmCommand } from './dev-package-manager.mjs';

export const productImProvider = Object.freeze({
  name: '@botharness/im-provider',
  version: '4.32.0-botharness.3',
  sourceManifestSha256: '501e62d558eceb2b42ad9cd03fc0910e09581fd6531ec68e074fe5a16225ed1e',
  sourceLockSha256: 'c7f16baaa5bb1ab3bbb607b59a10327f0af010c61e1ea1ab4a72d7d08af9ffe9',
  upstream: Object.freeze({
    package: '@xmanrui/dsh-im',
    packageVersion: '4.32.0',
    source: 'a0300e97d7996a5de3a6da2f5b9f50224eb12bd9',
    dsh: '0.2.0-rc.1',
    runtimeFiles: 393,
    runtimeSha256: 'caeb3c0bbed424012730d2a658d5f6ba86e6a892c007d8bbb7dd6def42d38544',
  }),
});

export function productManifest(manifest, version) {
  if (semver.valid(version) !== version) throw new Error('An explicit product SemVer is required');
  const { private: _private, scripts: _scripts, devDependencies: _dev, ...result } = manifest;
  return {
    ...result,
    version,
    license: 'MIT',
    repository: {
      type: 'git',
      url: 'git+https://github.com/BotHarness/BotHarness.git',
      directory: 'packages/deepseekbot',
    },
    description:
      'DeepSeekBot: the open-source Grok Bot alternative for DeepSeek Harness. PersonaBots with their own identity, Git Memory, Groups and Lark, Slack, Discord and WeChat identities.',
    homepage: 'https://deepseekbot.botharness.ai/en/',
    bugs: { url: 'https://github.com/BotHarness/BotHarness/issues' },
    keywords: [
      'deepseekbot',
      'deepseek',
      'deepseek-harness',
      'dsh',
      'dsh-plugin',
      'ai-agent',
      'persona',
      'memory',
      'grok-bot',
      'lark',
      'feishu',
      'slack',
      'discord',
      'wechat',
    ],
    publishConfig: { access: 'public' },
    dependencies: {
      ...manifest.dependencies,
      '@botharness/core': version,
      '@botharness/ui': version,
      [productImProvider.name]: productImProvider.version,
    },
    dsh: { ...manifest.dsh, bundle: { patch: './cordis.im.patch.yml' } },
    files: ['cordis.im.patch.yml', 'README.md', 'LICENSE'],
  };
}

export function verifyProviderSource(directory) {
  const bytes = readFileSync(join(directory, 'package.json'));
  const manifest = JSON.parse(bytes.toString('utf8'));
  const digest = providerRuntimeDigest(directory);
  if (
    manifest.name !== productImProvider.upstream.package ||
    manifest.version !== productImProvider.upstream.packageVersion ||
    createHash('sha256').update(bytes).digest('hex') !== productImProvider.sourceManifestSha256 ||
    createHash('sha256')
      .update(readFileSync(join(directory, 'package-lock.json')))
      .digest('hex') !== productImProvider.sourceLockSha256 ||
    digest.runtimeFiles !== productImProvider.upstream.runtimeFiles ||
    digest.runtimeSha256 !== productImProvider.upstream.runtimeSha256
  )
    throw new Error('Provider input differs from the qualified immutable artifact');
  return digest;
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr?.slice(-2500)}`);
  return result.stdout;
}

function copyAvailable(source, target, paths) {
  for (const path of paths) {
    if (!existsSync(join(source, path))) throw new Error(`Missing artifact input: ${path}`);
    cpSync(join(source, path), join(target, path), { recursive: true });
  }
}

export function stageProvider(source, target, repoRoot) {
  const input = verifyProviderSource(source);
  mkdirSync(target, { recursive: true });
  copyAvailable(source, target, [
    'assets',
    'lib',
    'locale',
    'plugin-src',
    'src',
    'LICENSE',
    'README.md',
    'README.en.md',
    'THIRD_PARTY_NOTICES.md',
  ]);
  const original = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
  const {
    scripts: _scripts,
    devDependencies: _dev,
    directories: _directories,
    bin: _bin,
    ...manifest
  } = original;
  writeJson(join(target, 'package.json'), {
    ...manifest,
    name: productImProvider.name,
    version: productImProvider.version,
    description: 'BotHarness-qualified IM Provider, maintained from dsh-im',
    repository: { type: 'git', url: 'git+https://github.com/DoodleBears/dsh-im.git' },
    bugs: { url: 'https://github.com/BotHarness/BotHarness/issues' },
    homepage: 'https://botharness.ai/docs/lark-connection/',
    files: [
      'assets',
      'lib',
      'locale',
      'plugin-src',
      'src',
      'cordis.patch.yml',
      'LICENSE',
      'THIRD_PARTY_NOTICES.md',
      'README.md',
      'README.en.md',
      'PROVENANCE.json',
    ],
    engines: { node: '>=22', dsh: productImProvider.upstream.dsh },
    dsh: {
      ...manifest.dsh,
      compatibility: { dsh: productImProvider.upstream.dsh, profiles: ['web'] },
    },
    botharness: { managedByProduct: true, upstreamSource: productImProvider.upstream.source },
  });
  writeFileSync(
    join(target, 'cordis.patch.yml'),
    `- insert:\n    - id: xmanrui-dsh-im\n      name: '${productImProvider.name}'\n`,
  );
  for (const filename of ['README.md', 'README.en.md']) {
    const path = join(target, filename);
    writeFileSync(
      path,
      `# BotHarness-managed IM Provider\n\nThis independently versioned Provider is maintained from dsh-im and installed and updated through the BotHarness product. Configure accounts through native Settings → IM bots. Do not follow the upstream standalone installation commands below for this scoped artifact; its standalone installer is not shipped. The following upstream documentation is retained for attribution and platform reference.\n\n---\n\n${readFileSync(path, 'utf8')}`,
    );
  }
  cpSync(
    join(repoRoot, 'scripts/product-provider/update-rpc.mjs'),
    join(target, 'plugin-src/host/update-rpc.mjs'),
  );
  cpSync(
    join(repoRoot, 'scripts/product-provider/update-policy.mjs'),
    join(target, 'plugin-src/host/update-policy.mjs'),
  );
  cpSync(
    join(repoRoot, 'scripts/product-provider/update-panel.js'),
    join(target, 'plugin-src/client/update-panel.js'),
  );
  const localePath = join(target, 'plugin-src/client/i18n.js');
  const locale = readFileSync(localePath, 'utf8');
  if (!locale.includes('const EN = Object.freeze({'))
    throw new Error('Provider locale seam changed');
  writeFileSync(
    localePath,
    locale.replace(
      'const EN = Object.freeze({',
      `const EN = Object.freeze({
  '随 BotHarness 更新': 'Updates with BotHarness',
  '此 IM 连接器随 BotHarness 更新，以保持兼容。': 'This IM Provider updates with BotHarness to retain compatibility.',`,
    ),
  );
  symlinkSync(join(source, 'node_modules'), join(target, 'node_modules'), 'dir');
  const env = { ...process.env, DSH_IM_CLIENT_ID: productImProvider.name };
  run(process.execPath, ['plugin-src/client/build.mjs'], { cwd: target, env });
  run(process.execPath, ['plugin-src/host/build.mjs'], { cwd: target, env });
  const output = providerRuntimeDigest(target);
  writeJson(join(target, 'PROVENANCE.json'), {
    name: productImProvider.name,
    version: productImProvider.version,
    source: productImProvider.upstream.source,
    sourceRepository: 'https://github.com/DoodleBears/dsh-im',
    upstreamRepository: 'https://github.com/xmanrui/dsh-im',
    dsh: productImProvider.upstream.dsh,
    qualifiedInput: input,
    compiledOutput: output,
    sourceManifestSha256: productImProvider.sourceManifestSha256,
    sourceLockSha256: productImProvider.sourceLockSha256,
    managedSources: Object.fromEntries(
      ['update-rpc.mjs', 'update-policy.mjs', 'update-panel.js'].map((name) => [
        name,
        createHash('sha256')
          .update(readFileSync(join(repoRoot, 'scripts/product-provider', name)))
          .digest('hex'),
      ]),
    ),
    upstreamReleased: false,
    derivation:
      'First-party package/client identity and product-managed updates; transport contracts unchanged',
  });
  return output;
}

export function packProduct({ repoRoot, outputDirectory, providerSource, version }) {
  const productRelease = productManifest(
    JSON.parse(readFileSync(join(repoRoot, 'packages/deepseekbot/package.json'), 'utf8')),
    version,
  );
  const output = resolve(outputDirectory);
  mkdirSync(output, { recursive: true });
  const staging = join(output, 'packages');
  if (existsSync(staging)) throw new Error('Use a fresh artifact output directory');
  mkdirSync(staging);
  const artifacts = [];
  const packageDirectories = [];
  for (const name of ['core', 'client']) {
    const source = join(repoRoot, 'packages', name);
    const target = join(staging, name);
    mkdirSync(target);
    const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
    const { private: _private, devDependencies: _dev, scripts: _scripts, ...release } = manifest;
    for (const path of manifest.files) copyAvailable(source, target, [path]);
    cpSync(join(repoRoot, 'LICENSE'), join(target, 'LICENSE'));
    writeJson(join(target, 'package.json'), {
      ...release,
      version,
      license: 'MIT',
      repository: {
        type: 'git',
        url: 'git+https://github.com/BotHarness/BotHarness.git',
        directory: `packages/${name}`,
      },
      files: [...release.files, 'LICENSE'],
      publishConfig: { access: 'public' },
    });
    packageDirectories.push(target);
  }
  const provider = join(staging, 'im-provider');
  const providerRuntime = stageProvider(providerSource, provider, repoRoot);
  packageDirectories.push(provider);
  const product = join(staging, 'deepseekbot');
  mkdirSync(product);
  const source = join(repoRoot, 'packages/deepseekbot');
  writeJson(join(product, 'package.json'), productRelease);
  copyAvailable(source, product, ['cordis.im.patch.yml', 'README.md']);
  cpSync(join(repoRoot, 'LICENSE'), join(product, 'LICENSE'));
  packageDirectories.push(product);
  for (const directory of packageDirectories) {
    const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
    const [command, args] = pnpmCommand(['pack', '--pack-destination', output]);
    run(command, args, { cwd: directory });
    const filename = `${manifest.name.replace(/^@/, '').replace('/', '-')}-${manifest.version}.tgz`;
    const bytes = readFileSync(join(output, filename));
    artifacts.push({
      name: manifest.name,
      version: manifest.version,
      filename,
      integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    });
  }
  writeJson(join(output, 'artifacts.json'), {
    productVersion: version,
    dsh: productImProvider.upstream.dsh,
    providerRuntime,
    artifacts,
  });
  return artifacts;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const values = new Map();
  for (let i = 2; i < process.argv.length; i += 2) values.set(process.argv[i], process.argv[i + 1]);
  for (const key of ['--output', '--provider-source', '--version'])
    if (!values.get(key)) throw new Error(`Required argument: ${key}`);
  console.log(
    JSON.stringify(
      packProduct({
        repoRoot: fileURLToPath(new URL('..', import.meta.url)),
        outputDirectory: values.get('--output'),
        providerSource: resolve(values.get('--provider-source')),
        version: values.get('--version'),
      }),
      null,
      2,
    ),
  );
}
