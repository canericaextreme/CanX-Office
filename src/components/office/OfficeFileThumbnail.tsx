import { useEffect, useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { FileText, File, Image, Link as LinkIcon } from 'lucide-react';
import { openOfficeFile } from '@/lib/office-files.functions';
import type { OfficeFile } from '@/lib/office-files';

type Thumbnail = { kind: 'image'; url: string } | { kind: 'text'; text: string };

export function OfficeFileThumbnail({ file, accessToken }: { file: OfficeFile; accessToken: string | null | undefined }) {
  const container = useRef<HTMLDivElement>(null);
  const open = useServerFn(openOfficeFile);
  const [visible, setVisible] = useState(false);
  const [thumbnail, setThumbnail] = useState<Thumbnail | null>(null);
  const extension = file.filename.split('.').pop()?.toLowerCase() ?? '';
  const image = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(extension);
  const text = ['docx', 'txt', 'md', 'csv'].includes(extension);
  const Icon = file.source_url ? LinkIcon : image ? Image : text || extension === 'pdf' ? FileText : File;

  useEffect(() => {
    if (!container.current) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setThumbnail(null);
    if (!visible || !accessToken || file.source_url || (!image && !text)) return;
    let active = true;
    let objectUrl = '';
    const controller = new AbortController();
    void (async () => {
      const url = await open({ data: { accessToken, id: file.id, download: false } });
      if (!active) return;
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) return;
      const buffer = await response.arrayBuffer();
      if (!active) return;
      if (image) {
        const mime: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
        objectUrl = URL.createObjectURL(new Blob([buffer], { type: mime[extension]! }));
        setThumbnail({ kind: 'image', url: objectUrl });
      } else {
        const content = extension === 'docx'
          ? (await (await import('mammoth')).extractRawText({ arrayBuffer: buffer })).value
          : new TextDecoder().decode(buffer);
        if (active) setThumbnail({ kind: 'text', text: content.trim().slice(0, 500) });
      }
    })().catch(() => { /* A file-type thumbnail remains available if preview loading fails. */ });
    return () => { active = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [visible, accessToken, file.id, file.source_url, image, text, extension, open]);

  return <div ref={container} aria-hidden="true" className="relative h-20 w-16 shrink-0 overflow-hidden rounded border border-border bg-muted">
    {thumbnail?.kind === 'image'
      ? <img src={thumbnail.url} alt="" className="h-full w-full object-cover" onError={() => setThumbnail(null)} />
      : thumbnail?.kind === 'text' && thumbnail.text
        ? <div className="h-full bg-white p-1.5 text-slate-800"><span className="mb-1 block border-b border-slate-200 pb-1 text-[7px] font-bold uppercase text-blue-700">{extension}</span><p className="whitespace-pre-wrap break-words text-[5px] leading-[7px]">{thumbnail.text}</p></div>
        : <div className="flex h-full flex-col items-center justify-center gap-1"><Icon className="h-7 w-7 text-muted-foreground" /><span className="max-w-full truncate px-1 text-[9px] font-semibold uppercase text-muted-foreground">{file.source_url ? 'Link' : extension.slice(0, 8) || 'File'}</span></div>}
  </div>;
}
