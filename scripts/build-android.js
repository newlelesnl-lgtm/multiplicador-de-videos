import { spawn } from 'node:child_process'
import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const androidDir = join(projectDir, 'android')
const releaseDir = join(projectDir, 'release')
const packageJson = JSON.parse(await readFile(join(projectDir, 'package.json'), 'utf8'))
const productName = packageJson.build?.productName || packageJson.name
const version = packageJson.version
const isWindows = process.platform === 'win32'

if (!process.env.ANDROID_HOME && !process.env.ANDROID_SDK_ROOT && !existsSync(join(androidDir, 'local.properties'))) {
  console.error('Android SDK não encontrado. Instale o Android Studio (ou o SDK) e defina ANDROID_HOME.')
  process.exit(1)
}

function run(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', windowsHide: true, shell: isWindows })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`O comando ${command} terminou com o código ${code}.`))
    })
  })
}

await run(isWindows ? 'npx.cmd' : 'npx', ['cap', 'sync', 'android'], projectDir)
await run(isWindows ? 'gradlew.bat' : './gradlew', ['assembleDebug'], androidDir)

const apk = join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
const target = join(releaseDir, `${productName}-${version}-teste.apk`)
await mkdir(releaseDir, { recursive: true })
await copyFile(apk, target)
console.log(`\nAPK de testes pronto em ${target}`)
