import { z } from 'zod'

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email('A valid email is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(200, 'Password is too long'),
})

export type Credentials = z.infer<typeof credentialsSchema>

export type CredentialsResult = { ok: true; data: Credentials } | { ok: false; error: string }

/** Validate raw request input into normalized credentials, returning a friendly error. */
export function parseCredentials(input: unknown): CredentialsResult {
  const result = credentialsSchema.safeParse(input)
  if (result.success) return { ok: true, data: result.data }
  return { ok: false, error: result.error.issues[0]?.message ?? 'Invalid input' }
}
