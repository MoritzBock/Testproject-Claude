import type { ApiErrorCode } from '@pixel/shared';
import type { ZodType } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: ApiErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = 'Eintrag') =>
  new HttpError(404, 'not_found', `${what} nicht gefunden.`);
export const forbidden = (msg = 'Keine Berechtigung.') => new HttpError(403, 'forbidden', msg);
export const conflict = (msg: string) => new HttpError(409, 'conflict', msg);

/** Validates untrusted input with zod; throws a 400 with a German message. */
export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    const msg = r.error.issues.map((i) => i.message).join(' ');
    throw new HttpError(400, 'validation', msg || 'Ungültige Eingabe.');
  }
  return r.data;
}
