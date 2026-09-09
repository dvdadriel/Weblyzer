'use client'

import { useActionState } from 'react'
import { masuk } from '../app/masuk/aksi.ts'
import { Ikon } from './Ikon.tsx'

export function FormMasuk() {
  const [hasil, kirim, menunggu] = useActionState(masuk, null)

  return (
    <form action={kirim} className="model-set">
      <label className="model-baris">
        <span className="model-nama">Email</span>
        <input
          type="email"
          name="email"
          autoComplete="username"
          required
          disabled={menunggu}
          // Dipasang kembali sesudah gagal. Tanpa ini React mengosongkan
          // medannya dan orang yang salah mengetik password harus mengetik
          // ulang alamatnya juga.
          defaultValue={hasil?.email ?? ''}
        />
      </label>

      <label className="model-baris">
        <span className="model-nama">Password</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          disabled={menunggu}
        />
      </label>

      <button type="submit" className="tombol" disabled={menunggu}>
        {menunggu ? 'Memeriksa…' : 'Masuk'}
      </button>

      {hasil?.error && (
        <p className="model-hasil gagal" role="alert">
          <Ikon nama="alert" ukuran={13} /> {hasil.error}
        </p>
      )}
    </form>
  )
}
