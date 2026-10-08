import { createFileRoute } from '@tanstack/react-router';
export const Route=createFileRoute('/api/office-work')({server:{handlers:{POST:async({request})=>{
 const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
 if(request.headers.has('Origin'))return reply({error:'Server connection required'},403);
 const match=/^Bearer ([A-Za-z0-9._-]{1,8192})$/.exec(request.headers.get('Authorization')??'');
 if(!match)return reply({error:'Authorization required'},401);
 if(request.headers.get('Content-Type')?.split(';')[0]?.trim()!=='application/json')return reply({error:'JSON required'},415);
 const reader=request.body?.getReader();if(!reader)return reply({error:'Body required'},400);
 let size=0;const parts:Uint8Array[]=[];
 try{while(true){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>16384){await reader.cancel();return reply({error:'Request too large'},413);}parts.push(p.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}
 try{const data=JSON.parse(new TextDecoder().decode(bytes));const {liveOfficeWorkBuild}=await import('../../lib/office-work.server');return reply(await liveOfficeWorkBuild(match[1]!,data));}
 catch{return reply({error:'Office work not confirmed. Check existing builds before retrying; a current working grant is required.'},403);}
}}}});
