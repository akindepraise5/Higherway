import { sql } from "drizzle-orm"
import { boolean, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"

/**
 * Better Auth's own tables, plus what Higherway adds on top.
 *
 * Better Auth owns the shape of `user`, `session`, `account` and `verification`
 * — do not rename their fields by hand. Column names are written out rather
 * than left to the global snake_case setting, so the adapter's expectations and
 * the database agree no matter what that setting does later.
 *
 * These were deliberately not hand-written in Phase 1 (see STATUS.md): guessing
 * at them and correcting later would have meant a migration for nothing.
 */

/**
 * Roles are strictly nested: Owner ⊃ Admin ⊃ Editor. ARCHITECTURE.md §10.
 * Checked in `lib/session.ts`, never inferred from anything else.
 */
export const userRole = pgEnum("user_role", ["owner", "admin", "editor"])

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),

  /** Higherway's addition. Declared to Better Auth as an additional field. */
  role: userRole("role").notNull().default("editor"),
  /** Set when an Owner suspends someone, without destroying their history. */
  disabledAt: timestamp("disabled_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
})

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Invitations. Sign-up is disabled, so this is the only way an account comes
 * into being after the seeded Owner. ARCHITECTURE.md §10.
 *
 * Only the *hash* of the token is stored: a leaked database row must not be
 * usable as an invitation. Single use, and expires in 72 hours.
 */
export const invitation = pgTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    role: userRole("role").notNull().default("editor"),

    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

    invitedBy: text("invited_by").references(() => user.id, { onDelete: "set null" }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedUserId: text("accepted_user_id").references(() => user.id, { onDelete: "set null" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("invitation_token_hash_idx").on(t.tokenHash),
    uniqueIndex("invitation_email_open_idx")
      .on(t.email)
      .where(sql`accepted_at is null and revoked_at is null`),
  ],
)
