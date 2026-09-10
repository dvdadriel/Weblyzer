import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { berkasSkill } from '../lib/claude-seo/prompt.ts'
import { promptGeo, promptAudit } from '../lib/claude-seo/prompt.ts'
import { KATEGORI } from '../lib/kategori.ts'

/**
 * Skill ada di repositori, dan prompt benar-benar menunjuk ke sana.
 *
 * Berkas ini menjaga satu janji yang mudah patah tanpa disadari: siapa pun
 * yang meng-clone proyek ini mendapat panduan aspeknya. Kalau berkasnya
 * dipindahkan, di-rename, atau lupa ikut ter-commit, promptnya akan menyuruh
 * model membaca berkas yang tidak ada — dan modelnya akan mengarang isinya
 * alih-alih gagal.
 */

const ASPEK = ['geo', 'audit', 'mobile-parity'] as const

describe('berkas skill', () => {
  it('ketiganya ada di disk', () => {
    for (const a of ASPEK) {
      expect(existsSync(berkasSkill(a)), a).toBe(true)
    }
  })

  it('README kontraknya ada dan menyebut bentuk keluarannya', () => {
    const readme = readFileSync(join(berkasSkill('geo'), '..', 'README.md'), 'utf8')
    // Bentuk JSON-nya adalah kontrak antara skill dan `lib/claude-seo/parse.ts`.
    // Kalau ia hilang dari README, skill yang ditulis kemudian akan mengarang
    // bentuknya sendiri.
    expect(readme).toContain('"temuan"')
    for (const k of ['rule', 'severity', 'title', 'url', 'detail']) {
      expect(readme, k).toContain(k)
    }
  })

  it('README menyebut aturan nama yang stabil tanpa angka', () => {
    // Ini pelajaran termahal di proyek ini: dua analisis berurutan tanpa
    // perubahan apa pun pernah menghasilkan nol temuan yang bertahan. Kalau
    // aturan ini hilang dari panduan, ia akan terulang.
    const readme = readFileSync(join(berkasSkill('geo'), '..', 'README.md'), 'utf8')
    expect(readme).toMatch(/stabil/i)
    expect(readme).toMatch(/tidak boleh memuat angka/i)
  })

  it('setiap skill menunjuk kembali ke README', () => {
    // Kontraknya hanya di satu tempat, jadi tiap skill harus mengarahkan ke
    // sana — bukan menyalinnya dan menyimpang perlahan.
    for (const a of ASPEK) {
      expect(readFileSync(berkasSkill(a), 'utf8'), a).toContain('README.md')
    }
  })

  it('skill yang butuh tool menyebutkan itu', () => {
    // Pertanyaan "bisa dijalankan model apa" harus terjawab di dalam berkasnya
    // sendiri. GEO dan Audit butuh tool; Mobile Parity tidak.
    for (const a of ['geo', 'audit'] as const) {
      expect(readFileSync(berkasSkill(a), 'utf8'), a).toMatch(/CLI agentik/)
    }
  })
})

describe('prompt memakai skill yang ter-commit', () => {
  it('prompt GEO menunjuk ke berkas yang benar-benar ada', () => {
    const p = promptGeo('Uji', 'https://uji.test')
    expect(p).toContain(berkasSkill('geo'))
    expect(existsSync(berkasSkill('geo'))).toBe(true)
  })

  it('prompt Audit menunjuk ke berkas yang benar-benar ada', () => {
    const p = promptAudit('Uji', 'https://uji.test', 50)
    expect(p).toContain(berkasSkill('audit'))
    expect(existsSync(berkasSkill('audit'))).toBe(true)
  })

  it('promptnya menyuruh MEMBACA berkasnya, bukan cuma menyebutnya', () => {
    // Path tanpa perintah membaca akan dilewati modelnya.
    for (const p of [promptGeo('U', 'https://u.test'), promptAudit('U', 'https://u.test', 10)]) {
      expect(p).toMatch(/tool Read/)
    }
  })

  it('plugin luar disebut sebagai pilihan, bukan syarat', () => {
    // Ini inti perubahannya: pluginnya percepatan, bukan prasyarat. Kalau
    // promptnya kembali mensyaratkannya, clone tanpa plugin gagal tanpa
    // penjelasan.
    const p = promptGeo('U', 'https://u.test')
    expect(p).toMatch(/kalau plugin itu memang terpasang/i)
  })

  it('path-nya absolut', () => {
    // CLI-nya dijalankan di direktori kerja lain (`claude-seo-out/`), jadi path
    // relatif akan menunjuk ke tempat yang salah.
    expect(berkasSkill('geo').startsWith('/')).toBe(true)
  })
})

describe('skill Mobile Parity sejalan dengan kodenya', () => {
  const skill = () => readFileSync(berkasSkill('mobile-parity'), 'utf8')

  it('menyebut ketiga lebar yang benar-benar diukur', () => {
    const s = skill()
    for (const angka of ['390', '820', '1440']) {
      expect(s, angka).toContain(angka)
    }
  })

  it('menyebut ambang target sentuh yang benar', () => {
    // Panduan yang menyebut 44 sedangkan kodenya memakai 24 akan membuat
    // pembacanya menyimpulkan ada bug.
    expect(skill()).toContain('24')
  })

  it('menyebut perintah yang benar untuk menjalankannya ulang', () => {
    expect(skill()).toContain('npm run scan -- mobile')
  })

  it('kategorinya memang ada di daftar kategori', () => {
    expect(KATEGORI).toContain('mobile')
  })
})
