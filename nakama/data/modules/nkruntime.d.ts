// Nakama TypeScript Runtime Type Declarations
// For Nakama 3.x JavaScript runtime (global nkruntime namespace)
// Reference: https://heroiclabs.com/docs/nakama/server-framework/typescript-runtime/

declare namespace nkruntime {
    interface Context {
        env: { [key: string]: string };
        executionMode: ExecutionMode;
        queryParams: { [key: string]: string[] };
        userId: string;
        username: string;
        vars: { [key: string]: string };
        clientIp: string;
        clientPort: string;
        matchId: string;
        matchNode: string;
        matchLabel: string;
        matchTickRate: number;
        lang: string;
        sessionId: string;
    }

    type RpcFunction = (
        ctx: Context,
        logger: Logger,
        nk: Nakama,
        payload: string
    ) => string;

    interface Logger {
        debug(format: string, ...params: any[]): void;
        info(format: string, ...params: any[]): void;
        warn(format: string, ...params: any[]): void;
        error(format: string, ...params: any[]): void;
    }

    interface Nakama {
        sqlExec(query: string, parameters: any[]): { rowsAffected: number };
        sqlQuery(query: string, parameters: any[]): any[];
        httpRequest(
            url: string,
            method: string,
            headers: { [key: string]: string },
            body: string,
            timeoutMs?: number
        ): { code: number; headers: { [key: string]: string[] }; body: string };
        uuidv4(): string;
        purchaseValidateGoogle(userId: string, receipt: string, persist?: boolean): ValidatePurchaseResponse;

        // Storage
        storageRead(reads: StorageReadRequest[]): StorageObject[];
        storageWrite(writes: StorageWriteRequest[]): StorageWriteAck[];
        storageDelete(deletes: StorageDeleteRequest[]): void;

        // Account
        accountGetId(userId: string): Account;
        authenticateGoogle(token: string, username?: string, create?: boolean): {userId:string;username:string;created:boolean};
        linkGoogle(userId: string, token: string): void;
        usersBanId(userIds: string[]): void;
        sessionLogout(userId: string, token?: string, refreshToken?: string): void;
        leaderboardRecordDelete(id: string, ownerId: string): void;

        // Leaderboard
        leaderboardCreate(
            id: string,
            authoritative: boolean,
            sortOrder: SortOrder,
            operator: Operator,
            resetSchedule: string,
            metadata: { [key: string]: any }
        ): void;
        leaderboardRecordWrite(
            id: string,
            ownerId: string,
            username: string,
            score: number,
            subscore: number,
            metadata: { [key: string]: any }
        ): LeaderboardRecord;
        leaderboardRecordsList(
            id: string,
            ownerIds: string[],
            limit: number,
            cursor: string,
            expiry: number
        ): LeaderboardRecordList;
    }

    interface ValidatedPurchase {
        userId: string;
        productId: string;
        transactionId: string;
        store: string;
        providerResponse: string;
        purchaseTime: number;
        createTime?: number;
        updateTime?: number;
        refundTime?: number;
        environment: string;
        seenBefore: boolean;
    }

    interface ValidatePurchaseResponse {
        validatedPurchases: ValidatedPurchase[];
    }

    interface Initializer {
        registerRpc(id: string, func: RpcFunction): void;
        registerBeforeRt(id: string, func: any): void;
        registerAfterRt(id: string, func: any): void;
        registerMatch(name: string, config: any): void;
    }

    interface StorageReadRequest {
        collection: string;
        key: string;
        userId: string;
    }

    interface StorageWriteRequest {
        collection: string;
        key: string;
        userId: string;
        value: { [key: string]: any };
        version?: string;
        permissionRead?: number;
        permissionWrite?: number;
    }

    interface StorageDeleteRequest {
        collection: string;
        key: string;
        userId: string;
    }

    interface StorageObject {
        collection: string;
        key: string;
        userId: string;
        value: { [key: string]: any };
        version: string;
        permissionRead: number;
        permissionWrite: number;
        createTime: number;
        updateTime: number;
    }

    interface StorageWriteAck {
        collection: string;
        key: string;
        userId: string;
        version: string;
    }

    interface Account {
        user: User;
        wallet: string;
        email: string;
        devices: AccountDevice[];
        customId: string;
        verifyTime: number;
        disableTime: number;
    }

    interface User {
        userId: string;
        username: string;
        displayName: string;
        avatarUrl: string;
        langTag: string;
        location: string;
        timezone: string;
        metadata: { [key: string]: any };
        facebookId: string;
        googleId: string;
        gamecenterId: string;
        steamId: string;
        online: boolean;
        edgeCount: number;
        createTime: number;
        updateTime: number;
    }

    interface AccountDevice {
        id: string;
        vars: { [key: string]: string };
    }

    interface LeaderboardRecord {
        leaderboardId: string;
        ownerId: string;
        username: string;
        score: number;
        subscore: number;
        numScore: number;
        metadata: { [key: string]: any };
        createTime: number;
        updateTime: number;
        expiryTime: number;
        rank: number;
    }

    interface LeaderboardRecordList {
        records: LeaderboardRecord[];
        ownerRecords: LeaderboardRecord[];
        nextCursor: string;
        prevCursor: string;
    }

    enum ExecutionMode {
        Event = "event",
        Match = "match",
        MatchHandler = "match_handler",
        Plugin = "plugin",
        Runtime = "runtime",
        Rpc = "rpc",
    }

    enum SortOrder {
        Ascending = "asc",
        Descending = "desc",
    }

    enum Operator {
        Best = "best",
        Set = "set",
        Increment = "incr",
        Decrement = "decr",
    }

    // Errors
    interface Error {
        message: string;
        code: number;
    }
}
