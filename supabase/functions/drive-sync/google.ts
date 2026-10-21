import { googleToken, serviceAccount } from '../_shared/googleAuth.ts';
import { assertAllowedDriveRequest, accountingFolders, sameYearFolder, sameCustomerFolder, existingDocument, type Destination } from '../_shared/driveFolders.ts';

type DriveFile = { id: string; name: string; webViewLink?: string };
export { serviceAccount };
const token = () => googleToken('https://www.googleapis.com/auth/drive');
const escapeQuery = (v: string) => v.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
export class GoogleDrive {
  private lists = new Map<string, DriveFile[]>();
  private folders = new Map<string, DriveFile>();
  async request(path: string, init: RequestInit = {}, upload = false) {
    assertAllowedDriveRequest(init.method || 'GET', path);
    const response = await fetch(`https://www.googleapis.com/${upload ? 'upload/' : ''}drive/v3/${path}`, {...init,headers:{Authorization:`Bearer ${await token()}`,...init.headers},signal:AbortSignal.timeout(25000)});
    if (!response.ok) {
      const body = await response.text();
      if (response.status === 404 || response.status === 403) throw new Error(`Mappen är inte delad med servicekontot, eller Google nekar åtkomst [${response.status}]: ${body}`);
      throw new Error(`Google Drive [${response.status}]: ${body}`);
    }
    return response.json();
  }
  async metadata(id: string): Promise<DriveFile> {
    const file = await this.request(`files/${encodeURIComponent(id)}?supportsAllDrives=true&fields=id,name,mimeType,trashed,capabilities(canAddChildren)`);
    if (file.trashed || file.mimeType !== 'application/vnd.google-apps.folder') throw new Error('Målmappen är inte en aktiv Drive-mapp');
    if (file.capabilities?.canAddChildren === false) throw new Error('Mappen måste delas med servicekontot som Redigerare');
    return file;
  }
  async list(parent: string, folders: boolean): Promise<DriveFile[]> {
    const key = `${parent}:${folders}`;
    const cached = this.lists.get(key);
    if (cached) return cached;
    const files: DriveFile[] = [];
    let next = '';
    do {
      const q = `'${escapeQuery(parent)}' in parents and ${folders ? "mimeType = 'application/vnd.google-apps.folder' and " : ''}trashed = false`;
      const params = new URLSearchParams({q,fields:'nextPageToken,files(id,name,webViewLink)',pageSize:'200',supportsAllDrives:'true',includeItemsFromAllDrives:'true',...(next ? {pageToken:next} : {})});
      const data = await this.request(`files?${params}`);
      files.push(...(data.files ?? [])); next = data.nextPageToken || '';
    } while (next);
    this.lists.set(key,files);
    return files;
  }
  private async folder(parent: string, name: string, matches: (name: string) => boolean) {
    const key = `${parent}:${name}`;
    const cached = this.folders.get(key);
    if (cached) return cached;
    const list = await this.list(parent,true);
    let found = list.find(f => matches(f.name));
    if (!found) {
      found = await this.request('files?supportsAllDrives=true&fields=id,name,webViewLink', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,mimeType:'application/vnd.google-apps.folder',parents:[parent]})});
      if (!found?.id) throw new Error('Google returnerade inget mapp-id');
      list.push(found);
    }
    this.folders.set(key,found);
    return found;
  }
  async target(settings: { root_folder_id: string; kunder_folder_id: string }, destination: Destination, date: string, address?: string) {
    if (destination === 'customers') {
      if (!address?.trim()) throw new Error('Signerad offert saknar kundadress');
      const folder = await this.folder(settings.kunder_folder_id,address.trim(),n => sameCustomerFolder(n,address));
      return {id:folder.id,path:`Kunder/${folder.name}`};
    }
    const names = accountingFolders(date,destination);
    const year = await this.folder(settings.root_folder_id,names.yearFolder,n => sameYearFolder(n,names.yearFolder));
    const month = await this.folder(year.id,names.monthFolder,n => names.monthPattern.test(n));
    return {id:month.id,path:`Smartklimat N3Prenad/${year.name}/${month.name}`};
  }
  async duplicate(parent: string, name: string, number: string | null) { return existingDocument(await this.list(parent,false),name,number); }
  async upload(parent: string, name: string, pdf: Blob): Promise<DriveFile> {
    const boundary = `drive_${crypto.randomUUID()}`;
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({name,parents:[parent]})}\r\n`,
      `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`, pdf, `\r\n--${boundary}--\r\n`,
    ]);
    const file = await this.request('files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body},true);
    if (!file.id) throw new Error('Google returnerade inget fil-id');
    const result = {...file,name};
    this.lists.get(`${parent}:false`)?.push(result);
    return result;
  }
}