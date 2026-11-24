import { z } from 'zod';

export const PASSWORD_MIN = 10;
export const USERNAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{2,23}$/;

export const Username = z
  .string()
  .trim()
  .regex(USERNAME_RE, 'Benutzername: 3–24 Zeichen, Buchstaben, Ziffern, . _ -');
export const Password = z
  .string()
  .min(PASSWORD_MIN, `Das Passwort muss mindestens ${PASSWORD_MIN} Zeichen lang sein.`)
  .max(200);
export const ClassCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{4,12}$/, 'Ungültiger Klassencode');

export const LoginRequest = z.object({
  classCode: ClassCode.optional().or(z.literal('').transform(() => undefined)),
  username: z.string().trim().min(1).max(40),
  password: z.string().min(1).max(200),
  totp: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export const ChangePasswordRequest = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: Password,
});

export type Role = 'student' | 'teacher' | 'superadmin';

export interface MeResponse {
  id: string;
  username: string;
  role: Role;
  classId: string | null;
  className: string | null;
  mustChangePassword: boolean;
  privacyAckRequired: boolean;
  privacyVersion: number;
  totpEnabled: boolean;
  totpSetupRequired: boolean;
  hasCharacter: boolean;
}

/** API error codes the client reacts to. */
export type ApiErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'password_change_required'
  | 'privacy_ack_required'
  | 'totp_required'
  | 'totp_setup_required'
  | 'invalid_credentials'
  | 'locked'
  | 'rate_limited'
  | 'validation'
  | 'not_found'
  | 'conflict'
  | 'disabled';
