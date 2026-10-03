grant delete on public.office_files, public.office_links to authenticated;
create policy office_files_owner_delete on public.office_files for delete to authenticated
using (owner_id=(select auth.uid()) and public.has_role((select auth.uid()),'owner') and (room <> 'finance' or (select auth.jwt()->>'aal')='aal2'));
create policy office_links_owner_delete on public.office_links for delete to authenticated
using (owner_id=(select auth.uid()) and public.has_role((select auth.uid()),'owner') and (room <> 'finance' or (select auth.jwt()->>'aal')='aal2'));
