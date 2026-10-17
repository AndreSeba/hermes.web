// Los 5 colores del prototipo para elegir en un toque. La dueña también puede elegir cualquier otro.
export const coloresDeTienda = [
  { nombre: 'Mostaza', hex: '#F2A33A' },
  { nombre: 'Verde', hex: '#0B7A57' },
  { nombre: 'Terracota', hex: '#B5532F' },
  { nombre: 'Azul', hex: '#2552A3' },
  { nombre: 'Grafito', hex: '#2E3036' },
] as const

// Los colores del fondo de la tienda pública (los mismos de Hermes.Public/Tema.cs: la vista previa tiene que verse igual).
export const paletaDeFondo = (fondo: 'Claro' | 'Crema' | 'Oscuro') =>
  ({
    Claro: { fondo: '#FFFFFF', superficie: '#F6F5F1', texto: '#17181C', suave: '#6B6E76', borde: '#E6E4DE' },
    Crema: { fondo: '#F6F5F1', superficie: '#FFFFFF', texto: '#17181C', suave: '#6B6E76', borde: '#E6E4DE' },
    Oscuro: { fondo: '#17181C', superficie: '#23252B', texto: '#F6F5F1', suave: '#A3A6AE', borde: '#34363D' },
  })[fondo]

// Texto claro u oscuro según el fondo, para que se lea (contraste WCAG: luminancia relativa).
export function colorDeTexto(hex: string) {
  const canal = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const luminancia = 0.2126 * canal(0) + 0.7152 * canal(1) + 0.0722 * canal(2)
  return luminancia > 0.4 ? '#17181C' : '#FFFFFF'
}
