/** Public user shape returned to clients (never includes the password hash). */
export interface User {
  id: string
  email: string
  createdAt: string
}

/** User as stored, including the password hash (server-side only). */
export interface StoredUser extends User {
  passwordHash: string
}

export interface NewUser {
  email: string
  passwordHash: string
}

/**
 * Persistence boundary for users. Injected into the auth service so the logic can
 * be tested with an in-memory fake (no database required).
 */
export interface UserRepository {
  findByEmail(email: string): Promise<StoredUser | null>
  create(user: NewUser): Promise<StoredUser>
}
