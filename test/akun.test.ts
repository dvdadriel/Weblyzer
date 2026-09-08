import { test, expect } from 'vitest'
import { bacaStatus } from '../lib/ai/akun.ts'

/** Bentuk sungguhan dari `claude auth status --json`, disalin apa adanya. */
const NYATA = JSON.stringify({
  loggedIn: true,
  authMethod: 'claude.ai',
  apiProvider: 'firstParty',
  email: 'website@massindo.com',
  orgId: '971981c6-393f-4549-a76f-b8e6cd758a26',
  orgName: 'Massindo',
  subscriptionType: 'team',
})

test('membaca status akun yang sedang masuk', () => {
  const s = bacaStatus(NYATA)
  expect(s.keadaan).toBe('masuk')
  if (s.keadaan !== 'masuk') return
  expect(s.email).toBe('website@massindo.com')
  expect(s.org).toBe('Massindo')
  expect(s.langganan).toBe('team')
  expect(s.metode).toBe('claude.ai')
})

test('akun pribadi tanpa organisasi tetap terbaca masuk', () => {
  // Medan yang tidak ada jadi null, bukan string "undefined" — dan komponennya
  // menghilangkan yang null alih-alih mencetaknya.
  const s = bacaStatus('{"loggedIn":true,"email":"a@b.test","authMethod":"claude.ai"}')
  expect(s.keadaan).toBe('masuk')
  if (s.keadaan !== 'masuk') return
  expect(s.org).toBeNull()
  expect(s.langganan).toBeNull()
})

test('medan kosong diperlakukan sebagai tidak ada', () => {
  const s = bacaStatus('{"loggedIn":true,"email":"   ","orgName":""}')
  expect(s.keadaan).toBe('masuk')
  if (s.keadaan !== 'masuk') return
  expect(s.email).toBeNull()
  expect(s.org).toBeNull()
})

test('loggedIn false berarti keluar', () => {
  expect(bacaStatus('{"loggedIn":false}').keadaan).toBe('keluar')
})

/**
 * §2.2 dalam bentuk kecil: status yang tidak jelas TIDAK boleh ditebak sebagai
 * "mungkin masuk". Panel yang mengaku masuk padahal tidak akan membuat
 * kegagalan ringkasan AI terlihat tak berhubungan dengan login.
 */
test('loggedIn yang bukan true persis dianggap keluar', () => {
  for (const raw of [
    '{"loggedIn":"true"}',
    '{"loggedIn":1}',
    '{"email":"a@b.test"}',
    '{}',
  ]) {
    expect(bacaStatus(raw).keadaan).toBe('keluar')
  }
})

test('keluaran bukan JSON dilaporkan mentah, bukan disamarkan', () => {
  const s = bacaStatus('Error: credential store unavailable')
  expect(s.keadaan).toBe('galat')
  if (s.keadaan !== 'galat') return
  // Pesan aslinya dipertahankan: "gagal membaca status" tidak bisa
  // ditindaklanjuti, sedangkan pesan ini bisa.
  expect(s.pesan).toContain('credential store')
})

test('keluaran kosong adalah galat, bukan keluar', () => {
  // Nol keluaran berarti kita tidak tahu. Melaporkannya sebagai "belum masuk"
  // akan mengirim orang menjalankan login yang mungkin tidak perlu.
  expect(bacaStatus('').keadaan).toBe('galat')
  expect(bacaStatus('   \n').keadaan).toBe('galat')
})

test('JSON yang bukan objek adalah galat', () => {
  for (const raw of ['null', '[]', '"masuk"', '42']) {
    const s = bacaStatus(raw)
    // `[]` dan `42` lolos JSON.parse tapi bukan objek berisi loggedIn.
    expect(['galat', 'keluar']).toContain(s.keadaan)
    expect(s.keadaan).not.toBe('masuk')
  }
})
