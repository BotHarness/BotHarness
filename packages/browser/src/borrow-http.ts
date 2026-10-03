import { BORROW_PREFIX, type BorrowService } from './borrow.js';
import { registerExtensionHttp } from './extension-http.js';
import type { BrowserViewerHost } from './viewer.js';
export function registerBorrowHttp(host: BrowserViewerHost, service: BorrowService): () => void {
  return registerExtensionHttp(host, BORROW_PREFIX, async (action, token, origin, body, signal) => {
    if (action === 'pair')
      return service.redeem(typeof body.code === 'string' ? body.code : '', origin);
    if (action === 'share') return service.share(token, origin, body);
    if (action === 'poll') return service.poll(token, origin, signal);
    if (action === 'result') {
      service.result(token, origin, body);
      return null;
    }
    if (action === 'return') {
      service.returnToken(token, origin);
      return null;
    }
    return undefined;
  });
}
