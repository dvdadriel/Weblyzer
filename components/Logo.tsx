import React from 'react'

/**
 * Logo Weblyzer: estetika panel instrumen & retro terminal era 1970-an (Braun-style).
 * Menggunakan variabel CSS tema (--surface-card, --ink, --line, --sev-medium)
 * agar selalu selaras dengan palet vintage krem dan tajam di layar resolusi tinggi.
 */
export function Logo({ ukuran = 26 }: { ukuran?: number }) {
  const lebar = Math.round((ukuran * 36) / 28)
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 36 28"
      width={lebar}
      height={ukuran}
      fill="none"
      aria-hidden="true"
      className="navbar-logo"
    >
      {/* Casing retro Braun dengan sudut membulat */}
      <rect
        x="1.5"
        y="1.5"
        width="33"
        height="25"
        rx="6"
        fill="var(--surface-card)"
        stroke="var(--ink)"
        strokeWidth="2"
      />
      {/* Bezel layar CRT / panel instrumen */}
      <rect
        x="4.5"
        y="4.5"
        width="27"
        height="19"
        rx="3.5"
        stroke="var(--line)"
        strokeWidth="1"
      />
      {/* Tracing W monoline instrumen */}
      <path
        d="M 7.5 9.5 L 12 20.5 L 18 12.5 L 24 20.5 L 28.5 9.5"
        stroke="var(--ink)"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Indikator diode retro amber di vertex pusat */}
      <circle
        cx="18"
        cy="12.5"
        r="2"
        fill="var(--sev-medium)"
        stroke="var(--ink)"
        strokeWidth="0.9"
      />
      {/* Titik probe terminal konsol */}
      <circle cx="28.5" cy="9.5" r="1.5" fill="var(--ink)" />
      <circle cx="7.5" cy="9.5" r="1.5" fill="var(--ink)" />
    </svg>
  )
}
