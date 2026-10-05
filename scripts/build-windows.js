import { spawn } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const releaseDir = join(projectDir, 'release')
const packageJson = JSON.parse(await readFile(join(projectDir, 'package.json'), 'utf8'))
const productName = packageJson.build?.productName || packageJson.name
const version = packageJson.version
const temporaryOutput = await mkdtemp(join(tmpdir(), 'multiplica-build-'))
const builderCli = join(projectDir, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js')

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: projectDir,
      stdio: 'inherit',
      windowsHide: true,
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`O empacotador terminou com o código ${code}.`))
    })
  })
}

try {
  await run(process.execPath, [
    builderCli,
    '--win',
    'nsis',
    'portable',
    '--publish',
    'never',
    `--config.directories.output=${temporaryOutput}`,
  ])

  await mkdir(releaseDir, { recursive: true })
  const files = [
    `${productName} Setup ${version}.exe`,
    `${productName} Setup ${version}.exe.blockmap`,
    `${productName} ${version}.exe`,
  ]
  for (const file of files) {
    await copyFile(join(temporaryOutput, file), join(releaseDir, file))
  }
  console.log(`\nExecutáveis prontos em ${releaseDir}`)
} finally {
  await rm(temporaryOutput, { recursive: true, force: true })
}
