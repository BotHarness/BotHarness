import { PROFILE_PREFIX, type ProfileControl } from './profile-control.js';
import { registerExtensionHttp } from './extension-http.js';
import type { BrowserViewerHost } from './viewer.js';
export function registerProfileHttp(host: BrowserViewerHost, service: ProfileControl): () => void {
  return registerExtensionHttp(
    host,
    PROFILE_PREFIX,
    async (action, token, origin, body, signal) => {
      if (action === 'pair')
        return service.redeem(typeof body.code === 'string' ? body.code : '', origin);
      if (action === 'poll')
        return service.poll(
          token,
          origin,
          typeof body.count === 'number' ? body.count : 0,
          typeof body.clientId === 'string' ? body.clientId : '',
          signal,
        );
      if (action === 'result') {
        await service.result(token, origin, body);
        return null;
      }
      if (action === 'forget') {
        await service.forgetToken(token, origin);
        return null;
      }
      return undefined;
    },
  );
}
