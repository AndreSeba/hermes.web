import type { ReactNode } from 'react'

// Mensaje de error (o de éxito) que el lector de pantalla anuncia al aparecer.
export function Aviso({ tipo = 'error', children }: { tipo?: 'error' | 'exito'; children: ReactNode }) {
  return (
    <div className={`aviso aviso-${tipo}`} role={tipo === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  )
}
