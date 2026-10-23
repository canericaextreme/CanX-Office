-- Run on PostgreSQL. Temporary fixture only; leaves production rows and schema untouched.
begin;
create temporary table brain_capacity_check (
  detail text constraint office_notes_detail_check check (char_length(detail) <= 2000)
);
do $$ begin
  begin
    insert into brain_capacity_check values (repeat('x', 2001));
    raise exception 'Old limit unexpectedly accepted 2001 characters';
  exception when check_violation then null; end;
end $$;
alter table brain_capacity_check
  drop constraint office_notes_detail_check,
  add constraint office_notes_detail_check check (char_length(detail) <= 12000);
insert into brain_capacity_check values
  (repeat('x', 2001)), (repeat('x', 11000)), (repeat('x', 12000)), (repeat('é', 11000));
do $$ begin
  if exists (select 1 from brain_capacity_check where detail <> repeat(left(detail, 1), char_length(detail))) then
    raise exception 'Full content readback differs';
  end if;
  begin
    insert into brain_capacity_check values (repeat('x', 12001));
    raise exception 'New limit unexpectedly accepted 12001 characters';
  exception when check_violation then null; end;
end $$;
select char_length(detail) as characters, octet_length(detail) as bytes from brain_capacity_check;
rollback;
