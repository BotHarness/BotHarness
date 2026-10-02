import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createMcpCuaDriver } from '../src/tool/driver.js';

const mocks = vi.hoisted(() => ({
  connect: vi.fn(async () => undefined),
  listTools: vi.fn(async () => ({ tools: [] })),
  callTool: vi.fn(),
  close: vi.fn(async () => undefined),
  created: vi.fn(),
}));
vi.mock('@modelcontextprotocol/client', () => ({
  Client: class {
    constructor() {
      mocks.created();
    }
    connect = mocks.connect;
    listTools = mocks.listTools;
    callTool = mocks.callTool;
    close = mocks.close;
  },
}));
vi.mock('@modelcontextprotocol/client/stdio', () => ({
  StdioClientTransport: class {},
}));

beforeEach(() => vi.clearAllMocks());
function driver(beforeOpen?: () => Promise<void>) {
  return createMcpCuaDriver({
    ensure: async () => ({ status: 'present', arch: 'test' }),
    transport: { command: 'unused', args: [], env: {} },
    ...(beforeOpen === undefined ? {} : { beforeOpen }),
  });
}

describe('Computer MCP process lifecycle', () => {
  it('does not retry an old observation after a target change closes its process', async () => {
    let rejectCall: ((error: Error) => void) | undefined;
    const observed = new Promise<void>((resolve) => {
      mocks.callTool.mockImplementationOnce(() => {
        resolve();
        return new Promise((_resolve, reject) => {
          rejectCall = reject;
        });
      });
    });
    const connection = driver();
    const call = connection.call('get_window_state', {});
    await observed;
    await connection.close();
    rejectCall?.(new Error('old process closed'));
    await expect(call).rejects.toThrow('old process closed');
    expect(mocks.created).toHaveBeenCalledTimes(1);
    expect(mocks.callTool).toHaveBeenCalledTimes(1);
  });

  it('verifies the executable again before reopening and refuses tampered files', async () => {
    const verify = vi.fn(async () => undefined);
    const connection = driver(verify);
    await connection.tools();
    await connection.close();
    verify.mockRejectedValueOnce(new Error('checksum mismatch'));
    await expect(connection.tools()).rejects.toThrow('checksum mismatch');
    expect(verify).toHaveBeenCalledTimes(2);
    expect(mocks.created).toHaveBeenCalledTimes(1);
  });

  it('does not spawn if closed while the executable check is still pending', async () => {
    let finish: (() => void) | undefined;
    const connection = driver(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const tools = connection.tools();
    const closed = connection.close();
    finish?.();
    await expect(tools).rejects.toThrow('cancelled');
    await closed;
    expect(mocks.created).not.toHaveBeenCalled();
  });
});
