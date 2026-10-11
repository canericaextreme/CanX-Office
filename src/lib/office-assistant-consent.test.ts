import { describe, it, expect, vi } from 'vitest';
import { assistantConsentWith, type AssistantConsentDeps } from './office-assistant-consent';
const owner='00000000-0000-4000-8000-000000000001', agent='00000000-0000-4000-8000-000000000002', client='00000000-0000-4000-8000-000000000003';
const details={authorization_id:'request',redirect_uri:'https://client.example/callback',client:{id:client,name:'Client'},user:{id:owner},scope:'openid',state:'state',assistant_user_id:null};
const input={token:'owner-token',authorizationId:'request',identity:'chatgpt' as const,action:'approve' as const};
function deps():AssistantConsentDeps {
  return {
    verify:vi.fn(async()=>({ok:true,userId:owner,aal:'aal2'})),
    rpc:vi.fn(async(_token,name)=>name==='canx_mcp_consent_preview'?details:name==='canx_mcp_bind_identity'?agent:client),
    provision:vi.fn(async()=>agent),mint:vi.fn(async()=>'internal-token'),
    auth:vi.fn(async(path)=>({ok:true,body:path.endsWith('/consent')?{redirect_url:'https://client.example/callback?code=code&state=state'}:{...details,user:{id:agent}}})),
    endSession:vi.fn(async()=>{}),
  };
}
describe('Isolated assistant consent',()=>{
  it('reads without creating users, minting sessions or binding an OAuth request',async()=>{
    const d=deps();expect(await assistantConsentWith(d,{...input,action:'read'})).toEqual({ok:true,details:{authorization_id:details.authorization_id,redirect_uri:details.redirect_uri,client:details.client,user:details.user,scope:details.scope}});
    expect(d.provision).not.toHaveBeenCalled();expect(d.mint).not.toHaveBeenCalled();expect(d.auth).not.toHaveBeenCalled();
  });
  it('denies with state, no authorization code and no identity provision',async()=>{
    const d=deps();const r=await assistantConsentWith(d,{...input,action:'deny'});
    expect(r).toEqual({ok:true,redirect:'https://client.example/callback?error=access_denied&state=state'});
    expect(d.provision).not.toHaveBeenCalled();expect(d.auth).not.toHaveBeenCalled();expect(d.rpc).toHaveBeenCalledTimes(1);
  });
  it('requires verified owner MFA before any service call',async()=>{
    for(const verification of [{ok:false},{ok:true,userId:owner,aal:'aal1'},{ok:true,userId:'bad',aal:'aal2'}]){
      const d=deps();d.verify=async()=>verification;
      expect((await assistantConsentWith(d,input)).ok).toBe(false);expect(d.rpc).not.toHaveBeenCalled();expect(d.provision).not.toHaveBeenCalled();
    }
  });
  it('uses separate tokens for owner grants and assistant consent and cleans up locally',async()=>{
    const d=deps();const r=await assistantConsentWith(d,input);expect(r.ok).toBe(true);
    expect(d.provision).toHaveBeenCalledWith(owner,'chatgpt');expect(d.mint).toHaveBeenCalledWith(agent);
    expect(d.auth).toHaveBeenCalledWith('/oauth/authorizations/request','internal-token');
    expect(d.auth).toHaveBeenCalledWith('/oauth/authorizations/request/consent','internal-token',{action:'approve'});
    expect(d.rpc).toHaveBeenLastCalledWith('owner-token','canx_approve_office_work',{_authorization_id:'request',_identity:'chatgpt'});
    expect(d.endSession).toHaveBeenCalledExactlyOnceWith('internal-token');expect(JSON.stringify(r)).not.toContain('internal-token');
  });
  it('reuses a bound identity without creating another',async()=>{
    const d=deps();d.rpc=vi.fn(async(_t,name)=>name==='canx_mcp_consent_preview'?{...details,assistant_user_id:agent}:client);
    expect((await assistantConsentWith(d,input)).ok).toBe(true);expect(d.provision).not.toHaveBeenCalled();expect(d.mint).toHaveBeenCalledWith(agent);
  });
  it('handles Supabase auto-approval only after explicit owner approval',async()=>{
    const d=deps();d.auth=vi.fn(async()=>({ok:true,body:{redirect_url:'https://client.example/callback?code=code&state=state'}}));
    expect((await assistantConsentWith(d,input)).ok).toBe(true);expect(d.auth).toHaveBeenCalledTimes(1);
    expect(d.rpc).toHaveBeenLastCalledWith('owner-token','canx_approve_office_work',expect.any(Object));
  });
  it('withholds redirects on failed grant persistence and always ends the internal session',async()=>{
    const d=deps();d.rpc=async(_t,name)=>name==='canx_mcp_consent_preview'?details:name==='canx_mcp_bind_identity'?agent:false;
    const r=await assistantConsentWith(d,input);expect(r.ok).toBe(false);expect(r).not.toHaveProperty('redirect');expect(d.endSession).toHaveBeenCalledWith('internal-token');
  });
  it('rejects owner identities, changed mappings and foreign Auth response identities',async()=>{
    for(const tamper of ['owner','mapping','response']){
      const d=deps();
      if(tamper==='owner')d.provision=async()=>owner;
      if(tamper==='mapping')d.rpc=async(_t,name)=>name==='canx_mcp_consent_preview'?details:owner;
      if(tamper==='response')d.auth=async()=>({ok:true,body:details});
      expect((await assistantConsentWith(d,input)).ok).toBe(false);
    }
  });
  it('rejects request, client, callback, scope and error redirects',async()=>{
    for(const body of [{...details,user:{id:agent},authorization_id:'other'},{...details,user:{id:agent},client:{id:owner,name:'Other'}},{...details,user:{id:agent},scope:'openid unknown'},{redirect_url:'https://evil.example/callback?code=x'},{redirect_url:'https://client.example/callback?error=access_denied'},{redirect_url:'https://client.example/callback'}]){
      const d=deps();d.auth=async()=>({ok:true,body});expect((await assistantConsentWith(d,input)).ok).toBe(false);
    }
  });
  it('hides credentials and raw exceptions',async()=>{
    const d=deps();d.mint=async()=>{throw Error('secret admin-token');};const r=await assistantConsentWith(d,input);
    expect(r.ok).toBe(false);expect(JSON.stringify(r)).not.toContain('admin-token');
  });
});
