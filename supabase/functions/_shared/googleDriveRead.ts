import { googleToken } from './googleAuth.ts';
import { assertAllowedDriveRequest } from './driveFolders.ts';

export interface DriveReadFile {
  id: string;
  name: string;
  mimeType: string;
  createdTime?: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
}

const FIELDS = 'nextPageToken,files(id,name,mimeType,createdTime,modifiedTime,size,webViewLink)';
const escapeQuery = (v: string) => v.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export class DriveReader {
  private async request(path: string, init: RequestInit = {}) {
    assertAllowedDriveRequest(init.method || 'GET', path);
    const url = path.startsWith('upload/') ? `https://www.googleapis.com/${path}` : `https://www.googleapis.com/drive/v3/${path}`;
    const response = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${await googleToken('https://www.googleapis.com/auth/drive')}`, ...init.headers },
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) {
      const body = await response.text();
      if (response.status === 404 || response.status === 403) throw new Error(`Mappen är inte delad med servicekontot, eller Google nekar åtkomst [${response.status}]: ${body}`);
      throw new Error(`Google Drive [${response.status}]: ${body}`);
    }
    return response;
  }

  async listChildren(parentId: string, opts?: { foldersOnly?: boolean }): Promise<DriveReadFile[]> {
    const files: DriveReadFile[] = [];
    let next = '';
    do {
      const q = `'${escapeQuery(parentId)}' in parents and ${opts?.foldersOnly ? "mimeType = 'application/vnd.google-apps.folder' and " : ''}trashed = false`;
      const params = new URLSearchParams({ q, fields: FIELDS, pageSize: '200', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', ...(next ? { pageToken: next } : {}) });
      const data = await (await this.request(`files?${params}`)).json();
      files.push(...(data.files ?? []));
      next = data.nextPageToken || '';
    } while (next);
    return files;
  }

  async getFile(id: string): Promise<DriveReadFile> {
    return (await this.request(`files/${encodeURIComponent(id)}?supportsAllDrives=true&fields=id,name,mimeType,createdTime,modifiedTime,size,webViewLink`)).json();
  }

  async download(id: string): Promise<Uint8Array> {
    const response = await this.request(`files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`);
    return new Uint8Array(await response.arrayBuffer());
  }

  /** Laddar upp en ny PDF i mappen. Skapar bara — ändrar aldrig befintliga filer. */
  async uploadPdf(parentId: string, name: string, bytes: Uint8Array): Promise<DriveReadFile> {
    const boundary = `drive_${crypto.randomUUID()}`;
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [parentId], mimeType: 'application/pdf' })}\r\n`,
      `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`, bytes, `\r\n--${boundary}--\r\n`,
    ]);
    const res = await this.request('upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,webViewLink', {
      method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
    });
    const file = await res.json();
    if (!file.id) throw new Error('Google returnerade inget fil-id');
    return file;
  }

  async findChildByName(parentId: string, predicate: (name: string) => boolean): Promise<DriveReadFile | undefined> {
    return (await this.listChildren(parentId)).find(f => predicate(f.name));
  }
}
