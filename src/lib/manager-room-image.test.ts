import { describe, expect, it, vi } from 'vitest';
import { runManagerChatWith, type ManagerDeps } from './manager.functions';
import type { ElsieRoomImage } from './elsie-room-image';

const image: ElsieRoomImage = { pngBase64: 'fixture', meta: {
  room: 'Goal & Analytics / CanX Brain', route: '/brain', capturedAt: new Date().toISOString(),
  viewport: { name:'desktop',width:1440,height:900 }, buildVersion:'fixture',state:'default',pageHeight:900,imageSha256:'0'.repeat(64),
} };
function setup(found: ElsieRoomImage | null = image) {
  const bodies: Record<string, unknown>[] = [];
  const readRoomImage = vi.fn(async () => found);
  const deps: ManagerDeps = {
    verifyOwner: async () => ({ok:true,userId:'owner',email:'owner@example.com',aal:'aal2'}),
    reserve: async () => ({allowed:true,reservationId:'r',remainingToday:10}),settle:async()=>undefined,
    buildContext: async () => ({ok:true,text:'Verified room text'}),openaiKey:'test',model:'test',readRoomImage,
    fetchImpl: async (_url,init) => {
      if(init?.method === 'POST') { bodies.push(JSON.parse(String(init.body))); return Response.json({output_text:'Room answer'}); }
      return Response.json({id:'test'});
    },
  };
  return {deps,readRoomImage,bodies};
}
describe('Elsie room-image integration',()=>{
  it('supplies one image to the answer and only metadata in the receipt',async()=>{
    const s=setup();
    const reply=await runManagerChatWith(s.deps,{accessToken:'owner-token',currentRoute:'/brain',messages:[{role:'user',content:'Look at the Brain room now'}]});
    expect(s.readRoomImage).toHaveBeenCalledExactlyOnceWith('owner-token','/brain');
    expect(JSON.stringify(s.bodies)).toContain('input_image');
    expect(reply.roomImage).toEqual(image.meta);
    expect(JSON.stringify(reply)).not.toContain('pngBase64');
  });
  it('discloses a missing picture instead of calling saved text visual evidence',async()=>{
    const s=setup(null);
    const reply=await runManagerChatWith(s.deps,{accessToken:'t',currentRoute:'/brain',messages:[{role:'user',content:'Look at the Brain room now'}]});
    expect(JSON.stringify(s.bodies)).toContain('No room image was received');
    expect(JSON.stringify(s.bodies)).not.toContain('input_image');
    expect(reply.roomImage).toBeUndefined();
  });
  it('does not capture for an ordinary text request or denied owner',async()=>{
    const s=setup();
    await runManagerChatWith(s.deps,{accessToken:'t',currentRoute:'/brain',messages:[{role:'user',content:'Read the Brain notes'}]});
    expect(s.readRoomImage).not.toHaveBeenCalled();
    s.deps.verifyOwner=async()=>({ok:false,reason:'no_session',message:'Sign in required'});
    await runManagerChatWith(s.deps,{accessToken:'t',currentRoute:'/brain',messages:[{role:'user',content:'Look at the Brain room now'}]});
    expect(s.readRoomImage).not.toHaveBeenCalled();
  });
});
