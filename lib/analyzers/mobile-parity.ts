import type { UkuranHalaman, UkuranLebar, NamaLebar } from '../scanners/mobile-parity.ts'
import type { Severity } from '../findings.ts'

/**
 * Mengubah pengukuran menjadi temuan.
 *
 * Fungsi murni: menerima angka, mengembalikan temuan. Tidak menyentuh
 * database, tidak membuka browser, tidak memanggil model. Itu yang membuat
 * seluruh ambang di bawah bisa diuji dengan angka yang ditulis tangan, tanpa
 * situs sungguhan dan tanpa Chromium.
 *
 * ============================================================================
 * SATU TEMUAN PER MASALAH, BUKAN PER ELEMEN
 * ============================================================================
 * Empat puluh elemen yang melewati tepi viewport adalah SATU masalah tata
 * letak, dan empat puluh baris akan mengubur tabnya. Jumlah dan contohnya
 * masuk ke `detail`; identitas temuannya tetap satu.
 *
 * Aturan yang sama sudah berlaku di prompt GEO/Audit, dan alasannya juga sama.
 */

export type TemuanMobile = {
  url: string
  severity: Severity
  rule: string
  title: string
  detail: Record<string, unknown>
}

/**
 * ============================================================================
 * AMBANG, DAN KENAPA ANGKANYA ITU
 * ============================================================================
 * Semuanya di satu tempat supaya bisa ditala tanpa mencarinya di enam cabang.
 * Setiap angka punya alasan; yang tidak punya alasan tidak boleh ada di sini.
 */
export const AMBANG = {
  /**
   * Selisih porsi teks tebal antara mobile dan desktop yang dianggap
   * kegagalan: 20 poin persentase.
   *
   * Bukan selisih apa pun. Naik sedikit di mobile itu sah dan sering benar —
   * judul yang membungkus jadi dua baris menambah porsinya tanpa ada yang
   * mengubah apa pun. Yang dicari adalah "semuanya jadi tebal", dan dua puluh
   * poin adalah lompatan yang tidak bisa terjadi karena pembungkusan baris.
   */
  bedaTebal: 0.2,

  /**
   * Porsi tebal yang dianggap berlebihan pada dirinya sendiri: 60%.
   *
   * Ada karena perbandingan saja tidak cukup: halaman yang tebal di SEMUA
   * lebar tidak punya selisih, tapi tetap halaman yang tidak punya hierarki.
   */
  tebalMutlak: 0.6,

  /**
   * Rasio ukuran judul terhadap ukuran isi yang dianggap sudah kehilangan
   * hierarki: 1,25×.
   *
   * Di bawah itu, judul dan isi terbaca sebagai satu blok. Angkanya dipilih
   * di bawah rasio "major third" (1,25) yang dipakai skala tipografi paling
   * umum — jadi yang ditandai adalah yang benar-benar rata, bukan yang
   * skalanya konservatif.
   */
  rasioHierarki: 1.25,

  /**
   * Seberapa jauh rasio hierarki mobile boleh turun dari desktop: 30%.
   *
   * Ini yang menjawab "rasio title dan desc tidak sesuai dengan desktop"
   * secara langsung — desktop yang 2,5× lalu mobile yang 1,3× adalah
   * keputusan yang tidak pernah dibuat siapa pun, ia hasil dari `clamp()`
   * yang tidak pernah diperiksa di lebar sempit.
   */
  susutHierarki: 0.3,

  /**
   * Jumlah kolom pada lebar mobile yang dianggap terlalu banyak: 3.
   *
   * Dua kolom di 390 piksel masih bisa dibela untuk kartu kecil. Tiga berarti
   * masing-masing sekitar 120 piksel — persis keluhan "yang seharusnya col-12
   * jadi col-4".
   */
  kolomMobile: 3,

  /**
   * Jarak median minimum pada mobile: 8 piksel.
   *
   * Di bawah itu, dua kartu bersinggungan dan terbaca sebagai satu. Bukan 16
   * (kelipatan yang lazim) karena banyak desain rapat yang memang memakai 8
   * dengan sengaja, dan menandainya adalah selera, bukan kegagalan.
   */
  jarakMinimum: 8,

  /**
   * Berapa banyak elemen keluar viewport yang menaikkan severity dari medium
   * ke high: 3.
   *
   * Satu elemen yang lewat tepi biasanya satu tabel atau satu gambar; tiga
   * atau lebih berarti tata letaknya sendiri yang tidak muat.
   */
  banyakKeluar: 3,
} as const

const cari = (u: UkuranHalaman, lebar: NamaLebar): UkuranLebar | undefined =>
  u.perLebar.find((p) => p.lebar === lebar)

/** Rasio judul terhadap isi. 0 kalau salah satunya tidak terukur. */
function rasio(p: UkuranLebar): number {
  if (p.ukuranIsi <= 0 || p.ukuranJudul <= 0) return 0
  return p.ukuranJudul / p.ukuranIsi
}

const persen = (x: number) => `${Math.round(x * 100)}%`

/**
 * Menganalisis satu halaman.
 *
 * Urutan temuannya tidak acak: yang menghalangi pemakaian lebih dulu (viewport
 * meta, zoom dimatikan, menggulir menyamping), lalu tata letak, lalu tulisan.
 * Itu urutan yang sama dengan urutan orang memperbaikinya.
 */
export function analisisMobileParity(u: UkuranHalaman): TemuanMobile[] {
  const temuan: TemuanMobile[] = []
  const m = cari(u, 'mobile')
  const t = cari(u, 'tablet')
  const d = cari(u, 'desktop')
  if (!m || !d) return temuan

  const pada = (rule: string, severity: Severity, title: string, detail: Record<string, unknown>) =>
    temuan.push({ url: u.url, severity, rule, title, detail })

  // ── 1. Mobile terabaikan ──────────────────────────────────────────────────

  if (u.metaViewport === null) {
    // Ini akar dari keluhan pertama, dan satu-satunya temuan di sini yang
    // critical: tanpa meta viewport, Chromium merender halaman selebar 980
    // piksel lalu mengecilkannya. Seluruh tulisan menjadi tak terbaca, dan
    // tidak ada CSS mana pun yang bisa memperbaikinya dari dalam.
    pada('mobile-viewport-meta-hilang', 'critical', 'Tidak ada meta viewport', {
      akibat:
        'Browser merender halaman selebar desktop lalu mengecilkannya, jadi seluruh ' +
        'tulisan tampil sangat kecil di ponsel.',
      perbaikan: '<meta name="viewport" content="width=device-width, initial-scale=1">',
    })
  } else if (/user-scalable\s*=\s*(no|0)/i.test(u.metaViewport)) {
    // Dipisah dari `maximum-scale` walau akibatnya mirip: yang ini pernyataan
    // eksplisit "jangan boleh di-zoom", dan biasanya dipasang dengan sengaja.
    pada('mobile-zoom-dimatikan', 'high', 'Zoom dimatikan lewat meta viewport', {
      metaViewport: u.metaViewport,
      akibat:
        'Orang yang perlu memperbesar tulisan tidak bisa. WCAG 1.4.4 menganggap ini ' +
        'kegagalan, dan iOS mengabaikannya sejak lama — jadi ia merugikan sebagian ' +
        'pemakai tanpa memberi apa pun.',
    })
  } else {
    const maks = /maximum-scale\s*=\s*([\d.]+)/i.exec(u.metaViewport)
    if (maks && parseFloat(maks[1]!) < 2) {
      pada('mobile-zoom-dibatasi', 'medium', 'Zoom dibatasi di bawah 200%', {
        metaViewport: u.metaViewport,
        akibat: 'WCAG 1.4.4 mensyaratkan tulisan bisa diperbesar sampai 200%.',
      })
    }
  }

  // Tata letak yang sama sekali tidak berubah antar lebar.
  //
  // Bukan "tidak ada media query" — itu tidak bisa dilihat dari hasil render,
  // dan CSS modern bisa responsif tanpa satu media query pun (`clamp`,
  // `minmax`, `flex-wrap`). Yang diperiksa adalah AKIBATNYA: ukuran huruf,
  // jarak, dan jumlah kolom yang identik pada 390 dan 1440 piksel berarti
  // tidak ada apa pun yang menyesuaikan diri.
  const samaPersis =
    m.ukuranIsi === d.ukuranIsi &&
    m.jarakMedian === d.jarakMedian &&
    m.kolomMaks === d.kolomMaks &&
    m.kolomMaks > 1
  if (samaPersis) {
    pada('mobile-tanpa-penyesuaian', 'high', 'Tata letak tidak berubah antara ponsel dan desktop', {
      ukuranIsi: m.ukuranIsi,
      jarakMedian: m.jarakMedian,
      kolomTerbanyak: m.kolomMaks,
      akibat:
        'Ukuran huruf, jarak, dan jumlah kolom identik pada 390 dan 1440 piksel. ' +
        'Halaman ini dirancang untuk satu lebar saja.',
    })
  }

  // ── 2. Tata letak hancur di mobile ────────────────────────────────────────

  for (const p of [m, t].filter((x): x is UkuranLebar => !!x)) {
    if (p.lebarDokumen > p.viewport + 1) {
      pada(
        `mobile-scroll-menyamping-${p.lebar}`,
        p.lebar === 'mobile' ? 'high' : 'medium',
        `Halaman menggulir menyamping di ${p.lebar}`,
        {
          lebarDokumen: p.lebarDokumen,
          lebarViewport: p.viewport,
          kelebihan: p.lebarDokumen - p.viewport,
          contoh: p.keluarViewport.slice(0, 5),
        },
      )
    }

    if (p.keluarViewport.length > 0) {
      pada(
        `mobile-elemen-keluar-viewport-${p.lebar}`,
        p.keluarViewport.length >= AMBANG.banyakKeluar ? 'high' : 'medium',
        `${p.keluarViewport.length} elemen melewati tepi layar di ${p.lebar}`,
        {
          jumlah: p.keluarViewport.length,
          // Contohnya yang paling parah lebih dulu — itu yang paling mungkin
          // jadi penyebab sisanya.
          contoh: p.keluarViewport.slice(0, 8),
        },
      )
    }

    if (p.terpotong.length > 0) {
      pada(
        `mobile-teks-terpotong-${p.lebar}`,
        'medium',
        `${p.terpotong.length} kotak memotong isinya di ${p.lebar}`,
        {
          jumlah: p.terpotong.length,
          contoh: p.terpotong.slice(0, 8),
          catatan:
            'Yang memakai text-overflow: ellipsis atau line-clamp tidak dihitung — ' +
            'pemotongan bersengaja bukan kerusakan.',
        },
      )
    }
  }

  if (m.kolomMaks >= AMBANG.kolomMobile) {
    pada('mobile-kolom-terlalu-banyak', 'medium', `${m.kolomMaks} kolom pada lebar ponsel`, {
      kolomMobile: m.kolomMaks,
      kolomDesktop: d.kolomMaks,
      lebarPerKolom: Math.round(m.viewport / m.kolomMaks),
      akibat: `Setiap kolom hanya sekitar ${Math.round(m.viewport / m.kolomMaks)} piksel.`,
      contoh: m.grid.filter((g) => g.kolom >= AMBANG.kolomMobile).slice(0, 5),
    })
  }

  // Kolom mobile lebih banyak daripada desktop: responsif yang terbalik.
  if (m.kolomMaks > d.kolomMaks && d.kolomMaks > 0) {
    pada('mobile-kolom-terbalik', 'medium', 'Ponsel punya lebih banyak kolom daripada desktop', {
      kolomMobile: m.kolomMaks,
      kolomDesktop: d.kolomMaks,
      akibat: 'Biasanya tanda breakpoint yang tertukar arahnya.',
    })
  }

  if (m.jarakMedian > 0 && m.jarakMedian < AMBANG.jarakMinimum) {
    pada('mobile-jarak-sempit', 'low', `Jarak antar-elemen median ${m.jarakMedian}px di ponsel`, {
      jarakMobile: m.jarakMedian,
      jarakDesktop: d.jarakMedian,
      ambang: AMBANG.jarakMinimum,
    })
  }

  // ── 3. Gaya penulisan meleset ─────────────────────────────────────────────

  if (m.porsiTebal - d.porsiTebal >= AMBANG.bedaTebal) {
    pada('mobile-tebal-berlebihan', 'medium', 'Jauh lebih banyak teks tebal di ponsel', {
      porsiTebalMobile: persen(m.porsiTebal),
      porsiTebalDesktop: persen(d.porsiTebal),
      selisih: persen(m.porsiTebal - d.porsiTebal),
      catatan:
        'Ditimbang panjang teks, bukan jumlah elemen — yang diukur adalah luas ' +
        'tulisan yang terbaca tebal.',
    })
  } else if (m.porsiTebal >= AMBANG.tebalMutlak) {
    pada('mobile-hampir-semua-tebal', 'medium', `${persen(m.porsiTebal)} teks ponsel tebal`, {
      porsiTebalMobile: persen(m.porsiTebal),
      ambang: persen(AMBANG.tebalMutlak),
      akibat: 'Kalau hampir semuanya tebal, tidak ada yang menonjol.',
    })
  }

  const rm = rasio(m)
  const rd = rasio(d)
  if (rm > 0 && rm < AMBANG.rasioHierarki) {
    pada('mobile-hierarki-rata', 'medium', 'Judul dan isi hampir sama besar di ponsel', {
      ukuranJudul: m.ukuranJudul,
      ukuranIsi: m.ukuranIsi,
      rasio: rm.toFixed(2),
      ambang: AMBANG.rasioHierarki,
    })
  } else if (rm > 0 && rd > 0 && rm < rd * (1 - AMBANG.susutHierarki)) {
    // Cabang `else if`, bukan temuan kedua: hierarki yang rata di mobile sudah
    // mencakup keluhannya, dan dua baris untuk satu masalah adalah persis yang
    // dilarang di kepala berkas ini.
    pada('mobile-hierarki-susut', 'medium', 'Rasio judul terhadap isi jauh lebih kecil di ponsel', {
      rasioMobile: rm.toFixed(2),
      rasioDesktop: rd.toFixed(2),
      susut: persen(1 - rm / rd),
      akibat:
        'Hierarki yang dirancang untuk desktop tidak ikut ke ponsel. Biasanya akibat ' +
        'clamp() atau ukuran tetap yang tidak pernah diperiksa di lebar sempit.',
    })
  }

  // ── 4. Fitur yang tidak bisa dipakai di layar sentuh ──────────────────────

  if (m.targetKecil.length > 0) {
    pada(
      'mobile-target-sentuh-kecil',
      'medium',
      `${m.targetKecil.length} target sentuh di bawah 24px`,
      {
        jumlah: m.targetKecil.length,
        ambang: 24,
        dasar: 'WCAG 2.2 kriteria 2.5.8 (Target Size, Minimum, AA).',
        contoh: m.targetKecil.slice(0, 8),
      },
    )
  }

  if (m.hoverSaja.length > 0) {
    pada(
      'mobile-hover-saja',
      'medium',
      `${m.hoverSaja.length} elemen menyingkap isinya hanya lewat hover`,
      {
        jumlah: m.hoverSaja.length,
        contoh: m.hoverSaja.slice(0, 8),
        akibat:
          'Layar sentuh tidak punya hover. Isi yang hanya muncul saat kursor lewat ' +
          'tidak akan pernah muncul di ponsel.',
      },
    )
  }

  return temuan
}

/** Menganalisis beberapa halaman sekaligus. */
export function analisisSitus(ukuran: UkuranHalaman[]): TemuanMobile[] {
  return ukuran.flatMap(analisisMobileParity)
}
