-- DBA-only, never executed by a least-privileged service startup.
DO $roles$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='c250_archive_reader') THEN CREATE ROLE c250_archive_reader NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='c250_archive_hold') THEN CREATE ROLE c250_archive_hold NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='c250_archive_rotation') THEN CREATE ROLE c250_archive_rotation NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='c250_archive_expiry') THEN CREATE ROLE c250_archive_expiry NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='c250_archive_restore') THEN CREATE ROLE c250_archive_restore NOLOGIN; END IF;
END $roles$;
DO $review$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN('c250_archive_reader','c250_archive_hold','c250_archive_rotation','c250_archive_expiry','c250_archive_restore')
  AND (rolcanlogin OR rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls)) THEN RAISE EXCEPTION 'Archive role drift requires DBA review'; END IF;
END $review$;
GRANT USAGE ON SCHEMA public TO c250_archive_reader,c250_archive_hold,c250_archive_rotation,c250_archive_expiry;
GRANT SELECT ON account_archive_operations_summary TO c250_archive_reader;
GRANT SELECT ON account_retention_archives TO c250_archive_rotation;
GRANT EXECUTE ON FUNCTION account_archive_rotate_commit(UUID,TEXT,TEXT,TEXT,TEXT,TEXT) TO c250_archive_rotation;
GRANT EXECUTE ON FUNCTION account_archive_manage(UUID,TEXT,TEXT,UUID,TEXT) TO c250_archive_hold;
GRANT EXECUTE ON FUNCTION account_archive_expire(UUID,TEXT) TO c250_archive_expiry;
GRANT SELECT ON account_archive_expiry_policy,account_archive_expiry_candidates TO c250_archive_expiry;
REVOKE ALL ON FUNCTION account_gameplay_cleanup_v1(UUID) FROM PUBLIC;
