import { z } from 'zod';
export declare const zUser: z.ZodObject<{
    id: z.ZodString;
    tg_id: z.ZodBigInt;
    username: z.ZodNullable<z.ZodString>;
    first_name: z.ZodNullable<z.ZodString>;
    last_name: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    username: string | null;
    first_name: string | null;
    last_name: string | null;
    id: string;
    tg_id: bigint;
}, {
    username: string | null;
    first_name: string | null;
    last_name: string | null;
    id: string;
    tg_id: bigint;
}>;
export type User = z.infer<typeof zUser>;
export type ApiError = {
    ok: false;
    code: string;
    error: string;
};
export type ApiOk<T> = {
    ok: true;
    data: T;
};
