import { Capacitor } from '@capacitor/core'

const SERVER_URL_KEY = 'multiplica-server-url'

/** No app Android a interface roda dentro do aparelho, e o processamento fica num servidor do Multiplica. */
export const isNativeApp = Capacitor.isNativePlatform()

function readStoredServerUrl() {
  try {
    return localStorage.getItem(SERVER_URL_KEY)
  } catch {
    return null
  }
}

/** Endereço do servidor. Vazio significa "o mesmo endereço da página" (navegador e Windows). */
export function getServerUrl() {
  return readStoredServerUrl() ?? import.meta.env.VITE_API_URL ?? ''
}

export function normalizeServerUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
}

export function setServerUrl(value: string) {
  try {
    localStorage.setItem(SERVER_URL_KEY, normalizeServerUrl(value))
  } catch {
    // Sem armazenamento disponível, o endereço vale só até fechar o app.
  }
}

/** Transforma caminhos do servidor (/api/...) em endereços completos quando o servidor fica em outro aparelho. */
export function apiUrl(path: string) {
  if (!path || /^[a-z][a-z0-9+.-]*:/i.test(path)) return path
  return `${getServerUrl()}${path}`
}
