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

  // ── Scanning ──────────────────────────────────────────────────────────────
  'scan.tombol': 'Scan {kategori}',
  'scan.berjalan': '{nama} has been running since {mulai}. This page will change on its own when it finishes.',
  'scan.sedangBerjalan': 'A scan of this site is already running.',
  'scan.gagalJalan': 'The scan failed to start. Check the server log.',
  'scan.tungguSelesai': 'This site is being scanned. Wait for it to finish.',

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


  // ── AI model ──────────────────────────────────────────────────────────────
  'model.judul': 'AI Model',
  'model.teks1':
    'claude and agy are chosen here — both have their own login on this machine, so there is no API key to store. The choice takes effect immediately, with no server restart.',
  'model.teks2':
    'Models that use an API key are configured through .env, and only from there. There is no model list in the code: put whatever the provider recognises in WEBLYZER_AI_MODEL, and a mistyped model is rejected by the provider with its own message.',
  'model.labelCli': 'CLI on this machine',
  'model.labelModel': 'Model',
  'model.cli.claude': 'Your Claude subscription',
  'model.cli.agy': 'Your agy subscription',
  'model.simpanUji': 'Save & Check',
  'model.memeriksa': 'Calling the CLI…',
  'model.pakaiEnv': 'Release, use .env',
  'model.melepas': 'Releasing…',
  'model.cliJawab': '{cli} answered: {jawab}',
  'model.cliGagal': '{cli} was saved, but failed when called: {galat}',
  'model.cliTakDikenal': 'Unknown CLI: {cli}',
  'model.sumberWeb': 'chosen on this page',
  'model.sumberEnv': 'from .env',
  'model.catatanKunci':
    'Only the CLI path can be chosen here, and that is a deliberate boundary: claude and agy use their own login on this machine, so all that gets stored is a CLI name and a model name. An API key never goes through a form — it is only read from .env, so no secret crosses the browser and none is stored in an unencrypted database file.',
  'model.aktif': 'Active over the {jalur} path with model {model}',
  'model.catatanNama':
    'Provider names whose base URL is already known: {daftar}. Any other name works too as long as it speaks the OpenAI protocol — give its base URL in WEBLYZER_AI_BASE_URL. There is no model list in the code, so adding a model means changing one line in .env rather than editing the program.',
  'model.catatanAi':
    'The AI layer only writes a summary of findings that already exist. All seven scan aspects run on their own without AI, and Lighthouse scores are measured rather than guessed by a model.',


  // ── Shared ────────────────────────────────────────────────────────────────
  'umum.situsTidakDitemukan': 'Site {id} was not found.',
  'umum.temuanTidakDitemukan': 'Finding {id} was not found.',
  'umum.kunjungi': 'Visit {url}',
  // ── Scan button names per aspect ──────────────────────────────────────────
  'scan.bugs': 'Scan Bug',
  'scan.console': 'Scan Console',
  'scan.security': 'Scan Security',
  'scan.seo': 'Scan SEO',
  'mobile.stripLabel': 'Rendering compared across screen widths',
  'mobile.stripCatatan':
    'Screenshots from the last scan, one row per page. Only the latest is kept — findings in Weblyzer describe the present, and an older screenshot may show a defect that is already fixed. Click one to open it full size.',
  'mobile.stripAlt': '{lebar} rendering of {url}',
  'mobile.potonganAlt': 'Screenshot crop of the element: {teks}',
  'scan.mobile': 'Scan Mobile',
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
