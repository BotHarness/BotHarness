export const name = 'browser-access-qa';
export const inject = ['agents', 'tools', 'connection'];
export function apply(ctx) {
  ctx.effect(() =>
    ctx.connection.fetch.register({
      path: '/api/browser-access-qa',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        const { sessionId, action, name, args } = await request.json();
        const agent = ctx.agents.get(sessionId);
        if (!agent) return Response.json({ error: 'Agent unavailable' }, { status: 400 });
        if (action === 'schemas')
          return Response.json({ names: ctx.tools.schemas(agent).map((s) => s.name) });
        if (
          action !== 'execute' ||
          ![
            'browser_open',
            'browser_observe',
            'browser_click',
            'browser_type',
            'browser_wait',
          ].includes(name)
        )
          return Response.json({ error: 'QA operation not allowed' }, { status: 400 });
        return Response.json(
          await ctx.tools.execute({
            name,
            arguments: args,
            agent,
            callId: `access-qa-${Date.now()}-${Math.random()}`,
            signal: request.signal,
          }),
        );
      },
    }),
  );
}
