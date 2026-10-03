import { describe, expect, it } from 'vitest';
import { validateOfficeFile, MAX_FILE_BYTES, validateWebLink } from './office-files';
const valid={filename:'Family photo.jpg',room:'family-continuity',folder:'Family and Legacy',size_bytes:10,content_hash:'a'.repeat(64)};
describe('office upload boundaries',()=>{
 it('accepts owner filing destinations and the maximum size',()=>expect(validateOfficeFile({...valid,size_bytes:MAX_FILE_BYTES})).toBeTruthy());
 it.each([{size_bytes:0},{size_bytes:MAX_FILE_BYTES+1},{room:'unknown'},{folder:'unknown'},{content_hash:'../escape'},{filename:''}])('rejects invalid metadata %j',change=>expect(()=>validateOfficeFile({...valid,...change})).toThrow());
});

describe('web link boundaries',()=>{ it('accepts ordinary web addresses',()=>expect(validateWebLink('https://example.com/story')).toBe('https://example.com/story')); it.each(['javascript:alert(1)','file:///desktop/photo.jpg','https://user:password@example.com/'])('rejects unsafe address %s',url=>expect(()=>validateWebLink(url)).toThrow()); });
