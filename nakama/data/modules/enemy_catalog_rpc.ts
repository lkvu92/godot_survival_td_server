// C259: DB authoring, immutable enemy releases and compatibility projections.
const EC_TABLES: {[key:string]:string} = {catalog:'enemy_catalog',visual_set:'enemy_visual_sets',visual_asset:'enemy_visual_assets',skill:'enemy_skill_catalog',stage_entry:'enemy_stage_entries'};
const EC_STATS=['hp','atk','def','move_speed','attack_speed','attack_range'];
const EC_ELEMENTS=['metal','water','wood','fire','earth'];
const EC_ID=/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,179}$/;

function createEnemyCatalogTables(nk:nkruntime.Nakama):void {
    nk.sqlExec(`CREATE OR REPLACE FUNCTION campaign_stage_write(doc JSONB,row_rev TEXT,draft_rev BIGINT,who TEXT,body JSONB,live BOOLEAN)
      RETURNS JSONB LANGUAGE plpgsql AS $cp$
      DECLARE state_rev BIGINT; old_doc JSONB; metadata_value JSONB; next_doc JSONB;
      BEGIN
       SELECT revision,metadata INTO state_rev,metadata_value FROM enemy_catalog_state WHERE id=1 FOR UPDATE;
       IF state_rev<>draft_rev THEN RAISE EXCEPTION 'EC_CONFLICT'; END IF;
       old_doc=metadata_value->'campaign_stages'->(doc->>'id');
       IF COALESCE(old_doc->>'revision','0')<>row_rev THEN RAISE EXCEPTION 'EC_CONFLICT'; END IF;
       next_doc=jsonb_build_object('document',doc,'revision',(state_rev+1)::TEXT);
       metadata_value=jsonb_set(metadata_value,'{campaign_stages}',COALESCE(metadata_value->'campaign_stages','{}'::JSONB)||jsonb_build_object(doc->>'id',next_doc),TRUE);
       DELETE FROM enemy_stage_entries WHERE data->>'stage_id'=doc->>'id';
       UPDATE enemy_catalog_state SET revision=revision+1,metadata=metadata_value WHERE id=1;
       INSERT INTO enemy_catalog_audit(actor,operation,entity,entity_id,before_data,after_data,draft_revision)
        VALUES(who,'save','campaign_stage',doc->>'id',old_doc,next_doc,state_rev+1);
       IF live THEN
        body=jsonb_set(body,'{framework,catalog_version}',to_jsonb('draft:'||(state_rev+1)::TEXT),TRUE);
        PERFORM enemy_catalog_apply_projection(body);
        UPDATE enemy_catalog_state SET metadata=jsonb_set(metadata,'{runtime_version}',body->'framework'->'catalog_version',TRUE) WHERE id=1;
       END IF;
       RETURN next_doc||jsonb_build_object('draft_revision',(state_rev+1)::TEXT);
      END $cp$;`,[]);
    for(const key of Object.keys(EC_TABLES))nk.sqlExec(`CREATE TABLE IF NOT EXISTS ${EC_TABLES[key]} (
      id TEXT PRIMARY KEY CHECK(length(id)<=180),data JSONB NOT NULL CHECK(jsonb_typeof(data)='object'),
      active BOOLEAN NOT NULL DEFAULT TRUE,revision BIGINT NOT NULL DEFAULT 1 CHECK(revision>0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,[]);
    nk.sqlExec(`CREATE TABLE IF NOT EXISTS enemy_catalog_releases (
      version BIGSERIAL PRIMARY KEY,snapshot JSONB NOT NULL,created_by TEXT NOT NULL,note TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS enemy_catalog_state (
      id INT PRIMARY KEY CHECK(id=1),revision BIGINT NOT NULL DEFAULT 0,active_release BIGINT REFERENCES enemy_catalog_releases(version),metadata JSONB NOT NULL DEFAULT '{}');
      INSERT INTO enemy_catalog_state(id) VALUES(1) ON CONFLICT DO NOTHING;
      CREATE TABLE IF NOT EXISTS enemy_catalog_audit (
      id BIGSERIAL PRIMARY KEY,actor TEXT NOT NULL,operation TEXT NOT NULL,entity TEXT NOT NULL,entity_id TEXT NOT NULL,
      before_data JSONB,after_data JSONB,draft_revision BIGINT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
      ALTER TABLE game_enemies ADD COLUMN IF NOT EXISTS catalog_projection JSONB;
      CREATE INDEX IF NOT EXISTS enemy_entries_stage_idx ON enemy_stage_entries((data->>'stage_id'));
      CREATE INDEX IF NOT EXISTS enemy_assets_set_idx ON enemy_visual_assets((data->>'visual_set_id'));`,[]);
    nk.sqlExec(`CREATE OR REPLACE FUNCTION enemy_catalog_write(tbl TEXT,rid TEXT,body JSONB,enabled BOOLEAN,row_rev BIGINT,draft_rev BIGINT,who TEXT,op TEXT)
      RETURNS JSONB LANGUAGE plpgsql AS $ec$
      DECLARE state_rev BIGINT; old_row JSONB; new_row JSONB;
      BEGIN
       IF tbl NOT IN ('enemy_catalog','enemy_visual_sets','enemy_visual_assets','enemy_skill_catalog','enemy_stage_entries') OR op NOT IN ('save','delete') THEN RAISE EXCEPTION 'EC_INVALID'; END IF;
       SELECT revision INTO state_rev FROM enemy_catalog_state WHERE id=1 FOR UPDATE;
       IF state_rev<>draft_rev THEN RAISE EXCEPTION 'EC_CONFLICT'; END IF;
       EXECUTE format('SELECT to_jsonb(t) FROM %I t WHERE id=$1 FOR UPDATE',tbl) INTO old_row USING rid;
       IF COALESCE((old_row->>'revision')::BIGINT,0)<>row_rev THEN RAISE EXCEPTION 'EC_CONFLICT'; END IF;
       IF op='delete' THEN
        IF old_row IS NULL THEN RAISE EXCEPTION 'EC_NOT_FOUND'; END IF;
        EXECUTE format('DELETE FROM %I WHERE id=$1',tbl) USING rid;
       ELSE
        EXECUTE format('INSERT INTO %I(id,data,active) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,active=EXCLUDED.active,revision=%I.revision+1,updated_at=NOW() RETURNING to_jsonb(%I.*)',tbl,tbl,tbl) INTO new_row USING rid,body,enabled;
       END IF;
       UPDATE enemy_catalog_state SET revision=revision+1 WHERE id=1;
       INSERT INTO enemy_catalog_audit(actor,operation,entity,entity_id,before_data,after_data,draft_revision) VALUES(who,op,tbl,rid,old_row,new_row,state_rev+1);
       RETURN jsonb_build_object('row',new_row,'draft_revision',(state_rev+1)::TEXT);
      END $ec$;`,[]);
    nk.sqlExec(`CREATE OR REPLACE FUNCTION enemy_catalog_batch(changes JSONB,draft_rev BIGINT,who TEXT)
      RETURNS JSONB LANGUAGE plpgsql AS $ec$
      DECLARE current_rev BIGINT; change JSONB; result JSONB;
      BEGIN
       SELECT revision INTO current_rev FROM enemy_catalog_state WHERE id=1 FOR UPDATE;
       IF current_rev<>draft_rev THEN RAISE EXCEPTION 'EC_CONFLICT'; END IF;
       FOR change IN SELECT value FROM jsonb_array_elements(changes) LOOP
        result=enemy_catalog_write(change->>'table',change->>'id',change->'data',COALESCE((change->>'active')::BOOLEAN,FALSE),(change->>'expected_revision')::BIGINT,current_rev,who,change->>'operation');
        current_rev=(result->>'draft_revision')::BIGINT;
       END LOOP;
       RETURN jsonb_build_object('draft_revision',current_rev::TEXT);
      END $ec$;`,[]);
    nk.sqlExec(`CREATE OR REPLACE FUNCTION enemy_catalog_import(bundle JSONB,draft_rev BIGINT,who TEXT)
      RETURNS JSONB LANGUAGE plpgsql AS $ec$
      DECLARE state_rev BIGINT; tbl TEXT; row JSONB;
      BEGIN
       SELECT revision INTO state_rev FROM enemy_catalog_state WHERE id=1 FOR UPDATE;
       IF state_rev<>draft_rev OR EXISTS(SELECT 1 FROM enemy_catalog) OR EXISTS(SELECT 1 FROM enemy_visual_sets) OR EXISTS(SELECT 1 FROM enemy_skill_catalog) OR EXISTS(SELECT 1 FROM enemy_stage_entries) OR EXISTS(SELECT 1 FROM enemy_visual_assets) THEN RAISE EXCEPTION 'EC_CONFLICT'; END IF;
       FOREACH tbl IN ARRAY ARRAY['enemy_visual_sets','enemy_catalog','enemy_skill_catalog','enemy_visual_assets','enemy_stage_entries'] LOOP
        FOR row IN SELECT value FROM jsonb_array_elements(bundle->tbl) LOOP
         EXECUTE format('INSERT INTO %I(id,data,active) VALUES($1,$2,$3)',tbl) USING row->>'id',row->'data',COALESCE((row->>'active')::BOOLEAN,TRUE);
        END LOOP;
       END LOOP;
       UPDATE enemy_catalog_state SET revision=revision+1,metadata=bundle->'metadata' WHERE id=1;
       INSERT INTO enemy_catalog_audit(actor,operation,entity,entity_id,after_data,draft_revision) VALUES(who,'import','catalog','all',bundle,state_rev+1);
       RETURN jsonb_build_object('draft_revision',(state_rev+1)::TEXT);
      END $ec$;`,[]);
    nk.sqlExec(`CREATE OR REPLACE FUNCTION enemy_catalog_apply_projection(body JSONB)
      RETURNS VOID LANGUAGE plpgsql AS $ec$
      DECLARE row JSONB;
      BEGIN
       UPDATE game_config SET value=jsonb_set(value,'{enemy_framework}',body->'framework',TRUE),updated_at=NOW() WHERE key='progression';
       IF NOT FOUND THEN RAISE EXCEPTION 'EC_MISSING_PROGRESSION'; END IF;
       DELETE FROM game_enemies WHERE catalog_projection IS NOT NULL AND id NOT IN (SELECT value->>'id' FROM jsonb_array_elements(body->'enemies'));
       FOR row IN SELECT value FROM jsonb_array_elements(body->'enemies') LOOP
        INSERT INTO game_enemies(id,display_name,catalog_projection) VALUES(row->>'id',row->>'display_name',row)
        ON CONFLICT(id) DO UPDATE SET display_name=EXCLUDED.display_name,catalog_projection=EXCLUDED.catalog_projection,updated_at=NOW();
       END LOOP;
       FOR row IN SELECT value FROM jsonb_array_elements(COALESCE(body->'campaign_stages','[]'::JSONB)) LOOP
        UPDATE game_stages SET display_name=row->>'display_name',stage_rules=row->'stage_rules',updated_at=NOW() WHERE id=row->>'id' AND arc_id=row->>'arc_id';
        IF NOT FOUND THEN RAISE EXCEPTION 'EC_STAGE_CHANGED'; END IF;
        DELETE FROM game_stage_waves WHERE stage_id=row->>'id';
        INSERT INTO game_stage_waves(stage_id,wave_index,wave_id,display_name,entries)
         SELECT row->>'id',(w.ordinality-1)::INT,w.value->>'id',w.value->>'display_name',w.value->'entries' FROM jsonb_array_elements(row->'waves') WITH ORDINALITY AS w(value,ordinality);
       END LOOP;
       FOR row IN SELECT value FROM jsonb_array_elements(body->'waves') LOOP
        UPDATE game_stage_waves SET entries=row->'entries' WHERE stage_id=row->>'stage_id' AND wave_index=(row->>'wave_index')::INT;
        IF NOT FOUND THEN RAISE EXCEPTION 'EC_STAGE_CHANGED'; END IF;
       END LOOP;
      END $ec$;`,[]);
    nk.sqlExec(`CREATE OR REPLACE FUNCTION enemy_catalog_live_mutate(operation TEXT,args JSONB,body JSONB,draft_rev BIGINT,who TEXT)
      RETURNS JSONB LANGUAGE plpgsql AS $ec$
      DECLARE result JSONB; current_rev BIGINT;
      BEGIN
       SELECT revision INTO current_rev FROM enemy_catalog_state WHERE id=1 FOR UPDATE;
       IF current_rev<>draft_rev THEN RAISE EXCEPTION 'EC_CONFLICT'; END IF;
       IF operation='write' THEN
        result=enemy_catalog_write(args->>'table',args->>'id',args->'data',(args->>'active')::BOOLEAN,(args->>'row_revision')::BIGINT,draft_rev,who,args->>'operation');
       ELSIF operation='batch' THEN result=enemy_catalog_batch(args,draft_rev,who);
       ELSIF operation='import' THEN result=enemy_catalog_import(args,draft_rev,who);
       ELSE RAISE EXCEPTION 'EC_INVALID'; END IF;
       body=jsonb_set(body,'{framework,catalog_version}',to_jsonb('draft:'||(result->>'draft_revision')),TRUE);
       PERFORM enemy_catalog_apply_projection(body);
       UPDATE enemy_catalog_state SET metadata=jsonb_set(metadata,'{runtime_version}',body->'framework'->'catalog_version',TRUE) WHERE id=1;
       RETURN result;
      END $ec$;`,[]);
    nk.sqlExec(`CREATE OR REPLACE FUNCTION enemy_catalog_publish(body JSONB,draft_rev BIGINT,who TEXT,release_note TEXT,rollback_version BIGINT DEFAULT NULL)
      RETURNS JSONB LANGUAGE plpgsql AS $ec$
      DECLARE state_rev BIGINT; ver BIGINT; row JSONB; remote_ver BIGINT;
      BEGIN
       SELECT revision INTO state_rev FROM enemy_catalog_state WHERE id=1 FOR UPDATE;
       IF state_rev<>draft_rev THEN RAISE EXCEPTION 'EC_CONFLICT'; END IF;
       IF rollback_version IS NOT NULL THEN SELECT snapshot INTO body FROM enemy_catalog_releases WHERE version=rollback_version; IF body IS NULL THEN RAISE EXCEPTION 'EC_NOT_FOUND'; END IF; END IF;
       IF (SELECT metadata ? 'campaign_stages' FROM enemy_catalog_state WHERE id=1) THEN
        IF EXISTS(SELECT 1 FROM game_stages s WHERE s.stage_rules->>'stage_designer_version'='1' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(body->'campaign_stages','[]'::JSONB)) d WHERE d->>'id'=s.id)) THEN RAISE EXCEPTION 'EC_INCOMPLETE_CAMPAIGN_RELEASE'; END IF;
       END IF;
       INSERT INTO enemy_catalog_releases(snapshot,created_by,note) VALUES(body,who,release_note) RETURNING version INTO ver;
       body=jsonb_set(body,'{framework,catalog_version}',to_jsonb(ver::TEXT),TRUE);
       UPDATE enemy_catalog_releases SET snapshot=body WHERE version=ver;
       PERFORM enemy_catalog_apply_projection(body);
       LOCK TABLE remote_config_releases IN SHARE ROW EXCLUSIVE MODE;
       SELECT COALESCE(MAX(config_version),0)+1 INTO remote_ver FROM remote_config_releases;
       INSERT INTO remote_config_releases(config_version,snapshot,min_app_version,latest_app_version,store_url,published_by)
        SELECT remote_ver,jsonb_set(snapshot,'{system,enemy_catalog_version}',to_jsonb(ver::TEXT),TRUE),min_app_version,latest_app_version,store_url,who FROM remote_config_releases ORDER BY config_version DESC LIMIT 1;
       IF NOT FOUND THEN RAISE EXCEPTION 'EC_MISSING_CONFIG_RELEASE'; END IF;
       UPDATE enemy_catalog_state SET revision=revision+1,active_release=ver,metadata=metadata-'runtime_version' WHERE id=1;
       INSERT INTO enemy_catalog_audit(actor,operation,entity,entity_id,after_data,draft_revision) VALUES(who,CASE WHEN rollback_version IS NULL THEN 'publish' ELSE 'rollback' END,'release',ver::TEXT,jsonb_build_object('version',ver::TEXT,'note',release_note),state_rev+1);
       RETURN jsonb_build_object('version',ver::TEXT,'draft_revision',(state_rev+1)::TEXT,'config_version',remote_ver);
      END $ec$;`,[]);
}

function ecLiveEnabled(ctx:nkruntime.Context):boolean {
    return !!ctx.env && ctx.env.APP_ENVIRONMENT==='develop' && ctx.env.CONFIG_DRAFT_LIVE_ENABLED==='true';
}
function ecLiveMutate(ctx:nkruntime.Context,nk:nkruntime.Nakama,operation:string,args:any,projected:any,revision:string):any {
    return parseJsonb(nk.sqlQuery('SELECT enemy_catalog_live_mutate($1,$2::JSONB,$3::JSONB,$4::BIGINT,$5) AS result',[operation,JSON.stringify(args),JSON.stringify(projected.snapshot),revision,ctx.userId])[0].result);
}
function ecObject(value:any):boolean{return !!value&&typeof value==='object'&&!Array.isArray(value);}
function ecCopy(value:any):any{return JSON.parse(JSON.stringify(value));}
function ecError(code:number,message:string,errors?:string[]):string{return JSON.stringify({success:false,code,message,errors});}
function ecRow(row:any):any{return {id:String(row.id),data:parseJsonb(row.data),active:row.active===true,revision:String(row.revision),created_at:row.created_at,updated_at:row.updated_at};}
function ecRead(nk:nkruntime.Nakama):any {
    const state=nk.sqlQuery('SELECT revision::TEXT,active_release::TEXT,metadata FROM enemy_catalog_state WHERE id=1',[])[0];
    const draft:any={revision:String(state.revision),active_release:state.active_release||null,metadata:parseJsonb(state.metadata)};
    for(const key of Object.keys(EC_TABLES))draft[key]=nk.sqlQuery(`SELECT id,data,active,revision::TEXT FROM ${EC_TABLES[key]} ORDER BY id`,[]).map(ecRow);
    return draft;
}
function ecIndex(rows:any[]):any {const result:any={};for(const row of rows)if(row.active)result[row.id]=row.data;return result;}
function ecCanonical(value:any):string {
    const sorted=(v:any):any=>Array.isArray(v)?v.map(sorted):ecObject(v)?Object.keys(v).sort().reduce((o:any,k:string)=>{o[k]=sorted(v[k]);return o;},{}):v;
    return JSON.stringify(sorted(value));
}
function ecNormalize(draft:any):any {
    const next=ecCopy(draft),aliases:any={},groups:any={},slots=['avatar','idle','run','attack','hit','die'];
    const signature=(set:any):string=>{
        const assets=next.visual_asset.filter((r:any)=>r.active&&r.data.visual_set_id===set.id);
        if(assets.length!==6||slots.some(slot=>assets.filter((r:any)=>r.data.slot===slot).length!==1))return '';
        return ecCanonical({set:set.data,assets:slots.map(slot=>{const data=ecCopy(assets.find((r:any)=>r.data.slot===slot).data);delete data.visual_set_id;return data;})});
    };
    for(const row of next.visual_set)if(row.active&&/_(metal|water|wood|fire|earth)$/.test(row.id)){
        const root=row.id.replace(/_(metal|water|wood|fire|earth)$/,'');(groups[root]||(groups[root]=[])).push(row);
    }
    for(const root of Object.keys(groups)){
        const rows=groups[root],sig=signature(rows[0]);
        if(rows.length<2||!sig||rows.some((r:any)=>signature(r)!==sig))continue;
        const existing=next.visual_set.find((r:any)=>r.id===root);
        if(existing&&(!existing.active||signature(existing)!==sig))continue;
        if(!existing){
            next.visual_set.push({id:root,data:ecCopy(rows[0].data),active:true,revision:'0'});
            for(const slot of slots){const original=next.visual_asset.find((r:any)=>r.active&&r.data.visual_set_id===rows[0].id&&r.data.slot===slot);
                const id=root+':'+slot;if(next.visual_asset.some((r:any)=>r.id===id))throw Error('Conflicting neutral asset ID');
                next.visual_asset.push({id,data:Object.assign({},ecCopy(original.data),{visual_set_id:root}),active:true,revision:'0'});
            }
        }
        for(const row of rows)aliases[row.id]=root;
    }
    for(const row of next.catalog){
        if(aliases[row.data.visual_set_id])row.data.visual_set_id=aliases[row.data.visual_set_id];
        if(Array.isArray(row.data.presentation_variants))row.data.presentation_variants=Array.from(new Set(row.data.presentation_variants.map((id:string)=>aliases[id]||id))).filter(id=>id!==row.data.visual_set_id);
    }
    for(const row of next.stage_entry)if(aliases[row.data.presentation_id])row.data.presentation_id=aliases[row.data.presentation_id];
    next.visual_set=next.visual_set.filter((r:any)=>!aliases[r.id]);
    next.visual_asset=next.visual_asset.filter((r:any)=>!aliases[r.data.visual_set_id]);
    const changes:any[]=[];
    for(const kind of Object.keys(EC_TABLES)){
        const before:any={};for(const row of draft[kind])before[row.id]=row;
        const after:any={};for(const row of next[kind])after[row.id]=row;
        for(const id of Object.keys(after)){const row=after[id],old=before[id];if(!old||row.active!==old.active||ecCanonical(row.data)!==ecCanonical(old.data))changes.push({entity:kind,table:EC_TABLES[kind],id,operation:'save',data:row.data,active:row.active,expected_revision:old?old.revision:'0'});}
        for(const id of Object.keys(before))if(!after[id])changes.push({entity:kind,table:EC_TABLES[kind],id,operation:'delete',expected_revision:before[id].revision});
    }
    return {draft:next,changes};
}
function ecValidData(kind:string,id:string,data:any):string[] {
    const errors:string[]=[];
    if(!EC_ID.test(id)||!ecObject(data))return ['Invalid ID or object'];
    if(JSON.stringify(data).length>250000)return ['Record exceeds 250KB'];
    if(kind==='catalog'){
        if(!['creep','boss'].includes(data.kind)||typeof data.display_name!=='string'||!data.display_name.trim()||data.display_name.length>240||!EC_ID.test(data.visual_set_id||''))errors.push('Missing name/kind/visual_set_id');
        for(const key of ['element','elements','skills','learnable_skills'])if(data[key]!==undefined)errors.push('Enemy cannot own '+key);
        for(const group of ['base_attributes','growth_per_level']){
            if(!ecObject(data[group])){errors.push('Missing '+group);continue;}
            for(const stat of EC_STATS){const value=data[group][stat];if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1e12||(group==='base_attributes'&&stat!=='def'&&value<0.001))errors.push('Invalid '+group+'.'+stat);}
            for(const stat of Object.keys(data[group]))if(typeof data[group][stat]!=='number'||!Number.isFinite(data[group][stat])||data[group][stat]<0||data[group][stat]>1e12)errors.push('Invalid stat '+stat);
        }
        if(!ecObject(data.reward)||['exp','gold'].some(k=>!Number.isSafeInteger(data.reward[k])||data.reward[k]<0))errors.push('Invalid reward');
        if(data.balance_profile!==undefined&&data.balance_profile!=='element_boss')errors.push('Unknown balance profile');
        if(data.presentation_variants!==undefined&&(!Array.isArray(data.presentation_variants)||data.presentation_variants.some((v:any)=>typeof v!=='string'||!EC_ID.test(v))))errors.push('Invalid presentation variants');
        if(data.balance_profile==='element_boss')for(const element of EC_ELEMENTS)for(const stat of ['hp','atk','def','attack_speed','move_speed'])if(!data.element_baselines||!data.element_baselines[element]||typeof data.element_baselines[element][stat]!=='number'||data.element_baselines[element][stat]<0.001||data.element_baselines[element][stat]>1e12||!Number.isFinite(data.element_baselines[element][stat]))errors.push('Invalid boss baseline '+element+'.'+stat);
    } else if(kind==='visual_set') {
        if(typeof data.display_name!=='string'||!data.display_name.trim()||data.display_name.length>240)errors.push('Missing visual name');
        for(const key of ['visual_scale','boss_visual_scale','boss_scale'])if(data[key]!==undefined&&(typeof data[key]!=='number'||!Number.isFinite(data[key])||!(data[key]>0)||data[key]>20))errors.push('Invalid '+key);
        if(Object.keys(data).some(key=>!['display_name','attack_type','visual_scale','boss_visual_scale','boss_scale','is_boss'].includes(key)))errors.push('Visual sets accept presentation fields only');
    } else if(kind==='visual_asset') {
        if(!EC_ID.test(data.visual_set_id||'')||!['avatar','idle','run','attack','hit','die'].includes(data.slot)||!EC_ID.test(data.source_id||''))errors.push('Invalid visual asset');
        if(data.fps!==undefined&&(typeof data.fps!=='number'||!Number.isFinite(data.fps)||!(data.fps>0)||data.fps>120))errors.push('Invalid FPS');
    } else if(kind==='skill') {
        if(data.id!==id||!['neutral',...EC_ELEMENTS].includes(data.element)||!Array.isArray(data.levels)||data.levels.length<1||data.levels.length>100)errors.push('Invalid skill identity/element/levels');
    } else if(kind==='stage_entry') {
        if(!EC_ID.test(data.stage_id||'')||!EC_ID.test(data.enemy_id||'')||!Number.isSafeInteger(data.wave_index)||data.wave_index<0||!Number.isSafeInteger(data.entry_index)||data.entry_index<0||!Number.isSafeInteger(data.level)||data.level<1||data.level>10000)errors.push('Invalid stage entry identity/level');
        if(!Number.isSafeInteger(data.count)||data.count<1||data.count>1000||typeof data.interval!=='number'||!Number.isFinite(data.interval)||data.interval<=0||typeof data.start_delay!=='number'||!Number.isFinite(data.start_delay)||data.start_delay<0)errors.push('Invalid spawn schedule');
        if(!Number.isSafeInteger(data.exp)||data.exp<0)errors.push('Explicit nonnegative entry EXP required');
        if(data.boss!==undefined&&typeof data.boss!=='boolean')errors.push('Invalid boss flag');
        if(data.difficulty_overrides!==undefined){
            if(!ecObject(data.difficulty_overrides))errors.push('Invalid difficulty overrides');
            else for(const difficulty of Object.keys(data.difficulty_overrides)){
                const override=data.difficulty_overrides[difficulty];
                if(!['normal','epic','legend'].includes(difficulty)||!ecObject(override)||Object.keys(override).some(k=>!['level','skills','skills_by_element','loadout_template_id'].includes(k)))errors.push('Difficulty overrides accept level/loadout fields only: '+difficulty);
            }
        }
        for(const key of ['attributes','modifiers','hp_mul','atk_mul','def_mul','boss_skill_ids','species_id'])if(data[key]!==undefined)errors.push('Unsupported entry '+key);
    }
    return errors;
}

function ecProject(draft:any):any {
    const errors:string[]=[],species=ecIndex(draft.catalog),sets=ecIndex(draft.visual_set),assets=ecIndex(draft.visual_asset),skills=ecIndex(draft.skill),entries=ecIndex(draft.stage_entry);
    for(const kind of Object.keys(EC_TABLES))for(const row of draft[kind])errors.push(...ecValidData(kind,row.id,row.data).map(e=>kind+'/'+row.id+': '+e));
    if(!ecObject(draft.metadata.framework)||Object.keys(species).length===0)errors.push('Migration has not populated the catalog');
    const framework:any=ecCopy(draft.metadata.framework||{});framework.species={};framework.skill_atlas=skills;
    const enemies:any=ecCopy(draft.metadata.legacy_enemies||{}),sources=draft.metadata.asset_sources||{},assigned:any={};
    for(const id of Object.keys(sets)){
        const set=sets[id];enemies[id]=Object.assign({},enemies[id]||{},set,{id});
        delete enemies[id].catalog_projection;enemies[id].presentation_assets={};
        if(ecObject(framework.enemy_skill_bindings)&&!framework.enemy_skill_bindings[id])framework.enemy_skill_bindings[id]={attack_skill:null,boss_skills:[],generic_skills:[]};
    }
    for(const id of Object.keys(assets)){
        const asset=assets[id],key=asset.visual_set_id+':'+asset.slot;
        if(!sets[asset.visual_set_id])errors.push('Asset references missing/inactive set: '+id);
        if(!sources[asset.source_id])errors.push('Asset source not registered in supported client manifest: '+id);
        if(assigned[key])errors.push('Duplicate visual slot: '+key);assigned[key]=true;
        if(enemies[asset.visual_set_id])enemies[asset.visual_set_id].presentation_assets[asset.slot]=ecCopy(asset);
    }
    for(const id of Object.keys(species)){
        const row=ecCopy(species[id]);
        if(!sets[row.visual_set_id])errors.push('Enemy references missing/inactive visual set: '+id);
        for(const variant of row.presentation_variants||[])if(!sets[variant])errors.push('Missing presentation variant: '+variant);
        row.visual_definition_id=row.visual_set_id;delete row.visual_set_id;delete row.display_name;delete row.kind;
        framework.species[id]=row;
        for(const setId of [row.visual_definition_id,...(row.presentation_variants||[])])for(const slot of ['avatar','idle','run','attack','hit','die'])if(!assigned[setId+':'+slot])errors.push('Missing required visual slot: '+setId+':'+slot);
    }
    const managed=draft.metadata.campaign_stages||{};
    const waves:any=ecCopy(draft.metadata.waves||[]).filter((w:any)=>!managed[w.stage_id]),waveMap:any={},stageMap:any={};
    for(const wave of waves){waveMap[wave.stage_id+':'+wave.wave_index]=wave;wave.entries=[];}
    for(const stage of draft.metadata.stages||[])stageMap[stage.id]=stage;
    const positions:any={};
    for(const id of Object.keys(entries)){
        if(managed[entries[id].stage_id])continue;
        const entry=ecCopy(entries[id]),wave=waveMap[entry.stage_id+':'+entry.wave_index],stage=stageMap[entry.stage_id];
        if(!species[entry.enemy_id])errors.push('Entry references missing/inactive enemy: '+id);
        if(!wave||!stage){errors.push('Entry references missing stage/wave: '+id);continue;}
        const position=entry.stage_id+':'+entry.wave_index+':'+entry.entry_index;
        if(positions[position])errors.push('Duplicate stage entry position: '+position);positions[position]=true;
        const sort=entry.entry_index;entry.species_id=entry.enemy_id;
        delete entry.enemy_id;delete entry.stage_id;delete entry.wave_index;delete entry.entry_index;
        for(const difficulty of ['normal','epic','legend']){
            const effective=Object.assign({},entry,(entry.difficulty_overrides||{})[difficulty]||{});
            const error=ecValidateEntry(effective,framework,stage);
            if(error)errors.push(id+'/'+difficulty+': '+error);
        }
        wave.entries.push({sort,entry});
    }
    for(const wave of waves){wave.entries.sort((a:any,b:any)=>a.sort-b.sort);wave.entries=wave.entries.map((e:any)=>e.entry);if(!wave.entries.length)errors.push('Empty managed wave: '+wave.stage_id+':'+wave.wave_index);}
    if(!errors.length){const error=validateEnemyFrameworkCatalog(framework);if(error)errors.push(error);}
    const campaign_stages=Object.keys(managed).map(id=>ecCopy(managed[id].document));
    for(const doc of campaign_stages){doc.stage_rules.wave_element_rates={};for(const wave of doc.waves)if(wave.element_rates)doc.stage_rules.wave_element_rates[wave.id]=wave.element_rates;}
    for(const doc of campaign_stages)errors.push(...campaignValidate(doc,framework));
    return {errors,snapshot:{framework,enemies:Object.keys(enemies).sort().map(id=>enemies[id]),waves,campaign_stages},counts:{catalog:Object.keys(species).length,visual_sets:Object.keys(sets).length,assets:Object.keys(assets).length,skills:Object.keys(skills).length,stage_entries:Object.keys(entries).length,waves:waves.length}};
}

function ecValidateEntry(entry:any,framework:any,stage:any):string {
    if(!framework.species[entry.species_id]||!Number.isInteger(entry.level)||entry.level<1||entry.level>framework.max_level)return 'Unknown enemy/invalid level';
    if(!Number.isInteger(entry.count)||entry.count<1||entry.count>1000||typeof entry.interval!=='number'||!Number.isFinite(entry.interval)||entry.interval<=0||typeof entry.start_delay!=='number'||!Number.isFinite(entry.start_delay)||entry.start_delay<0)return 'Invalid effective spawn schedule';
    if(entry.exp!==undefined&&(!Number.isSafeInteger(entry.exp)||entry.exp<0))return 'Invalid EXP';
    if(entry.formation_lead_seconds!==undefined&&(typeof entry.formation_lead_seconds!=='number'||!Number.isFinite(entry.formation_lead_seconds)||entry.formation_lead_seconds<0))return 'Invalid formation delay';
    if(entry.presentation_id&&entry.presentation_id!==framework.species[entry.species_id].visual_definition_id&&!(framework.species[entry.species_id].presentation_variants||[]).includes(entry.presentation_id))return 'Invalid presentation';
    let pool:any=entry.elements;
    if(entry.random_elements){const r=entry.random_elements;if(entry.elements||!Array.isArray(r.pool)||!Number.isInteger(r.count)||r.count<1||r.count>r.pool.length)return 'Invalid random elements';pool=r.pool;for(const e of pool)if(r.weights&&r.weights[e]!==undefined&&(!(r.weights[e]>0)||!Number.isFinite(r.weights[e])))return 'Invalid element weight';if(r.second_element_chance!==undefined&&(!(r.second_element_chance>=0)||r.second_element_chance>1))return 'Invalid element chance';}
    if(!Array.isArray(pool)||pool.length>5||new Set(pool).size!==pool.length||pool.some((e:any)=>!EC_ELEMENTS.includes(e)))return 'Invalid elements';
    const order=Number((stage.stage_rules||{}).campaign_arc_order||0);
    if(order>0&&order<6&&(entry.random_elements?(entry.random_elements.count>1||entry.random_elements.second_element_chance>0):pool.length>1))return 'Multiple elements require Arc 6+';
    if(framework.species[entry.species_id].balance_profile==='element_boss'&&(!entry.boss||!pool.length))return 'Boss requires boss flag and element';
    if(entry.loadout_template_id&&entry.skills_by_element)return 'Choose one elemental loadout source';
    const template=entry.loadout_template_id?framework.loadout_templates&&framework.loadout_templates[entry.loadout_template_id]:entry.skills_by_element;
    if(template&&!ecObject(template))return 'Invalid elemental loadout';
    if(entry.loadout_template_id&&!template)return 'Unknown loadout template';
    const branches=template?pool.map((element:string)=>({elements:[element],refs:template[element]})):[{elements:pool,refs:entry.skills}];
    for(const branch of branches){
        if(!Array.isArray(branch.refs))return 'Missing equipped skills';
        const seen:any={};let attacks=0;
        for(const ref of branch.refs){if(!ecObject(ref))return 'Invalid equipped skill';const skill=framework.skill_atlas[ref.skill_id];if(!skill||!Number.isInteger(ref.level)||!skill.levels.some((l:any)=>l.level===ref.level)||(skill.element!=='neutral'&&!branch.elements.includes(skill.element)))return 'Missing/incompatible equipped skill';
            if(entry.random_elements&&!template&&skill.element!=='neutral'&&entry.random_elements.count<pool.length)return 'Random subsets require a per-element loadout';
            const slot=skill.kind==='native'?ref.slot:'shared',key=ref.skill_id+':'+slot;if(seen[key])return 'Duplicate equipped skill';seen[key]=true;
            if(skill.kind==='native'&&(!['attack_skill','boss_skills','generic_skills'].includes(slot)||(slot==='generic_skills')!==(skill.executor==='enemy_trait')))return 'Invalid skill slot';
            if(slot==='attack_skill'&&++attacks>1)return 'Multiple basic attacks';
        }
    }
    for(const key of ['attributes','modifiers','hp_mul','atk_mul','def_mul','boss_skill_ids'])if(entry[key]!==undefined)return 'Legacy override '+key;
    return '';
}

function ecMigration(nk:nkruntime.Nakama,assetSources:any):any {
    const framework=ecCopy(parseJsonb(nk.sqlQuery("SELECT value FROM game_config WHERE key='progression'",[])[0].value).enemy_framework);
    const enemies:any={};for(const row of nk.sqlQuery('SELECT * FROM game_enemies ORDER BY id',[]).map(processEnemy))enemies[row.id]=row;
    const waves=nk.sqlQuery('SELECT * FROM game_stage_waves ORDER BY stage_id,wave_index',[]);
    const stages=nk.sqlQuery('SELECT * FROM game_stages ORDER BY id',[]).map((s:any)=>Object.assign({},s,{stage_rules:parseJsonb(s.stage_rules)||{},waves:waves.filter((w:any)=>w.stage_id===s.id).map((w:any)=>Object.assign({},w,{entries:parseJsonb(w.entries)}))}));
    const draft:any={catalog:[],visual_set:[],visual_asset:[],skill:[],stage_entry:[],metadata:{framework:ecCopy(framework),legacy_enemies:enemies,asset_sources:assetSources,stages:[],waves:[],legacy_stage_ids:[]}};
    const wrap=(id:string,data:any)=>({id,data,active:true,revision:'1'});
    for(const id of Object.keys(enemies)){
        const enemy=enemies[id],data:any={display_name:enemy.display_name||id};for(const key of ['attack_type','visual_scale','boss_visual_scale','boss_scale','is_boss'])if(enemy[key]!==undefined)data[key]=enemy[key];
        draft.visual_set.push(wrap(id,data));
        const registeredSource=enemy.presentation_assets&&enemy.presentation_assets.idle&&enemy.presentation_assets.idle.source_id;
        const source=assetSources[id]||assetSources[registeredSource]||Object.keys(assetSources).map(k=>assetSources[k]).find((s:any)=>Array.isArray(s.enemy_ids)&&s.enemy_ids.includes(id));
        const sourceId=assetSources[id]?id:source&&source.id;
        for(const slot of ['avatar','idle','run','attack','hit','die']){
            const configured=enemy.presentation_assets&&enemy.presentation_assets[slot],selected=configured&&assetSources[configured.source_id]?configured.source_id:sourceId;
            if(selected){const asset:any={visual_set_id:id,slot,source_id:selected};if(configured&&configured.fps!==undefined)asset.fps=configured.fps;draft.visual_asset.push(wrap(id+':'+slot,asset));}
        }
    }
    for(const id of Object.keys(framework.species)){
        const row=ecCopy(framework.species[id]);row.visual_set_id=row.visual_definition_id;delete row.visual_definition_id;
        row.display_name=(enemies[row.visual_set_id]||{}).display_name||id;row.kind=(enemies[row.visual_set_id]||{}).is_boss||row.balance_profile==='element_boss'?'boss':'creep';
        if(row.balance_profile==='element_boss')row.element_baselines=ecCopy(framework.boss_element_baselines);
        draft.catalog.push(wrap(id,row));
    }
    for(const id of Object.keys(framework.skill_atlas))draft.skill.push(wrap(id,framework.skill_atlas[id]));
    for(const stage of stages){
        if(Number((stage.stage_rules||{}).enemy_framework_version)!==2){draft.metadata.legacy_stage_ids.push(stage.id);continue;}
        draft.metadata.stages.push({id:stage.id,stage_rules:stage.stage_rules});
        for(const wave of stage.waves||[]){
            draft.metadata.waves.push({stage_id:stage.id,wave_index:wave.wave_index,wave_id:wave.wave_id||'',display_name:wave.display_name||''});
            (wave.entries||[]).forEach((raw:any,index:number)=>{const entry=ecCopy(raw);entry.enemy_id=entry.species_id;delete entry.species_id;Object.assign(entry,{stage_id:stage.id,wave_index:wave.wave_index,entry_index:index});draft.stage_entry.push(wrap(stage.id+':'+wave.wave_index+':'+index,entry));});
        }
    }
    delete draft.metadata.framework.species;delete draft.metadata.framework.skill_atlas;
    return draft;
}

function ecRpc(ctx:nkruntime.Context,_logger:nkruntime.Logger,nk:nkruntime.Nakama,payload:string,kind:string,action:string):string {
    if(!isConfigAdmin(ctx))return ecError(403,'Forbidden');
    let req:any;try{if((payload||'').length>12000000)throw Error();req=JSON.parse(payload||'{}');if(!ecObject(req))throw Error();}catch(_e){return ecError(400,'Invalid request');}
    try {
        const table=EC_TABLES[kind];
        if(action==='list'){
            const limit=req.limit===undefined?20:req.limit,cursor=req.cursor||'',search=req.search||'';
            if(!Number.isInteger(limit)||limit<1||limit>100||typeof cursor!=='string'||cursor.length>180||typeof search!=='string'||search.length>120||(req.active!==undefined&&typeof req.active!=='boolean'))return ecError(400,'Invalid pagination/filter');
            const filters:any={};
            for(const key of ['kind','enemy_id','stage_id','visual_set_id'])if(req[key]!==undefined){
                if(typeof req[key]!=='string'||(key==='kind'?!['creep','boss'].includes(req[key]):!EC_ID.test(req[key]))||(key==='kind'&&kind!=='catalog')||(['enemy_id','stage_id'].includes(key)&&kind!=='stage_entry')||(key==='visual_set_id'&&kind!=='visual_asset'))return ecError(400,'Invalid entity filter');
                filters[key]=req[key];
            }
            const rows=nk.sqlQuery(`SELECT id,data,active,revision::TEXT FROM ${table} WHERE id>$1 AND ($2='' OR id ILIKE '%'||$2||'%' OR data->>'display_name' ILIKE '%'||$2||'%') AND ($3::BOOLEAN IS NULL OR active=$3) AND data @> $5::JSONB ORDER BY id LIMIT $4`,[cursor,search,req.active===undefined?null:req.active,limit+1,JSON.stringify(filters)]).map(ecRow);
            const more=rows.length>limit;if(more)rows.pop();
            const state=nk.sqlQuery('SELECT revision::TEXT FROM enemy_catalog_state WHERE id=1',[])[0];
            return JSON.stringify({success:true,data:{rows,next_cursor:more?rows[rows.length-1].id:'',draft_revision:String(state.revision)}});
        }
        if(action==='get'){
            if(!EC_ID.test(req.id||''))return ecError(400,'Invalid ID');
            const row=nk.sqlQuery(`SELECT *,revision::TEXT FROM ${table} WHERE id=$1`,[req.id])[0];return row?JSON.stringify({success:true,data:ecRow(row)}):ecError(404,'Not found');
        }
        const draft=ecRead(nk);
        if(kind==='stage_entry'&&['save','delete'].includes(action)){const previous=draft.stage_entry.find((r:any)=>r.id===req.id);const sid=(req.data||{}).stage_id||(previous&&previous.data.stage_id);if((draft.metadata.campaign_stages||{})[sid])return ecError(409,'Edit this stage in Stage Designer');}
        if(action==='status')return JSON.stringify({success:true,data:{draft_revision:draft.revision,active_release:draft.active_release,counts:Object.keys(EC_TABLES).reduce((o:any,k:string)=>{o[k]=draft[k].length;return o;},{}),asset_sources:draft.metadata.asset_sources||{},stages:draft.metadata.stages||[],waves:draft.metadata.waves||[],loadout_templates:(draft.metadata.framework||{}).loadout_templates||{},legacy_stage_ids:draft.metadata.legacy_stage_ids||[]}});
        if(action==='validate'){const projected=ecProject(draft);return JSON.stringify({success:true,data:{valid:!projected.errors.length,errors:projected.errors,counts:projected.counts,draft_revision:draft.revision}});}
        if(action==='preview'){
            const record=draft.catalog.find((r:any)=>r.id===req.enemy_id),row=record&&record.data;if(!row||!Number.isInteger(req.level)||req.level<1||req.level>Number((draft.metadata.framework||{}).max_level||200)||!Array.isArray(req.elements)||req.elements.some((e:any)=>!EC_ELEMENTS.includes(e)))return ecError(400,'Invalid preview');
            const stats:any={};for(const stat of Object.keys(row.base_attributes))stats[stat]=row.base_attributes[stat]+(req.level-1)*(row.growth_per_level[stat]||0);
            if(row.balance_profile==='element_boss'){if(!req.elements.length)return ecError(400,'Boss preview requires element');for(const stat of ['hp','atk','def','attack_speed','move_speed'])stats[stat]=Math.max(...req.elements.map((e:string)=>row.element_baselines[e][stat]))*(['hp','atk','def'].includes(stat)?req.level:1);}
            return JSON.stringify({success:true,data:{stats,stage_ids:Array.from(new Set([...draft.stage_entry.filter((r:any)=>r.active&&r.data.enemy_id===req.enemy_id).map((r:any)=>r.data.stage_id),...Object.keys(draft.metadata.campaign_stages||{}).filter(id=>draft.metadata.campaign_stages[id].document.waves.some((w:any)=>w.entries.some((e:any)=>e.species_id===req.enemy_id)))]))}});
        }
        if(typeof req.expected_revision!=='string'||!/^\d{1,18}$/.test(req.expected_revision))return ecError(400,'expected_revision decimal string required');
        if(action==='normalize'){
            if(typeof req.dry_run!=='boolean')return ecError(400,'dry_run boolean required');
            if(req.expected_revision!==draft.revision)return ecError(409,'Draft changed; reload before normalizing');
            const plan=ecNormalize(draft),projected=ecProject(plan.draft);
            if(projected.errors.length)return ecError(422,'Normalized catalog invalid',projected.errors);
            let revision=draft.revision;
            if(!req.dry_run&&plan.changes.length)revision=String((ecLiveEnabled(ctx)?ecLiveMutate(ctx,nk,'batch',plan.changes,projected,draft.revision):parseJsonb(nk.sqlQuery('SELECT enemy_catalog_batch($1::JSONB,$2::BIGINT,$3) AS result',[JSON.stringify(plan.changes),draft.revision,ctx.userId])[0].result)).draft_revision);
            return JSON.stringify({success:true,data:{changes:plan.changes.map((r:any)=>({entity:r.entity,id:r.id,operation:r.operation})),draft_revision:revision,applied:!req.dry_run}});
        }
        if(action==='migrate'){
            if(typeof req.dry_run!=='boolean'||!ecObject(req.asset_sources)||Object.keys(req.asset_sources).length>2000)return ecError(400,'Migration requires dry_run and supported asset_sources');
            const imported=ecMigration(nk,req.asset_sources),projected=ecProject(imported);
            if(projected.errors.length)return ecError(422,'Migration validation failed',projected.errors);
            if(req.dry_run)return JSON.stringify({success:true,data:{counts:projected.counts,legacy_stage_ids:imported.metadata.legacy_stage_ids,draft_revision:draft.revision}});
            const bundle:any={metadata:imported.metadata};for(const key of Object.keys(EC_TABLES))bundle[EC_TABLES[key]]=imported[key];
            const result=ecLiveEnabled(ctx)?ecLiveMutate(ctx,nk,'import',bundle,projected,req.expected_revision):parseJsonb(nk.sqlQuery('SELECT enemy_catalog_import($1::JSONB,$2::BIGINT,$3) AS result',[JSON.stringify(bundle),req.expected_revision,ctx.userId])[0].result);
            return JSON.stringify({success:true,data:Object.assign(result,{counts:projected.counts})});
        }
        if(action==='publish'||action==='rollback'){
            if(typeof req.note!=='string'||!req.note.trim()||req.note.length>1000)return ecError(400,'Release note required');
            let snapshot:any=null;if(action==='publish'){const p=ecProject(draft);if(p.errors.length)return ecError(422,'Catalog validation failed',p.errors);snapshot=p.snapshot;}
            else {if(!/^\d+$/.test(String(req.version||'')))return ecError(400,'Invalid release version');const old=nk.sqlQuery('SELECT snapshot FROM enemy_catalog_releases WHERE version=$1::BIGINT',[req.version])[0];if(old){const target=parseJsonb(old.snapshot);const current=nk.sqlQuery("SELECT id FROM game_stages WHERE (stage_rules->>'stage_designer_version')='1'",[]);if(current.some((r:any)=>!(target.campaign_stages||[]).some((d:any)=>d.id===r.id)))return ecError(422,'Target predates Stage Designer migration; use a complete content checkpoint');}}
            const result=parseJsonb(nk.sqlQuery('SELECT enemy_catalog_publish($1::JSONB,$2::BIGINT,$3,$4,$5::BIGINT) AS result',[snapshot?JSON.stringify(snapshot):null,req.expected_revision,ctx.userId,req.note,action==='rollback'?req.version:null])[0].result);
            return JSON.stringify({success:true,data:result});
        }
        if(action==='save'||action==='delete'){
            if(!EC_ID.test(req.id||''))return ecError(400,'Invalid ID');
            const old=draft[kind].find((r:any)=>r.id===req.id);
            if(action==='delete'&&!old)return ecError(404,'Not found');
            if(action==='save'){
                if(typeof req.active!=='boolean')return ecError(400,'active boolean required');
                const errors=ecValidData(kind,req.id,req.data);if(errors.length)return ecError(422,'Invalid entity',errors);
            }
            draft[kind]=draft[kind].filter((r:any)=>r.id!==req.id);
            if(action==='save')draft[kind].push({id:req.id,data:req.data,active:req.active,revision:'1'});
            const projected=ecProject(draft);
            if(projected.errors.length)return ecError(422,'Reference/compatibility validation failed',projected.errors);
            const result=ecLiveEnabled(ctx)?ecLiveMutate(ctx,nk,'write',{table,id:req.id,data:action==='save'?req.data:null,active:req.active===true,row_revision:req.expected_revision,operation:action},projected,draft.revision):parseJsonb(nk.sqlQuery('SELECT enemy_catalog_write($1,$2,$3::JSONB,$4,$5::BIGINT,$6::BIGINT,$7,$8) AS result',[table,req.id,action==='save'?JSON.stringify(req.data):null,req.active===true,req.expected_revision,draft.revision,ctx.userId,action])[0].result);
            return JSON.stringify({success:true,data:result.row?ecRow(result.row):null,draft_revision:result.draft_revision});
        }
        return ecError(400,'Unknown operation');
    }catch(error){const message=String(error);if(message.includes('EC_CONFLICT'))return ecError(409,'Draft changed; reload before saving');if(message.includes('EC_NOT_FOUND'))return ecError(404,'Not found');_logger.error('Enemy catalog operation failed: %s/%s',kind,action);return ecError(500,'Enemy catalog operation failed');}
}

function ecHistoryRpc(ctx:nkruntime.Context,_logger:nkruntime.Logger,nk:nkruntime.Nakama,payload:string,kind:string,action:string):string {
    if(!isConfigAdmin(ctx))return ecError(403,'Forbidden');
    let req:any;try{req=JSON.parse(payload||'{}');if(!ecObject(req))throw Error();}catch(_e){return ecError(400,'Invalid request');}
    const table=kind==='release'?'enemy_catalog_releases':'enemy_catalog_audit',column=kind==='release'?'version':'id';
    if(action==='get'){
        if(!/^[0-9]{1,18}$/.test(String(req.id||'')))return ecError(400,'Invalid ID');
        const row=nk.sqlQuery(`SELECT *,${column}::TEXT AS id FROM ${table} WHERE ${column}=$1::BIGINT`,[req.id])[0];
        if(!row)return ecError(404,'Not found');if(row.version!==undefined)row.version=String(row.id);if(row.draft_revision!==undefined)row.draft_revision=String(row.draft_revision);
        for(const key of ['snapshot','before_data','after_data'])if(row[key]!==undefined)row[key]=parseJsonb(row[key]);
        return JSON.stringify({success:true,data:row});
    }
    const cursor=String(req.cursor||'9223372036854775807'),limit=req.limit===undefined?20:req.limit;
    if(!/^\d{1,19}$/.test(cursor)||!Number.isInteger(limit)||limit<1||limit>100)return ecError(400,'Invalid pagination');
    const fields=kind==='release'?'version::TEXT AS id,version::TEXT,created_by,note,created_at':'id::TEXT,actor,operation,entity,entity_id,draft_revision::TEXT,created_at';
    const rows=nk.sqlQuery(`SELECT ${fields} FROM ${table} WHERE ${column}<$1::BIGINT ORDER BY ${column} DESC LIMIT $2`,[cursor,limit+1]);const more=rows.length>limit;if(more)rows.pop();
    return JSON.stringify({success:true,data:{rows,next_cursor:more?String(rows[rows.length-1].id):''}});
}

function enemyCatalogVersion(nk:nkruntime.Nakama):string {
    const rows=nk.sqlQuery("SELECT COALESCE(metadata->>'runtime_version',active_release::TEXT) AS version FROM enemy_catalog_state WHERE id=1",[]);return rows.length&&rows[0].version?String(rows[0].version):'0';
}

function rpc_admin_enemy_catalog_list(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return ecRpc(c,l,n,p,"catalog","list");}
function rpc_admin_enemy_catalog_get(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return ecRpc(c,l,n,p,"catalog","get");}
function rpc_admin_enemy_catalog_save(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return ecRpc(c,l,n,p,"catalog","save");}
function rpc_admin_enemy_catalog_delete(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return ecRpc(c,l,n,p,"catalog","delete");}
function rpc_admin_enemy_visual_set_list(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return ecRpc(c,l,n,p,"visual_set","list");}
function rpc_admin_enemy_visual_set_get(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return ecRpc(c,l,n,p,"visual_set","get");}
function rpc_admin_enemy_visual_set_save(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return ecRpc(c,l,n,p,"visual_set","save");}
function rpc_admin_enemy_visual_set_delete(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return ecRpc(c,l,n,p,"visual_set","delete");}
function rpc_admin_enemy_visual_asset_list(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return ecRpc(c,l,n,p,"visual_asset","list");}
function rpc_admin_enemy_visual_asset_get(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return ecRpc(c,l,n,p,"visual_asset","get");}
function rpc_admin_enemy_visual_asset_save(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return ecRpc(c,l,n,p,"visual_asset","save");}
function rpc_admin_enemy_visual_asset_delete(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return ecRpc(c,l,n,p,"visual_asset","delete");}
function rpc_admin_enemy_skill_list(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return ecRpc(c,l,n,p,"skill","list");}
function rpc_admin_enemy_skill_get(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return ecRpc(c,l,n,p,"skill","get");}
function rpc_admin_enemy_skill_save(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return ecRpc(c,l,n,p,"skill","save");}
function rpc_admin_enemy_skill_delete(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return ecRpc(c,l,n,p,"skill","delete");}
function rpc_admin_enemy_stage_entry_list(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return ecRpc(c,l,n,p,"stage_entry","list");}
function rpc_admin_enemy_stage_entry_get(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return ecRpc(c,l,n,p,"stage_entry","get");}
function rpc_admin_enemy_stage_entry_save(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return ecRpc(c,l,n,p,"stage_entry","save");}
function rpc_admin_enemy_stage_entry_delete(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return ecRpc(c,l,n,p,"stage_entry","delete");}
function rpc_admin_enemy_catalog_status(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return ecRpc(c,l,n,p,"catalog","status");}
function rpc_admin_enemy_catalog_normalize(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return ecRpc(c,l,n,p,"catalog","normalize");}
function rpc_admin_enemy_catalog_preview(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return ecRpc(c,l,n,p,"catalog","preview");}
function rpc_admin_enemy_catalog_validate(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return ecRpc(c,l,n,p,"catalog","validate");}
function rpc_admin_enemy_catalog_migrate(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return ecRpc(c,l,n,p,"catalog","migrate");}
function rpc_admin_enemy_catalog_publish(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return ecRpc(c,l,n,p,"catalog","publish");}
function rpc_admin_enemy_catalog_rollback(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return ecRpc(c,l,n,p,"catalog","rollback");}
function rpc_admin_enemy_release_list(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return ecHistoryRpc(c,l,n,p,"release","list");}
function rpc_admin_enemy_release_get(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return ecHistoryRpc(c,l,n,p,"release","get");}
function rpc_admin_enemy_audit_list(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return ecHistoryRpc(c,l,n,p,"audit","list");}
function rpc_admin_enemy_audit_get(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return ecHistoryRpc(c,l,n,p,"audit","get");}
// C269: one content lifecycle, server-owned element allocation and stage documents.
function campaignRates(value:any):boolean {
    return ecObject(value)&&Object.keys(value).length===5&&EC_ELEMENTS.every(e=>typeof value[e]==='number'&&Number.isFinite(value[e])&&value[e]>=0&&value[e]<=100&&Math.abs(value[e]*100-Math.round(value[e]*100))<1e-7)&&Math.abs(EC_ELEMENTS.reduce((n,e)=>n+value[e],0)-100)<1e-7;
}
function campaignRandom(seed:number):()=>number {
    let state=seed>>>0;
    return ()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};
}
function campaignAllocate(count:number,rates:any,random:()=>number):string[] {
    const rows=EC_ELEMENTS.map((element,index)=>{const numerator=count*Math.round(rates[element]*100);return {element,index,count:Math.floor(numerator/10000),remainder:numerator%10000};});
    let remaining=count-rows.reduce((n,r)=>n+r.count,0);
    for(const row of rows.slice().sort((a,b)=>b.remainder-a.remainder||a.index-b.index)){if(remaining--<=0)break;row.count++;}
    const result:string[]=[];for(const row of rows)for(let n=0;n<row.count;n++)result.push(row.element);
    for(let n=result.length-1;n>0;n--){const at=Math.floor(random()*(n+1)),temp=result[n];result[n]=result[at];result[at]=temp;}
    return result;
}
function campaignBonus(rules:any,wave:number):number {const p=rules.progression;return wave<p.start_wave?0:Math.min(p.max_bonus,(1+Math.floor((wave-p.start_wave)/p.every))*p.level_step);}
function campaignDefaults():any {return {stage_designer_version:1,enemy_framework_version:2,enemy_visual_scale_multiplier:1,boss_visual_scale_multiplier:1,spawn_pacing:{batch_size:1,batch_growth_every:4,batch_max:8,individual_delay:0.4,batch_delay:0.65,jitter:0.25,max_alive:45,lane_count:7},wave_transition:{warning_sec:120,grace_sec:10,next_wave_delay:1.5},progression:{start_wave:1,every:4,level_step:0,max_bonus:0}};}
function campaignValidate(doc:any,framework:any):string[] {
    const errors:string[]=[];const fail=(path:string,message:string)=>errors.push(path+': '+message);
    if(!ecObject(doc)||!EC_ID.test(doc.id||'')||!EC_ID.test(doc.arc_id||'')||typeof doc.display_name!=='string'||!doc.display_name.trim()||doc.display_name.length>160)return ['Invalid stage identity/name'];
    if(JSON.stringify(doc).length>1048576)return ['Stage document exceeds 1 MiB'];
    const r=doc.stage_rules;
    if(!ecObject(r)||r.stage_designer_version!==1||r.enemy_framework_version!==2||!campaignRates(r.element_rates))return ['stage_rules.element_rates: five percentages must total 100'];
    const bounded=(o:any,key:string,min:number,max:number,integer=false)=>{if(!ecObject(o)||typeof o[key]!=='number'||!Number.isFinite(o[key])||o[key]<min||o[key]>max||(integer&&!Number.isInteger(o[key])))fail('stage_rules.'+key,'Invalid bound');};
    for(const key of ['enemy_visual_scale_multiplier','boss_visual_scale_multiplier'])bounded(r,key,0.1,5);
    for(const [key,min,max] of [['batch_size',1,16],['batch_growth_every',0,100],['batch_max',1,16],['max_alive',1,200],['lane_count',2,16]] as [string,number,number][])bounded(r.spawn_pacing,key,min,max,true);
    for(const key of ['batch_delay','jitter'])bounded(r.spawn_pacing,key,0,120);
    if(ecObject(r.spawn_pacing)&&r.spawn_pacing.individual_delay!==undefined)bounded(r.spawn_pacing,'individual_delay',0.05,120);
    for(const key of ['warning_sec','grace_sec','next_wave_delay'])bounded(r.wave_transition,key,0,3600);
    for(const [key,min,max] of [['start_wave',1,100],['every',1,100],['level_step',0,100],['max_bonus',0,10000]] as [string,number,number][])bounded(r.progression,key,min,max,true);
    if(errors.length)return errors;
    if(r.spawn_pacing.batch_max<r.spawn_pacing.batch_size)fail('spawn_pacing.batch_max','Below batch size');
    if(r.wave_transition.warning_sec+r.wave_transition.grace_sec<=0)fail('wave_transition','Timeout must be positive');
    if(!Array.isArray(doc.waves)||doc.waves.length<1||doc.waves.length>100)return ['waves: expected 1..100'];
    let total=0;const ids:any={};
    doc.waves.forEach((wave:any,wi:number)=>{
        const path='waves.'+wi;
        if(!ecObject(wave)||!EC_ID.test(wave.id||'')||ids[wave.id]){fail(path,'Invalid/duplicate stable wave ID');return;}ids[wave.id]=true;
        if(typeof wave.display_name!=='string'||wave.display_name.length>160)fail(path,'Invalid name');
        if(wave.element_rates!==undefined&&!campaignRates(wave.element_rates)){fail(path+'.element_rates','Percentages must total 100');return;}
        if(!Array.isArray(wave.entries)||!wave.entries.length||wave.entries.length>100){fail(path,'Expected 1..100 groups');return;}
        const rates=wave.element_rates||r.element_rates,entryIds:any={};
        wave.entries.forEach((entry:any,ei:number)=>{
            const ep=path+'.entries.'+ei;
            if(!ecObject(entry)||!EC_ID.test(entry.id||'')||entryIds[entry.id]){fail(ep,'Invalid/duplicate group ID');return;}entryIds[entry.id]=true;
            for(const forbidden of ['resolved_elements','random_elements','element_sequence','modifiers','attributes'])if(entry[forbidden]!==undefined)fail(ep,forbidden+' is not an authored field');
            if(typeof entry.boss!=='boolean')fail(ep+'.boss','Boolean required');
            if(!entry.boss&&entry.elements!==undefined)fail(ep+'.elements','Creeps use stage/wave rates');
            if(!Number.isInteger(entry.count)||entry.count<1||entry.count>1000)fail(ep+'.count','Expected 1..1000');else total+=entry.count;
            if(!Number.isSafeInteger(entry.exp)||entry.exp<0||entry.exp>1000000)fail(ep+'.exp','Invalid EXP');
            if(typeof entry.interval!=='number'||!Number.isFinite(entry.interval)||entry.interval<0.001||entry.interval>3600||typeof entry.start_delay!=='number'||!Number.isFinite(entry.start_delay)||entry.start_delay<0||entry.start_delay>3600)fail(ep,'Invalid schedule');
            const fixed=entry.boss&&Array.isArray(entry.elements)&&entry.elements.length>0;
            const elements=fixed?entry.elements:EC_ELEMENTS.filter(e=>rates[e]>0);
            for(const difficulty of ['normal','epic','legend']){
                const override=(entry.difficulty_overrides||{})[difficulty]||{};
                if(!ecObject(override)||Object.keys(override).some(k=>!['level','skills','skills_by_element','loadout_template_id'].includes(k))){fail(ep+'.difficulty_overrides','Only level/loadout fields supported');continue;}
                const effective=Object.assign({},entry,override);effective.level+=campaignBonus(r,wi+1);
                const template=effective.loadout_template_id?(framework.loadout_templates||{})[effective.loadout_template_id]:effective.skills_by_element;
                if(effective.loadout_template_id&&!template){fail(ep,'Unknown loadout template');continue;}
                if(fixed){const candidate=ecCopy(effective);if(template)candidate.skills=template[elements[0]];delete candidate.loadout_template_id;delete candidate.skills_by_element;const error=ecValidateEntry(candidate,framework,doc);if(error)fail(ep+'/'+difficulty,error);}
                else for(const element of elements){const candidate=ecCopy(effective);candidate.elements=[element];if(template)candidate.skills=template[element];delete candidate.loadout_template_id;delete candidate.skills_by_element;const error=ecValidateEntry(candidate,framework,doc);if(error)fail(ep+'/'+difficulty+'/'+element,error);}
            }
        });
    });
    if(total>10000)fail('waves','Maximum 10000 individuals');
    return errors;
}
function campaignResolve(doc:any,framework:any,difficulty:string,seed:number,version:string):any {
    if(!['normal','epic','legend'].includes(difficulty)||!Number.isInteger(seed)||seed<0||seed>4294967295)throw Error('Invalid difficulty/seed');
    const errors=campaignValidate(doc,framework);if(errors.length)throw Error(errors.slice(0,20).join('\n'));
    const stage=ecCopy(doc),random=campaignRandom(seed);let total_count=0,total_exp=0;
    stage.waves.forEach((wave:any,wi:number)=>{
        const rates=wave.element_rates||stage.stage_rules.element_rates;
        const allocated=campaignAllocate(wave.entries.filter((e:any)=>!e.boss).reduce((n:number,e:any)=>n+e.count,0),rates,random);let cursor=0;
        for(const entry of wave.entries){
            Object.assign(entry,(entry.difficulty_overrides||{})[difficulty]||{});delete entry.difficulty_overrides;
            entry.level+=campaignBonus(stage.stage_rules,wi+1);
            entry.resolved_elements=[];
            for(let i=0;i<entry.count;i++){
                if(!entry.boss)entry.resolved_elements.push([allocated[cursor++]]);
                else if(Array.isArray(entry.elements)&&entry.elements.length)entry.resolved_elements.push(ecCopy(entry.elements));
                else {let pick=random()*100,chosen=EC_ELEMENTS.filter(e=>rates[e]>0).slice(-1)[0];for(const element of EC_ELEMENTS){pick-=rates[element];if(pick<0){chosen=element;break;}}entry.resolved_elements.push([chosen]);}
            }
            total_count+=entry.count;total_exp+=entry.count*entry.exp;
        }
    });
    return {version:1,stage_id:doc.id,difficulty_id:difficulty,content_version:version,seed,stage,total_count,total_exp};
}
function campaignDocument(nk:nkruntime.Nakama,draft:any,id:string):any {
    const saved=(draft.metadata.campaign_stages||{})[id];if(saved)return ecCopy(saved);
    const header=nk.sqlQuery('SELECT id,arc_id,display_name,stage_rules FROM game_stages WHERE id=$1',[id])[0];if(!header)return null;
    const rules=Object.assign({},parseJsonb(header.stage_rules)||{},campaignDefaults());
    const arc=nk.sqlQuery('SELECT id,element,sort_order,enemy_visual_scale_multiplier FROM game_arcs WHERE id=$1',[header.arc_id])[0];
    rules.campaign_arc_order=Number(arc&&arc.sort_order||0);rules.enemy_visual_scale_multiplier=Number(arc&&arc.enemy_visual_scale_multiplier||1);rules.boss_visual_scale_multiplier=[1,3,4,5,6].includes(rules.campaign_arc_order)?0.6:1;rules.element_rates=EC_ELEMENTS.reduce((o:any,e)=>{o[e]=e===(arc&&arc.element)?100:0;return o;},{});
    if(!campaignRates(rules.element_rates))rules.element_rates={metal:20,water:20,wood:20,fire:20,earth:20};
    const waves=nk.sqlQuery('SELECT * FROM game_stage_waves WHERE stage_id=$1 ORDER BY wave_index',[id]).map((w:any)=>({id:w.wave_id||'wave_'+w.wave_index,display_name:w.display_name||'',entries:(draft.stage_entry.filter((e:any)=>e.active&&e.data.stage_id===id&&e.data.wave_index===w.wave_index).sort((a:any,b:any)=>a.data.entry_index-b.data.entry_index).map((row:any)=>{const e=ecCopy(row.data);e.id=row.id;e.species_id=e.enemy_id;for(const key of ['enemy_id','stage_id','wave_index','entry_index'])delete e[key];return e;}))}));
    for(const wave of waves)for(const entry of wave.entries){if(!entry.boss)delete entry.elements;delete entry.random_elements;}
    return {document:{id,arc_id:header.arc_id,display_name:header.display_name,stage_rules:rules,waves},revision:'0'};
}
function campaignFramework(draft:any):any {
    const framework=Object.assign({},draft.metadata.framework||{},{species:{},skill_atlas:ecIndex(draft.skill)});
    for(const row of draft.catalog)if(row.active)framework.species[row.id]=Object.assign({},row.data,{visual_definition_id:row.data.visual_set_id});
    return framework;
}
function campaignRpc(ctx:nkruntime.Context,logger:nkruntime.Logger,nk:nkruntime.Nakama,payload:string,action:string):string {
    if(!ctx.userId||!isConfigAdmin(ctx))return ecError(403,'Forbidden');
    try {
        if(payload.length>1048576)return ecError(400,'Payload exceeds 1 MiB');
        const req=JSON.parse(payload||'{}'),draft=ecRead(nk);
        if(action==='overview'){
            const arcs=nk.sqlQuery('SELECT id,display_name,sort_order FROM game_arcs ORDER BY sort_order,id',[]).map((a:any)=>({id:a.id,display_name:a.display_name,order:Number(a.sort_order)}));
            const stages=nk.sqlQuery("SELECT id,arc_id,display_name FROM game_stages WHERE (stage_rules->>'enemy_framework_version')='2' ORDER BY arc_id,sort_order,id",[]).map((s:any)=>({...s,managed:!!(draft.metadata.campaign_stages||{})[s.id]}));
            const visuals:any={};for(const asset of draft.visual_asset)if(asset.active&&['run','idle'].includes(asset.data.slot)){const source=(draft.metadata.asset_sources||{})[asset.data.source_id];const sheet=source&&source.sheets&&source.sheets[asset.data.slot];if(sheet&&typeof sheet.path==='string'&&sheet.path.startsWith('res://assets/')&&(!visuals[asset.data.visual_set_id]||asset.data.slot==='run'))visuals[asset.data.visual_set_id]={path:'/api/assets/'+sheet.path.slice('res://assets/'.length).split('/').map(encodeURIComponent).join('/'),columns:sheet.columns||3,rows:sheet.rows||3,frame_count:sheet.frame_count||9};}
            return JSON.stringify({success:true,data:{arcs,stages,visuals,draft_revision:draft.revision,active_release:draft.active_release,enemies:draft.catalog.filter((r:any)=>r.active).map((r:any)=>({id:r.id,display_name:r.data.display_name,kind:r.data.kind,visual_set_id:r.data.visual_set_id})),loadout_templates:Object.keys((draft.metadata.framework||{}).loadout_templates||{}).map(id=>{const template=draft.metadata.framework.loadout_templates[id],refs=template.fire||template[Object.keys(template)[0]]||[],primary=refs.find((r:any)=>((draft.metadata.framework.skill_atlas||{})[r.skill_id]||{}).element!=='neutral')||refs[0],skill=primary&&draft.skill.find((r:any)=>r.id===primary.skill_id);return {id,label:(skill&&skill.data.display_name||primary&&primary.skill_id||id)+' / Lv'+(primary&&primary.level||1)+' / '+refs.length+' skills'};})}});
        }
        if(action==='get'){if(!EC_ID.test(req.id||''))return ecError(400,'Invalid ID');const value=campaignDocument(nk,draft,req.id);return value?JSON.stringify({success:true,data:{...value,draft_revision:draft.revision}}):ecError(404,'Stage not found');}
        const doc=req.document;if(!ecObject(doc))return ecError(400,'document required');
        const header=nk.sqlQuery('SELECT id,arc_id FROM game_stages WHERE id=$1',[doc.id])[0];if(!header||header.arc_id!==doc.arc_id)return ecError(422,'Stage/Arc identity cannot change');
        const arc=nk.sqlQuery('SELECT sort_order FROM game_arcs WHERE id=$1',[doc.arc_id])[0];doc.stage_rules={...doc.stage_rules,campaign_arc_order:Number(arc&&arc.sort_order||0)};
        const framework=campaignFramework(draft),errors=campaignValidate(doc,framework);
        if(errors.length)return ecError(422,'Invalid stage',errors);
        if(action==='resolve')return JSON.stringify({success:true,data:campaignResolve(doc,framework,req.difficulty_id||'normal',req.seed===undefined?269:req.seed,draft.revision)});
        if(action!=='save')return ecError(400,'Unknown operation');
        if(!/^\d{1,18}$/.test(req.expected_revision||'')||!/^\d{1,18}$/.test(req.expected_draft_revision||''))return ecError(400,'Revisions required');
        const next=ecCopy(draft);next.metadata.campaign_stages=next.metadata.campaign_stages||{};next.metadata.campaign_stages[doc.id]={document:doc,revision:req.expected_revision};
        const result=ecLiveEnabled(ctx)?ecProject(next):{errors:[],snapshot:null};if(result.errors.length)return ecError(422,'Content validation failed',result.errors.slice(0,30));
        const saved=parseJsonb(nk.sqlQuery('SELECT campaign_stage_write($1::JSONB,$2,$3::BIGINT,$4,$5::JSONB,$6) AS result',[JSON.stringify(doc),req.expected_revision,req.expected_draft_revision,ctx.userId,JSON.stringify(result.snapshot),ecLiveEnabled(ctx)])[0].result);
        return JSON.stringify({success:true,data:saved});
    } catch(error){const message=String(error);if(message.includes('EC_CONFLICT'))return ecError(409,'Configuration changed; reload before saving');logger.error('Campaign operation failed: %s',message);return ecError(422,'Stage operation failed; check configuration');}
}
function rpc_admin_campaign_overview(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return campaignRpc(c,l,n,p,'overview');}
function rpc_admin_campaign_stage_get(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return campaignRpc(c,l,n,p,'get');}
function rpc_admin_campaign_stage_save(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return campaignRpc(c,l,n,p,'save');}
function rpc_admin_campaign_stage_resolve(c:nkruntime.Context,l:nkruntime.Logger,n:nkruntime.Nakama,p:string):string{return campaignRpc(c,l,n,p,'resolve');}
function campaignRunPlan(nk:nkruntime.Nakama,stageId:string,difficulty:string,runId:string):any {
    const row=nk.sqlQuery('SELECT id,arc_id,display_name,stage_rules FROM game_stages WHERE id=$1',[stageId])[0];
    if(!row||Number((parseJsonb(row.stage_rules)||{}).stage_designer_version)!==1)return null;
    const framework=parseJsonb(nk.sqlQuery("SELECT value FROM game_config WHERE key='progression'",[])[0].value).enemy_framework;
    const waves=nk.sqlQuery('SELECT * FROM game_stage_waves WHERE stage_id=$1 ORDER BY wave_index',[stageId]).map((w:any)=>({id:w.wave_id,display_name:w.display_name||'',entries:parseJsonb(w.entries)}));
    const rates=(parseJsonb(row.stage_rules)||{}).wave_element_rates||{};for(const wave of waves)if(rates[wave.id])wave.element_rates=rates[wave.id];
    let seed=269;for(let i=0;i<runId.length;i++)seed=(Math.imul(seed,31)+runId.charCodeAt(i))>>>0;
    return campaignResolve({id:row.id,arc_id:row.arc_id,display_name:row.display_name,stage_rules:parseJsonb(row.stage_rules),waves},framework,difficulty,seed,String(framework.catalog_version||'0'));
}
const getStagePlan:nkruntime.RpcFunction=(ctx,_l,nk,payload)=>{
    if(!ctx.userId)return ecError(403,'Session required');
    let req:any;try{req=JSON.parse(payload||'{}');}catch(_){return ecError(400,'Invalid JSON');}
    const row=nk.storageRead([{collection:'player_stage_runs',key:'active',userId:ctx.userId}])[0],run=row&&row.value;
    if(!run||run.run_id!==req.run_id||run.status!=='active'||Date.now()>=Number(run.expires_at_ms))return ecError(404,'Active run not found');
    if(run.enemy_catalog_version!==enemyCatalogVersion(nk))return ecError(409,'Content changed; start a new run');
    return JSON.stringify({success:true,encounter_plan:run.encounter_plan||null});
};
