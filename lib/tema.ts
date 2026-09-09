export const TEMA = ['system', 'light', 'dark'] as const
export type Tema = (typeof TEMA)[number]

export const NAMA_COOKIE_TEMA = 'weblyzer_tema'

export function temaSah(nilai: string | undefined): Tema {
  return TEMA.includes(nilai as Tema) ? (nilai as Tema) : 'system'
}

/**
 * Atribut `data-theme` untuk `<html>`.
 *
 * `system` mengembalikan `undefined` — tidak ada atribut sama sekali — dan itu
 * bukan kelalaian. Server tidak bisa mengetahui `prefers-color-scheme` milik
 * browser, jadi satu-satunya cara memenuhi pilihan `system` adalah menyerahkan
 * keputusannya ke CSS lewat media query. Memaksa nilai di server berarti
 * menebak, dan tebakan yang salah menampilkan tema yang tidak diminta.
 */
export function atributTema(tema: Tema): 'light' | 'dark' | undefined {
  return tema === 'system' ? undefined : tema
}
