import { hash, verify } from '@node-rs/argon2'

/** Hash a plaintext password with argon2id (sensible defaults from @node-rs/argon2). */
export function hashPassword(plain: string): Promise<string> {
  return hash(plain)
}

/** Verify a plaintext password against a stored argon2 hash. */
export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(storedHash, plain)
  } catch {
    // Malformed hash, etc. — treat as a failed verification rather than throwing.
    return false
  }
}
