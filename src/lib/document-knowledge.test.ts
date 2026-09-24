import { describe,it,expect } from 'vitest';
import { readDocumentContext,documentSearchQuery } from './document-knowledge';
const id='e3d6572f-42fe-4005-b17b-430cafcb34dd';
const doc={id,title:'Book',filename:'Book.docx',project:'Book',content_hash:'abc',character_count:12000,chunk_count:2,created_at:'2026-09-24'};
describe('document knowledge',()=>{
 it.each(['Read the whole book','Create the ad campaign'])('passes the complete text without the memory excerpt cap for %s',async(request)=>{
  const text='X'.repeat(6000);const result=await readDocumentContext(async p=>({ok:true,status:200,body:p.startsWith('knowledge_documents?')?[doc]:[{section_number:1,content:text},{section_number:2,content:text}]}),request);
  expect(result.text).toContain(text);expect(result.text).toContain('Complete extracted text');expect(result.gaps).toEqual([]);expect(result.sources[0]).toContain('1, 2 of 2');
 });
 it('labels search results as partial and cites a section',async()=>{
  const result=await readDocumentContext(async p=>({ok:true,status:200,body:p.startsWith('knowledge_documents?')?[doc]:[{...doc,document_id:id,section_number:2,content:'The ending'}]}),'motivation');
  expect(result.text).toContain('PARTIAL');expect(result.gaps[0]).toContain('1 of 2');expect(result.sources[0]).toContain('sections 2 of 2');
 });
 it('does not claim an unreadable source',async()=>{
  const result=await readDocumentContext(async()=>({ok:false,status:403,body:null}),'book');expect(result.sources).toEqual([]);expect(result.gaps.length).toBe(1);
 });
 it('reports no match rather than claiming the book is absent',async()=>{
  const result=await readDocumentContext(async p=>({ok:true,status:200,body:p.startsWith('knowledge_documents?')?[doc]:[]}),'unmatched');expect(result.gaps[0]).toContain('No matching');
 });
 it('does not silently load huge books in one call',async()=>{
  const calls:string[]=[];await readDocumentContext(async p=>{calls.push(p);return {ok:true,status:200,body:p.startsWith('knowledge_documents?')?[{...doc,character_count:1000000}]:[]};},'read the entire book');expect(calls[1]).toBe('rpc/search_knowledge_sections');
 });
 it('makes keyword queries instead of executing filter syntax',()=>expect(documentSearchQuery('river & motivation')).toBe('river OR motivation'));
});
