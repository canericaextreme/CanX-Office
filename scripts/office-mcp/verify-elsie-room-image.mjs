import assert from 'node:assert/strict';
import { requestsRoomImage, validateElsieRoomImage, readElsieRoomImage, roomImageInput } from '../../src/lib/elsie-room-image.ts';
const png = Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0]);
const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',png)), b=>b.toString(16).padStart(2,'0')).join('');
const now = Date.now();
const fixture = { pngBase64: Buffer.from(png).toString('base64'), meta: {
  room:'Goal & Analytics / CanX Brain',route:'/brain',capturedAt:new Date(now).toISOString(),
  viewport:{name:'desktop',width:1440,height:900},buildVersion:'index-fixture.js',state:'default',pageHeight:900,imageSha256:hash,
} };
assert.equal(requestsRoomImage('Look at the Brain room now'),true);
assert.equal(requestsRoomImage('Can you see the Brain room?'),false);
assert.equal(requestsRoomImage('Do not take a picture of the room'),false);
assert.equal(requestsRoomImage('Read the saved Brain notes'),false);
assert.ok(await validateElsieRoomImage(fixture,'/brain',now));
assert.equal(await validateElsieRoomImage(fixture,'/legal',now),null);
assert.equal(await validateElsieRoomImage(fixture,'/brain',now+600001),null);
assert.equal(await validateElsieRoomImage(fixture,'/brain',now-60001),null);
assert.equal(await validateElsieRoomImage({...fixture,meta:{...fixture.meta,imageSha256:'0'.repeat(64)}},'/brain',now),null);
assert.equal(await validateElsieRoomImage({...fixture,pngBase64:'not base64'},'/brain',now),null);
const calls=[];
const fetchImpl=async(url,init)=>{
  calls.push({url,init,body:JSON.parse(init.body)});
  return Response.json(url.endsWith('/request')?{ok:true,requestId:'request'}:url.endsWith('/wait')?{ok:true,captureId:'capture'}:{ok:true,...fixture});
};
const image=await readElsieRoomImage('https://project.supabase.co','owner-token','/brain',fetchImpl);
assert.ok(image);
assert.deepEqual(calls.map(c=>c.url),['request','wait','fetch'].map(p=>`https://project.supabase.co/functions/v1/office-view/${p}`));
assert.ok(calls.every(c=>c.body.asElsie===true&&c.init.redirect==='error'&&c.init.headers.Authorization==='Bearer owner-token'));
assert.equal(calls[0].body.route,'/brain');
const input=roomImageInput(image);
assert.equal(input.content[1].type,'input_image');
assert.equal(input.content[1].image_url,`data:image/png;base64,${fixture.pngBase64}`);
assert.ok(!JSON.stringify(input).includes('owner-token'));
let deniedCalls=0;
assert.equal(await readElsieRoomImage('https://project.supabase.co','owner-token','/brain',async()=>{deniedCalls++;return Response.json({ok:false},{status:403});}),null);
assert.equal(deniedCalls,1,'denial never retries or switches identity');
assert.equal(await readElsieRoomImage('http://project.supabase.co','owner-token','/brain',fetchImpl),null);
assert.equal(await readElsieRoomImage('https://project.supabase.co','owner-token','/missing',fetchImpl),null);
console.log('Elsie image adapter checks passed: explicit request, route, freshness, checksum, broker identity, denial, provider payload, token exclusion. Fixtures only; no live image or provider calls.');
