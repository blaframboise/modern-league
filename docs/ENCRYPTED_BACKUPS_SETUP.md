# Modern League Free-tier encrypted backups

**Status: configuration and restore verification required.** Workflow: `.github/workflows/encrypted-supabase-backup.yml`. Once configured, it runs daily and uploads a 30-day encrypted GitHub Actions artifact. Do not publish plaintext dumps or commit them to this public repository.

## Owner setup

1. Install [age](https://age-encryption.org/) on a trusted computer. Generate an identity: `age-keygen -o modern-league-backup-key.txt`. Keep that **private key** offline in two secure places, including a password manager or encrypted drive. Never share it in chat or commit it.
2. Copy only the public recipient starting with `age1`. Under GitHub **Settings → Secrets and variables → Actions → Variables**, create `BACKUP_AGE_RECIPIENT` and paste the public value.
3. In your Supabase project, use **Connect → Session pooler** to get a PostgreSQL connection URL (the session pooler is IPv4 compatible with GitHub runners). Under GitHub **Settings → Secrets and variables → Actions → Secrets**, create `SUPABASE_DB_URL` containing the full URL with password. Never paste it in chat or code.
4. On GitHub, open **Actions → Encrypted Supabase database backup → Run workflow** on main. Confirm a successful run and a `.tar.gz.age` artifact. Daily scheduled runs follow.
5. Download the encrypted artifact to your trusted computer. Decrypt using `age -d -i modern-league-backup-key.txt -o backup.tar.gz downloaded-file.tar.gz.age`, extract, and verify `roles.sql`, `schema.sql`, and `data.sql` are not empty.
6. **Restore into a separate disposable Supabase/PostgreSQL instance** following the [Supabase backup/restore guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore). Never restore over production to test. Reconcile row counts and settings. This final restore step is required before marking backup readiness passed.

## Safety and limitations

- Supabase Free has no guaranteed automatic database backups. The GitHub workflow is an external scheduled backup, not a paid subscription.
- The repository is public. The workflow encrypts the full export **before** uploading any artifact. The private age identity must never be placed in GitHub. Losing it makes every encrypted artifact unreadable.
- Artifacts expire after 30 days. Periodically retain encrypted copies off GitHub.
- GitHub schedules can be delayed or missed, and Supabase Free projects can pause after inactivity. Check Action success after each official tournament.
- Database dumps include metadata but **not screenshot image bytes** from Supabase Storage. Establish separate evidence-file exports before relying on disaster recovery.
- A successful dump/encrypted artifact is **not a proven restore**. Verify one isolated restoration before launch.

## January 1 test result

The synthetic tournament `9efa701f-9bc0-45c7-8b51-abb8c2db1af4` (nine private player results) is approved for removal from TEST STANDINGS. Preserve screenshot draft `50e05e52-554d-46cc-99a4-de92a1dfb8ae` and its immutable correction/evidence history. Cleanup should be a single scoped transaction after obtaining a usable recovery copy. Neither the public leaderboard nor the official 2027 ledger contains this test event.
