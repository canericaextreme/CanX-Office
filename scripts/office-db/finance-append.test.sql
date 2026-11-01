-- Database test for 20261101031000_finance_receipts_append_only.sql, run on a throwaway local Postgres
-- by finance-append.nodetest.mjs. Minimal stand-ins replace Supabase's auth and the Office grant.
\set ON_ERROR_STOP 1
create role authenticated;
create role anon;
create schema auth;
create schema canx_private;
create function auth.jwt() returns jsonb language sql as $$ select '{"client_id":"00000000-0000-0000-0000-0000000000c1"}'::jsonb $$;
create function canx_private.mcp_owner() returns uuid language sql as $$ select '00000000-0000-0000-0000-00000000000a'::uuid $$;
create function canx_private.mcp_work_active() returns boolean language sql as $$ select coalesce(current_setting('test.grant',true),'on')='on' $$;
create table public.finance_receipts(owner_id uuid primary key, doc jsonb not null default '{"kind":"canx-finance-receipts","receipts":[],"schemaVersion":1}', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), ingested_receipts jsonb not null default '[]');
create table public.office_audit(id bigserial primary key, owner_id uuid, action text, entity text, entity_id text, detail jsonb default '{}', at timestamptz default now());

\i :migration

-- Helpers: a realistic receipt of about 800 bytes, and a list of them filled to a byte target.
create function pg_temp.receipt(_id text) returns jsonb language sql as $$
 select jsonb_build_object('id',_id,'vendor','Lovable Labs Incorporated','date','2026-08-30','total',224,'tax',24,'currency','USD','category','Software',
  'notes','Invoice W6JU2EYL-0010. Charged CA$326.99 at 1 USD = 1.4598 CAD, including a 4% conversion fee. GST $10.00 and BC PST $14.00. Payment method ending 9579.',
  'sourceUrl','https://mail.google.com/mail/u/?authuser=example#all/'||_id,'reviewStatus','needs-review','paymentStatus','paid','sourceMessageIds',jsonb_build_array(_id),
  'sourceEmailText',repeat('x',300)) $$;
create function pg_temp.fill(_bytes integer) returns jsonb language plpgsql as $$ declare l jsonb:='[]'; i integer:=0; begin
 while octet_length(l::text)<_bytes loop l:=l||jsonb_build_array(pg_temp.receipt('old-'||i)); i:=i+1; end loop; return l; end $$;
create function pg_temp.seed(_list jsonb) returns void language sql as $$
 delete from public.finance_receipts; delete from public.office_audit;
 insert into public.finance_receipts(owner_id,doc) values('00000000-0000-0000-0000-00000000000a',
  jsonb_build_object('kind','canx-finance-receipts','schemaVersion',1,'receipts',_list,'subscriptions',jsonb_build_array(jsonb_build_object('name','Keep me'))));
$$;
create function pg_temp.stored() returns jsonb language sql as $$ select doc from public.finance_receipts $$;
create function pg_temp.check(_ok boolean,_what text) returns void language plpgsql as $$ begin if not coalesce(_ok,false) then raise exception 'FAILED: %',_what; end if; raise notice 'ok - %',_what; end $$;

-- 1 and 2: the stored list is just under, then well over, the 12,000-byte limit (the real list held 11,704).
do $$ declare target integer; before jsonb; res jsonb; after jsonb; begin
 foreach target in array array[11500,13000,40000] loop
  perform pg_temp.seed(pg_temp.fill(target));
  before:=pg_temp.stored();
  res:=public.canx_append_finance_receipts(jsonb_build_array(pg_temp.receipt('new-1')));
  after:=pg_temp.stored();
  perform pg_temp.check(octet_length((before->'receipts')::text)>=target,format('[%s] list pre-filled to %s bytes',target,octet_length((before->'receipts')::text)));
  perform pg_temp.check((res->>'saved')::boolean and res->'appended'->0->>'id'='new-1',format('[%s] save succeeds',target));
  perform pg_temp.check(jsonb_array_length(after->'receipts')=jsonb_array_length(before->'receipts')+1,format('[%s] exactly one receipt added',target));
  perform pg_temp.check((select jsonb_agg(e.v order by e.n) from jsonb_array_elements(after->'receipts') with ordinality e(v,n) where e.n<=jsonb_array_length(before->'receipts'))=before->'receipts',format('[%s] old receipts unchanged and in order',target));
  perform pg_temp.check(after->'receipts'->-1=pg_temp.receipt('new-1'),format('[%s] new receipt stored last, exactly as sent',target));
  perform pg_temp.check((after-'receipts')=(before-'receipts'),format('[%s] subscriptions and other Finance keys untouched',target));
 end loop;
end $$;

-- 3: the common case, a small list.
do $$ declare res jsonb; begin
 perform pg_temp.seed(jsonb_build_array(pg_temp.receipt('a'),pg_temp.receipt('b')));
 res:=public.canx_append_finance_receipts(jsonb_build_array(pg_temp.receipt('c')));
 perform pg_temp.check((select jsonb_agg(e->>'id') from jsonb_array_elements(pg_temp.stored()->'receipts') e)='["a","b","c"]','small list saves a, b, c in order');
 perform pg_temp.check((res->>'countBefore')::int=2 and (res->>'countAfter')::int=3,'counts before and after reported');
end $$;

-- 4: twelve pending receipts, as one batch and then one at a time, on top of a full list.
do $$ declare batch jsonb:='[]'; i integer; before jsonb; begin
 perform pg_temp.seed(pg_temp.fill(11700)); before:=pg_temp.stored()->'receipts';
 for i in 1..12 loop batch:=batch||jsonb_build_array(jsonb_build_object('id','p-'||i,'vendor','Vendor '||i,'date','2026-10-0'||(i%9+1),'total',i*10.5,'notes','pending')); end loop;
 perform public.canx_append_finance_receipts(batch);
 perform pg_temp.check(jsonb_array_length(pg_temp.stored()->'receipts')=jsonb_array_length(before)+12,'batch of twelve saved on top of a full list');
 perform pg_temp.check((select jsonb_agg(e.v order by e.n) from jsonb_array_elements(pg_temp.stored()->'receipts') with ordinality e(v,n) where e.n>jsonb_array_length(before))=batch,'batch stored in the order sent');
 perform pg_temp.seed(pg_temp.fill(11700));
 for i in 1..12 loop perform public.canx_append_finance_receipts(jsonb_build_array(batch->(i-1))); end loop;
 perform pg_temp.check(jsonb_array_length(pg_temp.stored()->'receipts')=jsonb_array_length(before)+12,'twelve saved one at a time');
end $$;

-- 5: a retry never duplicates; an already saved id is reported, not rewritten.
do $$ declare res jsonb; begin
 perform pg_temp.seed(jsonb_build_array(pg_temp.receipt('a')));
 res:=public.canx_append_finance_receipts(jsonb_build_array(jsonb_build_object('id','a','vendor','Changed vendor'),pg_temp.receipt('b')));
 perform pg_temp.check(res->'alreadySaved'='["a"]' and jsonb_array_length(res->'appended')=1,'existing id skipped, new one added');
 perform pg_temp.check(pg_temp.stored()->'receipts'->0=pg_temp.receipt('a'),'existing receipt not overwritten by a retry');
 res:=public.canx_append_finance_receipts(jsonb_build_array(pg_temp.receipt('b')));
 perform pg_temp.check(jsonb_array_length(pg_temp.stored()->'receipts')=2 and (res->>'countAfter')::int=2,'full retry adds nothing');
 perform pg_temp.check((select count(*) from public.office_audit where action='office_mcp.finance_append')=2,'every call audited');
end $$;

-- 6: refusals change nothing.
do $$ declare before jsonb; bad jsonb; begin
 perform pg_temp.seed(jsonb_build_array(pg_temp.receipt('a'))); before:=pg_temp.stored();
 foreach bad in array array['{}'::jsonb,'[]',jsonb_build_array('text'::text),jsonb_build_array(jsonb_build_object('id','x')),jsonb_build_array(jsonb_build_object('vendor','no id')),
   jsonb_build_array(jsonb_build_object('id','d','vendor','v'),jsonb_build_object('id','d','vendor','v')),jsonb_build_array(jsonb_build_object('id','big','vendor','v','notes',repeat('z',12100)))] loop
  begin perform public.canx_append_finance_receipts(bad); raise exception 'FAILED: accepted %',left(bad::text,60);
  exception when others then if sqlerrm like 'FAILED%' then raise; end if; perform pg_temp.check(sqlerrm='Invalid receipts batch','refused '||left(bad::text,40)); end;
 end loop;
 perform set_config('test.grant','off',false);
 begin perform public.canx_append_finance_receipts(jsonb_build_array(pg_temp.receipt('z'))); raise exception 'FAILED: no grant accepted';
 exception when others then if sqlerrm like 'FAILED%' then raise; end if; perform pg_temp.check(sqlerrm='Office working grant required','refused without a working grant'); end;
 perform set_config('test.grant','on',false);
 perform pg_temp.check(pg_temp.stored()=before,'refused calls left Finance unchanged');
 delete from public.finance_receipts;
 begin perform public.canx_append_finance_receipts(jsonb_build_array(pg_temp.receipt('z'))); raise exception 'FAILED: missing row accepted';
 exception when others then if sqlerrm like 'FAILED%' then raise; end if; perform pg_temp.check(sqlerrm='Initialize Finance inside the Office before editing','no Finance row is never created here'); end;
end $$;

-- 7: only signed-in callers may run it.
do $$ begin perform pg_temp.check(not has_function_privilege('public','public.canx_append_finance_receipts(jsonb)','execute') and has_function_privilege('authenticated','public.canx_append_finance_receipts(jsonb)','execute'),'execute granted to signed-in callers only'); end $$;
\echo ALL FINANCE APPEND TESTS PASSED
