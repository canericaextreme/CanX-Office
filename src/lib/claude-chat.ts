import { loadCanxSupabase } from './canx-supabase';
export interface ClaudeModel {id:string;name:string}
export interface ClaudeChatReply {ok:boolean;detail?:string;code?:string;text?:string;complete?:boolean;models?:ClaudeModel[]}
/** No provider credential or provider endpoint ever reaches this client. */
export async function invokeOfficeClaude(body: {action:'models'} | {prompt:string;model:string}): Promise<ClaudeChatReply> {
 const client=await loadCanxSupabase();
 if(!client) return {ok:false,detail:'The office connection is unavailable.'};
 const {data,error}=await client.functions.invoke('claude-chat',{body});
 if(error) {
  const response=(error as {context?:Response}).context;
  if(response instanceof Response) {
   const value=await response.json().catch(()=>null);
   if(value?.ok===false && typeof value.detail==='string') return {ok:false,detail:value.detail};
  }
  return {ok:false,detail:'The Claude connection could not be verified. Check owner sign-in and two-step verification.'};
 }
 return data && typeof data.ok==='boolean'?data:{ok:false,detail:'Claude returned an unreadable reply.'};
}
