/** Owner-token Auth requests use the same portable timeout mechanism as Office reads. */
export async function requestConsentDetails(config:{url:string;publishableKey:string},path:string,token:string,body?:unknown,fetchImpl:typeof fetch=fetch) {
  if(!/^\/oauth\/authorizations\/[A-Za-z0-9_-]{1,200}(\/consent)?$/.test(path))return {ok:false,status:0,body:null};
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),10000);
  try {
    const response=await fetchImpl(`${config.url}/auth/v1${path}`,{
      method:body===undefined?"GET":"POST",redirect:"error",signal:controller.signal,
      headers:{apikey:config.publishableKey,Authorization:`Bearer ${token}`,"Content-Type":"application/json","X-Supabase-Api-Version":"2024-01-01"},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
    });
    return {ok:response.ok,status:response.status,body:await response.json().catch(()=>null)};
  }catch(error){
    const timeout=controller.signal.aborted;
    return {ok:false,status:0,body:null,transportFailure:timeout?"timeout":"network_or_runtime"};
  }finally{clearTimeout(timer);}
}
