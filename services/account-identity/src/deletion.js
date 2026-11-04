import {randomUUID} from 'node:crypto';

// C232 v3 restoration; archive/purge lives in archive.js.
export async function requestRestoration(db,userId,generation) {
 const job=await db.query("SELECT id FROM account_identity_deletions WHERE user_id=$1 AND status='soft_deleted' AND flow_version IN(2,3) AND restore_until>clock_timestamp() FOR UPDATE",[userId]);
 if(!job.rowCount)throw Object.assign(Error('RESTORE_UNAVAILABLE'),{status:409});
 const owner=await db.query("SELECT u.id FROM users u JOIN player_login_sessions s ON s.user_id=u.id WHERE u.id=$1 AND s.generation=$2 FOR UPDATE OF u",[userId,generation]);
 if(!owner.rowCount)throw Object.assign(Error('IDENTITY_CHANGED'),{status:409});
 const valid=await db.query("SELECT 1 FROM account_identity_deletions WHERE id=$1 AND restore_until>clock_timestamp()",[job.rows[0].id]);
 if(!valid.rowCount)throw Object.assign(Error('RESTORE_UNAVAILABLE'),{status:409});
 await db.query("INSERT INTO account_restoration_requests(id,deletion_id,user_id,generation,status) VALUES($1,$2,$3,$4,'pending') ON CONFLICT (deletion_id) WHERE status='pending' DO NOTHING",[randomUUID(),job.rows[0].id,userId,generation]);
 return {success:true,status:'pending_review',message:'Đã gửi yêu cầu phục hồi. Tài khoản vẫn chờ xóa cho đến khi admin duyệt trước thời hạn trên biên nhận.'};
}

export async function restoreAccount(db,userId,generation) {
 // Worker and restore acquire this same row lock before changing terminal eligibility.
 const {rows}=await db.query("SELECT id FROM account_identity_deletions WHERE user_id=$1 AND status='soft_deleted' AND flow_version IN(2,3) AND restore_until>NOW() FOR UPDATE",[userId]);
 if(!rows.length)throw Object.assign(Error('RESTORE_UNAVAILABLE'),{status:409});
 const owner=await db.query('SELECT u.id FROM users u JOIN player_login_sessions s ON s.user_id=u.id WHERE u.id=$1 AND s.generation=$2 FOR UPDATE OF u',[userId,generation]);
 if(!owner.rowCount)throw Object.assign(Error('IDENTITY_CHANGED'),{status:409});
 // Recheck wall-clock deadline after waiting for the owner lock.
 const changed=await db.query("UPDATE account_identity_deletions SET status='cancelled',updated_at=NOW() WHERE id=$1 AND restore_until>clock_timestamp() RETURNING id",[rows[0].id]);
 if(!changed.rowCount)throw Object.assign(Error('RESTORE_UNAVAILABLE'),{status:409});
 await db.query("UPDATE account_link_state SET status='active' WHERE user_id=$1 AND status='deleting'",[userId]);
 // Invalidates pending links/session ownership; ordinary next login issues a new generation.
 await db.query("UPDATE player_login_sessions SET generation=$2 WHERE user_id=$1",[userId,'restored-'+rows[0].id]);
 await db.query('UPDATE account_identity_challenges SET consumed_at=NOW() WHERE user_id=$1 AND consumed_at IS NULL',[userId]);
 return {success:true,message:'Đạo hữu đã khôi phục tài khoản. Hãy đăng nhập lại để tiếp tục hành trình.'};
}
