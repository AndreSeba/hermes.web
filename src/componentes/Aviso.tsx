import type { ReactNode } from 'react'

// Mensaje que el lector de pantalla anuncia al aparecer. `advertencia` es informativo (no es un
// error): "esto tiene consecuencias, leelo antes de seguir".
export function Aviso({ tipo = 'error', children }: { tipo?: 'error' | 'exito' | 'advertencia'; children: ReactNode }) {
  return (
    <div className={`aviso aviso-${tipo}`} role={tipo === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  )
}
