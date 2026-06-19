import type { NewUser, StoredUser, UserRepository } from '../src/auth/types'
import type {
  Database,
  Design,
  DesignRepository,
  DesignSummary,
  FlavorId,
} from '../src/designs/types'

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

/** In-memory DesignRepository scoped by user. */
export class FakeDesignRepository implements DesignRepository {
  private readonly items = new Map<string, Design & { userId: string }>()
  private seq = 0

  async listByUser(userId: string): Promise<DesignSummary[]> {
    return [...this.items.values()]
      .filter((d) => d.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(({ id, name, flavor, createdAt, updatedAt }) => ({
        id,
        name,
        flavor,
        createdAt,
        updatedAt,
      }))
  }

  async create(
    userId: string,
    name: string,
    flavor: FlavorId,
    database: Database,
  ): Promise<Design> {
    const now = new Date().toISOString()
    const design = {
      id: String(++this.seq),
      userId,
      name,
      flavor,
      createdAt: now,
      updatedAt: now,
      database,
    }
    this.items.set(design.id, design)
    return this.publicDesign(design)
  }

  async get(userId: string, id: string): Promise<Design | null> {
    const d = this.items.get(id)
    return d && d.userId === userId ? this.publicDesign(d) : null
  }

  async update(
    userId: string,
    id: string,
    patch: { name?: string; database?: Database },
  ): Promise<Design | null> {
    const d = this.items.get(id)
    if (!d || d.userId !== userId) return null
    if (patch.name !== undefined) d.name = patch.name
    if (patch.database !== undefined) d.database = patch.database
    d.updatedAt = new Date().toISOString()
    return this.publicDesign(d)
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const d = this.items.get(id)
    if (!d || d.userId !== userId) return false
    return this.items.delete(id)
  }

  private publicDesign(d: Design & { userId: string }): Design {
    return {
      id: d.id,
      name: d.name,
      flavor: d.flavor,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      database: d.database,
    }
  }
}
