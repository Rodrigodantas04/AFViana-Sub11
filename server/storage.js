/**
 * Small key-value store with compare-and-swap, used for: public cache, write lease,
 * idempotency/operation log, login throttling, session revocation and private
 * backups. Never a second source of results — the workbook is.
 *   get(key, type) -> { value, etag } | null       type: 'json' | 'bytes'
 *   set(key, value, { onlyIfNew, onlyIfMatch }) -> { modified, etag }
 *   delete(key)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class MemoryStorage {
  constructor() { this.map = new Map(); }
  async get(key, type = 'json') {
    const entry = this.map.get(key);
    if (!entry) return null;
    return { value: type === 'json' ? JSON.parse(entry.body) : new Uint8Array(entry.body), etag: entry.etag };
  }
  async set(key, value, { onlyIfNew, onlyIfMatch } = {}) {
    const existing = this.map.get(key);
    if (onlyIfNew && existing) return { modified: false };
    if (onlyIfMatch && existing?.etag !== onlyIfMatch) return { modified: false };
    const etag = randomUUID();
    this.map.set(key, { body: value instanceof Uint8Array ? Buffer.from(value) : JSON.stringify(value), etag });
    return { modified: true, etag };
  }
  async delete(key) { this.map.delete(key); }
}

/** Development only: one file per key under data/internal/dev-store (git-ignored). */
export class FileStorage extends MemoryStorage {
  constructor(directory) { super(); this.directory = directory; this.loaded = false; }
  file(key) { return path.join(this.directory, encodeURIComponent(key)); }
  async load() {
    if (this.loaded) return;
    await fs.mkdir(this.directory, { recursive: true });
    for (const name of await fs.readdir(this.directory)) {
      const body = await fs.readFile(path.join(this.directory, name));
      this.map.set(decodeURIComponent(name), { body: name.endsWith('.xlsx') || decodeURIComponent(name).startsWith('backups/') ? body : body.toString('utf8'), etag: randomUUID() });
    }
    this.loaded = true;
  }
  async get(key, type) { await this.load(); return super.get(key, type); }
  async set(key, value, options) {
    await this.load();
    const result = await super.set(key, value, options);
    if (result.modified) await fs.writeFile(this.file(key), this.map.get(key).body);
    return result;
  }
  async delete(key) { await this.load(); await super.delete(key); await fs.rm(this.file(key), { force: true }); }
}

/** Netlify Blobs (site-wide store, strong consistency for locks and idempotency). */
export class BlobStorage {
  constructor(store) { this.store = store; }
  async get(key, type = 'json') {
    const result = await this.store.getWithMetadata(key, { type: type === 'json' ? 'json' : 'arrayBuffer' });
    if (!result) return null;
    return { value: type === 'json' ? result.data : new Uint8Array(result.data), etag: result.etag };
  }
  async set(key, value, options = {}) {
    const conditions = options.onlyIfNew ? { onlyIfNew: true } : options.onlyIfMatch ? { onlyIfMatch: options.onlyIfMatch } : {};
    return value instanceof Uint8Array ? this.store.set(key, value, conditions) : this.store.setJSON(key, value, conditions);
  }
  async delete(key) { await this.store.delete(key); }
}

/** Mutual exclusion between server instances (expiring lease with CAS). */
export async function acquireLease(storage, key, seconds, now = Date.now) {
  const value = { id: randomUUID(), expires: now() + seconds * 1000 };
  let result = await storage.set(key, value, { onlyIfNew: true });
  if (!result.modified) {
    const current = await storage.get(key);
    if (current && current.value.expires < now()) result = await storage.set(key, value, { onlyIfMatch: current.etag });
  }
  if (!result.modified) return null;
  return async () => { await storage.set(key, { id: value.id, expires: 0 }, { onlyIfMatch: result.etag }); };
}
