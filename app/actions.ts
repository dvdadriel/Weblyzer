'use server'

import { revalidatePath } from 'next/cache'
import { getDb } from '../lib/db.ts'

/**
 * Menandai temuan diabaikan, atau membukanya kembali.
 *
 * `ignored` bersifat lengket di `reconcile`: pemindaian ulang tidak pernah
 * mengembalikannya ke `open`. Aturan itu sudah diuji di `test/findings.test.ts`;
 * di sini kita hanya membalik bendera yang sama.
 */
export async function ubahStatusTemuan(
  findingId: number,
  status: 'open' | 'ignored',
  path: string,
): Promise<void> {
  getDb().prepare('UPDATE findings SET status = ? WHERE id = ?').run(status, findingId)
  revalidatePath(path)
}
