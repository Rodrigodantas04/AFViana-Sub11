import { getStore } from '@netlify/blobs';
import { appFromEnv } from '../../server/runtime.js';
import { BlobStorage } from '../../server/storage.js';

let handler;
export default async (request, context) => {
  handler ??= appFromEnv({
    env: process.env,
    storage: new BlobStorage(getStore({ name: 'minho11-private', consistency: 'strong' })),
    log: (...args) => console.log('[minho11]', ...args),
  });
  return handler(request, context);
};

// The live JSON overrides the static snapshot file; the admin API lives under /api/admin/.
export const config = { path: ['/data/competition.json', '/api/admin/*'], preferStatic: false };
