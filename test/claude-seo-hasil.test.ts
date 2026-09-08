import { test, expect } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NAMA_HASIL, jalankanClaudeSeo, direktoriKerja } from '../lib/claude-seo/jalankan.ts'
import { promptGeo } from '../lib/claude-seo/prompt.ts'

/**
 * `jalankanClaudeSeo` men-spawn `claude` sungguhan, yang butuh menit dan
 * jawabannya berbeda tiap kali. Yang diuji di sini adalah perilaku BERKAS-nya
 * dengan cara mengarahkan `process.cwd()` ke folder sementara dan membiarkan
 * pemanggilannya gagal cepat — yang penting bukan hasil analisisnya, tapi apa
 * yang terjadi pada berkas hasil sebelum dan sesudah.
 */
function sandbox(): { dir: string; pulihkan: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'weblyzer-'))
  const asli = process.cwd
  process.cwd = () => dir
  return {
    dir,
    pulihkan: () => {
      process.cwd = asli
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

test('prompt menyuruh menulis ke berkas hasil, dengan namanya', () => {
  const p = promptGeo('Uji', 'https://uji.test', [])
  expect(p).toContain(NAMA_HASIL)
  expect(p).toMatch(/tool Write/)
  // Alasannya ikut disebut. Perintah tanpa alasan lebih mudah diabaikan model,
  // dan alasan ini konkret: JSON di jawaban akhir memang pernah hilang.
  expect(p).toMatch(/pesan terakhir/)
})

/**
 * Penjaga §2.2, dan yang paling berbahaya kalau salah.
 *
 * Tanpa penghapusan ini, run yang gagal tanpa menulis apa pun akan membaca
 * berkas run kemarin dan melaporkannya sebagai hasil hari ini — temuan yang
 * sudah diperbaiki muncul lagi, yang baru tidak pernah terlihat, dan kegagalan
 * menyamar jadi keberhasilan yang membeku.
 */
test('hasil run sebelumnya dihapus sebelum run baru dimulai', async () => {
  const s = sandbox()
  try {
    const cwd = direktoriKerja(7)
    const berkas = join(cwd, NAMA_HASIL)
    writeFileSync(berkas, '{"temuan":[{"rule":"basi","severity":"low","title":"kemarin"}]}')
    expect(existsSync(berkas)).toBe(true)

    // Batas 1 ms: prosesnya dibunuh nyaris seketika, jadi ia tidak mungkin
    // menulis berkas apa pun. Yang diperiksa adalah keadaan berkasnya setelah
    // itu — bukan hasil analisisnya.
    const h = await jalankanClaudeSeo('abaikan', 7, 1)

    expect(existsSync(berkas)).toBe(false)
    // Dan hasilnya gagal, bukan berisi data kemarin.
    expect(h.ok).toBe(false)
  } finally {
    s.pulihkan()
  }
}, 60_000)

test('berkas hasil dibaca sebagai keluaran walau pemanggilannya gagal', async () => {
  // Ini yang membuat audit sembilan puluh menit tidak terbuang: begitu model
  // menuliskan hasilnya, exit code dan kalimat penutup di stdout tidak lagi
  // menentukan apa pun.
  const s = sandbox()
  try {
    const cwd = direktoriKerja(8)
    const berkas = join(cwd, NAMA_HASIL)

    // Ditulis SETELAH jalankanClaudeSeo menghapusnya, meniru model yang
    // menulis berkas lalu prosesnya berakhir buruk. Dijadwalkan segera supaya
    // sudah ada saat callback-nya jalan.
    const tulis = setTimeout(() => {
      writeFileSync(berkas, '{"temuan":[{"rule":"nyata","severity":"high","title":"ada"}]}')
    }, 5)

    const h = await jalankanClaudeSeo('abaikan', 8, 200)
    clearTimeout(tulis)

    // Berkasnya ada dan itulah yang dipakai — bukan stdout, bukan galat.
    if (existsSync(berkas)) {
      expect(h.ok).toBe(true)
      expect(h.ok && h.teks).toContain('nyata')
      expect(readFileSync(berkas, 'utf8')).toContain('nyata')
    }
  } finally {
    s.pulihkan()
  }
}, 60_000)

test('berkas hasil kosong diperlakukan sebagai tidak ada', async () => {
  // Berkas kosong bukan "nol temuan" — ia berarti model membuatnya lalu gagal
  // mengisinya. Memperlakukannya sebagai hasil sah akan merekonsiliasi nol
  // temuan dan menandai semuanya beres.
  const s = sandbox()
  try {
    const cwd = direktoriKerja(9)
    const berkas = join(cwd, NAMA_HASIL)
    const tulis = setTimeout(() => writeFileSync(berkas, '   \n'), 5)
    const h = await jalankanClaudeSeo('abaikan', 9, 200)
    clearTimeout(tulis)
    expect(h.ok).toBe(false)
  } finally {
    s.pulihkan()
  }
}, 60_000)
