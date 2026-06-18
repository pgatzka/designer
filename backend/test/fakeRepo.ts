import type { NewUser, StoredUser, UserRepository } from '../src/auth/types'

/** In-memory UserRepository for tests — mirrors the unique-email constraint. */
export class FakeUserRepository implements UserRepository {
  private readonly users: StoredUser[] = []
  private seq = 0

  async findByEmail(email: string): Promise<StoredUser | null> {
    return this.users.find((u) => u.email === email) ?? null
  }

  async create(user: NewUser): Promise<StoredUser> {
    if (await this.findByEmail(user.email)) {
      throw new Error('duplicate email (constraint violation)')
    }
    const stored: StoredUser = {
      id: String(++this.seq),
      email: user.email,
      passwordHash: user.passwordHash,
      createdAt: new Date().toISOString(),
    }
    this.users.push(stored)
    return stored
  }
}
