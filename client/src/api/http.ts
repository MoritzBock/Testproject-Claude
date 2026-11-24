import type { ApiErrorCode } from '@pixel/shared';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ApiErrorCode | 'network' | 'internal',
    message: string,
  ) {
    super(message);
  }
}

/** Global hook: called when the session is gone (e.g. expired) – the app returns to the login. */
export const apiHooks = { onUnauthenticated: () => {} };

/**
 * JSON fetch against our own origin. The session lives in an httpOnly cookie –
 * no tokens are ever handled or stored by client code.
 */
export async function api<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'content-type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network', 'Keine Verbindung zum Server.');
  }
  const data = (await res.json().catch(() => ({}))) as { error?: ApiErrorCode; message?: string };
  if (!res.ok) {
    if (res.status === 401 && data.error === 'unauthenticated') apiHooks.onUnauthenticated();
    throw new ApiError(res.status, data.error ?? 'internal', data.message ?? 'Unbekannter Fehler.');
  }
  return data as T;
}

export const get = <T>(url: string) => api<T>('GET', url);
export const post = <T>(url: string, body: unknown = {}) => api<T>('POST', url, body);
export const put = <T>(url: string, body: unknown = {}) => api<T>('PUT', url, body);
export const patch = <T>(url: string, body: unknown = {}) => api<T>('PATCH', url, body);
export const del = <T>(url: string, body: unknown = {}) => api<T>('DELETE', url, body);
