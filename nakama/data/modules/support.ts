// C264: ticket writes and receipts commit atomically in PostgreSQL.
const SUPPORT_CATEGORIES = ['account','payment','bug','report','other'];
const SUPPORT_STATUSES = ['new','in_progress','waiting_player','resolved','closed'];
const SUPPORT_UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function createSupportTables(nk:nkruntime.Nakama):void {
 nk.sqlExec(`CREATE TABLE IF NOT EXISTS support_tickets (
 id UUID PRIMARY KEY,owner_id UUID NOT NULL,server_id TEXT NOT NULL DEFAULT '',generation INT NOT NULL DEFAULT 0,
 character_name TEXT NOT NULL DEFAULT '',category TEXT NOT NULL,title TEXT NOT NULL,metadata JSONB NOT NULL DEFAULT '{}',
 status TEXT NOT NULL DEFAULT 'new',priority TEXT NOT NULL DEFAULT 'normal',assignee TEXT NOT NULL DEFAULT '',
 version INT NOT NULL DEFAULT 1,public_seq INT NOT NULL DEFAULT 0,player_read_seq INT NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),closed_at TIMESTAMPTZ);
 CREATE INDEX IF NOT EXISTS support_owner_idx ON support_tickets(owner_id,created_at DESC,id DESC);
 CREATE INDEX IF NOT EXISTS support_queue_idx ON support_tickets(status,assignee,created_at DESC);
 CREATE TABLE IF NOT EXISTS support_messages(id BIGSERIAL PRIMARY KEY,ticket_id UUID NOT NULL REFERENCES support_tickets(id),
 author_id UUID NOT NULL,author_kind TEXT NOT NULL,internal BOOLEAN NOT NULL DEFAULT FALSE,body TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 CREATE INDEX IF NOT EXISTS support_thread_idx ON support_messages(ticket_id,id);
 CREATE TABLE IF NOT EXISTS support_ticket_events(id BIGSERIAL PRIMARY KEY,ticket_id UUID NOT NULL REFERENCES support_tickets(id),actor_id UUID NOT NULL,action TEXT NOT NULL,detail JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS support_receipts(actor_id UUID NOT NULL,request_id UUID NOT NULL,fingerprint JSONB NOT NULL,result JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(actor_id,request_id));
 CREATE OR REPLACE FUNCTION support_mutate(actor UUID,is_admin BOOLEAN,operation TEXT,r JSONB,new_id UUID) RETURNS JSONB LANGUAGE plpgsql AS $$
 DECLARE t support_tickets%ROWTYPE; receipt support_receipts%ROWTYPE; result JSONB; next_status TEXT; note BOOLEAN; count_n INT;
 BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('support:'||actor::text,0));
 SELECT * INTO receipt FROM support_receipts WHERE actor_id=actor AND request_id=(r->>'request_id')::uuid;
 IF FOUND THEN
   IF receipt.fingerprint=jsonb_build_object('action',operation,'request',r-'character_name') THEN RETURN receipt.result; END IF;
   RETURN jsonb_build_object('success',false,'code',409,'message','Mã yêu cầu đã dùng cho nội dung khác.');
 END IF;
 IF operation='create' THEN
   SELECT COUNT(*) INTO count_n FROM support_tickets WHERE owner_id=actor AND created_at>NOW()-INTERVAL '24 hours';
   IF count_n>=5 OR (SELECT COUNT(*) FROM support_tickets WHERE owner_id=actor AND status NOT IN ('closed','resolved'))>=5 THEN RETURN jsonb_build_object('success',false,'code',429,'message','Đã đạt giới hạn 5 yêu cầu trong ngày hoặc đang mở.'); END IF;
   INSERT INTO support_tickets(id,owner_id,server_id,generation,character_name,category,title,metadata,public_seq,player_read_seq)
    VALUES(new_id,actor,COALESCE(r->>'server_id',''),COALESCE((r->>'generation')::int,0),COALESCE(r->>'character_name',''),r->>'category',r->>'title',COALESCE(r->'metadata','{}'),1,1) RETURNING * INTO t;
   INSERT INTO support_messages(ticket_id,author_id,author_kind,body) VALUES(t.id,actor,'player',r->>'body');
 ELSE
   SELECT * INTO t FROM support_tickets WHERE id=(r->>'ticket_id')::uuid FOR UPDATE;
   IF NOT FOUND OR (NOT is_admin AND t.owner_id<>actor) THEN RETURN jsonb_build_object('success',false,'code',404,'message','Không tìm thấy yêu cầu.'); END IF;
   IF t.version<>(r->>'expected_version')::int THEN RETURN jsonb_build_object('success',false,'code',409,'message','Yêu cầu đã thay đổi. Hãy tải lại trước khi thao tác.'); END IF;
   next_status:=t.status;
   IF operation='reply' THEN
     note:=is_admin AND COALESCE((r->>'internal')::boolean,false);
     IF t.status='closed' AND NOT note THEN RETURN jsonb_build_object('success',false,'code',409,'message','Yêu cầu đã đóng. Hãy mở lại trước khi trả lời.'); END IF;
     SELECT COUNT(*) INTO count_n FROM support_messages WHERE author_id=actor AND created_at>NOW()-INTERVAL '1 hour';
     IF count_n>=30 THEN RETURN jsonb_build_object('success',false,'code',429,'message','Bạn gửi quá nhanh. Hãy thử lại sau.'); END IF;
     SELECT COUNT(*) INTO count_n FROM support_messages WHERE ticket_id=t.id;
     IF count_n>=500 THEN RETURN jsonb_build_object('success',false,'code',429,'message','Hội thoại đạt giới hạn 500 tin. Hãy tạo yêu cầu mới.'); END IF;
     INSERT INTO support_messages(ticket_id,author_id,author_kind,internal,body) VALUES(t.id,actor,CASE WHEN is_admin THEN 'admin' ELSE 'player' END,note,r->>'body');
     IF NOT note THEN
       IF (NOT is_admin AND t.status IN ('waiting_player','resolved')) OR (is_admin AND t.status='new') THEN next_status:='in_progress'; END IF;
       t.public_seq:=t.public_seq+1;
       IF NOT is_admin AND t.player_read_seq=t.public_seq-1 THEN t.player_read_seq:=t.public_seq; END IF;
     END IF;
   ELSIF operation='close' THEN
     IF t.status<>'resolved' THEN RETURN jsonb_build_object('success',false,'code',409,'message','Chỉ xác nhận đóng khi đã giải quyết.'); END IF;
     next_status:='closed';
   ELSIF operation='reopen' THEN
     IF t.status<>'closed' OR t.closed_at<NOW()-INTERVAL '7 days' THEN RETURN jsonb_build_object('success',false,'code',409,'message','Không thể mở lại. Hãy tạo yêu cầu mới.'); END IF;
     next_status:='in_progress';
   ELSIF operation='update' AND is_admin THEN
     next_status:=COALESCE(r->>'status',t.status);
     IF next_status<>t.status AND NOT (
       (t.status='new' AND next_status='in_progress') OR
       (t.status='in_progress' AND next_status IN ('waiting_player','resolved','closed')) OR
       (t.status='waiting_player' AND next_status IN ('in_progress','resolved','closed')) OR
       (t.status='resolved' AND next_status IN ('in_progress','closed')) OR
       (t.status='closed' AND next_status='in_progress' AND t.closed_at>=NOW()-INTERVAL '7 days')
     ) THEN RETURN jsonb_build_object('success',false,'code',409,'message','Chuyển trạng thái không hợp lệ.'); END IF;
     t.priority:=COALESCE(r->>'priority',t.priority);t.assignee:=COALESCE(r->>'assignee',t.assignee);
     IF next_status<>t.status THEN t.public_seq:=t.public_seq+1; END IF;
   ELSE RETURN jsonb_build_object('success',false,'code',400,'message','Thao tác không hợp lệ.');
   END IF;
   UPDATE support_tickets SET status=next_status,priority=t.priority,assignee=t.assignee,version=version+1,
     public_seq=t.public_seq,player_read_seq=t.player_read_seq,updated_at=NOW(),
     closed_at=CASE WHEN next_status='closed' THEN COALESCE(closed_at,NOW()) ELSE NULL END WHERE id=t.id RETURNING * INTO t;
 END IF;
 INSERT INTO support_ticket_events(ticket_id,actor_id,action,detail) VALUES(t.id,actor,operation,
   jsonb_build_object('version',t.version,'status',t.status,'priority',t.priority,'assignee',t.assignee,'internal',COALESCE(note,false)));
 result:=jsonb_build_object('success',true,'data',jsonb_build_object('ticket',to_jsonb(t)||jsonb_build_object('unread',t.public_seq>t.player_read_seq)));
 INSERT INTO support_receipts(actor_id,request_id,fingerprint,result) VALUES(actor,(r->>'request_id')::uuid,jsonb_build_object('action',operation,'request',r-'character_name'),result);
 RETURN result;
 END $$;`,[]);
}
// Nakama exposes PostgreSQL JSONB as bytes. Select text and parse explicitly.
function supportUtc(column:string):string {return "to_char("+column+" AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')";}
function supportColumns(alias:string):string {
 const p=alias?alias+'.':'';
 return ['id','owner_id','server_id','generation','character_name','category','title','status','priority','assignee','version','public_seq','player_read_seq'].map(k=>p+k).join(',')+','+p+'metadata::text AS metadata,'+supportUtc(p+'created_at')+' AS created_at,'+supportUtc(p+'updated_at')+' AS updated_at,'+supportUtc(p+'closed_at')+' AS closed_at,'+p+'public_seq>'+p+'player_read_seq AS unread';
}
function supportDecodeTicket(row:any):any {if(row&&typeof row.metadata==='string')row.metadata=JSON.parse(row.metadata);return row;}
function supportResult(data:any):string{return JSON.stringify({success:true,data});}
function supportHandler(action:string,admin:boolean):nkruntime.RpcFunction {
 return (ctx,_logger,nk,payload)=>{
  if(!ctx.userId)return serverFailure('AUTH_REQUIRED',401,'Cần đăng nhập.');
  if(admin){const denied=requireServerAdmin(ctx);if(denied)return denied;}
  let r:any;try{r=serverRequest(payload);const allowed=['ticket_id','request_id','expected_version','category','title','body','server_id','generation','metadata','internal','status','priority','assignee','cursor','limit','search','public_seq'];const clean:any={};for(const k of allowed)if(r[k]!==undefined)clean[k]=r[k];r=clean;}catch(_e){return serverFailure('INVALID_REQUEST',400,'JSON không hợp lệ.');}
  const fail=(s:string)=>serverFailure('INVALID_REQUEST',400,s);
  if(action==='list'){
   const limit=r.limit===undefined?20:r.limit,cursor=r.cursor||'';
   if(!Number.isSafeInteger(limit)||limit<1||limit>30||typeof cursor!=='string'||(cursor&&!SUPPORT_UUID.test(cursor)))return fail('Phân trang không hợp lệ.');
   for(const key of ['search','status','category','server_id','assignee'])if(r[key]!==undefined&&(typeof r[key]!=='string'||r[key].length>120))return fail('Bộ lọc không hợp lệ.');
   const filter=r.assignee==='mine'?ctx.userId:(r.assignee||'');
   const rows=nk.sqlQuery(`SELECT ${supportColumns('t')} FROM support_tickets t WHERE
    ($1::bool OR owner_id=$2::uuid) AND ($3='' OR (t.created_at,t.id)<(SELECT created_at,id FROM support_tickets WHERE id=NULLIF($3,'')::uuid AND ($1::bool OR owner_id=$2::uuid)))
    AND (NOT $1::bool OR (($4='' OR status=$4) AND ($5='' OR category=$5) AND ($6='' OR server_id=$6)
    AND ($7='' OR ($7='unassigned' AND assignee='') OR assignee=$7)
    AND ($8='' OR position(lower($8) in lower(title||' '||id::text||' '||owner_id::text||' '||character_name))>0)))
    ORDER BY created_at DESC,id DESC LIMIT $9`,[admin,ctx.userId,cursor,r.status||'',r.category||'',r.server_id||'',filter,r.search||'',limit+1]);
   const more=rows.length>limit;if(more)rows.pop();
   const count=admin?0:Number(nk.sqlQuery('SELECT COUNT(*)::int AS n FROM support_tickets WHERE owner_id=$1::uuid AND public_seq>player_read_seq',[ctx.userId])[0].n);
   return supportResult({tickets:rows.map(supportDecodeTicket),next_cursor:more?rows[rows.length-1].id:'',unread_count:count});
  }
  if(action!=='create'&&(typeof r.ticket_id!=='string'||!SUPPORT_UUID.test(r.ticket_id)))return fail('Mã yêu cầu không hợp lệ.');
  if(action==='get'||action==='read'){
   const tickets=nk.sqlQuery('SELECT '+supportColumns('')+' FROM support_tickets WHERE id=$1::uuid AND ($2::bool OR owner_id=$3::uuid)',[r.ticket_id,admin,ctx.userId]);
   if(!tickets.length)return serverFailure('NOT_FOUND',404,'Không tìm thấy yêu cầu.');
   if(action==='read'){
    if(!Number.isSafeInteger(r.public_seq)||r.public_seq<0||r.public_seq>tickets[0].public_seq)return fail('Mốc đọc không hợp lệ.');
    const rows=nk.sqlQuery('WITH changed AS (UPDATE support_tickets SET player_read_seq=GREATEST(player_read_seq,$2) WHERE id=$1::uuid AND owner_id=$3::uuid RETURNING *) SELECT '+supportColumns('changed')+' FROM changed',[r.ticket_id,r.public_seq,ctx.userId]);
    return supportResult({ticket:supportDecodeTicket(rows[0])});
   }
   const cursor=r.cursor||'';if(typeof cursor!=='string'||(!/^\d{0,19}$/.test(cursor)||(cursor.length===19&&cursor>'9223372036854775807')))return fail('Cursor không hợp lệ.');
   const messages=nk.sqlQuery(`SELECT id::text,ticket_id,author_id,author_kind,internal,body,${supportUtc('created_at')} AS created_at FROM support_messages WHERE ticket_id=$1::uuid AND ($2::bool OR NOT internal) AND id>COALESCE(NULLIF($3,'')::bigint,0) ORDER BY support_messages.id LIMIT 51`,[r.ticket_id,admin,cursor]);
   const more=messages.length>50;if(more)messages.pop();
   const data:any={ticket:supportDecodeTicket(tickets[0]),messages,next_cursor:more?messages[messages.length-1].id:''};
   if(admin)data.events=nk.sqlQuery('SELECT id::text,actor_id,action,detail::text AS detail,'+supportUtc('created_at')+' AS created_at FROM support_ticket_events WHERE ticket_id=$1::uuid ORDER BY support_ticket_events.id DESC LIMIT 100',[r.ticket_id]).map((e:any)=>{e.detail=JSON.parse(e.detail);return e;});
   return supportResult(data);
  }
  if(typeof r.request_id!=='string'||!SUPPORT_UUID.test(r.request_id))return fail('Cần mã chống gửi trùng.');
  if(action!=='create'&&(!Number.isSafeInteger(r.expected_version)||r.expected_version<1))return fail('Phiên bản không hợp lệ.');
  if(action==='create'||action==='reply'){
   if(typeof r.body!=='string'||!r.body.trim()||r.body.length>4000)return fail('Nội dung cần từ 1 đến 4000 ký tự.');
   if(!admin&&!validateSupportText(r.body))return fail('Nội dung chứa từ ngữ không phù hợp.');
   if(r.internal!==undefined&&typeof r.internal!=='boolean')return fail('Loại ghi chú không hợp lệ.');
  }
  if(action==='create'){
   if(typeof r.title!=='string'||r.title.trim().length<5||r.title.length>120||SUPPORT_CATEGORIES.indexOf(r.category)<0)return fail('Kiểm tra tiêu đề và danh mục.');
   if(!validateSupportText(r.title))return fail('Tiêu đề chứa từ ngữ không phù hợp.');
   if(r.metadata===undefined)r.metadata={};
   if(!r.metadata||typeof r.metadata!=='object'||Array.isArray(r.metadata))return fail('Thông tin bổ sung không hợp lệ.');
   const clean:any={};for(const k of ['version','platform','occurred_at','order_id','steps']){if(r.metadata[k]!==undefined){if(typeof r.metadata[k]!=='string'||r.metadata[k].length>(k==='steps'?2000:200))return fail('Thông tin bổ sung quá dài.');clean[k]=r.metadata[k];}}
   r.metadata=clean;r.character_name='';r.server_id=r.server_id||'';r.generation=r.generation||0;
   if(typeof r.server_id!=='string'||!Number.isSafeInteger(r.generation)||r.generation<0)return fail('Máy chủ không hợp lệ.');
   if(r.server_id){
    if(!/^[a-z][a-z0-9_]{0,31}$/.test(r.server_id))return fail('Máy chủ không hợp lệ.');
    const chars=nk.sqlQuery(`SELECT COALESCE(p.value->>'display_name','') AS name FROM player_characters c LEFT JOIN storage p ON p.user_id=c.account_id AND p.collection='player_profiles' AND p.key=c.server_id||':g'||c.generation::text||':main' WHERE c.account_id=$1::uuid AND c.server_id=$2 AND c.generation=$3 AND c.status='ready'`,[ctx.userId,r.server_id,r.generation]);
    if(!chars.length)return fail('Không tìm thấy nhân vật tại máy chủ này.');r.character_name=chars[0].name;
   }else if(r.generation!==0)return fail('Máy chủ không hợp lệ.');
  }
  if(action==='update'){
   if(!admin)return serverFailure('FORBIDDEN',403,'Forbidden');
   if(r.status!==undefined&&SUPPORT_STATUSES.indexOf(r.status)<0)return fail('Trạng thái không hợp lệ.');
   if(r.priority!==undefined&&['normal','high','urgent'].indexOf(r.priority)<0)return fail('Ưu tiên không hợp lệ.');
   if(r.assignee!==undefined&&(typeof r.assignee!=='string'||(r.assignee!==''&&(!SUPPORT_UUID.test(r.assignee)||!isConfigAdmin({userId:r.assignee,env:ctx.env} as nkruntime.Context)))))return fail('Người phụ trách phải là admin được cấu hình.');
  }
  const result=nk.sqlQuery('SELECT support_mutate($1::uuid,$2::bool,$3,$4::jsonb,$5::uuid)::text AS result',[ctx.userId,admin,action,JSON.stringify(r),nk.uuidv4()])[0].result;
  return typeof result==='string'?result:JSON.stringify(result);
 };
}

function rpc_support_create(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {return supportHandler('create',false)(c,l,n,p);}

function rpc_support_list(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {return supportHandler('list',false)(c,l,n,p);}

function rpc_support_get(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {return supportHandler('get',false)(c,l,n,p);}

function rpc_support_read(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {return supportHandler('read',false)(c,l,n,p);}

function rpc_support_reply(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {return supportHandler('reply',false)(c,l,n,p);}

function rpc_support_close(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {return supportHandler('close',false)(c,l,n,p);}

function rpc_support_reopen(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {return supportHandler('reopen',false)(c,l,n,p);}

function rpc_admin_support_list(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {return supportHandler('list',true)(c,l,n,p);}

function rpc_admin_support_get(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {return supportHandler('get',true)(c,l,n,p);}

function rpc_admin_support_reply(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {return supportHandler('reply',true)(c,l,n,p);}

function rpc_admin_support_update(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string {return supportHandler('update',true)(c,l,n,p);}
