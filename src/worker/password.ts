import bcrypt from "bcryptjs";

// bcrypt over Argon2id: Argon2's reference implementations need WASM/native
// bindings, which is more moving parts than this fix needs. bcryptjs is pure
// JS, runs on the Workers runtime as-is, and is one of the two algorithms
// asked for. 12 rounds is comfortably above the OWASP-recommended floor (10)
// without pushing per-login CPU time into Workers' execution limits.
const SALT_ROUNDS = 12;
export const MIN_PASSWORD_LENGTH = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function passwordStrengthError(password: string): string | null {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}
