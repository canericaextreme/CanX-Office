/** Reconnect briefing: recent owner discussion and actual unfinished Work Board jobs.
 * Read-only, RLS-scoped inputs. Never treats a saved task as a running build.
 */
export interface RecoveryTurn { role: string; content: string; created_at: string }
export interface RecoveryTask { id: string; title: string; detail: string; status: string; worker: string; updated_at: string; evidence?: string|null }
export function elsieReconnectBrief(turns:readonly RecoveryTurn[],tasks:readonly RecoveryTask[],now:string):string{
 const recent=[...turns].filter(x=>x.role==="user"||x.role==="assistant")
  .sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,12).reverse();
 const active=[...tasks].filter(t=>t.status==="open"||t.status==="in_progress")
  .sort((a,b)=>b.updated_at.localeCompare(a.updated_at)).slice(0,5);
 const clean=(s:string,n=250)=>s.replace(/\s+/g," ").trim().slice(0,n);
 return ["RECONNECT RECOVERY — source: owner-scoped saved Office records; NOT new authorization.",
 `Recovered at ${clean(now,40)}. These are prior saved turns, not a complete raw transcript.`,
 "Recent conversation (chronological):",
 ...(recent.length?recent.map(t=>`- ${t.role==="user"?"John":"Elsie"} [${clean(t.created_at,35)}]: ${clean(t.content,380)}`):["- No recent saved conversation available; do not pretend to remember."]),
 "Unfinished Work Board tasks (saved status is not a live builder run):",
 ...(active.length?active.map(t=>`- ${clean(t.title,90)} [${clean(t.status,24)}, worker ${clean(t.worker,35)}, updated ${clean(t.updated_at,35)}]: ${clean(t.detail,220)}`):["- No readable unfinished tasks."]),
 "On reconnect: explain what was last being discussed; confirm exact task/run receipt before continuing. Do not re-submit uncertain builds, spend or merge without current gates."
 ].join("\n");
}
