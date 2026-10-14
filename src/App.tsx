import { marca } from './marca'

// Pantalla provisoria: confirma que el front levanta. Las pantallas reales salen del
// prototipo (ver CLAUDE.md) a medida que el backend expone cada módulo.
export default function App() {
  return (
    <main className="inicio">
      {marca.nombre && <h1>{marca.nombre}</h1>}
      <p className="lema">{marca.lema}</p>
    </main>
  )
}
