export type TelegramUser = {
    id: number;
    username?: string;
    first_name?: string;
    last_name?: string;
};
export declare function parseInitData(initData: string): Record<string, string>;
/**
 * Verify Telegram WebApp initData signature.
 * Docs: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export declare function verifyTelegramInitData(initData: string, botToken: string, maxAgeSeconds?: number): {
    ok: boolean;
    reason?: string;
    data?: Record<string, string>;
};
export declare function extractTelegramUser(data: Record<string, string>): TelegramUser | null;
