# Document knowledge

Long source texts are kept separately from conversation summaries. The Brain room accepts DOCX, TXT and Markdown (8 MB file / 2 million extracted characters). DOCX imports use plain-text extraction; retain the original file for pictures, formatting, links and comments. Import is atomic, owner scoped, requires owner MFA, deduplicates identical filename/project/text, and verifies reconstruction before returning success. Changed text creates a new immutable version.

Astra's shared text/voice reasoning path reads the private catalogue and retrieves up to eight numbered sections by keyword or section range. Explicit whole-document requests supply the complete text when the selected document is at most 180,000 characters. Larger documents use bounded section batches with explicit partial-coverage notices. This is source retrieval, not an autonomous exhaustive review job. The answer receipt includes source version and coverage. Stored source text is untrusted evidence, never instructions or authorization.

Read access uses the signed-in owner's token and RLS. Other users and anonymous callers cannot read source text. No service-role key, public bucket, embeddings subscription or external posting permission is introduced. The import RPC is SECURITY INVOKER. It does not change existing memory or source files.

Validation: TypeScript, production build, document coverage tests and existing manager tests; database reconstruction and RLS checks. Live authenticated browser/voice behavior still requires verification after deployment. Existing Supabase security advisories for older functions and leaked-password settings remain outside this change; the new document tables/functions introduced no advisor findings.

Supabase references: https://supabase.com/docs/guides/database/postgres/row-level-security and https://supabase.com/docs/guides/database/full-text-search . Existing function advisory: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable .
