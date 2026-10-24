// C193: published feature configuration; no client gameplay authority.
const FEATURE_IDS = ["mailbox", "checkin", "daily_quests", "shop", "leaderboard", "stage_epic", "sweep", "elements", "stage_legend", "talisman", "trial_tower", "laws", "guild_war", "ancient_battlefield", "multiverse"];
const FEATURE_DEFAULTS: any = {
  "schema_version": 1,
  "features": {
    "mailbox": {
      "required_user_level": 1,
      "enabled": true,
      "release_status": "released",
      "display_name": "Hộp thư",
      "description": "Đọc thư và nhận phần thưởng từ hệ thống.",
      "tour_id": "mailbox_v1",
      "tour_mode": "dismiss_any",
      "mail_title": "Đã khai mở: Hộp thư",
      "mail_body": "Chúc mừng đạo hữu đạt cấp {level}! Hộp thư đã khai mở.\n\nĐọc thư và nhận phần thưởng từ hệ thống.\n\nTrở về Trang chủ để khám phá chức năng mới."
    },
    "checkin": {
      "required_user_level": 2,
      "enabled": true,
      "release_status": "released",
      "display_name": "Điểm danh hàng ngày",
      "description": "Nhận quà điểm danh mỗi ngày khi sự kiện hoạt động.",
      "tour_id": "checkin_v1",
      "tour_mode": "dismiss_any",
      "mail_title": "Đã khai mở: Điểm danh hàng ngày",
      "mail_body": "Chúc mừng đạo hữu đạt cấp {level}! Điểm danh hàng ngày đã khai mở.\n\nNhận quà điểm danh mỗi ngày khi sự kiện hoạt động.\n\nTrở về Trang chủ để khám phá chức năng mới."
    },
    "daily_quests": {
      "required_user_level": 3,
      "enabled": true,
      "release_status": "released",
      "display_name": "Nhiệm vụ hàng ngày",
      "description": "Hoàn thành nhiệm vụ mỗi ngày.",
      "tour_id": "daily_quests_v1",
      "tour_mode": "dismiss_any",
      "mail_title": "Đã khai mở: Nhiệm vụ hàng ngày",
      "mail_body": "Chúc mừng đạo hữu đạt cấp {level}! Nhiệm vụ hàng ngày đã khai mở.\n\nHoàn thành nhiệm vụ mỗi ngày.\n\nTrở về Trang chủ để khám phá chức năng mới."
    },
    "shop": {
      "required_user_level": 4,
      "enabled": true,
      "release_status": "released",
      "display_name": "Huyền Thiên Các",
      "description": "Khám phá những vật phẩm trợ lực trên đường tu luyện.",
      "tour_id": "shop_v1",
      "tour_mode": "dismiss_any",
      "mail_title": "Đã khai mở: Huyền Thiên Các",
      "mail_body": "Chúc mừng đạo hữu đạt cấp {level}! Huyền Thiên Các đã khai mở.\n\nKhám phá những vật phẩm trợ lực trên đường tu luyện.\n\nTrở về Trang chủ để khám phá chức năng mới."
    },
    "leaderboard": {
      "required_user_level": 10,
      "enabled": true,
      "release_status": "released",
      "display_name": "Bảng xếp hạng",
      "description": "Theo dõi thành tựu của các đạo hữu.",
      "tour_id": "leaderboard_v1",
      "tour_mode": "dismiss_any",
      "mail_title": "Đã khai mở: Bảng xếp hạng",
      "mail_body": "Chúc mừng đạo hữu đạt cấp {level}! Bảng xếp hạng đã khai mở.\n\nTheo dõi thành tựu của các đạo hữu.\n\nTrở về Trang chủ để khám phá chức năng mới."
    },
    "stage_epic": {
      "required_user_level": 10,
      "enabled": true,
      "release_status": "released",
      "display_name": "Stage Epic",
      "description": "Thử sức với độ khó Tinh Anh tại những ải đã đủ điều kiện.",
      "tour_id": "stage_epic_v1",
      "tour_mode": "dismiss_any",
      "mail_title": "Đã khai mở: Stage Epic",
      "mail_body": "Chúc mừng đạo hữu đạt cấp {level}! Stage Epic đã khai mở.\n\nThử sức với độ khó Tinh Anh tại những ải đã đủ điều kiện.\n\nTrở về Trang chủ để khám phá chức năng mới."
    },
    "sweep": {
      "required_user_level": 5,
      "enabled": true,
      "release_status": "released",
      "display_name": "Càn quét",
      "description": "Càn quét những ải đủ điều kiện để tích lũy tài nguyên.",
      "tour_id": "sweep_v2",
      "tour_mode": "guided",
      "mail_title": "Đã khai mở: Càn quét",
      "mail_body": "Chúc mừng đạo hữu đạt cấp {level}! Càn quét đã khai mở.\n\nCàn quét những ải đủ điều kiện để tích lũy tài nguyên.\n\nTrở về Trang chủ để khám phá chức năng mới."
    },
    "elements": {
      "required_user_level": 15,
      "enabled": true,
      "release_status": "released",
      "display_name": "Linh căn",
      "description": "Tìm hiểu và bồi dưỡng thuộc tính ngũ hành.",
      "tour_id": "elements_v1",
      "tour_mode": "dismiss_any",
      "mail_title": "Đã khai mở: Linh căn",
      "mail_body": "Chúc mừng đạo hữu đạt cấp {level}! Linh căn đã khai mở.\n\nTìm hiểu và bồi dưỡng thuộc tính ngũ hành.\n\nTrở về Trang chủ để khám phá chức năng mới."
    },
    "stage_legend": {
      "required_user_level": 22,
      "enabled": true,
      "release_status": "released",
      "display_name": "Stage Legend",
      "description": "Chinh phục độ khó Huyền Thoại tại những ải đã đủ điều kiện.",
      "tour_id": "stage_legend_v1",
      "tour_mode": "dismiss_any",
      "mail_title": "Đã khai mở: Stage Legend",
      "mail_body": "Chúc mừng đạo hữu đạt cấp {level}! Stage Legend đã khai mở.\n\nChinh phục độ khó Huyền Thoại tại những ải đã đủ điều kiện.\n\nTrở về Trang chủ để khám phá chức năng mới."
    },
    "talisman": {
      "required_user_level": 20,
      "enabled": true,
      "release_status": "released",
      "display_name": "Pháp bảo",
      "description": "Quản lý và bồi dưỡng pháp bảo trợ chiến.",
      "tour_id": "talisman_v1",
      "tour_mode": "dismiss_any",
      "mail_title": "Đã khai mở: Pháp bảo",
      "mail_body": "Chúc mừng đạo hữu đạt cấp {level}! Pháp bảo đã khai mở.\n\nQuản lý và bồi dưỡng pháp bảo trợ chiến.\n\nTrở về Trang chủ để khám phá chức năng mới."
    },
    "trial_tower": {
      "required_user_level": 25,
      "enabled": true,
      "release_status": "released",
      "display_name": "Thí luyện",
      "description": "Bước vào Tháp Thí Luyện để tôi luyện bản lĩnh.",
      "tour_id": "trial_tower_v1",
      "tour_mode": "dismiss_any",
      "mail_title": "Đã khai mở: Thí luyện",
      "mail_body": "Chúc mừng đạo hữu đạt cấp {level}! Thí luyện đã khai mở.\n\nBước vào Tháp Thí Luyện để tôi luyện bản lĩnh.\n\nTrở về Trang chủ để khám phá chức năng mới."
    },
    "laws": {
      "required_user_level": 30,
      "enabled": true,
      "release_status": "released",
      "display_name": "Pháp tắc",
      "description": "Bồi dưỡng Thần Luân bằng Mảnh pháp tắc từ Tâm Ma Tháp để tăng khả năng sinh tồn.",
      "tour_id": "than_luan_v1",
      "tour_mode": "dismiss_any",
      "mail_title": "Đã khai mở: Pháp tắc",
      "mail_body": "Chúc mừng đạo hữu đạt cấp {level}! Pháp tắc đã khai mở.\n\nBồi dưỡng Thần Luân bằng Mảnh pháp tắc từ Tâm Ma Tháp để tăng khả năng sinh tồn.\n\nTrở về Trang chủ để khám phá chức năng mới."
    },
    "guild_war": {
      "required_user_level": null,
      "enabled": false,
      "release_status": "planned",
      "display_name": "Tông môn chi chiến",
      "description": "Đại chiến bảo vệ tông môn — sắp ra mắt.",
      "tour_id": "",
      "tour_mode": "dismiss_any",
      "mail_title": "Đã khai mở: Tông môn chi chiến",
      "mail_body": "Chúc mừng đạo hữu đạt cấp {level}! Tông môn chi chiến đã khai mở.\n\nĐại chiến bảo vệ tông môn — sắp ra mắt.\n\nTrở về Trang chủ để khám phá chức năng mới."
    },
    "ancient_battlefield": {
      "required_user_level": null,
      "enabled": false,
      "release_status": "planned",
      "display_name": "Chiến trường thượng cổ",
      "description": "Nhân – yêu – ma chi chiến — sắp ra mắt.",
      "tour_id": "",
      "tour_mode": "dismiss_any",
      "mail_title": "Đã khai mở: Chiến trường thượng cổ",
      "mail_body": "Chúc mừng đạo hữu đạt cấp {level}! Chiến trường thượng cổ đã khai mở.\n\nNhân – yêu – ma chi chiến — sắp ra mắt.\n\nTrở về Trang chủ để khám phá chức năng mới."
    },
    "multiverse": {
      "required_user_level": null,
      "enabled": false,
      "release_status": "planned",
      "display_name": "Vạn giới chư thiên",
      "description": "Phá bỏ thiên đạo gông cùm, mở ra map mới, cấp độ mới và chức năng mới — sắp ra mắt.",
      "tour_id": "",
      "tour_mode": "dismiss_any",
      "mail_title": "Đã khai mở: Vạn giới chư thiên",
      "mail_body": "Chúc mừng đạo hữu đạt cấp {level}! Vạn giới chư thiên đã khai mở.\n\nPhá bỏ thiên đạo gông cùm, mở ra map mới, cấp độ mới và chức năng mới — sắp ra mắt.\n\nTrở về Trang chủ để khám phá chức năng mới."
    }
  }
};
const REALM_MILESTONE_DEFAULTS:any={schema_version:1,milestones:{
    '10':{title:'Chúc mừng đột phá — Lv.10',body:'Chúc mừng đạo hữu vượt thiên kiếp, bước vào cảnh giới mới! Tiên lộ từ đây rộng mở, nhưng mỗi miền đất đều ẩn chứa nhân quả. Hãy vững đạo tâm, tích lũy căn cơ và thử sức với những thử thách khắc nghiệt hơn.'},
    '20':{title:'Chúc mừng đột phá — Lv.20',body:'Chúc mừng đạo hữu đột phá thành công! Khi linh lực dần tinh thuần, ngũ hành cũng hé lộ quy luật tương sinh tương khắc. Thấu hiểu linh căn sẽ giúp đạo hữu đi xa hơn trên con đường tu luyện.'},
    '30':{title:'Chúc mừng đột phá — Lv.30',body:'Chúc mừng đạo hữu vượt thêm một tầng thiên đạo! Sức mạnh cần được tôi luyện qua thực chiến; Tháp Thí Luyện đang chờ những người đủ bản lĩnh. Hãy chuẩn bị pháp bảo, giữ tâm sáng và tiến từng bước vững vàng.'},
    '40':{title:'Chúc mừng đột phá — Lv.40',body:'Chúc mừng đạo hữu đặt chân tới cảnh giới cao hơn! Càng gần thiên đạo, người tu hành càng nhận ra sức mạnh luôn đi cùng trách nhiệm. Phía sau những cuộc tranh đấu còn có bí mật của thế giới này đang chờ được khám phá.'},
    '50':{title:'Chúc mừng đột phá — Lv.50',body:'Chúc mừng đạo hữu chạm tới đỉnh cao hiện tại! Đỉnh núi hôm nay có thể chỉ là khởi đầu của một chân trời khác. Truyền thuyết kể rằng ngoài gông cùm thiên đạo còn có vạn giới chư thiên — hãy giữ vững đạo tâm, chờ ngày tiên lộ tiếp tục rộng mở.'}
}};

function featureValidateConfig(config:any,realms:any):void {
    if(!config||config.schema_version!==1||!config.features||Array.isArray(config.features)||!realms||realms.schema_version!==1||!realms.milestones)throw Error('FEATURE_CONFIG_INVALID');
    const tours:string[]=[];
    for(const id of FEATURE_IDS){
        const f=config.features[id];
        if(!f||typeof f.enabled!=='boolean'||['planned','released'].indexOf(f.release_status)<0
            ||(f.required_user_level!==null&&(!Number.isSafeInteger(f.required_user_level)||f.required_user_level<1||f.required_user_level>50))
            ||(f.enabled&&(f.required_user_level===null||f.release_status!=='released'))
            ||typeof f.display_name!=='string'||!f.display_name.trim()||f.display_name.length>100
            ||typeof f.description!=='string'||f.description.length>2000
            ||typeof f.tour_id!=='string'||(f.tour_id!==''&&!/^[a-z][a-z0-9_]{0,79}$/.test(f.tour_id))
            ||['dismiss_any','guided'].indexOf(f.tour_mode)<0
            ||typeof f.mail_title!=='string'||!f.mail_title.trim()||f.mail_title.length>160
            ||typeof f.mail_body!=='string'||!f.mail_body.trim()||f.mail_body.length>10000)throw Error('FEATURE_CONFIG_INVALID:'+id);
        if(f.tour_id){if(tours.indexOf(f.tour_id)>=0)throw Error('DUPLICATE_TOUR');tours.push(f.tour_id);}
    }
    if(Object.keys(config.features).some(id=>FEATURE_IDS.indexOf(id)<0))throw Error('UNKNOWN_FEATURE');
    for(const level of ['10','20','30','40','50']){
        const r=realms.milestones[level];
        if(!r||typeof r.title!=='string'||!r.title.trim()||r.title.length>160||typeof r.body!=='string'||!r.body.trim()||r.body.length>10000)throw Error('REALM_CONFIG_INVALID');
    }
}
function featureConfig(nk:nkruntime.Nakama):any {
    const c=getRemoteConfigValue(nk,'system','feature_unlocks',null),r=getRemoteConfigValue(nk,'system','realm_milestones',null);
    featureValidateConfig(c,r);return {features:c.features,realms:r.milestones};
}
function featureState(profile:any):any {
    const s=profile.feature_unlocks;
    return s&&s.schema_version===1&&s.unlocked&&typeof s.unlocked==='object'&&!Array.isArray(s.unlocked)&&Array.isArray(s.completed_tours)
        ?s:{schema_version:1,unlocked:{},completed_tours:[]};
}
function featureAccess(profile:any,id:string,config:any):any {
    const f=config.features[id],level=Number(profile.level||1);
    if(!f||!f.enabled||f.release_status!=='released')return {success:false,code:'FEATURE_UNAVAILABLE',feature_id:id,message:'Chức năng chưa phát hành.'};
    if(!featureState(profile).unlocked[id]&&level<f.required_user_level)return {success:false,code:'FEATURE_LOCKED',feature_id:id,required_user_level:f.required_user_level,current_user_level:level,message:'Mở ở Lv.'+f.required_user_level};
    return {success:true};
}
// Adds mail + ledger to the SAME Storage batch as progression (also used by workers).
function featureRuntime(base:nkruntime.Nakama,userId:string):nkruntime.Nakama {
    if(!userId||(base as any).__featureRuntime===userId)return base;
    const runtime:any=Object.create(base);runtime.__featureRuntime=userId;
    runtime.storageWrite=(input:any[])=>{
        const writes=input.slice(),profile=writes.find((w:any)=>w.collection==='player_profiles'&&w.key==='main'&&w.userId===userId);
        if(!profile)return base.storageWrite(writes);
        const c=featureConfig(base),old=base.storageRead([{collection:'player_profiles',key:'main',userId}])[0];
        // Honor the caller's version fence; fail before constructing any notification.
        if(old&&profile.version&&profile.version!==old.version)throw Error('FEATURE_PROFILE_CONFLICT');
        const previous=old?old.value:{},state=featureState(profile.value),migrating=!!old&&!previous.feature_unlocks;
        profile.value.feature_unlocks=state;
        // Never let a stale/generic profile write erase committed entitlements or tour ACKs.
        const priorState=featureState(previous);
        Object.keys(priorState.unlocked).forEach(id=>state.unlocked[id]=priorState.unlocked[id]);
        priorState.completed_tours.forEach((id:string)=>{if(state.completed_tours.indexOf(id)<0)state.completed_tours.push(id);});
        const reports:any[]=[],batch:any=Object.create(base);batch.__mailBatch=true;
        batch.storageWrite=(extra:any[])=>{writes.push(...extra);return [];};
        const send=(definition:any)=>reports.push(deliverMail(batch,userId,Object.assign({category:'system',sender_name:'Thiên Đạo Truyền Thư',attachments:[],expires_at_ms:null},definition)));
        Object.keys(c.features).forEach(id=>{
            const f=c.features[id];
            if(!f.enabled||f.release_status!=='released'||Number(profile.value.level||1)<f.required_user_level)return;
            if(!state.unlocked[id]){
                state.unlocked[id]=Date.now();
                send({source_id:'feature_unlocked:'+id,source_type:'feature_unlocked',title:f.mail_title,body:f.mail_body.split('{level}').join(String(f.required_user_level))});
            }
            if(migrating&&f.tour_id&&state.completed_tours.indexOf(f.tour_id)<0)state.completed_tours.push(f.tour_id);
        });
        // History proves success; level alone must never manufacture a breakthrough.
        const history=profile.value.breakthrough&&profile.value.breakthrough.history;
        if(Array.isArray(history))for(const level of ['10','20','30','40','50']){
            if(!history.some((h:any)=>Number(h.level)===Number(level)))continue;
            const r=c.realms[level];send({source_id:'realm_breakthrough:'+level,source_type:'realm_breakthrough',title:r.title,body:r.body});
        }
        const result=base.storageWrite(writes);
        for(const report of reports)if(!report.idempotent)mailPush(base,userId,report.id);
        return result;
    };
    return runtime;
}
function featureForRpc(id:string,req:any):string[] {
    const map:any={get_than_luan_state:'laws',upgrade_than_luan:'laws',daily_checkin_status:'checkin',daily_checkin_claim:'checkin',store_purchase:'shop',purchase_hero:'shop',upgrade_element:'elements',
        talisman_action:'talisman',get_trial_tower_status:'trial_tower',start_trial_tower:'trial_tower',
        get_weekly_leaderboard_rewards:'leaderboard',claim_weekly_leaderboard_reward:'leaderboard',get_leaderboard_records:'leaderboard'};
    if(id==='prepare_rewarded_ad'&&req.placement_id==='daily_mission_talisman_fragment_ad')return ['daily_quests'];
    if(id==='talisman_action')return ['buy_material','buy_fragment'].indexOf(req.action)>=0?['shop']:req.action==='reroll_talent'?[]:['talisman'];
    if(['get_sweep_options','preview_sweep','start_sweep'].indexOf(id)>=0){
        if(req.sweep_type==='tower')return ['sweep','trial_tower'];
        const needed=['sweep'],mode=req.level_id||req.difficulty_id;
        if(mode==='epic'||mode==='legend')needed.push('stage_'+mode);
        return needed;
    }
    if(id==='start_stage'){
        if(req.stage_id==='stage_trial_tower')return ['trial_tower'];
        const mode=req.level_id||req.difficulty_id;
        return mode==='epic'?['stage_epic']:mode==='legend'?['stage_legend']:[];
    }
    // Settlement, cancellation and already equipped combat effects remain usable.
    if(['mail_summary','mail_list','mail_open','mail_claim','mail_claim_all','mail_delete','mail_delete_read'].indexOf(id)>=0)return ['mailbox'];
    return map[id]?[map[id]]:[];
}
function featureGuardedRpc(id:string,handler:nkruntime.RpcFunction):nkruntime.RpcFunction {
    return (ctx,logger,nk,payload)=>{
        if(!ctx.userId)return handler(ctx,logger,nk,payload);
        let req:any;try{req=JSON.parse(payload||'{}');}catch(_e){return JSON.stringify({success:false,code:400,message:'Invalid JSON'});}
        const needed=featureForRpc(id,req||{});
        if(needed.length){
            let c:any;try{c=featureConfig(nk);}catch(_e){return JSON.stringify({success:false,code:'FEATURE_CONFIG_INVALID',message:'Cấu hình mở chức năng chưa sẵn sàng.'});}
            const row=nk.storageRead([{collection:'player_profiles',key:'main',userId:ctx.userId}])[0];
            if(!row)return JSON.stringify({success:false,code:'PROFILE_REQUIRED'});
            for(const key of needed){const access=featureAccess(row.value,key,c);if(!access.success)return JSON.stringify(access);}
        }
        return handler(ctx,logger,nk,payload);
    };
}
const completeFeatureTour:nkruntime.RpcFunction=(ctx,_logger,nk,payload)=>{
    if(!ctx.userId)return JSON.stringify({success:false,code:401});
    const req=JSON.parse(payload||'{}');
    const c=featureConfig(nk),f=Object.keys(c.features).map(id=>({id,...c.features[id]})).find(f=>f.tour_id&&f.tour_id===req.tour_id);
    const row=nk.storageRead([{collection:'player_profiles',key:'main',userId:ctx.userId}])[0];
    if(!f||!row)return JSON.stringify({success:false,code:'UNKNOWN_TOUR'});
    const access=featureAccess(row.value,f.id,c);if(!access.success)return JSON.stringify(access);
    const s=featureState(row.value);row.value.feature_unlocks=s;
    if(s.completed_tours.indexOf(req.tour_id)<0){
        s.completed_tours.push(req.tour_id);
        try{nk.storageWrite([{collection:'player_profiles',key:'main',userId:ctx.userId,value:row.value,version:row.version,permissionRead:1,permissionWrite:0}]);}
        catch(_e){return JSON.stringify({success:false,code:'DATA_CHANGED',message:'Vui lòng thử lại.'});}
    }
    return JSON.stringify({success:true,feature_unlocks:s});
};
