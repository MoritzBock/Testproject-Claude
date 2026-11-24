import type { Role } from '@pixel/shared';

export interface AuthUser {
  id: string;
  role: Role;
  username: string;
  classId: string | null;
  mustChangePassword: boolean;
  privacyAckVersion: number | null;
  totpEnabled: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
    sessionHash: string | null;
  }
}
