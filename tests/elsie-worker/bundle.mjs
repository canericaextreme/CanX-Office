// Review/build only. Does not deploy, set secrets, or enable the scheduler.
import {build} from 'rolldown';
import {mkdir,writeFile} from 'node:fs/promises';
const out=process.argv[2];
if(!out)throw Error('Choose a scratch output directory');
await mkdir(out,{recursive:true});
await build({input:'src/lib/elsie-worker-edge.server.ts',platform:'neutral',output:{file:`${out}/worker.js`,format:'esm'}});
await writeFile(`${out}/index.ts`,await (await import('node:fs/promises')).readFile('supabase/functions/elsie-extended-worker/index.ts','utf8'));
