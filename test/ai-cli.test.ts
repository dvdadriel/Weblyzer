import { describe, it, expect } from 'vitest'
import { tafsirkanCli, CLI } from '../lib/ai/cli.ts'

const galat = (code: string | number, message = 'Command failed') =>
  Object.assign(new Error(message), { code })

/** Kegagalan batas waktu SEPERTI YANG SUNGGUHAN DILAPORKAN Node: `code: 1`
 *  dan `killed: true`, bukan `code: 'ETIMEDOUT'`. Terukur, bukan diduga. */
const kehabisanWaktu = () =>
  Object.assign(new Error('Command failed: agy --model x -p=' + 'y'.repeat(12000)), {
    code: 1,
    killed: true,
  })

describe('tafsirkanCli — agy', () => {
  it('menjelaskan CLI yang tidak terpasang', () => {
    const h = tafsirkanCli('agy', galat('ENOENT'), '', '', 100)
    expect(h.ok).toBe(false)
    expect(h.ok === false && h.galat).toMatch(/tidak ada di PATH/)
  })

  it('menyebut batas waktunya saat timeout', () => {
    const h = tafsirkanCli('agy', galat('ETIMEDOUT'), '', '', 100)
    expect(h.ok === false && h.galat).toMatch(/180 detik/)
  })

  it('timeout dikenali dari killed, bukan hanya dari ETIMEDOUT', () => {
    // Inilah bentuk yang benar-benar dilaporkan Node saat batas waktunya
    // terlewat. Versi pertama hanya memeriksa ETIMEDOUT, jadi kasus ini jatuh
    // ke cabang umum.
    const h = tafsirkanCli('agy', kehabisanWaktu(), '', '', 100)
    expect(h.ok === false && h.galat).toMatch(/180 detik/)
  })

  it('prompt tidak pernah ikut masuk ke pesan galat', () => {
    // `execFile` menyusun `err.message` sebagai "Command failed: " + seluruh
    // baris perintah, dan baris itu memuat prompt utuh — belasan kilobyte
    // temuan yang akan tersimpan di `runs.ai_error` lalu terpampang di panel
    // ringkasan.
    const h = tafsirkanCli('agy', kehabisanWaktu(), '', '', 100)
    expect(h.ok === false && h.galat).not.toMatch(/yyyy/)
    expect(h.ok === false && h.galat.length).toBeLessThan(200)
  })

  it('keluar tanpa pesan apa pun tetap menyebut kode keluarnya', () => {
    const h = tafsirkanCli('agy', galat(3, 'Command failed: agy -p=' + 'z'.repeat(5000)), '', '', 100)
    expect(h.ok === false && h.galat).toBe(
      'agy keluar dengan kode 3 tanpa keluaran maupun pesan galat.',
    )
  })

  it('pesan di stdout dipakai kalau stderr kosong', () => {
    // `agy` mencetak "error: interrupted" ke stdout, bukan stderr. Tanpa
    // cabang ini, satu-satunya petunjuk yang ada ikut terbuang.
    const h = tafsirkanCli('agy', galat(1, 'Command failed: agy'), 'error: interrupted', '', 100)
    expect(h.ok === false && h.galat).toBe('error: interrupted')
  })

  it('memakai stderr, bukan pesan Node yang tidak menjelaskan apa pun', () => {
    const h = tafsirkanCli('agy', galat(1), 'ada di stdout', 'Not logged in. Run `agy login`.', 100)
    expect(h.ok === false && h.galat).toBe('Not logged in. Run `agy login`.')
  })

  it('layar bantuan adalah kegagalan walau exit code 0', () => {
    // Kegagalan paling menyesatkan dari jalur ini: bentuk argumen yang salah
    // membuat agy mencetak bantuannya lalu keluar bersih, dan tanpa
    // pemeriksaan ini teks itu tersimpan sebagai "ringkasan" di tabel reports.
    const h = tafsirkanCli('agy', null, 'Usage of agy:\n  agy -p=...\nAvailable subcommands:\n', '', 9999)
    expect(h.ok).toBe(false)
    expect(h.ok === false && h.galat).toMatch(/layar bantuan/)
  })

  it('keluaran kosong adalah kegagalan', () => {
    expect(tafsirkanCli('agy', null, '   \n ', '', 100).ok).toBe(false)
  })

  it('memotong keluaran pada batasnya', () => {
    const h = tafsirkanCli('agy', null, 'x'.repeat(500), '', 10)
    expect(h.ok && h.teks).toBe('x'.repeat(10))
  })

  it('membuang spasi di ujung jawaban', () => {
    const h = tafsirkanCli('agy', null, '\n  SIAP  \n', '', 100)
    expect(h.ok && h.teks).toBe('SIAP')
  })
})

describe('CLI.baca — login dan daftar model', () => {
  it('agy: mengabaikan baris "Fetching…" dan mengambil kolom pertama', () => {
    // Keluaran nyata `agy models`: satu baris pembuka tanpa TAB, lalu
    // "id<TAB>label" per model.
    const s = CLI.agy.baca(
      'Fetching available models...\ngemini-3.1-pro-high\tGemini 3.1 Pro (High)\nclaude-opus-4-6-thinking\tClaude Opus 4.6 (Thinking)\n',
    )
    expect(s.masuk).toBe(true)
    expect(s.model).toEqual(['gemini-3.1-pro-high', 'claude-opus-4-6-thinking'])
  })

  it('agy: tanpa satu pun baris model berarti belum login', () => {
    expect(CLI.agy.baca('Fetching available models...\n').masuk).toBe(false)
  })

  it('claude: membaca loggedIn dan email dari JSON-nya', () => {
    const s = CLI.claude.baca('{"loggedIn":true,"email":"a@b.test","authMethod":"claude.ai"}')
    expect(s.masuk).toBe(true)
    expect(s.akun).toBe('a@b.test')
    expect(s.model.length).toBeGreaterThan(0)
  })

  it('claude: loggedIn false berarti belum login', () => {
    expect(CLI.claude.baca('{"loggedIn":false}').masuk).toBe(false)
  })
})
