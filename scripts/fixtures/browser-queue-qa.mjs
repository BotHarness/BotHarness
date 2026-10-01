export const name = 'browser-queue-qa';
export const inject = ['agents', 'tools', 'connection'];
export function apply(ctx) {
  ctx.effect(() =>
    ctx.connection.fetch.register({
      path: '/api/browser-queue-qa',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        const { sessionId, name, args } = await request.json();
        if (
          ![
            'browser_wait',
            'browser_click',
            'browser_type',
            'browser_press_key',
            'browser_open',
            'browser_tabs',
            'browser_observe',
            'browser_screenshot',
          ].includes(name)
        )
          return Response.json({ error: 'QA tool not allowed' }, { status: 400 });
        const agent = ctx.agents.get(sessionId);
        if (!agent) return Response.json({ error: 'Agent unavailable' }, { status: 400 });
        const result = await ctx.tools.execute({
          name,
          arguments: args,
          agent,
          callId: `queue-qa-${Date.now()}-${Math.random()}`,
          signal: request.signal,
        });
        return Response.json(result);
      },
    }),
  );
}
