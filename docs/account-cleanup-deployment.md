# Account cleanup and friend Realtime deployment

Apply `20260907000914_atomic_account_group_cleanup_and_profile_cascade.sql`
before deploying the account reset/delete API changes. It adds the
service-role-only `cleanup_account_groups(uuid)` RPC and corrects the
`profiles.id` foreign key to `auth.users(id) ON DELETE CASCADE`.
The APIs fail before Storage or account-data deletion if that RPC is unavailable.
Group cleanup checks membership under row locks and deletes parent groups in one
transaction; membership cleanup uses the existing `group_members.group_id`
cascade. Deploy the earlier `20260807133000_atomic_delete_group.sql` first if it
has not already been applied.

The API no longer deletes the profile before calling Auth `admin.deleteUser`.
If Auth deletion fails, its database transaction keeps the user and profile
together, and the same account can retry. Earlier Storage and per-table cleanup
steps remain idempotent, but are separate transactions: an error does not restore
data already removed by those steps. Long-term tasks/subtasks are removed by
their existing Auth foreign-key cascades after a successful hard deletion.

Apply `20260907001518_publish_friend_profile_and_study_session_updates.sql`
to provision the `profiles` and `study_sessions` Realtime publication membership
needed by friend status and study-total refresh. It preserves existing membership
and skips installations without a `supabase_realtime` publication. Validate both
memberships before enabling this flow on a new Supabase project.

Run `scripts/test-supabase-security.ps1` against its isolated local database.
The account cleanup tests cover RPC access, blocked shared groups, multi-group
rollback, retry, profile/Auth rollback, and long-term cascades. The publication
tests cover both friend update streams. Route tests additionally inject a
temporary Auth failure and a cleanup RPC failure.

## Storage ownership inventory — 2026-10-03

Apply `20261003050327_account_storage_cleanup_inventory.sql` before deploying
the updated account routes. It adds
`public.list_account_storage_objects(uuid, uuid, integer)`, callable only by
`service_role`. The function also checks the JWT role, fixes its search path to
empty, and only reads `storage.objects`; it never changes metadata or blobs.
The migration does not delete, rename, or backfill existing uploads.

Storage `list()` does not return `owner` and only lists one folder level. The
account routes now use this RPC to enumerate actual ownership with UUID keyset
pagination. A nonempty `owner_id` takes precedence, with legacy `owner` used only
when `owner_id` is missing or empty. Neither a filename prefix, feedback URL,
nor custom object metadata establishes ownership.

Before removing any blob, the helper validates the complete inventory. Only
owned objects in `feedback-uploads` under a safe `<userId>/` path can be removed;
safe nested and legacy filenames within that namespace are supported. A file
under that prefix owned by another account is never selected. An owned file
outside that namespace, in another bucket, or with an unsafe path blocks cleanup
with `storage_unverified_objects` (`retryable: false`). Such legacy files require
explicit operational review; they are not silently skipped or automatically
moved/deleted. No paths or ownership identifiers are included in the error body.

Validated objects are deleted through the Storage API in batches of 100. A final
inventory probe must find zero owned objects before account-table cleanup can
proceed. RPC/Storage failures and remaining objects produce retryable failures;
an HTTP success from Storage alone is insufficient. The existing group cleanup
still runs first, so a later Storage failure does not restore solo groups already
removed. Storage, group cleanup, per-table deletion, and Auth deletion remain
separate transactions; concurrent uploads after the final probe and later Auth
errors cannot be rolled back as one operation.

Run `supabase/tests/account_storage_cleanup.test.sql` in the isolated SQL harness
for ownership precedence, all-bucket discovery, pagination, argument validation,
fixed search path, and role checks. The TypeScript helper/route tests additionally
cover the real ownerless Storage list shape, nested paths, ownership mismatch,
partial deletion and retry, silent no-op removal, final verification failure,
and stopping before account-table deletion. The exact RPC allowlists in the
authorization tests and read-only postflight include the new service-only RPC.

The reset route also clears `profiles.study_session_id` and
`study_session_offset` after applying
`20261003050354_shared_timer_session_progress.sql`. Private progress tombstones
remain intact so delayed requests from another device cannot recreate erased
study time; the next timer starts with a fresh logical session identity.

References: [Storage list](https://supabase.com/docs/reference/javascript/file-buckets-list),
[Storage ownership](https://supabase.com/docs/guides/storage/security/ownership),
[Storage deletion](https://supabase.com/docs/guides/storage/management/delete-objects),
[Auth user deletion](https://supabase.com/docs/guides/auth/managing-user-data).

## Production migration record — 2026-09-07

Both migrations were applied to the active production project `fomopomo`
(`pqfozgiprhizwavfhjgv`, PostgreSQL 17.6) before merging the application changes.
The project was confirmed against the public production site's Supabase host
and the repository's linked project. `.env.local` points to the separate,
inactive `fomopomo-dev` project and was not used to select the rollout target.

| Source migration | Recorded production version |
| --- | --- |
| `20260907000914_atomic_account_group_cleanup_and_profile_cascade.sql` | `20260907093048` |
| `20260907001518_publish_friend_profile_and_study_session_updates.sql` | `20260907093058` |

The migration API assigns the production version at application time. Match the
migration names and this record when checking history; do not replay the legacy
migration chain or reapply an equivalent migration solely because its source
filename has a different timestamp.

Read-only verification confirmed all 52 repository postflight checks, profile
and membership cascades, service-role-only access to the new cleanup RPC, its
empty search path, and both Realtime publication entries. No user cleanup RPC,
account deletion, or Storage mutation was executed to test the rollout.

The hosted security advisor still reports the existing authenticated
`SECURITY DEFINER` RPCs (covered by the exact allowlist), the intentionally
client-inaccessible `debug_logs` table, and disabled leaked-password protection.
The new cleanup RPC is not exposed to browser roles. References:
[RPC advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable),
[password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
