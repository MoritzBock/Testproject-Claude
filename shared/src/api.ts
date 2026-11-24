import { z } from 'zod';

/** Response of GET /api/health – contains no personal data. */
export const HealthResponse = z.object({
  status: z.literal('ok'),
  version: z.string(),
  uptimeSeconds: z.number().int().nonnegative(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
