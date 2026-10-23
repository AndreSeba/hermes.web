import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { MOSTRAR_MI_PLAN } from '../diseno/secciones'

// Mensaje que el lector de pantalla anuncia al aparecer. `advertencia` es informativo (no es un
// error): "esto tiene consecuencias, leelo antes de seguir".
// Los mensajes de límite del plan (402) mandan a "Mi plan": el aviso trae el enlace solo.
export function Aviso({ tipo = 'error', children }: { tipo?: 'error' | 'exito' | 'advertencia'; children: ReactNode }) {
  const deLimite = MOSTRAR_MI_PLAN && tipo === 'error' && typeof children === 'string' && children.includes('Mi plan')
  return (
    <div className={`aviso aviso-${tipo}`} role={tipo === 'error' ? 'alert' : 'status'}>
      {children}
      {deLimite && (
        <>
          {' '}
          <Link to="/mi-plan">Ver mi plan</Link>
        </>
      )}
    </div>
  )
}
