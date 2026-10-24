-- John requested increasing normal Office viewing capacity, 23 October 2026.
-- Keep permissions, spending limits, request lifetimes and auditing unchanged.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('canx_private.view_request_make(uuid,text,text,text,text,text)'::regprocedure);
  if position('if recent >= 120 then' in definition) > 0 then return; end if;
  if position('if recent >= 30 then' in definition) = 0 then
    raise exception 'Unexpected Office viewing limit definition; review before changing it';
  end if;
  execute replace(definition, 'if recent >= 30 then', 'if recent >= 120 then');
end $$;
