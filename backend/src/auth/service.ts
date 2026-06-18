import { hashPassword, verifyPassword } from './password'
import type { StoredUser, User, UserRepository } from './types'

export class EmailTakenError extends Error {
  constructor() {
    super('Email already registered')
    this.name = 'EmailTakenError'
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid email or password')
    this.name = 'InvalidCredentialsError'
  }
}

function toPublicUser(user: StoredUser): User {
  return { id: user.id, email: user.email, createdAt: user.createdAt }
}

/** Core authentication logic, independent of HTTP and the database. */
export class AuthService {
  constructor(private readonly users: UserRepository) {}

  async register(email: string, password: string): Promise<User> {
    const existing = await this.users.findByEmail(email)
    if (existing) throw new EmailTakenError()
    const passwordHash = await hashPassword(password)
    const created = await this.users.create({ email, passwordHash })
    return toPublicUser(created)
  }

  async login(email: string, password: string): Promise<User> {
    const existing = await this.users.findByEmail(email)
    if (!existing) throw new InvalidCredentialsError()
    const valid = await verifyPassword(existing.passwordHash, password)
    if (!valid) throw new InvalidCredentialsError()
    return toPublicUser(existing)
  }
}
