import postgres from 'npm:postgres@3.4.5';
import {createClaudeChatHandler} from './handler.ts';
const url = Deno.env.get('SUPABASE_URL') ?? '';
const apiKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Object.values(JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}'))[0] as string | undefined;
let sql: ReturnType<typeof postgres> | undefined;
async function rest(token: string, path: string, body?: unknown) {
 if (!url || !apiKey) throw Error('Backend configuration unavailable');
 return fetch(url + path,{method:body===undefined?'GET':'POST',headers:{apikey:apiKey,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(15000),...(body===undefined?{}:{body:JSON.stringify(body)})});
}
Deno.serve(createClaudeChatHandler({
 verifyOwner: async token => {
  const response=await rest(token,'/auth/v1/user');
  if(!response.ok) return false;
  const user=await response.json();
  if(typeof user.id!=='string') return false;
  // Decode only after Auth has validated the token; never trust user_metadata.
  const claims=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
  if(claims.sub!==user.id || claims.aal!=='aal2' || !claims.exp || claims.exp*1000<=Date.now()) return false;
  const role=await rest(token,'/rest/v1/rpc/has_role',{_user_id:user.id,_role:'owner'});
  return role.ok && await role.json()===true;
 },
 readKey: async () => {
  const dbUrl=Deno.env.get('SUPABASE_DB_URL');
  if(!dbUrl) return null;
  sql ??= postgres(dbUrl,{prepare:false,max:1,connect_timeout:10,idle_timeout:20});
  const rows=await sql`select decrypted_secret from vault.decrypted_secrets where name = 'ANTHROPIC_API_KEY' limit 1`;
  return typeof rows[0]?.decrypted_secret==='string'?rows[0].decrypted_secret:null;
 },
 reserve: async (token,cents) => {
  const response=await rest(token,'/rest/v1/rpc/reserve_ai_call',{_estimated_cents:cents});
  if(!response.ok) return null;
  const body=await response.json(),row=Array.isArray(body)?body[0]:body;
  return row?.allowed===true && typeof row.reservation_id==='string'?row.reservation_id:null;
 },
 settle: async (token,id,outcome) => {await rest(token,'/rest/v1/rpc/settle_ai_call',{_reservation_id:id,_outcome:outcome});},
 fetch:(input,init)=>fetch(input,init),
}));
