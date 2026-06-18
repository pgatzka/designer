import type { Pool } from 'pg'
import type { NewUser, StoredUser, UserRepository } from '../auth/types'

interface UserRow {
  id: string
  email: string
  password_hash: string
  created_at: Date
}

function toStored(row: UserRow): StoredUser {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: row.created_at.toISOString(),
  }
}

export class PgUserRepository implements UserRepository {
  constructor(private readonly pool: Pool) {}

  async findByEmail(email: string): Promise<StoredUser | null> {
    const res = await this.pool.query<UserRow>(
      'SELECT id, email, password_hash, created_at FROM users WHERE email = $1',
      [email],
    )
    const row = res.rows[0]
    return row ? toStored(row) : null
  }

  async create(user: NewUser): Promise<StoredUser> {
    const res = await this.pool.query<UserRow>(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, password_hash, created_at`,
      [user.email, user.passwordHash],
    )
    return toStored(res.rows[0])
  }
}
