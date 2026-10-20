function createMonetizationTables(nk: nkruntime.Nakama, logger: nkruntime.Logger): void {
    nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS game_store_products (
            product_id              TEXT PRIMARY KEY,
            pack_id                 TEXT NOT NULL UNIQUE,
            tab_id                  TEXT NOT NULL DEFAULT '',
            display_name            TEXT NOT NULL,
            description             TEXT NOT NULL DEFAULT '',
            badge                   TEXT NOT NULL DEFAULT '',
            icon_type               TEXT NOT NULL DEFAULT 'pack',
            icon_key                TEXT NOT NULL DEFAULT '',
            fallback_price          TEXT NOT NULL DEFAULT '',
            google_product_type     TEXT NOT NULL DEFAULT 'inapp',
            fulfillment_type        TEXT NOT NULL DEFAULT 'consumable',
            active                  BOOLEAN NOT NULL DEFAULT FALSE,
            unique_purchase         BOOLEAN NOT NULL DEFAULT FALSE,
            purchase_limit          INT NOT NULL DEFAULT 0,
            purchase_limit_period   TEXT NOT NULL DEFAULT '',
            ui                      JSONB NOT NULL DEFAULT '{}',
            created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `, []);
    nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS game_store_product_rewards (
            product_id              TEXT NOT NULL REFERENCES game_store_products(product_id) ON DELETE CASCADE,
            line_no                 INT NOT NULL,
            reward_type             TEXT NOT NULL,
            reward_id               TEXT NOT NULL,
            quantity                BIGINT NOT NULL CHECK (quantity > 0),
            metadata                JSONB NOT NULL DEFAULT '{}',
            PRIMARY KEY (product_id, line_no)
        )
    `, []);
    nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS monetization_purchase_orders (
            id                      TEXT PRIMARY KEY,
            user_id                 TEXT NOT NULL,
            product_id              TEXT NOT NULL REFERENCES game_store_products(product_id),
            status                  TEXT NOT NULL DEFAULT 'pending',
            reward_snapshot         JSONB NOT NULL,
            fulfillment_type        TEXT NOT NULL,
            transaction_id          TEXT NOT NULL DEFAULT '',
            purchase_token_hash     TEXT NOT NULL DEFAULT '',
            failure_reason          TEXT NOT NULL DEFAULT '',
            created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at              TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
            validated_at            TIMESTAMPTZ,
            fulfilled_at            TIMESTAMPTZ,
            updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `, []);
    nk.sqlExec(`ALTER TABLE monetization_purchase_orders ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'android';
        ALTER TABLE monetization_purchase_orders ADD COLUMN IF NOT EXISTS store_product_id TEXT NOT NULL DEFAULT '';
        ALTER TABLE monetization_purchase_orders ADD COLUMN IF NOT EXISTS target_server_id TEXT NOT NULL DEFAULT '';
        ALTER TABLE monetization_purchase_orders ADD COLUMN IF NOT EXISTS target_generation INT NOT NULL DEFAULT 0;
        CREATE TABLE IF NOT EXISTS game_store_platform_products (
            platform TEXT NOT NULL CHECK(platform IN ('android','ios')),
            product_id TEXT NOT NULL REFERENCES game_store_products(product_id),
            store_product_id TEXT NOT NULL,
            active BOOL NOT NULL DEFAULT FALSE,
            PRIMARY KEY(platform,product_id), UNIQUE(platform,store_product_id)
        )`, []);
    nk.sqlExec("CREATE INDEX IF NOT EXISTS purchase_orders_user_status_idx ON monetization_purchase_orders(user_id, status, created_at DESC)", []);
    nk.sqlExec("CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_one_pending_uq ON monetization_purchase_orders(user_id, product_id) WHERE status = 'pending'", []);
    nk.sqlExec("CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_token_uq ON monetization_purchase_orders(purchase_token_hash) WHERE purchase_token_hash <> ''", []);
    nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS player_monetization_entitlements (
            user_id                 TEXT PRIMARY KEY,
            no_ads_expires_at       TIMESTAMPTZ,
            source                  TEXT NOT NULL DEFAULT '',
            last_product_id         TEXT NOT NULL DEFAULT '',
            updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `, []);

    nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS monetization_purchases (
            id                      BIGSERIAL PRIMARY KEY,
            request_id              TEXT NOT NULL UNIQUE,
            user_id                 TEXT NOT NULL,
            platform                TEXT NOT NULL,
            product_id              TEXT NOT NULL,
            purchase_token_hash     TEXT NOT NULL DEFAULT '',
            order_id                TEXT NOT NULL DEFAULT '',
            status                  TEXT NOT NULL,
            granted_seconds         BIGINT NOT NULL DEFAULT 0,
            purchased_at            TIMESTAMPTZ,
            verified_at             TIMESTAMPTZ,
            consumed_at             TIMESTAMPTZ,
            created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `, []);
    nk.sqlExec(
        "CREATE UNIQUE INDEX IF NOT EXISTS monetization_purchases_token_hash_uq " +
        "ON monetization_purchases(purchase_token_hash) WHERE purchase_token_hash <> ''",
        []
    );
    nk.sqlExec("ALTER TABLE monetization_purchases ADD COLUMN IF NOT EXISTS purchase_order_id TEXT NOT NULL DEFAULT ''", []);
    nk.sqlExec("ALTER TABLE monetization_purchases ALTER COLUMN granted_seconds TYPE BIGINT", []);

    nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS monetization_ad_rewards (
            ad_session_id           TEXT PRIMARY KEY,
            admob_transaction_id    TEXT UNIQUE,
            user_id                 TEXT NOT NULL,
            placement_id            TEXT NOT NULL,
            reward_type             TEXT NOT NULL,
            reward_amount           INT NOT NULL,
            status                  TEXT NOT NULL DEFAULT 'prepared',
            custom_data             TEXT NOT NULL DEFAULT '',
            context                 JSONB NOT NULL DEFAULT '{}',
            created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            verified_at             TIMESTAMPTZ,
            granted_at              TIMESTAMPTZ,
            consumed_at             TIMESTAMPTZ,
            expires_at              TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 minutes'
        )
    `, []);
    nk.sqlExec(
        "CREATE INDEX IF NOT EXISTS monetization_ad_rewards_user_status_idx " +
        "ON monetization_ad_rewards(user_id, status, created_at DESC)",
        []
    );
    nk.sqlExec("ALTER TABLE monetization_ad_rewards ADD COLUMN IF NOT EXISTS context JSONB NOT NULL DEFAULT '{}'", []);
    nk.sqlExec("ALTER TABLE monetization_ad_rewards ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ", []);
    nk.sqlExec("ALTER TABLE monetization_ad_rewards ADD COLUMN IF NOT EXISTS delivery_source TEXT NOT NULL DEFAULT 'ad'", []);
    nk.sqlExec("ALTER TABLE monetization_ad_rewards ADD COLUMN IF NOT EXISTS client_request_id TEXT NOT NULL DEFAULT ''", []);
    nk.sqlExec("CREATE UNIQUE INDEX IF NOT EXISTS monetization_ad_request_uq ON monetization_ad_rewards(user_id,client_request_id) WHERE client_request_id<>''", []);
    // The unique key is the server-side daily quota guard. It prevents two
    // rewarded sessions from granting the same daily placement concurrently.
    nk.sqlExec(`
        CREATE TABLE IF NOT EXISTS monetization_daily_reward_claims (
            user_id         TEXT NOT NULL,
            placement_id    TEXT NOT NULL,
            reward_date     DATE NOT NULL DEFAULT CURRENT_DATE,
            ad_session_id   TEXT NOT NULL UNIQUE,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, placement_id, reward_date)
        )
    `, []);

    nk.sqlExec("ALTER TABLE monetization_daily_reward_claims ADD COLUMN IF NOT EXISTS claim_slot INT NOT NULL DEFAULT 1", []);
    nk.sqlExec("ALTER TABLE monetization_daily_reward_claims ALTER COLUMN reward_date SET DEFAULT (NOW() AT TIME ZONE 'UTC')::DATE", []);
    nk.sqlExec(`DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='monetization_daily_reward_claims'::regclass AND contype='p' AND pg_get_constraintdef(oid) NOT LIKE '%claim_slot%') THEN
            ALTER TABLE monetization_daily_reward_claims DROP CONSTRAINT monetization_daily_reward_claims_pkey;
            ALTER TABLE monetization_daily_reward_claims ADD PRIMARY KEY (user_id,placement_id,reward_date,claim_slot);
        END IF;
    END $$`, []);
    // Preserve today's spent stamina quota when upgrading the old runtime.
    nk.sqlExec(`INSERT INTO monetization_daily_reward_claims (user_id,placement_id,reward_date,claim_slot,ad_session_id)
        SELECT user_id,'stamina_dialog_ad',reward_date,slot,ad_session_id FROM (
            SELECT user_id,(granted_at AT TIME ZONE 'UTC')::DATE AS reward_date,ad_session_id,
                ROW_NUMBER() OVER (PARTITION BY user_id,(granted_at AT TIME ZONE 'UTC')::DATE ORDER BY granted_at,ad_session_id) AS slot
            FROM monetization_ad_rewards WHERE placement_id IN ('stamina_dialog_ad','main_menu_stamina')
                AND status='granted' AND granted_at IS NOT NULL
                AND (granted_at AT TIME ZONE 'UTC')::DATE=(NOW() AT TIME ZONE 'UTC')::DATE
        ) history WHERE slot<=3 ON CONFLICT DO NOTHING`, []);
    nk.sqlExec(`CREATE TABLE IF NOT EXISTS monetization_daily_fragment_rewards (
        user_id TEXT NOT NULL,
        reward_date DATE NOT NULL,
        item_id TEXT NOT NULL,
        granted_at TIMESTAMPTZ,
        PRIMARY KEY (user_id,reward_date)
    )`, []);

    nk.sqlExec("ALTER TABLE monetization_purchase_orders ADD COLUMN IF NOT EXISTS vip_exp BIGINT CHECK (vip_exp >= 0)", []);
    nk.sqlExec("ALTER TABLE monetization_purchase_orders ADD COLUMN IF NOT EXISTS vip_environment TEXT NOT NULL DEFAULT ''", []);
    nk.sqlExec(`CREATE TABLE IF NOT EXISTS player_vip_credits (
        purchase_id BIGINT PRIMARY KEY REFERENCES monetization_purchases(id),
        user_id TEXT NOT NULL,
        environment TEXT NOT NULL,
        exp BIGINT NOT NULL CHECK (exp >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`, []);
    nk.sqlExec("CREATE INDEX IF NOT EXISTS player_vip_credits_user_idx ON player_vip_credits(user_id, environment)", []);
    for(const table of ['monetization_purchases','monetization_ad_rewards','monetization_daily_reward_claims','monetization_daily_fragment_rewards']) {
        nk.sqlExec('ALTER TABLE '+table+" ADD COLUMN IF NOT EXISTS target_server_id TEXT NOT NULL DEFAULT ''; ALTER TABLE "+table+' ADD COLUMN IF NOT EXISTS target_generation INT NOT NULL DEFAULT 0',[]);
    }
    nk.sqlExec(`DROP INDEX IF EXISTS purchase_orders_one_pending_uq;
      CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_one_pending_scope_uq ON monetization_purchase_orders(user_id,product_id,target_server_id,target_generation) WHERE status='pending';
      CREATE TABLE IF NOT EXISTS store_receipt_reservations (
        token_hash TEXT PRIMARY KEY,order_id TEXT NOT NULL UNIQUE REFERENCES monetization_purchase_orders(id),
        user_id TEXT NOT NULL,target_server_id TEXT NOT NULL,target_generation INT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`,[]);
    nk.sqlExec(`DROP INDEX IF EXISTS monetization_ad_request_uq;
      CREATE UNIQUE INDEX IF NOT EXISTS monetization_ad_request_scope_uq ON monetization_ad_rewards(user_id,target_server_id,target_generation,client_request_id) WHERE client_request_id<>'';
      DO $scope$ BEGIN
        IF EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='monetization_daily_reward_claims'::regclass AND contype='p' AND pg_get_constraintdef(oid) NOT LIKE '%target_server_id%') THEN
          ALTER TABLE monetization_daily_reward_claims DROP CONSTRAINT monetization_daily_reward_claims_pkey;
          ALTER TABLE monetization_daily_reward_claims ADD PRIMARY KEY(user_id,target_server_id,target_generation,placement_id,reward_date,claim_slot);
        END IF;
        IF EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='monetization_daily_fragment_rewards'::regclass AND contype='p' AND pg_get_constraintdef(oid) NOT LIKE '%target_server_id%') THEN
          ALTER TABLE monetization_daily_fragment_rewards DROP CONSTRAINT monetization_daily_fragment_rewards_pkey;
          ALTER TABLE monetization_daily_fragment_rewards ADD PRIMARY KEY(user_id,target_server_id,target_generation,reward_date);
        END IF;
      END $scope$;
      CREATE TABLE IF NOT EXISTS server_financial_inbox(
        event_id TEXT PRIMARY KEY,event_type TEXT NOT NULL,user_id TEXT NOT NULL,target_server_id TEXT NOT NULL,target_generation INT NOT NULL,
        payload JSONB NOT NULL,status TEXT NOT NULL DEFAULT 'pending',reason TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`,[]);
    nk.sqlExec(`CREATE TABLE IF NOT EXISTS store_purchase_voids(token_hash TEXT PRIMARY KEY,received_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
      CREATE OR REPLACE FUNCTION void_store_purchase(token TEXT) RETURNS JSONB LANGUAGE plpgsql AS $void$
      DECLARE changed JSONB;
      BEGIN
        INSERT INTO store_purchase_voids(token_hash) VALUES(token) ON CONFLICT DO NOTHING;
        WITH revoked AS (
          UPDATE monetization_purchases SET status='voided',updated_at=NOW() WHERE purchase_token_hash=token AND status<>'voided' RETURNING *
        ), expired_mail AS (
          UPDATE storage SET value=jsonb_set(jsonb_set(value,'{expires_at_ms}',to_jsonb((EXTRACT(EPOCH FROM clock_timestamp())*1000)::BIGINT)),
            '{purge_at_ms}',to_jsonb((EXTRACT(EPOCH FROM clock_timestamp()+INTERVAL '7 days')*1000)::BIGINT)),
            version=md5(version||clock_timestamp()::TEXT),update_time=NOW()
          WHERE collection='player_mail' AND value->>'source_id'='purchase:'||token AND value->>'claimed_at_ms' IS NULL
        ), entitlements AS (
          UPDATE player_monetization_entitlements e SET no_ads_expires_at=GREATEST(NOW(),e.no_ads_expires_at-(r.granted_seconds*INTERVAL '1 second')),
            source='google_play_voided',updated_at=NOW() FROM revoked r WHERE e.user_id=r.user_id
        ), queued AS (
          INSERT INTO server_financial_inbox(event_id,event_type,user_id,target_server_id,target_generation,payload,reason)
          SELECT 'void:'||token,'store_void',user_id,target_server_id,target_generation,jsonb_build_object('purchase_id',id),'REVIEW_CONSUMABLE_REVOCATION'
            FROM revoked WHERE target_server_id<>'' ON CONFLICT DO NOTHING
        ) SELECT to_jsonb(r) INTO changed FROM revoked r LIMIT 1;
        RETURN changed;
      END $void$;`,[]);
    logger.info("Monetization tables created/verified.");
}
