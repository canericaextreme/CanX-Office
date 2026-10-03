import { ROOMS } from './office-data';
export const FILE_BUCKET = 'office-files';
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const FILE_ROOMS = [...ROOMS.map(r => ({ id: r.id as string, label: r.shortLabel })), { id: 'family-continuity', label: 'Family Continuity, Skills & Training' }, { id: 'analytics', label: 'Analytics' }, { id: 'round-table', label: 'Round Table' }, { id: 'research', label: 'Research' }];
export const FILE_FOLDERS = ['Start Here', 'Family and Legacy', 'Journals and Talks', 'CanX Projects', 'Finance', 'Rules and Decisions'];
export interface OfficeFile { source_url?: string; id: string; filename: string; room: string; folder: string; object_path: string; content_hash: string; size_bytes: number; mime_type: string; created_at: string }
export function validateOfficeFile(v: { filename: string; room: string; folder: string; size_bytes: number; content_hash: string }) {
 if (!v || typeof v.filename !== 'string' || !v.filename.trim() || v.filename.length > 300 || !FILE_ROOMS.some(r => r.id === v.room) || !FILE_FOLDERS.includes(v.folder) || !Number.isInteger(v.size_bytes) || v.size_bytes <= 0 || v.size_bytes > MAX_FILE_BYTES || !/^[a-f0-9]{64}$/.test(v.content_hash)) throw new Error('Choose a file up to 25 MB and a valid room and folder.');
 return v;
}

export function validateWebLink(value:string){ const url=new URL(value.trim()); if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.href.length>2000) throw new Error('Use an http or https web link without passwords.'); return url.href; }
