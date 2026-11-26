import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.multiplica.videos',
  appName: 'Multiplica',
  webDir: 'dist',
  server: {
    // O app conversa por HTTP com o servidor do Multiplica na rede local.
    // Com "https", o Android bloquearia essas chamadas como conteúdo misto.
    androidScheme: 'http',
    cleartext: true,
  },
}

export default config
