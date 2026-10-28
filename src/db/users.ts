import { db } from './index.ts';
import { users } from './schema.ts';
import { fallbackUpsertUser } from './server-store.ts';

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName?: string | null
) {
  try {
    if (!process.env.SQL_HOST) {
      return fallbackUpsertUser(uid, email, displayName);
    }

    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        displayName: displayName ?? null,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          displayName: displayName ?? null,
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    if (!process.env.SQL_HOST) {
      return fallbackUpsertUser(uid, email, displayName);
    }
    console.error('Database user upsert failed:', error);
    throw new Error('Failed to synchronize user record in database.', {
      cause: error,
    });
  }
}
