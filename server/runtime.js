/** Builds the app from environment + repository files (shared by Netlify and the local server). */
import config from '../config/competition.json' with { type: 'json' };
import policy from '../config/publication.json' with { type: 'json' };
import snapshot from '../data/public/competition.json' with { type: 'json' };
import crests from '../config/crests.json' with { type: 'json' };
import { createApp } from './app.js';
import { DriveSource, FileSource } from './sources.js';

export function appFromEnv({ env, storage, sourceFile, log }) {
  const source = sourceFile ? new FileSource(sourceFile) : DriveSource.fromEnv(env, config.drive?.fileId);
  return createApp({ storage, source, env, config, policy, snapshot, crests, refreshSeconds: Number(env.MINHO11_REFRESH_SECONDS || 60), log });
}
