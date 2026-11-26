import express from 'express'
import multer from 'multer'
import ffmpegStaticPath from 'ffmpeg-static'
import ffprobe from 'ffprobe-static'
import { ZipArchive } from 'archiver'
import { spawn } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { networkInterfaces } from 'node:os'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = resolve(process.env.MULTIPLICA_DATA_DIR || join(rootDir, 'data'))
const databasePath = join(dataDir, 'projects.json')
const workDir = resolve(process.env.MULTIPLICA_WORK_DIR || join(rootDir, 'work', 'render-jobs'))
const uploadDir = join(workDir, 'uploads')
const outputDir = resolve(process.env.MULTIPLICA_OUTPUT_DIR || join(rootDir, 'outputs', 'videos'))
const frontendDir = resolve(process.env.MULTIPLICA_FRONTEND_DIR || join(rootDir, 'dist'))
// MULTIPLICA_FFMPEG e MULTIPLICA_FFPROBE trocam o FFmpeg embutido por outro. No Linux, o embutido não tem o filtro de texto (drawtext).
const ffmpegPath = process.env.MULTIPLICA_FFMPEG || ffmpegStaticPath?.replace('app.asar', 'app.asar.unpacked')
const ffprobePath = process.env.MULTIPLICA_FFPROBE || ffprobe.path.replace('app.asar', 'app.asar.unpacked')
const port = Number(process.env.PORT || 3001)
// 127.0.0.1 deixa o servidor acessível só neste computador. Use 0.0.0.0 para o app Android alcançá-lo pela rede Wi-Fi.
const host = process.env.MULTIPLICA_HOST || (process.argv.includes('--lan') ? '0.0.0.0' : '127.0.0.1')
// Origens das telas do app Android (Capacitor) e do Vite. Outras podem ser somadas em MULTIPLICA_ALLOWED_ORIGINS, separadas por vírgula.
const allowedOrigins = new Set([
  'http://localhost',
  'https://localhost',
  'capacitor://localhost',
  ...(process.env.MULTIPLICA_ALLOWED_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean),
])
const fontCandidates = [
  process.env.MULTIPLICA_FONT,
  join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'arialbd.ttf'),
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
].filter(Boolean)
const fontFile = fontCandidates.find((candidate) => existsSync(candidate)) || fontCandidates[0]
const jobs = new Map()

await Promise.all([
  mkdir(dataDir, { recursive: true }),
  mkdir(uploadDir, { recursive: true }),
  mkdir(outputDir, { recursive: true }),
])

let database = { projects: [] }
try {
  database = JSON.parse(await readFile(databasePath, 'utf8'))
} catch (error) {
  if (error.code !== 'ENOENT') throw error
  await writeFile(databasePath, JSON.stringify(database, null, 2), 'utf8')
}

let databaseWrite = Promise.resolve()
function saveDatabase() {
  const snapshot = JSON.stringify(database, null, 2)
  databaseWrite = databaseWrite.then(() => writeFile(databasePath, snapshot, 'utf8'))
  return databaseWrite
}

if (!database.projects.length) {
  const now = new Date().toISOString()
  const initialProject = {
    id: randomUUID(),
    name: 'Meu primeiro projeto',
    createdAt: now,
    updatedAt: now,
    clips: [],
    exports: [],
  }
  database.projects.push(initialProject)
  await mkdir(join(dataDir, 'projects', initialProject.id, 'clips'), { recursive: true })
  await saveDatabase()
}

let migratedClips = false
for (const project of database.projects) {
  for (const clip of project.clips) {
    if (typeof clip.trimStart !== 'number') {
      clip.trimStart = 0
      migratedClips = true
    }
    if (typeof clip.trimEnd !== 'number') {
      clip.trimEnd = clip.duration
      migratedClips = true
    }
  }
}
if (migratedClips) await saveDatabase()

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 500 * 1024 * 1024, files: 30 },
  fileFilter: (_request, file, callback) => {
    callback(null, file.mimetype.startsWith('video/'))
  },
})

const app = express()
app.use((request, response, next) => {
  const origin = request.headers.origin
  if (origin && allowedOrigins.has(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Vary', 'Origin')
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (request.method === 'OPTIONS') return response.sendStatus(204)
  }
  next()
})
app.use(express.json())
app.use('/api/files', express.static(outputDir, { fallthrough: false }))

function safeName(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'projeto'
}

function publicProject(project) {
  return {
    ...project,
    clips: project.clips.map(({ storedName: _storedName, ...clip }) => ({
      ...clip,
      url: `/api/projects/${project.id}/clips/${clip.id}/file`,
    })),
  }
}

function projectSummary(project) {
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    clipCount: project.clips.length,
    exportCount: project.exports.length,
  }
}

function findProject(id) {
  return database.projects.find((project) => project.id === id)
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const process = spawn(command, args, { windowsHide: true })
    let stderr = ''
    process.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    process.on('error', reject)
    process.on('close', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(stderr.split('\n').slice(-8).join('\n') || `Processo finalizado com código ${code}`))
    })
  })
}

async function readDuration(path) {
  return new Promise((resolvePromise) => {
    const process = spawn(ffprobePath, [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', path,
    ], { windowsHide: true })
    let output = ''
    process.stdout.on('data', (chunk) => { output += chunk.toString() })
    process.on('error', () => resolvePromise(0))
    process.on('close', () => resolvePromise(Number.parseFloat(output.trim()) || 0))
  })
}

async function hasAudio(path) {
  return new Promise((resolvePromise) => {
    const process = spawn(ffprobePath, [
      '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_type',
      '-of', 'default=noprint_wrappers=1:nokey=1', path,
    ], { windowsHide: true })
    let output = ''
    process.stdout.on('data', (chunk) => { output += chunk.toString() })
    process.on('error', () => resolvePromise(false))
    process.on('close', () => resolvePromise(output.trim() === 'audio'))
  })
}

async function normalizeClip(input, output, clip) {
  const audio = await hasAudio(input)
  const trimStart = Math.max(0, clip.trimStart || 0)
  const trimEnd = Math.min(clip.duration, clip.trimEnd || clip.duration)
  const selectedDuration = Math.max(0.1, trimEnd - trimStart)
  const videoFilter = 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,setsar=1,format=yuv420p'
  const args = ['-y']
  if (trimStart > 0) args.push('-ss', trimStart.toFixed(3))
  args.push('-i', input)
  if (!audio) args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000')
  args.push(
    '-vf', videoFilter,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
    '-t', selectedDuration.toFixed(3), '-movflags', '+faststart', '-shortest', output,
  )
  await run(ffmpegPath, args)
}

async function concatClips(paths, output, listPath) {
  const content = paths.map((path) => `file '${path.replaceAll("'", "'\\''")}'`).join('\n')
  await writeFile(listPath, content, 'utf8')
  await run(ffmpegPath, ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', '-movflags', '+faststart', output])
}

function filterPath(value) {
  return value.replaceAll('\\', '/').replace(':', '\\:').replaceAll("'", "\\'")
}

function normalizeVisualStyle(input) {
  const color = /^#[0-9a-f]{6}$/i.test(input?.accentColor || '') ? input.accentColor.toUpperCase() : '#D8F45C'
  const backgroundColor = /^#[0-9a-f]{6}$/i.test(input?.backgroundColor || '') ? input.backgroundColor.toUpperCase() : '#193F35'
  const backgroundOpacity = Math.min(100, Math.max(0, Number(input?.backgroundOpacity ?? 88)))
  const position = ['top', 'center', 'bottom'].includes(input?.position) ? input.position : 'top'
  return {
    enabled: Boolean(input?.enabled),
    headline: String(input?.headline || '').trim().slice(0, 80),
    brandName: String(input?.brandName || '').trim().slice(0, 40),
    accentColor: color,
    backgroundColor,
    backgroundOpacity,
    position,
  }
}

async function applyVisualStyle(input, output, style, jobDir) {
  const filters = []
  const fontPath = filterPath(fontFile)
  const color = `0x${style.accentColor.slice(1)}`
  const backgroundColor = `0x${style.backgroundColor.slice(1)}@${(style.backgroundOpacity / 100).toFixed(2)}`
  const headlineY = style.position === 'center' ? '(h-text_h)/2' : style.position === 'bottom' ? 'h-text_h-h*0.14' : 'h*0.10'

  if (style.headline) {
    const headlinePath = join(jobDir, 'headline.txt')
    await writeFile(headlinePath, style.headline, 'utf8')
    filters.push(`drawtext=fontfile='${fontPath}':textfile='${filterPath(headlinePath)}':expansion=none:fontcolor=${color}:fontsize=72:x=(w-text_w)/2:y=${headlineY}:box=1:boxcolor=${backgroundColor}:boxborderw=28`)
  }
  if (style.brandName) {
    const brandPath = join(jobDir, 'brand.txt')
    await writeFile(brandPath, style.brandName, 'utf8')
    filters.push(`drawtext=fontfile='${fontPath}':textfile='${filterPath(brandPath)}':expansion=none:fontcolor=white:fontsize=36:x=w-text_w-54:y=h-text_h-54:box=1:boxcolor=black@0.45:boxborderw=14`)
  }

  if (!filters.length) {
    await rename(input, output)
    return
  }
  await run(ffmpegPath, ['-y', '-i', input, '-vf', filters.join(','), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'copy', '-movflags', '+faststart', output])
}

async function createZip(sourceDir, zipPath) {
  await new Promise((resolvePromise, reject) => {
    const output = createWriteStream(zipPath)
    const archive = new ZipArchive({ zlib: { level: 6 } })
    output.on('close', resolvePromise)
    output.on('error', reject)
    archive.on('error', reject)
    archive.pipe(output)
    archive.directory(sourceDir, false)
    archive.finalize()
  })
}

function storedClipPath(project, clip) {
  return join(dataDir, 'projects', project.id, 'clips', clip.storedName)
}

async function processJob(job, project) {
  const jobDir = join(workDir, job.id)
  const normalizedDir = join(jobDir, 'normalized')
  const projectOutputName = `${safeName(job.batchName)}-${job.id.slice(0, 8)}`
  const projectOutputDir = join(outputDir, projectOutputName)
  await mkdir(normalizedDir, { recursive: true })
  await mkdir(projectOutputDir, { recursive: true })

  try {
    job.status = 'normalizing'
    const selectedClips = [...new Map(
      job.combinations.flatMap((combination) => [combination.hook, combination.body, combination.cta]).map((clip) => [clip.id, clip]),
    ).values()]
    const normalized = new Map()
    let normalizedCount = 0

    for (const clip of selectedClips) {
      const target = join(normalizedDir, `${clip.type}-${clip.id}.mp4`)
      await normalizeClip(storedClipPath(project, clip), target, clip)
      normalized.set(clip.id, target)
      normalizedCount += 1
      job.progress = Math.round((normalizedCount / selectedClips.length) * 35)
      job.message = `Preparando trecho ${normalizedCount} de ${selectedClips.length}`
    }

    job.status = 'rendering'
    for (let index = 0; index < job.combinations.length; index += 1) {
      const combination = job.combinations[index]
      const fileName = `variacao-${String(index + 1).padStart(3, '0')}.mp4`
      const target = join(projectOutputDir, fileName)
      const assembled = join(jobDir, `assembled-${index}.mp4`)
      await concatClips(
        [normalized.get(combination.hook.id), normalized.get(combination.body.id), normalized.get(combination.cta.id)],
        job.visualStyle.enabled ? assembled : target,
        join(jobDir, `concat-${index}.txt`),
      )
      if (job.visualStyle.enabled) await applyVisualStyle(assembled, target, job.visualStyle, jobDir)
      job.files.push({ name: fileName, url: `/api/files/${encodeURIComponent(projectOutputName)}/${encodeURIComponent(fileName)}` })
      job.progress = 35 + Math.round(((index + 1) / job.combinations.length) * 60)
      job.message = `Montando vídeo ${index + 1} de ${job.combinations.length}`
    }

    job.status = 'packaging'
    job.message = 'Criando pacote para download'
    const zipName = `${projectOutputName}.zip`
    await createZip(projectOutputDir, join(outputDir, zipName))
    job.zipUrl = `/api/files/${encodeURIComponent(zipName)}`
    job.progress = 100
    job.status = 'done'
    job.message = `${job.files.length} vídeo${job.files.length === 1 ? '' : 's'} concluído${job.files.length === 1 ? '' : 's'}`

    project.exports.unshift({
      id: job.id,
      name: job.batchName,
      visualStyle: job.visualStyle,
      createdAt: job.createdAt,
      total: job.files.length,
      files: job.files,
      zipUrl: job.zipUrl,
    })
    project.exports = project.exports.slice(0, 20)
    project.updatedAt = new Date().toISOString()
    await saveDatabase()
  } catch (error) {
    job.status = 'error'
    job.message = error instanceof Error ? error.message : 'Falha desconhecida no processamento'
  } finally {
    await rm(jobDir, { recursive: true, force: true })
  }
}

app.get('/api/health', (_request, response) => {
  response.json({ ok: Boolean(ffmpegPath && existsSync(ffmpegPath)), ffmpeg: Boolean(ffmpegPath) })
})

app.get('/api/projects', (_request, response) => {
  const projects = [...database.projects]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(projectSummary)
  response.json(projects)
})

app.post('/api/projects', async (request, response) => {
  const now = new Date().toISOString()
  const project = {
    id: randomUUID(),
    name: String(request.body.name || 'Novo projeto').trim().slice(0, 100) || 'Novo projeto',
    createdAt: now,
    updatedAt: now,
    clips: [],
    exports: [],
  }
  database.projects.push(project)
  await mkdir(join(dataDir, 'projects', project.id, 'clips'), { recursive: true })
  await saveDatabase()
  response.status(201).json(publicProject(project))
})

app.get('/api/projects/:id', (request, response) => {
  const project = findProject(request.params.id)
  if (!project) return response.status(404).json({ error: 'Projeto não encontrado.' })
  response.json(publicProject(project))
})

app.patch('/api/projects/:id', async (request, response) => {
  const project = findProject(request.params.id)
  if (!project) return response.status(404).json({ error: 'Projeto não encontrado.' })
  const name = String(request.body.name || '').trim().slice(0, 100)
  if (!name) return response.status(400).json({ error: 'Informe um nome para o projeto.' })
  project.name = name
  project.updatedAt = new Date().toISOString()
  await saveDatabase()
  response.json(publicProject(project))
})

app.post('/api/projects/:id/full-videos', upload.array('videos', 10), async (request, response) => {
  const project = findProject(request.params.id)
  const files = request.files || []
  if (!project) {
    await Promise.all(files.map((file) => rm(file.path, { force: true })))
    return response.status(404).json({ error: 'Projeto não encontrado.' })
  }
  if (files.length < 2) {
    await Promise.all(files.map((file) => rm(file.path, { force: true })))
    return response.status(400).json({ error: 'Envie pelo menos dois vídeos completos para usar a divisão automática.' })
  }

  const targetDir = join(dataDir, 'projects', project.id, 'clips')
  const createdPaths = []
  const added = []
  const parts = [
    { type: 'hook', label: 'Gancho' },
    { type: 'body', label: 'Desenvolvimento' },
    { type: 'cta', label: 'CTA' },
  ]

  try {
    await mkdir(targetDir, { recursive: true })
    for (const file of files) {
      const duration = await readDuration(file.path)
      if (duration < 3) throw new Error(`O vídeo “${file.originalname}” precisa ter pelo menos 3 segundos.`)
      const baseName = file.originalname.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')
      const extension = extname(file.originalname).toLowerCase() || '.mp4'
      const boundaries = [0, Math.round((duration / 3) * 10) / 10, Math.round(((duration * 2) / 3) * 10) / 10, duration]

      for (let index = 0; index < parts.length; index += 1) {
        const id = randomUUID()
        const storedName = `${id}${extension}`
        const target = join(targetDir, storedName)
        await copyFile(file.path, target)
        createdPaths.push(target)
        added.push({
          id,
          type: parts[index].type,
          name: `${baseName} — ${parts[index].label}`,
          originalName: file.originalname,
          storedName,
          size: file.size,
          duration,
          trimStart: boundaries[index],
          trimEnd: boundaries[index + 1],
          sourceGroup: baseName,
          createdAt: new Date().toISOString(),
        })
      }
      await rm(file.path, { force: true })
    }
  } catch (error) {
    await Promise.all([...files.map((file) => file.path), ...createdPaths].map((path) => rm(path, { force: true })))
    throw error
  }

  project.clips.push(...added)
  project.updatedAt = new Date().toISOString()
  await saveDatabase()
  response.status(201).json(publicProject(project))
})

app.post('/api/projects/:id/clips', upload.any(), async (request, response) => {
  const project = findProject(request.params.id)
  const files = request.files || []
  if (!project) {
    await Promise.all(files.map((file) => rm(file.path, { force: true })))
    return response.status(404).json({ error: 'Projeto não encontrado.' })
  }

  const validTypes = new Set(['hook', 'body', 'cta'])
  const targetDir = join(dataDir, 'projects', project.id, 'clips')
  await mkdir(targetDir, { recursive: true })
  const added = []

  for (const file of files) {
    if (!validTypes.has(file.fieldname)) {
      await rm(file.path, { force: true })
      continue
    }
    const id = randomUUID()
    const extension = extname(file.originalname).toLowerCase() || '.mp4'
    const storedName = `${id}${extension}`
    const target = join(targetDir, storedName)
    await rename(file.path, target)
    const duration = await readDuration(target)
    const clip = {
      id,
      type: file.fieldname,
      name: file.originalname.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
      originalName: file.originalname,
      storedName,
      size: file.size,
      duration,
      trimStart: 0,
      trimEnd: duration,
      createdAt: new Date().toISOString(),
    }
    project.clips.push(clip)
    added.push(clip)
  }

  project.updatedAt = new Date().toISOString()
  await saveDatabase()
  response.status(201).json(publicProject(project))
})

app.get('/api/projects/:projectId/clips/:clipId/file', (request, response) => {
  const project = findProject(request.params.projectId)
  const clip = project?.clips.find((item) => item.id === request.params.clipId)
  if (!project || !clip) return response.status(404).json({ error: 'Trecho não encontrado.' })
  response.sendFile(storedClipPath(project, clip))
})

app.patch('/api/projects/:projectId/clips/:clipId', async (request, response) => {
  const project = findProject(request.params.projectId)
  const clip = project?.clips.find((item) => item.id === request.params.clipId)
  if (!project || !clip) return response.status(404).json({ error: 'Trecho não encontrado.' })

  const trimStart = Number(request.body.trimStart)
  const trimEnd = Number(request.body.trimEnd)
  if (!Number.isFinite(trimStart) || !Number.isFinite(trimEnd)) {
    return response.status(400).json({ error: 'Informe pontos de início e fim válidos.' })
  }
  if (trimStart < 0 || trimEnd > clip.duration + 0.01 || trimEnd - trimStart < 0.1) {
    return response.status(400).json({ error: 'O recorte precisa ter pelo menos 0,1 segundo e ficar dentro da duração do vídeo.' })
  }

  clip.trimStart = Math.round(trimStart * 10) / 10
  clip.trimEnd = Math.round(trimEnd * 10) / 10
  project.updatedAt = new Date().toISOString()
  await saveDatabase()
  response.json(publicProject(project))
})

app.delete('/api/projects/:projectId/clips/:clipId', async (request, response) => {
  const project = findProject(request.params.projectId)
  const clip = project?.clips.find((item) => item.id === request.params.clipId)
  if (!project || !clip) return response.status(404).json({ error: 'Trecho não encontrado.' })
  await rm(storedClipPath(project, clip), { force: true })
  project.clips = project.clips.filter((item) => item.id !== clip.id)
  project.updatedAt = new Date().toISOString()
  await saveDatabase()
  response.status(204).end()
})

app.post('/api/jobs', async (request, response) => {
  const project = findProject(request.body.projectId)
  if (!project) return response.status(404).json({ error: 'Projeto não encontrado.' })
  const clipsById = new Map(project.clips.map((clip) => [clip.id, clip]))
  const requestedCombinations = Array.isArray(request.body.combinations) ? request.body.combinations : []
  const combinations = requestedCombinations.map((item) => ({
    hook: clipsById.get(item?.hookId),
    body: clipsById.get(item?.bodyId),
    cta: clipsById.get(item?.ctaId),
  }))
  if (!combinations.length) return response.status(400).json({ error: 'Selecione ao menos uma combinação para gerar.' })
  if (combinations.length > 100) return response.status(400).json({ error: `Este lote criaria ${combinations.length} vídeos. O limite atual é 100.` })
  if (combinations.some(({ hook, body, cta }) => !hook || hook.type !== 'hook' || !body || body.type !== 'body' || !cta || cta.type !== 'cta')) {
    return response.status(400).json({ error: 'Uma das combinações selecionadas não é mais válida.' })
  }
  const uniqueKeys = new Set(combinations.map(({ hook, body, cta }) => `${hook.id}:${body.id}:${cta.id}`))
  if (uniqueKeys.size !== combinations.length) return response.status(400).json({ error: 'O lote contém combinações repetidas.' })

  const total = combinations.length
  const batchName = String(request.body.batchName || project.name).trim().slice(0, 100) || project.name
  const visualStyle = normalizeVisualStyle(request.body.visualStyle)

  const id = randomUUID()
  const job = {
    id,
    projectId: project.id,
    projectName: project.name,
    batchName,
    visualStyle,
    combinations,
    status: 'queued',
    progress: 0,
    message: 'Aguardando processamento',
    total,
    files: [],
    zipUrl: null,
    createdAt: new Date().toISOString(),
  }
  jobs.set(id, job)
  response.status(202).json({ id, total })
  void processJob(job, project)
})

app.get('/api/jobs/:id', (request, response) => {
  const job = jobs.get(request.params.id)
  if (!job) return response.status(404).json({ error: 'Processamento não encontrado.' })
  response.json(job)
})

if (existsSync(frontendDir)) {
  app.use(express.static(frontendDir))
  app.use((request, response, next) => {
    if (request.method === 'GET' && !request.path.startsWith('/api/')) {
      return response.sendFile(join(frontendDir, 'index.html'))
    }
    next()
  })
}

app.use((error, _request, response, _next) => {
  const message = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
    ? 'Um dos arquivos ultrapassa o limite de 500 MB.'
    : error.message || 'Não foi possível processar os arquivos.'
  response.status(400).json({ error: message })
})

export function startServer(preferredPort = port) {
  return new Promise((resolvePromise, reject) => {
    const server = app.listen(preferredPort, host, () => {
      const address = server.address()
      const activePort = typeof address === 'object' && address ? address.port : preferredPort
      console.log(`Multiplica pronto em http://127.0.0.1:${activePort}`)
      if (host === '0.0.0.0') {
        const lanAddresses = Object.values(networkInterfaces()).flat()
          .filter((item) => item && item.family === 'IPv4' && !item.internal)
          .map((item) => `http://${item.address}:${activePort}`)
        for (const address of lanAddresses) console.log(`Na rede local (app Android): ${address}`)
      }
      resolvePromise(server)
    })
    server.on('error', reject)
  })
}

if (process.env.MULTIPLICA_EMBEDDED !== '1') {
  await startServer()
}
