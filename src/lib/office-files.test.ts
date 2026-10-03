import { describe, expect, it } from 'vitest';
import { validateOfficeFile, MAX_FILE_BYTES } from './office-files';
const valid={filename:'Family photo.jpg',room:'family-continuity',folder:'Family and Legacy',size_bytes:10,content_hash:'a'.repeat(64)};
describe('office upload boundaries',()=>{
 it('accepts owner filing destinations and the maximum size',()=>expect(validateOfficeFile({...valid,size_bytes:MAX_FILE_BYTES})).toBeTruthy());
 it.each([{size_bytes:0},{size_bytes:MAX_FILE_BYTES+1},{room:'unknown'},{folder:'unknown'},{content_hash:'../escape'},{filename:''}])('rejects invalid metadata %j',change=>expect(()=>validateOfficeFile({...valid,...change})).toThrow());
});
