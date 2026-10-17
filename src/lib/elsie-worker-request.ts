/** Handler skeleton for future owner-authorized and budget-reserved worker.
 * No dispatch capability is exposed until secure grant and ledger connectors ship.
 */
export interface WorkerRequest { mode: string; repository?:string; pr?:number; sha?:string }
export function validateWorkerRequest(value: unknown): {ok:true;request:WorkerRequest}|{ok:false;status:number;reason:string}{
 if(!value||typeof value!=="object")return{ok:false,status:400,reason:"Malformed body"};
 const data=value as Record<string,unknown>;
 if(data.mode!=="merge"&&data.mode!=="poll")return{ok:false,status:400,reason:"Unknown event"};
 if(data.mode==="merge"&&!(data.repository==="canericaextreme/CanX-Office"&&Number.isSafeInteger(data.pr)&&Number(data.pr)>0&&typeof data.sha==="string"&&/^[a-f0-9]{40}$/i.test(data.sha)))return{ok:false,status:400,reason:"Invalid merge reference"};
 return{ok:true,request:data as WorkerRequest};
}
/** Fail-closed until durable job grants/leases and provider reservations are verified. */
export function workerActivationState(config:{enabled:boolean;scopedGrantVerified:boolean;ledgerVerified:boolean;leaseVerified:boolean}){
 return config.enabled&&config.scopedGrantVerified&&config.ledgerVerified&&config.leaseVerified ?
  {ready:true as const} : {ready:false as const,reason:"Worker dispatch disabled: authorization, budget or lease not verified"};
}
