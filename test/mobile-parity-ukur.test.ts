import { test, expect, beforeAll, afterAll } from 'vitest'
import { chromium, type Browser } from 'playwright'
import { startFixtureServer, type FixtureServer } from './fixture-server.ts'
import { ukurHalaman, type UkuranHalaman, type NamaLebar } from '../lib/scanners/mobile-parity.ts'
import { analisisMobileParity } from '../lib/analyzers/mobile-parity.ts'

/**
 * Pengukur diuji terhadap halaman yang CACATNYA SUDAH DIKETAHUI.
 *
 * Ini satu-satunya cara membuktikan pengukurannya benar. Menguji ambangnya
 * dengan angka yang ditulis tangan (berkas `mobile-parity-aturan.test.ts`)
 * hanya membuktikan cabangnya; ia tidak menjawab pertanyaan yang sebenarnya —
 * apakah `getComputedStyle` di dalam Chromium sungguhan menghasilkan angka
 * yang kita sangka.
 *
 * Dua fixture, dan keduanya perlu. `mobile-rusak` memuat delapan cacat yang
 * sengaja dipasang; `mobile-sehat` memuat nol. Tanpa yang kedua, pengukur yang
 * selalu menjawab "ada masalah" akan lolos seluruh test di berkas ini.
 */

let browser: Browser
let rusak: FixtureServer
let sehat: FixtureServer
let ukuranRusak: UkuranHalaman
let ukuranSehat: UkuranHalaman

// Chromium menyala sekali, lalu enam konteks (dua halaman × tiga lebar).
// Menyalakannya per test berarti tambahan satu detik dikalikan dua belas.
const BATAS = 180_000

beforeAll(async () => {
  browser = await chromium.launch()
  rusak = await startFixtureServer('mobile-rusak')
  sehat = await startFixtureServer('mobile-sehat')
  ukuranRusak = await ukurHalaman(browser, rusak.url)
  ukuranSehat = await ukurHalaman(browser, sehat.url)
}, BATAS)

afterAll(async () => {
  await browser?.close()
  await rusak?.close()
  await sehat?.close()
})

const pada = (u: UkuranHalaman, lebar: NamaLebar) => u.perLebar.find((p) => p.lebar === lebar)!
const aturan = (u: UkuranHalaman) => analisisMobileParity(u).map((t) => t.rule)

/* ── pengukuran mentah ────────────────────────────────────────────────────── */

test('ketiga lebar terukur, dengan viewport yang benar', () => {
  expect(ukuranRusak.perLebar.map((p) => p.lebar)).toEqual(['mobile', 'tablet', 'desktop'])
  expect(pada(ukuranRusak, 'mobile').viewport).toBe(390)
  expect(pada(ukuranRusak, 'desktop').viewport).toBe(1440)
})

test('meta viewport dibaca apa adanya', () => {
  expect(ukuranRusak.metaViewport).toContain('user-scalable=no')
  expect(ukuranSehat.metaViewport).toBe('width=device-width, initial-scale=1')
})

test('elemen selebar 900px terdeteksi keluar viewport di ponsel', () => {
  const m = pada(ukuranRusak, 'mobile')
  expect(m.keluarViewport.length).toBeGreaterThan(0)
  // Kelebihannya nyata, bukan sekadar tanda: 900 − 390 ≈ 510 piksel, dan yang
  // terparah dilaporkan lebih dulu.
  expect(m.keluarViewport[0]!.angka).toBeGreaterThan(400)
  expect(m.keluarViewport[0]!.teks).toContain('sembilan ratus piksel')
})

test('hanya elemen terdalam yang dilaporkan, bukan seluruh rantai induknya', () => {
  // Satu tabel selebar 900 piksel membuat body, div, table, dan td sama-sama
  // melewati tepi. Melaporkan keempatnya berarti satu masalah tampil sebagai
  // empat, dan hitungan di judul temuan jadi menipu.
  const m = pada(ukuranRusak, 'mobile')
  const selektor = m.keluarViewport.map((e) => e.selektor)
  expect(selektor).not.toContain('body')
  expect(selektor).not.toContain('table.tabel-lebar')
  // Yang paling dalam pada rantai itu adalah selnya.
  expect(selektor).toContain('td')
})

test('elemen yang sama TIDAK keluar viewport di desktop', () => {
  // Inilah "parity": 900 piksel adalah masalah di 390, bukan di 1440. Aspek
  // yang menandainya di kedua lebar cuma pendeteksi lebar tetap.
  expect(pada(ukuranRusak, 'desktop').keluarViewport).toEqual([])
})

test('kotak yang memotong isinya terdeteksi', () => {
  const m = pada(ukuranRusak, 'mobile')
  expect(m.terpotong.some((e) => e.selektor.includes('terpotong'))).toBe(true)
})

test('porsi tebal ditimbang panjang teks, dan tinggi di halaman rusak', () => {
  // Halaman rusak menebalkan kartu, isi, dan judul — hampir semua teksnya.
  expect(pada(ukuranRusak, 'mobile').porsiTebal).toBeGreaterThan(0.6)
  // Halaman sehat hanya menebalkan judulnya, yang porsinya kecil.
  expect(pada(ukuranSehat, 'mobile').porsiTebal).toBeLessThan(0.3)
})

test('rasio judul terhadap isi terukur, dan bedanya nyata antar fixture', () => {
  const r = pada(ukuranRusak, 'mobile')
  const s = pada(ukuranSehat, 'mobile')
  // Rusak: 15px judul di atas 14px isi — hampir rata.
  expect(r.ukuranJudul / r.ukuranIsi).toBeLessThan(1.25)
  // Sehat: 30px di atas 16px.
  expect(s.ukuranJudul / s.ukuranIsi).toBeGreaterThan(1.5)
})

test('jumlah kolom grid terbaca per lebar', () => {
  // Rusak: empat kolom tetap di semua lebar.
  expect(pada(ukuranRusak, 'mobile').kolomMaks).toBe(4)
  expect(pada(ukuranRusak, 'desktop').kolomMaks).toBe(4)
  // Sehat: satu di ponsel, empat di desktop. Inilah bentuk yang benar.
  expect(pada(ukuranSehat, 'mobile').kolomMaks).toBe(1)
  expect(pada(ukuranSehat, 'desktop').kolomMaks).toBe(4)
})

test('target sentuh kecil hanya dilaporkan pada lebar sentuh', () => {
  expect(pada(ukuranRusak, 'mobile').targetKecil.length).toBeGreaterThan(0)
  // Kursor tetikus tidak punya masalah dengan tombol 16 piksel, jadi
  // melaporkannya di desktop adalah derau.
  expect(pada(ukuranRusak, 'desktop').targetKecil).toEqual([])
})

test('penyingkap yang hanya bereaksi pada hover terdeteksi dari stylesheet', () => {
  const m = pada(ukuranRusak, 'mobile')
  expect(m.hoverSaja.some((e) => e.selektor.includes('menu'))).toBe(true)
  // Halaman sehat tidak punya `:hover` yang mengubah keterlihatan.
  expect(pada(ukuranSehat, 'mobile').hoverSaja).toEqual([])
})

/* ── dari pengukuran ke temuan ────────────────────────────────────────────── */

test('halaman rusak menghasilkan temuan untuk keempat keluhan', () => {
  const r = aturan(ukuranRusak)

  // 1. mobile terabaikan
  expect(r).toContain('mobile-tanpa-penyesuaian')
  // 2. tata letak hancur
  expect(r).toContain('mobile-elemen-keluar-viewport-mobile')
  expect(r).toContain('mobile-teks-terpotong-mobile')
  expect(r).toContain('mobile-kolom-terlalu-banyak')
  // 3. gaya penulisan meleset
  expect(r.some((x) => x.startsWith('mobile-hampir-semua-tebal') || x === 'mobile-tebal-berlebihan')).toBe(true)
  expect(r).toContain('mobile-hierarki-rata')
  // 4. tidak bisa dipakai di layar sentuh
  expect(r).toContain('mobile-zoom-dimatikan')
  expect(r).toContain('mobile-target-sentuh-kecil')
  expect(r).toContain('mobile-hover-saja')
})

test('halaman sehat menghasilkan NOL temuan', () => {
  // Test terpenting di berkas ini. Sebelas aturan yang menandai halaman yang
  // benar adalah sebelas sumber banjir peringatan, dan aspek yang membanjiri
  // akan diabaikan seluruhnya — termasuk temuan yang sungguhan.
  expect(analisisMobileParity(ukuranSehat)).toEqual([])
})

test('nama aturan tidak memuat angka', () => {
  // Nama aturan adalah identitas temuan. Nama yang memuat hitungan akan
  // berubah minggu depan, dan temuan yang sama tercatat sebagai "sudah
  // diperbaiki, ada yang baru" — riwayatnya jadi berbohong.
  for (const r of aturan(ukuranRusak)) {
    expect(r, r).not.toMatch(/\d/)
  }
})

test('setiap temuan membawa URL yang benar-benar diukur', () => {
  for (const t of analisisMobileParity(ukuranRusak)) {
    expect(t.url).toBe(ukuranRusak.url)
  }
})
