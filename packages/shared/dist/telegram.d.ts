export declare function parseInitData(initData: string): Record<string, string>;
export declare function verifyTelegramInitData(initData: string, botToken: string, maxAgeSec?: number): boolean;
export declare function extractTelegramUser(initData: string): {
    tg_id: bigint;
    username?: string;
    first_name?: string;
    last_name?: string;
} | null;
