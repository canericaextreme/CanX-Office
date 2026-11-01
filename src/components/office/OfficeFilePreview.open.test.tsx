// @vitest-environment happy-dom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const fixtures=vi.hoisted(()=>({open:vi.fn()}));
vi.mock('@tanstack/react-start',()=>({useServerFn:(fn:unknown)=>fn}));
vi.mock('@/lib/office-files.functions',()=>({openOfficeFile:fixtures.open}));
import {OfficeFilePreview} from './OfficeFilePreview';
import type {OfficeFile} from '@/lib/office-files';
const file={id:'saved-pdf',filename:'Book.pdf',room:'research',folder:'CanX Projects',mime_type:'application/pdf'} as OfficeFile;
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();fixtures.open.mockReset();});
it('offers a fresh same-tab original even when the embedded preview fails',async()=>{
 fixtures.open.mockResolvedValueOnce('https://example.invalid/preview').mockResolvedValueOnce('https://example.invalid/fresh-original');
 vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('Preview network failed')));
 const assign=vi.spyOn(window.location,'assign').mockImplementation(()=>{});
 render(<OfficeFilePreview file={file} accessToken="owner" onClose={()=>{}} onDownload={()=>{}}/>);
 await screen.findByRole('alert');
 fireEvent.click(screen.getByRole('button',{name:'Open original'}));
 await waitFor(()=>expect(assign).toHaveBeenCalledWith('https://example.invalid/fresh-original'));
 expect(fixtures.open).toHaveBeenLastCalledWith({data:{accessToken:'owner',id:file.id,download:false}});
 expect(screen.getByText(/If the PDF below is blank on your phone/)).toBeTruthy();
});
it('reports sign-in instead of leaving an indefinite opening spinner',async()=>{
 render(<OfficeFilePreview file={file} accessToken={null} onClose={()=>{}} onDownload={()=>{}}/>);
 expect(await screen.findByRole('alert')).toHaveProperty('textContent','Sign in to open this saved file.');
 expect(screen.queryByText('Opening preview…')).toBeNull();
 expect(screen.getByRole('button',{name:'Open original'}).hasAttribute('disabled')).toBe(true);
 expect(fixtures.open).not.toHaveBeenCalled();
});
it('retries only preview retrieval without changing the saved file',async()=>{
 fixtures.open.mockResolvedValue('https://example.invalid/original');
 vi.stubGlobal('fetch',vi.fn().mockRejectedValueOnce(new Error('Temporary error')).mockResolvedValueOnce({ok:true,arrayBuffer:async()=>new TextEncoder().encode('Saved text').buffer}));
 render(<OfficeFilePreview file={{...file,filename:'Notes.txt'}} accessToken="owner" onClose={()=>{}} onDownload={()=>{}}/>);
 await screen.findByRole('alert');
 fireEvent.click(screen.getByRole('button',{name:'Retry preview'}));
 expect(await screen.findByText('Saved text')).toBeTruthy();
 expect(fixtures.open).toHaveBeenCalledTimes(2);
});
