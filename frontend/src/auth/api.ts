export interface AuthUser {
  id: string
  email: string
}

export class AuthError extends Error {}

async function request(path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function userOrThrow(res: Response): Promise<AuthUser> {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new AuthError(data?.error ?? 'Something went wrong. Please try again.')
  }
  return data.user as AuthUser
}

/** Returns the current user, or null if not authenticated. */
export async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch('/api/auth/me', { credentials: 'include' })
  if (res.status === 401) return null
  if (!res.ok) throw new AuthError('Could not load your session.')
  const data = await res.json()
  return data.user as AuthUser
}

export async function register(email: string, password: string): Promise<AuthUser> {
  return userOrThrow(await request('/api/auth/register', { email, password }))
}

export async function login(email: string, password: string): Promise<AuthUser> {
  return userOrThrow(await request('/api/auth/login', { email, password }))
}

export async function logout(): Promise<void> {
  await request('/api/auth/logout')
}
