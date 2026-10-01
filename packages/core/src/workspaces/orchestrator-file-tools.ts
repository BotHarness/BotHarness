import { AsyncLocalStorage } from 'node:async_hooks';
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { SandboxPolicyService } from '@deepseek-ai/dsh-sandbox-policy';
import * as fileTools from '@deepseek-ai/dsh-tool-fs';
import * as bashTools from '@deepseek-ai/dsh-tool-bash';
import type { DshAgentPresetHost } from '../runtime/dsh-bot-agent-adapter.js';
import { NATIVE_FILE_TOOL_NAMES } from './grant-native-tools.js';

type Policy = ReturnType<SandboxPolicyService['resolve']>;

export async function installOrchestratorFileTools(
  agentCtx: Context,
  agent: Agent,
  presets: DshAgentPresetHost | undefined,
  rootFor: (name: string, args: unknown) => string,
): Promise<() => Promise<void>> {
  const base = agentCtx.get('sandboxPolicy');
  const fs = presets?.serviceFor?.(agent, 'fs') ?? agentCtx.get('fs');
  const shell = presets?.serviceFor?.(agent, 'shell') ?? agentCtx.get('shell');
  if (base === undefined || fs === undefined || shell === undefined)
    throw new Error('Orchestrator native filesystem, Shell and Policy Providers are required');
  const callPolicy = new AsyncLocalStorage<Policy>();
  const scoped = agentCtx.isolate('sandboxPolicy').isolate('fs').isolate('shell');
  const fiber = scoped.plugin({
    name: 'botharness-orchestrator-file-tools',
    apply(ctx: Context) {
      ctx.provide('fs', fs);
      ctx.provide('shell', shell);
      ctx.provide('sandboxPolicy', {
        defaultMode: base.defaultMode,
        workspaceRoot: base.workspaceRoot,
        overrideOf: (session: Parameters<SandboxPolicyService['overrideOf']>[0]) =>
          base.overrideOf(session),
        resolve(request: Parameters<SandboxPolicyService['resolve']>[0]) {
          const policy = base.resolve(request);
          const current = callPolicy.getStore();
          return current === undefined || request?.session !== agent.session
            ? policy
            : { ...policy, workspaceRoot: current.workspaceRoot };
        },
      });
      ctx.on('tools/execute', (execution, next) => {
        if (
          execution.agent !== agent ||
          (execution.name !== 'bash' && !NATIVE_FILE_TOOL_NAMES.has(execution.name))
        )
          return next();
        const workspaceRoot = rootFor(execution.name, execution.arguments);
        return callPolicy.run({ ...base.resolve({ session: agent.session }), workspaceRoot }, next);
      });
    },
  });
  try {
    await fiber.await();
    const files = fiber.ctx.plugin(fileTools, {});
    const bash = fiber.ctx.plugin(bashTools, {
      enableRunInBackground: false,
      promoteOnTimeout: false,
    });
    await files.await();
    await bash.await();
    if (files.state !== 2 || bash.state !== 2)
      throw new Error('Orchestrator native Tools failed to activate');
  } catch (error) {
    await fiber.dispose();
    throw error;
  }
  return () => fiber.dispose();
}
