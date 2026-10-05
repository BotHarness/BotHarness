export const name = 'assignment-execution-error-qa';
export const inject = ['llm'];
const marker = 'NATIVE_ERROR_PROGRESS: Evidence retained before execution failure.';

export function apply(ctx) {
  ctx.on('llm/stream', async function* (options, next) {
    if (options.tools?.some((tool) => tool.name === 'report_to_orchestrator')) {
      const call = options.messages
        .flatMap((message) => (message.role === 'assistant' ? message.content : []))
        .find(
          (block) =>
            block.type === 'tool-call' &&
            block.name === 'report_to_orchestrator' &&
            JSON.parse(block.arguments).summary === marker,
        );
      if (
        call &&
        options.messages.some(
          (message) =>
            message.role === 'tool' && message.toolCallId === call.id && message.isError !== true,
        )
      )
        throw new Error(
          'Isolated QA execution failure after committed Report; PRIVATE_QA_ERROR_CANARY',
        );
    }
    yield* next();
  });
}
