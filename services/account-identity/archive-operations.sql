-- Additive C250 schema. Role installation is a separate privileged DBA step.
ALTER TABLE account_retention_archives ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS account_archive_restore_gate(
 singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(singleton),state TEXT NOT NULL CHECK(state IN('ready','blocked')),
 checkpoint_digest TEXT,report JSONB NOT NULL DEFAULT '{}',updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO account_archive_restore_gate(singleton,state) VALUES(TRUE,'ready') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS account_archive_recovered_audit(
 checkpoint_digest TEXT NOT NULL,source_audit_id BIGINT NOT NULL,event JSONB NOT NULL,
 recovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(checkpoint_digest,source_audit_id)
);
CREATE OR REPLACE VIEW account_archive_operations_summary WITH(security_barrier=true) AS
 SELECT d.status,count(*) AS jobs,count(a.deletion_id) AS archives,count(a.expired_at) AS expired_archives
 FROM account_identity_deletions d LEFT JOIN account_retention_archives a ON a.deletion_id=d.id GROUP BY d.status;
CREATE OR REPLACE VIEW account_archive_expiry_policy WITH(security_barrier=true) AS
 SELECT snapshot#>'{system,account_archive_operations}' AS policy FROM remote_config_releases ORDER BY config_version DESC LIMIT 1;
CREATE OR REPLACE VIEW account_archive_expiry_candidates WITH(security_barrier=true) AS
 SELECT a.deletion_id,a.retain_until FROM account_retention_archives a JOIN account_identity_deletions j ON j.id=a.deletion_id
 WHERE a.expired_at IS NULL AND a.retain_until<=NOW() AND NOT a.hold AND NOT j.hold AND j.status='gameplay_purged'
 AND EXISTS(SELECT 1 FROM account_archive_restore_gate WHERE singleton=TRUE AND state='ready')
 AND NOT EXISTS(SELECT 1 FROM account_archive_holds h WHERE h.deletion_id=j.id AND h.released_at IS NULL AND h.action IN('all','identity_expiry'));

CREATE OR REPLACE FUNCTION account_archive_rotate_commit(jid UUID,expected_digest TEXT,new_key_id TEXT,new_payload TEXT,new_digest TEXT,case_ref TEXT)
 RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $body$
DECLARE a public.account_retention_archives%ROWTYPE;
BEGIN
 IF NOT pg_has_role(session_user,'c250_archive_rotation','MEMBER') THEN RAISE EXCEPTION 'Archive role denied' USING ERRCODE='42501'; END IF;
 IF new_key_id!~'^[A-Za-z0-9_-]{1,64}$' OR length(case_ref)<4 OR length(new_payload)<54 OR new_digest<>encode(sha256(convert_to(new_payload,'UTF8')),'hex') THEN RAISE EXCEPTION 'Invalid rotation'; END IF;
 PERFORM id FROM public.account_identity_deletions WHERE id=jid FOR UPDATE;
 SELECT * INTO a FROM public.account_retention_archives WHERE deletion_id=jid FOR UPDATE;
 IF NOT FOUND OR a.expired_at IS NOT NULL OR a.payload='' OR a.content_digest IS DISTINCT FROM expected_digest THEN RAISE EXCEPTION 'Archive changed or expired'; END IF;
 IF a.key_id=new_key_id THEN RETURN FALSE; END IF;
 UPDATE public.account_retention_archives SET key_id=new_key_id,payload=new_payload,content_digest=new_digest WHERE deletion_id=jid;
 INSERT INTO public.account_archive_audit(deletion_id,action,result) VALUES(jid,'key_rotated',jsonb_build_object('actor',session_user,'case_reference',case_ref,'from_key_id',a.key_id,'to_key_id',new_key_id));
 RETURN TRUE;
END $body$;

CREATE OR REPLACE FUNCTION account_archive_expire(jid UUID,case_ref TEXT) RETURNS BOOLEAN
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $body$
DECLARE j public.account_identity_deletions%ROWTYPE; a public.account_retention_archives%ROWTYPE; p JSONB;
BEGIN
 IF NOT pg_has_role(session_user,'c250_archive_expiry','MEMBER') THEN RAISE EXCEPTION 'Archive role denied' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.account_archive_restore_gate WHERE singleton=TRUE AND state='ready') THEN RAISE EXCEPTION 'Restore gate closed'; END IF;
 SELECT snapshot#>'{system,account_archive_operations}' INTO p FROM public.remote_config_releases ORDER BY config_version DESC LIMIT 1;
 IF p->'schema_version' IS DISTINCT FROM '1'::jsonb OR p->'enabled' IS DISTINCT FROM 'true'::jsonb OR p#>'{identity_expiry,enabled}' IS DISTINCT FROM 'true'::jsonb
  OR jsonb_typeof(p->'revision') IS DISTINCT FROM 'string' OR length(trim(COALESCE(p->>'revision','')))=0
  OR jsonb_typeof(p#>'{identity_expiry,approval_reference}') IS DISTINCT FROM 'string'
  OR length(trim(COALESCE(p#>>'{identity_expiry,approval_reference}','')))<4 OR lower(trim(p#>>'{identity_expiry,approval_reference}')) IN('pending','draft','none')
  OR jsonb_typeof(p#>'{identity_expiry,approved_by}') IS DISTINCT FROM 'string'
  OR length(trim(COALESCE(p#>>'{identity_expiry,approved_by}','')))<2 OR p#>>'{identity_expiry,effective_at}' IS NULL
  OR (p#>>'{identity_expiry,effective_at}')::timestamptz>clock_timestamp() OR length(case_ref)<4 THEN RAISE EXCEPTION 'Expiry policy not approved'; END IF;
 SELECT * INTO j FROM public.account_identity_deletions WHERE id=jid FOR UPDATE;
 IF NOT FOUND OR j.flow_version<>3 OR j.status<>'gameplay_purged' OR j.hold OR j.identity_released_at IS NULL THEN RETURN FALSE; END IF;
 SELECT * INTO a FROM public.account_retention_archives WHERE deletion_id=jid FOR UPDATE;
 IF NOT FOUND OR a.expired_at IS NOT NULL OR a.retain_until>clock_timestamp() OR a.hold THEN RETURN FALSE; END IF;
 IF EXISTS(SELECT 1 FROM public.account_archive_holds WHERE deletion_id=jid AND released_at IS NULL AND action IN('all','identity_expiry')) THEN RETURN FALSE; END IF;
 UPDATE public.account_retention_archives SET payload='',key_id=NULL,content_digest=NULL,expired_at=clock_timestamp() WHERE deletion_id=jid;
 INSERT INTO public.account_archive_audit(deletion_id,action,result) VALUES(jid,'identity_archive_expired',jsonb_build_object('actor',session_user,'case_reference',case_ref,'policy_revision',p->>'revision','approval_reference',p#>>'{identity_expiry,approval_reference}'));
 RETURN TRUE;
END $body$;

CREATE OR REPLACE FUNCTION account_archive_manage(jid UUID,operation TEXT,hold_scope TEXT,hid UUID,case_ref TEXT)
 RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $body$
DECLARE j public.account_identity_deletions%ROWTYPE; new_id UUID; changed INT;
BEGIN
 IF NOT pg_has_role(session_user,'c250_archive_hold','MEMBER') THEN RAISE EXCEPTION 'Archive role denied' USING ERRCODE='42501'; END IF;
 IF length(case_ref)<4 THEN RAISE EXCEPTION 'Case reference required'; END IF;
 SELECT * INTO j FROM public.account_identity_deletions WHERE id=jid FOR UPDATE;
 IF NOT FOUND OR j.flow_version<>3 THEN RAISE EXCEPTION 'V3 job required'; END IF;
 IF operation='hold' THEN
  IF hold_scope NOT IN('all','archive','gameplay_purge','identity_expiry') OR hid IS NULL THEN RAISE EXCEPTION 'Invalid scope/id'; END IF;
  INSERT INTO public.account_archive_holds(id,deletion_id,action,actor,reason) VALUES(hid,jid,hold_scope,session_user,case_ref);new_id=hid;
 ELSIF operation='release' THEN
  UPDATE public.account_archive_holds SET released_at=clock_timestamp(),released_by=session_user WHERE id=hid AND deletion_id=jid AND released_at IS NULL RETURNING action INTO hold_scope;
  GET DIAGNOSTICS changed=ROW_COUNT;IF changed<>1 THEN RAISE EXCEPTION 'Active hold required'; END IF;new_id=hid;
 ELSIF operation='retry' THEN
  IF j.status NOT IN('archive_failed','manual_review','gameplay_review') THEN RAISE EXCEPTION 'Review/retry job required'; END IF;
  UPDATE public.account_identity_deletions SET status=CASE WHEN identity_released_at IS NULL THEN 'archive_failed' ELSE 'archived' END,attempts=0,next_attempt_at=NOW(),last_error_code=NULL WHERE id=jid;
 ELSE RAISE EXCEPTION 'Invalid operation'; END IF;
 INSERT INTO public.account_archive_audit(deletion_id,action,result) VALUES(jid,'operator_'||operation,jsonb_build_object('actor',session_user,'case_reference',case_ref,'scope',hold_scope));
 UPDATE public.account_archive_worker_state SET next_run_at=NOW() WHERE name='gameplay';
 RETURN jsonb_build_object('success',TRUE,'hold_id',new_id,'scope',hold_scope,'retry_queued',operation='retry');
END $body$;
REVOKE ALL ON FUNCTION account_archive_rotate_commit(UUID,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION account_archive_expire(UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION account_archive_manage(UUID,TEXT,TEXT,UUID,TEXT) FROM PUBLIC;
REVOKE ALL ON account_retention_archives,account_archive_holds,account_archive_audit,account_archive_restore_gate FROM PUBLIC;
REVOKE ALL ON account_archive_recovered_audit FROM PUBLIC;
REVOKE ALL ON account_archive_expiry_policy,account_archive_expiry_candidates FROM PUBLIC;
