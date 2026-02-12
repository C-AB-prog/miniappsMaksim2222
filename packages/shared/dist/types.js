import { z } from 'zod';
export const zUser = z.object({
    id: z.string().uuid(),
    tg_id: z.coerce.bigint(),
    username: z.string().nullable(),
    first_name: z.string().nullable(),
    last_name: z.string().nullable()
});
