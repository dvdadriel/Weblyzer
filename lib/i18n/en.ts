import type { Kamus } from './id.ts'

/**
 * English dictionary.
 *
 * `satisfies Kamus` is what makes a missing key a TypeScript error rather than
 * an `undefined` that reaches the screen. It catches both directions: a key
 * defined in `id.ts` but absent here fails to compile, and a key here that
 * does not exist there is rejected as an excess property.
 *
 * Same rule as the Indonesian file about what stays untranslated: technical
 * terms used as-is, category names, rule names, and severity names. What is
 * avoided is mixing two languages inside one label.
 */
export const en = {
  // ── Navigation and shell ──────────────────────────────────────────────────
  'nav.home': 'Home',
  'nav.model': 'Model',
  'nav.masuk': 'Sign in',
  'nav.keluar': 'Sign out',
  'nav.bagianUtama': 'Main sections',
  'nav.tema': 'Theme',
  'nav.semuaSitus': 'All Sites',

  'tema.system': 'System',
  'tema.light': 'Light',
  'tema.dark': 'Dark',

  'locale.label': 'Language',
  'locale.id': 'Indonesia',
  'locale.en': 'English',

  // ── Dashboard ─────────────────────────────────────────────────────────────
  'dash.judul': 'Sites',
  'dash.teks': 'Regular checks on the health, performance, and finding history of your sites.',
  'dash.metrikSitus': 'Sites',
  'dash.metrikTemuan': 'Open findings',
  'dash.metrikBersih': 'Clean sites',
  'dash.ringkasanLabel': 'Monitoring summary',
  'dash.buka': 'Open',
  'dash.belumAdaSitus': 'No sites yet',
  'dash.belumAdaSitusTeks':
    'Add your first site, then run a scan to see what is broken.',

  // ── Add site ──────────────────────────────────────────────────────────────
  'tambah.pemicu': 'Add Site',
  'tambah.nama': 'Name',
  'tambah.namaPetunjuk': 'e.g. Springair',
  'tambah.url': 'Address',
  'tambah.simpan': 'Save Site',
  'tambah.batal': 'Cancel',
  'tambah.namaKosong': 'The site name is empty.',
  'tambah.urlKosong': 'The site address is empty.',
  'tambah.sudahAda': 'You are already watching a site at that address.',

  // ── Delete site ───────────────────────────────────────────────────────────
  'hapus.pemicu': 'Delete',
  'hapus.tanya': 'Delete this site?',
  'hapus.teks': '{temuan} findings and {run} runs will be gone permanently. There is no undo.',
  'hapus.konfirmasi': 'Delete Permanently',
  'hapus.batal': 'Cancel',
  'hapus.sedangDipindai': 'This site is being scanned. Wait for it to finish, then delete.',

  // ── Tabs and categories ───────────────────────────────────────────────────
  'tab.aspek': 'Scan aspects',
  'tab.tagAi': 'AI',
  'tab.tagAdmin': 'ADMIN',
  'kategori.dinilaiAi':
    'Judged by claude-seo, not measured by a rule. Its answer can shift between analyses even when the site has not changed, so "fixed" here means less than it does in the other categories.',

  // ── Findings table ────────────────────────────────────────────────────────
  'tabel.severity': 'Severity',
  'tabel.aturan': 'Rule',
  'tabel.halaman': 'Page',
  'tabel.terlihat': 'Seen',
  'tabel.aksi': 'Action',
  'tabel.lihat': 'View',
  'tabel.temuanTerbuka': '{n} open findings.',
  'tabel.temuanDiabaikan': '{n} ignored findings.',
  'tabel.dipindai': 'scanned {waktu}',
  'tabel.terlewat': 'missed {n}×',
  'tabel.run': 'run {n}',

  'saring.status': 'Finding status',
  'saring.terbuka': 'Open',
  'saring.diabaikan': 'Ignored',
  'saring.belumAdaDiabaikan': 'Nothing has been ignored in this category yet.',

  'temuan.abaikan': 'Ignore',
  'temuan.bukaLagi': 'Reopen',
  'temuan.periksa': 'Check Now',
  'temuan.memeriksa': 'Checking…',
  'temuan.beres': 'fixed',
  'temuan.masihAda': 'still there',
  'temuan.detail': 'Details',

  // ── Empty states ──────────────────────────────────────────────────────────
  'kosong.belumDipindai': 'Never scanned',
  'kosong.belumDipindaiTeks': 'Run a scan to see the state of this site.',
  'kosong.bersih': 'Nothing broken here',
  'kosong.bersihTeks': 'The last scan found nothing in this category.',
  'kosong.gagal': 'The last scan failed',
  'kosong.gagalTeks':
    'The result is unknown — this does not mean the site is clean. Try scanning again.',
  'kosong.butuhAkun': 'Needs an account',
  'kosong.butuhAkunTeks':
    'This aspect uses your own API key, so it needs somewhere to store it. Every other scan aspect still works without an account.',
  'kosong.adminSaja': 'Instance owner only',
  'kosong.adminSajaTeks':
    'This aspect is run by the Claude CLI on the server rather than by your API key, so only the instance owner can trigger it. Existing findings are still visible below.',

  // ── Scanning ──────────────────────────────────────────────────────────────
  'scan.tombol': 'Scan {kategori}',
  'scan.berjalan': '{nama} has been running since {mulai}. This page will change on its own when it finishes.',
  'scan.sedangBerjalan': 'A scan of this site is already running.',
  'scan.gagalJalan': 'The scan failed to start. Check the server log.',
  'scan.tungguSelesai': 'This site is being scanned. Wait for it to finish.',
  'scan.adminSaja':
    'This aspect runs on the server with its own CLI, so only the instance owner can trigger it.',

  // ── AI summary ────────────────────────────────────────────────────────────
  'ai.judul': 'AI Summary',
  'ai.ulangi': 'Summarise Again',
  'ai.mengulang': 'Summarising…',
  'ai.gagal': 'The summary could not be produced.',
  'ai.dilewati': 'Summary skipped: no verified API key yet.',
  'ai.gagalJalan': 'The summary failed to start. Check the server log.',
  'ai.lipatBuka': 'Show more',
  'ai.lipatTutup': 'Show less',

  // ── Lighthouse ────────────────────────────────────────────────────────────
  'lh.judul': 'Lighthouse',
  'lh.perf': 'Perf',
  'lh.a11y': 'A11y',
  'lh.best': 'Best',
  'lh.seo': 'SEO',
  'lh.mobile': 'Mobile',
  'lh.desktop': 'Desktop',
  'lh.pengukuran': '{n} measurements ({strategi}).',
  'lh.belumDiukur': 'Not measured yet',
  'lh.belumDiukurTeks': 'Run Scan Lighthouse to measure the pages of this site.',
  'lh.ukurDesktop': 'Measure desktop too',
  'lh.ukurDesktopBiaya': 'measurement takes twice as long',

  // ── Export and site settings ──────────────────────────────────────────────
  'unduh.excel': 'Download Excel',
  'unduh.catatan': 'every category, including what is fixed and ignored',
  'atur.pemicu': 'Settings',
  'atur.judul': 'Site Settings',
  'atur.maxPages': 'Page limit',
  'atur.mode': 'Lighthouse mode',
  'atur.sitemap': 'Sitemap address',
  'atur.aktif': 'Enable scheduled scans',
  'atur.simpan': 'Save',
  'atur.tersimpan': 'Saved.',

  // ── Sign in ───────────────────────────────────────────────────────────────
  'masuk.judul': 'Sign in',
  'masuk.teks':
    'Without an account every scan aspect still works — the only thing that needs one is the AI summary, because it uses your own API key.',
  'masuk.email': 'Email',
  'masuk.password': 'Password',
  'masuk.tombol': 'Sign in',
  'masuk.memeriksa': 'Checking…',
  'masuk.google': 'Sign in with Google',
  'masuk.tanpaDaftar': 'This instance does not accept self-registration. Accounts are created by its owner.',
  'masuk.kosong': 'Email and password are both required.',
  'masuk.salah': 'Wrong email or password.',
  'masuk.lewatGoogle': 'This account signs in with Google. Use the button below.',
  'masuk.galatOauthMati': 'Signing in with Google is not configured on this instance.',
  'masuk.galatState': 'The sign-in request expired or did not match. Start again.',
  'masuk.galatTukar': 'Google refused to exchange the sign-in code. Try again.',
  'masuk.galatToken': 'The identity from Google could not be verified.',
  'masuk.galatTidakTerdaftar':
    'That Google account is not registered on this instance. This instance does not accept self-registration — ask its owner to create an account.',

  // ── Account ───────────────────────────────────────────────────────────────
  'akun.judul': 'Account',
  'akun.masukSebagai': 'Signed in as',
  'akun.gantiPassword': 'Change password',
  'akun.passwordSekarang': 'Current password',
  'akun.passwordBaru': 'New password',
  'akun.tombolGanti': 'Change Password',
  'akun.menyimpan': 'Saving…',
  'akun.tanpaPassword':
    'This account signs in with Google and has no password yet. Filling this form adds one, so you can sign in either way.',
  'akun.passwordPendek': 'The new password must be at least {n} characters.',
  'akun.passwordLamaSalah': 'The current password is wrong.',
  'akun.passwordDiganti':
    'Password changed. Sessions already issued on other devices are not revoked.',
  'akun.peringatanSesi':
    'Sessions in this project have no table, so changing your password does not sign you out of other devices. If a device is lost, ask the instance owner to delete and recreate the account.',
  'akun.daftarJudul': 'Accounts on this instance',
  'akun.kolomEmail': 'Email',
  'akun.kolomPeran': 'Role',
  'akun.kolomCaraMasuk': 'Sign-in method',
  'akun.kolomDibuat': 'Created',
  'akun.caraGoogle': 'Google only',
  'akun.caraPassword': 'Password',
  'akun.buatJudul': 'Create account',
  'akun.buatTeks':
    'This instance does not accept self-registration, so accounts are created here. Open registration would mean moderation, email verification, and quota abuse — three problems that do not exist yet.',
  'akun.passwordAwal': 'Initial password',
  'akun.jadikanAdmin': 'Make admin',
  'akun.jadikanAdminTeks': 'can trigger the GEO and Audit aspects',
  'akun.buatTombol': 'Create Account',
  'akun.membuat': 'Creating…',
  'akun.dibuat': 'Account {email} created.',
  'akun.butuhAkun': 'This action needs an account. Sign in first.',
  'akun.hanyaAdmin': 'This action is for admins only.',

  // ── AI model ──────────────────────────────────────────────────────────────
  'model.judul': 'AI Model',
  'model.teks1':
    'The AI summary uses your own Anthropic API key, and the bill is yours. The key is stored encrypted and never sent back to the browser — all that is shown here is its last four characters.',
  'model.teks2':
    'A new key is checked against Anthropic before it counts as valid, and the AI summary stays off until that check passes. The check spends no tokens.',
  'model.labelModel': 'Model',
  'model.labelKunci': 'API key',
  'model.simpanUji': 'Save & Check',
  'model.memeriksa': 'Checking…',
  'model.lupakan': 'Forget key',
  'model.menghapus': 'Deleting…',
  'model.gantiPetunjuk': 'Fill this in to replace the stored key',
  'model.berlaku': 'Key is valid for {model}',
  'model.berakhiran': 'ending in {ekor}',
  'model.belumTerbukti':
    'The key is stored but not proven valid. The AI summary is off until it passes the check.',
  'model.tersimpanBerlaku': 'Key stored and valid. The AI summary is now active.',
  'model.catatanAi':
    'The AI layer only writes a summary of findings that already exist. All seven scan aspects run on their own without AI, and Lighthouse scores are measured rather than guessed by a model.',
  'model.catatanAdmin':
    'The GEO and Audit aspects do not use this key. Both run the claude CLI on the server with the claude-seo plugin, so their credentials belong to the machine. That is why only admins can trigger them.',

  // ── Guest quotas ──────────────────────────────────────────────────────────
  'kuota.situs': 'Without an account you can watch {n} site. Sign in to add more.',
  'kuota.scan': 'Without an account, {n} scans per {jam} hours. Sign in to scan without a limit.',

  // ── Shared ────────────────────────────────────────────────────────────────
  'umum.situsTidakDitemukan': 'Site {id} was not found.',
  'umum.temuanTidakDitemukan': 'Finding {id} was not found.',
  'umum.kunjungi': 'Visit {url}',
  // ── Scan button names per aspect ──────────────────────────────────────────
  'scan.bugs': 'Scan Bug',
  'scan.console': 'Scan Console',
  'scan.security': 'Scan Security',
  'scan.seo': 'Scan SEO',
  'scan.geo': 'Analyse GEO',
  'scan.audit': 'Full Audit',
  'scan.lighthouse': 'Scan Lighthouse',
  'scan.memulai': 'Starting…',

  // ── Component additions ───────────────────────────────────────────────────
  'temuan.periksaLagi': 'Check Again',
  'temuan.beresPesan': 'Fixed — that finding is closed and gone from the list.',
  'temuan.masihAdaPesan': 'Still there. Nothing has changed on that page.',
  'ai.ringkasSekarang': 'Summarise Now',
  'ai.gagalTag': 'AI failed',
  'hapus.yakin': 'Are you sure?',
  'hapus.riwayat': 'Its entire scan history goes with it.',
  'hapus.menghapus': 'Deleting…',
  'tambah.contoh': 'e.g. My Online Store',
  'tambah.menyimpan': 'Saving…',
  'atur.ikutJadwal': 'Include in scheduled scans',
  'atur.menyimpan': 'Saving…',
  'lh.strategy': 'Strategy',
  'tab.kategori': 'Category',
  // ── Lighthouse: empty states specific to this page ────────────────────────
  'lh.belumCrawl': 'Never scanned',
  'lh.belumCrawlTeks':
    'Its pages are not known yet either. Lighthouse measures pages that are already stored, so a scan has to run first.',
  'lh.bukaTabBug': 'Open the Bug tab to scan',
  'lh.strategiPengukuran': 'Measurement strategy',
  'lh.desktopMati': 'Desktop measurement is off',
  'lh.desktopMatiTeks': 'Turn it on above, then run Scan Lighthouse.',
  'lh.gagal': 'The last scan failed',
  'lh.gagalTeks': 'The scores are unknown — this does not mean the pages are fast. Measure again.',
  'lh.desktopBelumTerukur': 'Desktop is on but has not been measured yet. Run Scan Lighthouse.',
  'lh.belumSatuPun': 'The pages are known, but none has been measured yet.',
  'run.full': 'Full scan',
  'meta.deskripsi': 'What broke on my sites, and what is already fixed.',
} satisfies Kamus
