// Developer-only WSL -> Windows HTTPS tunnel. One client, one target, CONNECT:443 only.
const net = require('node:net');

const [bindAddress, clientAddress, destination, rawPort] = process.argv.slice(2);
const port = Number(rawPort);
if (
  net.isIP(bindAddress) !== 4 ||
  net.isIP(clientAddress) !== 4 ||
  !/^[a-z0-9.-]+$/.test(destination ?? '') ||
  !Number.isSafeInteger(port) ||
  port < 1024 ||
  port > 65535
) {
  throw new Error(
    'Usage: node dev-wsl-connect-relay.cjs <Windows WSL IPv4> <WSL guest IPv4> <target host> <port>',
  );
}

const sockets = new Set();
const server = net.createServer((client) => {
  sockets.add(client);
  client.once('close', () => sockets.delete(client));
  if (client.remoteAddress !== clientAddress) {
    client.destroy();
    return;
  }

  let head = Buffer.alloc(0);
  const accept = (chunk) => {
    head = Buffer.concat([head, chunk]);
    if (head.length > 8192) {
      client.destroy();
      return;
    }
    const boundary = head.indexOf('\r\n\r\n');
    if (boundary < 0) return;
    client.off('data', accept);
    const firstLine = head.subarray(0, head.indexOf('\r\n')).toString('ascii');
    if (firstLine !== `CONNECT ${destination}:443 HTTP/1.1`) {
      client.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n');
      return;
    }

    const upstream = net.connect({ host: destination, port: 443 });
    sockets.add(upstream);
    upstream.once('close', () => sockets.delete(upstream));
    upstream.once('connect', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      const tail = head.subarray(boundary + 4);
      if (tail.length) upstream.write(tail);
      client.pipe(upstream).pipe(client);
    });
    upstream.on('error', () => client.destroy());
    client.on('error', () => upstream.destroy());
    client.on('close', () => upstream.destroy());
  };
  client.on('data', accept);
  client.on('error', () => client.destroy());
  client.setTimeout(120000, () => client.destroy());
});

server.listen(port, bindAddress, () => console.log('restricted CONNECT relay ready'));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    for (const socket of sockets) socket.destroy();
    server.close(() => process.exit());
  });
}
