/**
 * Where the workbook lives. Same interface for Google Drive (production) and a
 * local file (development and tests):
 *   meta()            -> { version, modifiedTime, canEdit }   (cheap)
 *   read()            -> { bytes, revision, meta }
 *   write(bytes, src) -> { bytes, revision, meta }  (only if unchanged since `src`; re-read to confirm)
 */
import fs from 'node:fs/promises';
import { createHash, createSign } from 'node:crypto';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export class SourceError extends Error { constructor(message, status = 503) { super(message); this.status = status; } }
const MAX_BYTES = 10_000_000;

export class FileSource {
  constructor(path) { this.path = path; this.kind = 'file'; }
  async meta() {
    const stat = await fs.stat(this.path).catch(() => { throw new SourceError('Ficheiro de desenvolvimento em falta.'); });
    return { version: String(stat.mtimeMs) + ':' + stat.size, modifiedTime: stat.mtime.toISOString(), canEdit: true };
  }
  async read() {
    const before = await this.meta();
    const bytes = new Uint8Array(await fs.readFile(this.path));
    const after = await this.meta();
    if (before.version !== after.version) throw new SourceError('A fonte está a ser alterada. Tenta novamente.', 409);
    return { bytes, revision: sha256(bytes), meta: after };
  }
  async write(bytes, source) {
    const current = await this.read();
    if (current.revision !== source.revision) throw new SourceError('O Excel foi alterado entretanto. Nada foi gravado.', 409);
    const tmp = this.path + '.tmp';
    await fs.writeFile(tmp, bytes);
    await fs.rename(tmp, this.path);
    const verified = await this.read();
    if (verified.revision !== sha256(bytes)) throw new SourceError('A gravação não pôde ser confirmada.', 502);
    return verified;
  }
}

/** Google Drive, binary XLSX kept as XLSX (no conversion), via a service account with Editor access to this one file. */
export class DriveSource {
  constructor({ fileId, credentials, fetchImpl = fetch }) {
    if (!/^[A-Za-z0-9_-]{20,}$/.test(fileId ?? '')) throw new SourceError('Identificador do ficheiro Drive inválido.');
    if (!credentials?.client_email || !credentials?.private_key) throw new SourceError('Credenciais Google incompletas.');
    Object.assign(this, { fileId, credentials, fetch: fetchImpl, kind: 'drive', token: null });
  }
  static fromEnv(env, fileId) {
    const raw = env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!raw) return null;
    const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    return new DriveSource({ fileId: env.DRIVE_FILE_ID || fileId, credentials: JSON.parse(text) });
  }
  async accessToken() {
    if (this.token && this.token.expires > Date.now() + 60_000) return this.token.value;
    const now = Math.floor(Date.now() / 1000);
    const enc = v => Buffer.from(JSON.stringify(v)).toString('base64url');
    const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({ iss: this.credentials.client_email, scope: 'https://www.googleapis.com/auth/drive', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
    const signature = createSign('RSA-SHA256').update(unsigned).sign(this.credentials.private_key).toString('base64url');
    const response = await this.fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }), signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new SourceError('Não foi possível autorizar a ligação ao Google Drive.');
    const body = await response.json();
    this.token = { value: body.access_token, expires: Date.now() + body.expires_in * 1000 };
    return this.token.value;
  }
  async request(url, options = {}) {
    const response = await this.fetch(url, { ...options, headers: { Authorization: `Bearer ${await this.accessToken()}`, ...options.headers }, signal: AbortSignal.timeout(25_000) });
    if (!response.ok) {
      if (response.status === 404) throw new SourceError('O ficheiro Excel não foi encontrado no Drive (ou não foi partilhado com a ligação do site).');
      if (response.status === 403) throw new SourceError('A ligação do site não tem permissão sobre o Excel.');
      throw new SourceError('Não foi possível contactar o Google Drive. Tenta novamente daqui a pouco.');
    }
    return response;
  }
  async meta() {
    const response = await this.request(`https://www.googleapis.com/drive/v3/files/${this.fileId}?fields=id,name,mimeType,version,modifiedTime,size,md5Checksum,capabilities(canEdit)&supportsAllDrives=true`);
    const meta = await response.json();
    if (meta.mimeType !== XLSX_MIME) throw new SourceError('A fonte deixou de ser um ficheiro XLSX.');
    if (Number(meta.size) > MAX_BYTES) throw new SourceError('O ficheiro Excel ultrapassa o tamanho suportado.');
    return { version: meta.version, modifiedTime: meta.modifiedTime, md5: meta.md5Checksum, canEdit: Boolean(meta.capabilities?.canEdit), name: meta.name };
  }
  async read() {
    const before = await this.meta();
    const response = await this.request(`https://www.googleapis.com/drive/v3/files/${this.fileId}?alt=media&supportsAllDrives=true`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > MAX_BYTES) throw new SourceError('O ficheiro Excel ultrapassa o tamanho suportado.');
    const after = await this.meta();
    if (before.version !== after.version) throw new SourceError('O Excel está a ser alterado neste momento. Tenta novamente.', 409);
    if (after.md5 && createHash('md5').update(bytes).digest('hex') !== after.md5) throw new SourceError('Leitura do Excel incompleta. Tenta novamente.', 502);
    return { bytes, revision: sha256(bytes), meta: after };
  }
  /**
   * Replaces the content of the SAME file (same ID, sharing and history; Drive keeps the
   * previous version in its revision history). Drive offers no compare-and-swap for media
   * uploads: we check the version right before uploading and re-read afterwards. A person
   * saving the file at the very same instant could still win; that case is detected on the
   * next read (see lost-write check in server/app.js) and reported, never hidden.
   */
  async write(bytes, source) {
    if (!source.meta.canEdit) throw new SourceError('A ligação do site só tem permissão de leitura sobre o Excel.');
    const current = await this.meta();
    if (current.version !== source.meta.version) throw new SourceError('O Excel foi alterado entretanto. Nada foi gravado.', 409);
    await this.request(`https://www.googleapis.com/upload/drive/v3/files/${this.fileId}?uploadType=media&supportsAllDrives=true&fields=id,version`, { method: 'PATCH', headers: { 'Content-Type': XLSX_MIME }, body: bytes });
    const verified = await this.read();
    if (verified.revision !== sha256(bytes)) throw new SourceError('A gravação não pôde ser confirmada no Drive. Recarrega antes de repetir.', 502);
    return verified;
  }
}
