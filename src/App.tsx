import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Check, ChevronDown, Download, Film, FolderPlus, History, LayoutGrid, LoaderCircle, Menu, Palette, Play, Plus, RotateCcw, Scissors, Search, Sparkles, Trash2, Type, Video, X } from 'lucide-react'

type ClipType = 'hook' | 'body' | 'cta'
type Clip = { id: string; name: string; type: ClipType; duration: number; trimStart: number; trimEnd: number; size: number; url: string; createdAt: string }
type RenderedFile = { name: string; url: string }
type ExportBatch = { id: string; name?: string; createdAt: string; total: number; files: RenderedFile[]; zipUrl: string }
type ProjectSummary = { id: string; name: string; createdAt: string; updatedAt: string; clipCount: number; exportCount: number }
type Project = ProjectSummary & { createdAt: string; clips: Clip[]; exports: ExportBatch[] }
type Combination = { id: string; hook: Clip; body: Clip; cta: Clip; duration: number }
type VisualStyle = { enabled: boolean; headline: string; brandName: string; accentColor: string; backgroundColor: string; backgroundOpacity: number; position: 'top' | 'center' | 'bottom' }
type AppView = 'studio' | 'projects' | 'exports'
type RenderJob = {
  id: string
  status: 'queued' | 'normalizing' | 'rendering' | 'packaging' | 'done' | 'error'
  progress: number
  message: string
  total: number
  files: RenderedFile[]
  zipUrl: string | null
}

const clipLabels: Record<ClipType, { title: string; short: string; hint: string; color: string }> = {
  hook: { title: 'Ganchos', short: 'Gancho', hint: 'Prenda a atenção logo no início', color: '#ee6c4d' },
  body: { title: 'Desenvolvimentos', short: 'Corpo', hint: 'Apresente o produto ou a ideia', color: '#5865c7' },
  cta: { title: 'Chamadas para ação', short: 'CTA', hint: 'Convide a pessoa para agir', color: '#27896f' },
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 MB'
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds)) return '--:--'
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function hexToRgba(hex: string, opacity: number) {
  const value = Number.parseInt(hex.slice(1), 16)
  return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${opacity / 100})`
}

function buildCombinations(clips: Clip[]): Combination[] {
  const hooks = clips.filter((clip) => clip.type === 'hook')
  const bodies = clips.filter((clip) => clip.type === 'body')
  const ctas = clips.filter((clip) => clip.type === 'cta')
  return hooks.flatMap((hook) => bodies.flatMap((body) => ctas.map((cta) => ({
    id: `${hook.id}:${body.id}:${cta.id}`,
    hook,
    body,
    cta,
    duration: (hook.trimEnd - hook.trimStart) + (body.trimEnd - body.trimStart) + (cta.trimEnd - cta.trimStart),
  }))))
}

function exportAsJob(item: ExportBatch): RenderJob {
  return {
    id: item.id,
    status: 'done',
    progress: 100,
    message: `${item.total} vídeo${item.total === 1 ? '' : 's'} salvo${item.total === 1 ? '' : 's'} neste histórico`,
    total: item.total,
    files: item.files,
    zipUrl: item.zipUrl,
  }
}

function App() {
  const [activeView, setActiveView] = useState<AppView>('studio')
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [project, setProject] = useState<Project | null>(null)
  const [projectName, setProjectName] = useState('')
  const [activeType, setActiveType] = useState<ClipType | null>(null)
  const [isEditingName, setIsEditingName] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [uploadingType, setUploadingType] = useState<ClipType | null>(null)
  const [isSmartUploading, setIsSmartUploading] = useState(false)
  const [editingClip, setEditingClip] = useState<Clip | null>(null)
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(0)
  const [isSavingTrim, setIsSavingTrim] = useState(false)
  const [selectedCombinationIds, setSelectedCombinationIds] = useState<Set<string>>(new Set())
  const [batchName, setBatchName] = useState('')
  const [visualStyle, setVisualStyle] = useState<VisualStyle>({ enabled: false, headline: '', brandName: '', accentColor: '#D8F45C', backgroundColor: '#193F35', backgroundOpacity: 88, position: 'top' })
  const [job, setJob] = useState<RenderJob | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fullVideoInputRef = useRef<HTMLInputElement>(null)
  const editorVideoRef = useRef<HTMLVideoElement>(null)

  const clips = useMemo(() => project?.clips || [], [project?.clips])
  const counts = useMemo(() => ({
    hook: clips.filter((clip) => clip.type === 'hook').length,
    body: clips.filter((clip) => clip.type === 'body').length,
    cta: clips.filter((clip) => clip.type === 'cta').length,
  }), [clips])
  const total = counts.hook * counts.body * counts.cta
  const combinations = useMemo(() => buildCombinations(clips), [clips])
  const selectedCombinations = combinations.filter((combination) => selectedCombinationIds.has(combination.id))
  const selectedDuration = selectedCombinations.reduce((sum, combination) => sum + combination.duration, 0)
  const isProcessing = Boolean(job && !['done', 'error'].includes(job.status))

  async function request<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, options)
    const payload = response.status === 204 ? null : await response.json()
    if (!response.ok) throw new Error(payload?.error || 'Não foi possível concluir a operação.')
    return payload as T
  }

  async function loadProjects(preferredId?: string) {
    try {
      const list = await request<ProjectSummary[]>('/api/projects')
      setProjects(list)
      const savedId = preferredId || localStorage.getItem('multiplica-active-project')
      const selected = list.find((item) => item.id === savedId) || list[0]
      if (selected) await loadProject(selected.id)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível carregar os projetos.')
    } finally {
      setIsLoading(false)
    }
  }

  async function loadProject(id: string) {
    const selected = await request<Project>(`/api/projects/${id}`)
    setProject(selected)
    setProjectName(selected.name)
    setBatchName(`${selected.name} — Lote ${selected.exports.length + 1}`)
    setSelectedCombinationIds(new Set(buildCombinations(selected.clips).map((combination) => combination.id)))
    setJob(selected.exports[0] ? exportAsJob(selected.exports[0]) : null)
    localStorage.setItem('multiplica-active-project', id)
  }

  async function createProject() {
    try {
      const created = await request<Project>('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `Projeto ${projects.length + 1}` }),
      })
      await loadProjects(created.id)
      setActiveView('studio')
      setIsEditingName(true)
      showToast('Novo projeto criado')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível criar o projeto.')
    }
  }

  async function saveProjectName() {
    if (!project || !projectName.trim()) return
    try {
      const updated = await request<Project>(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projectName }),
      })
      setProject(updated)
      setProjectName(updated.name)
      setProjects((current) => current.map((item) => item.id === updated.id ? { ...item, name: updated.name, updatedAt: updated.updatedAt } : item))
      setIsEditingName(false)
      showToast('Projeto salvo neste computador')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível salvar o projeto.')
    }
  }

  function openPicker(type: ClipType) {
    setActiveType(type)
    setTimeout(() => inputRef.current?.click(), 0)
  }

  async function uploadFiles(files: FileList | File[], type: ClipType) {
    if (!project) return
    const videos = Array.from(files).filter((file) => file.type.startsWith('video/'))
    if (!videos.length) return showToast('Selecione arquivos de vídeo válidos')
    const formData = new FormData()
    videos.forEach((file) => formData.append(type, file, file.name))
    setUploadingType(type)
    try {
      const updated = await request<Project>(`/api/projects/${project.id}/clips`, { method: 'POST', body: formData })
      setProject(updated)
      setSelectedCombinationIds(new Set(buildCombinations(updated.clips).map((combination) => combination.id)))
      setJob(updated.exports[0] ? exportAsJob(updated.exports[0]) : null)
      setProjects((current) => current.map((item) => item.id === updated.id ? { ...item, clipCount: updated.clips.length, updatedAt: updated.updatedAt } : item))
      showToast(`${videos.length} vídeo${videos.length > 1 ? 's salvos' : ' salvo'} no projeto`)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível salvar os vídeos.')
    } finally {
      setUploadingType(null)
    }
  }

  async function uploadFullVideos(files: FileList | File[]) {
    if (!project) return
    const videos = Array.from(files).filter((file) => file.type.startsWith('video/'))
    if (videos.length < 2) return showToast('Selecione pelo menos dois vídeos completos')
    const formData = new FormData()
    videos.forEach((file) => formData.append('videos', file, file.name))
    setIsSmartUploading(true)
    try {
      const updated = await request<Project>(`/api/projects/${project.id}/full-videos`, { method: 'POST', body: formData })
      setProject(updated)
      setSelectedCombinationIds(new Set(buildCombinations(updated.clips).map((combination) => combination.id)))
      setJob(null)
      setProjects((current) => current.map((item) => item.id === updated.id ? { ...item, clipCount: updated.clips.length, updatedAt: updated.updatedAt } : item))
      showToast(`${videos.length} vídeos divididos em ${videos.length * 3} trechos editáveis`)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível dividir os vídeos.')
    } finally {
      setIsSmartUploading(false)
    }
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files && activeType) void uploadFiles(event.target.files, activeType)
    event.target.value = ''
  }

  function handleFullVideos(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) void uploadFullVideos(event.target.files)
    event.target.value = ''
  }

  function handleDrop(event: DragEvent<HTMLDivElement>, type: ClipType) {
    event.preventDefault()
    void uploadFiles(event.dataTransfer.files, type)
  }

  async function removeClip(clip: Clip) {
    if (!project || !window.confirm(`Remover “${clip.name}” deste projeto?`)) return
    try {
      await request(`/api/projects/${project.id}/clips/${clip.id}`, { method: 'DELETE' })
      const nextProject = { ...project, clips: project.clips.filter((item) => item.id !== clip.id) }
      setProject(nextProject)
      setSelectedCombinationIds(new Set(buildCombinations(nextProject.clips).map((combination) => combination.id)))
      setProjects((current) => current.map((item) => item.id === project.id ? { ...item, clipCount: item.clipCount - 1 } : item))
      setJob(null)
      showToast('Trecho removido')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível remover o trecho.')
    }
  }

  function openClipEditor(clip: Clip) {
    setEditingClip(clip)
    setTrimStart(clip.trimStart)
    setTrimEnd(clip.trimEnd)
  }

  function changeTrimStart(value: number) {
    const next = Math.min(Math.max(0, value), trimEnd - 0.1)
    setTrimStart(Math.round(next * 10) / 10)
    if (editorVideoRef.current) editorVideoRef.current.currentTime = next
  }

  function changeTrimEnd(value: number) {
    if (!editingClip) return
    const next = Math.max(Math.min(editingClip.duration, value), trimStart + 0.1)
    setTrimEnd(Math.round(next * 10) / 10)
    if (editorVideoRef.current) editorVideoRef.current.currentTime = Math.max(0, next - 0.05)
  }

  async function saveTrim() {
    if (!project || !editingClip) return
    setIsSavingTrim(true)
    try {
      const updated = await request<Project>(`/api/projects/${project.id}/clips/${editingClip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trimStart, trimEnd }),
      })
      setProject(updated)
      setJob(null)
      setEditingClip(null)
      showToast(`Recorte salvo: ${(trimEnd - trimStart).toFixed(1).replace('.', ',')} s`)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Não foi possível salvar o recorte.')
    } finally {
      setIsSavingTrim(false)
    }
  }

  function showToast(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(null), 2800)
  }

  // Initial synchronization with the local project store runs once on mount.
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void loadProjects() }, [])

  async function pollJob(id: string) {
    while (true) {
      await new Promise((resolve) => window.setTimeout(resolve, 1000))
      const nextJob = await request<RenderJob>(`/api/jobs/${id}`)
      setJob(nextJob)
      if (nextJob.status === 'done') {
        showToast(`${nextJob.files.length} vídeos prontos para baixar`)
        if (project) {
          const refreshed = await request<Project>(`/api/projects/${project.id}`)
          setProject(refreshed)
        }
        return
      }
      if (nextJob.status === 'error') throw new Error(nextJob.message)
    }
  }

  async function generateVideos() {
    if (!project) return
    if (!counts.hook || !counts.body || !counts.cta) return showToast('Adicione ao menos um vídeo em cada etapa')
    if (!selectedCombinations.length) return showToast('Selecione ao menos uma combinação')
    if (selectedCombinations.length > 100) return showToast('Reduza o lote: o limite atual é 100 vídeos')
    setJob({ id: '', status: 'queued', progress: 2, message: 'Preparando o projeto', total: selectedCombinations.length, files: [], zipUrl: null })
    try {
      const payload = await request<{ id: string; total: number }>('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          batchName,
          visualStyle,
          combinations: selectedCombinations.map(({ hook, body, cta }) => ({ hookId: hook.id, bodyId: body.id, ctaId: cta.id })),
        }),
      })
      setJob((current) => current ? { ...current, id: payload.id, progress: 5, message: 'Projeto recebido' } : current)
      await pollJob(payload.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha no processamento.'
      setJob((current) => current ? { ...current, status: 'error', message } : current)
      showToast(message)
    }
  }

  function toggleCombination(id: string) {
    setSelectedCombinationIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setJob(null)
  }

  function selectAllCombinations(selected: boolean) {
    setSelectedCombinationIds(selected ? new Set(combinations.map((combination) => combination.id)) : new Set())
    setJob(null)
  }

  function updateVisualStyle(changes: Partial<VisualStyle>) {
    setVisualStyle((current) => ({ ...current, ...changes }))
    setJob(null)
  }

  function openView(view: AppView) {
    setActiveView(view)
    setIsMobileMenuOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function openProject(id: string) {
    await loadProject(id)
    openView('studio')
  }

  if (isLoading || !project) {
    return <div className="loading-screen"><span className="brand-mark"><Play size={15} fill="currentColor" /></span><LoaderCircle className="spin" size={22} /><p>Carregando seus projetos…</p></div>
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => openView('studio')} aria-label="Multiplica — início"><span className="brand-mark"><Play size={15} fill="currentColor" /></span><span>multiplica</span></button>
        <nav className="main-nav" aria-label="Navegação principal">{([['studio', 'Estúdio'], ['projects', 'Projetos'], ['exports', 'Exportações']] as [AppView, string][]).map(([view, label]) => <button key={view} className={activeView === view ? 'active' : ''} onClick={() => openView(view)}>{label}</button>)}</nav>
        <div className="top-actions"><button className="icon-button" aria-label="Pesquisar"><Search size={19} /></button><button className="avatar" aria-label="Abrir perfil">WM</button><button className="mobile-menu" aria-label="Abrir menu" aria-expanded={isMobileMenuOpen} onClick={() => setIsMobileMenuOpen((current) => !current)}><Menu size={21} /></button></div>
        {isMobileMenuOpen && <nav className="mobile-nav" aria-label="Navegação móvel">{([['studio', 'Estúdio'], ['projects', 'Projetos'], ['exports', 'Exportações']] as [AppView, string][]).map(([view, label]) => <button key={view} className={activeView === view ? 'active' : ''} onClick={() => openView(view)}>{label}</button>)}</nav>}
      </header>

      <main id="workspace">
        {activeView === 'studio' && <>
        <section className="hero-section" id="top">
          <div className="project-toolbar">
            <label><span>Projeto atual</span><select value={project.id} onChange={(event) => void loadProject(event.target.value)}>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <button onClick={() => void createProject()}><FolderPlus size={16} /> Novo projeto</button>
          </div>
          <div className="eyebrow"><Sparkles size={15} /> Estúdio de combinações</div>
          <div className="hero-row"><div><p className="breadcrumb">Projetos <span>/</span> Salvo localmente</p>
            {isEditingName ? <input className="project-name-input" autoFocus value={projectName} onChange={(event) => setProjectName(event.target.value)} onBlur={() => void saveProjectName()} onKeyDown={(event) => event.key === 'Enter' && void saveProjectName()} /> : <button className="project-title" onClick={() => setIsEditingName(true)} title="Clique para editar">{projectName} <ChevronDown size={21} /></button>}
            <p className="hero-copy">Seus arquivos e exportações ficam disponíveis mesmo depois de fechar o aplicativo.</p></div>
            <button className="secondary-button" onClick={() => void saveProjectName()}><Check size={17} /> Salvar projeto</button>
          </div>
        </section>

        <section className="formula-card" aria-label="Resumo das combinações">
          <div className="formula-intro"><span className="formula-icon"><LayoutGrid size={19} /></span><div><strong>Sua fórmula de conteúdo</strong><span>Uma combinação para cada possibilidade</span></div></div>
          <div className="formula"><div><b>{counts.hook}</b><span>ganchos</span></div><i>×</i><div><b>{counts.body}</b><span>corpos</span></div><i>×</i><div><b>{counts.cta}</b><span>CTAs</span></div><i>=</i><div className="total-pill"><b>{total}</b><span>vídeos</span></div></div>
        </section>

        <section className={`smart-upload ${isSmartUploading ? 'is-uploading' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void uploadFullVideos(event.dataTransfer.files) }}>
          <div className="smart-upload-icon">{isSmartUploading ? <LoaderCircle className="spin" size={24} /> : <Sparkles size={24} />}</div>
          <div className="smart-upload-copy"><p className="section-kicker">Modo automático</p><h2>Envie vídeos completos e deixe o Multiplica separar</h2><p>Cada vídeo vira um gancho, um desenvolvimento e um CTA. A divisão inicial usa três partes iguais e você pode ajustar cada corte depois.</p></div>
          <div className="smart-upload-math"><span><b>2</b> vídeos</span><i>→</i><span><b>8</b> combinações</span></div>
          <button className="primary-button" onClick={() => fullVideoInputRef.current?.click()} disabled={isSmartUploading}>{isSmartUploading ? 'Dividindo vídeos…' : <><Plus size={17} /> Enviar 2 ou mais vídeos</>}</button>
        </section>

        <section className="steps-header"><div><p className="section-kicker">Prepare as peças</p><h2>Monte sua biblioteca de trechos</h2></div><p>Envie vídeos verticais em MP4, MOV ou WebM.<br />Cada arquivo é salvo automaticamente.</p></section>
        <section className="clip-columns">
          {(Object.keys(clipLabels) as ClipType[]).map((type, index) => {
            const info = clipLabels[type]
            const typeClips = clips.filter((clip) => clip.type === type)
            return <article className="clip-column" key={type} style={{ '--accent': info.color } as React.CSSProperties}>
              <div className="column-heading"><span className="step-number">0{index + 1}</span><div><h3>{info.title}</h3><p>{info.hint}</p></div><span className="count-badge">{typeClips.length}</span></div>
              <div className="clip-list">
                {typeClips.length === 0 && <div className="empty-clips"><Film size={21} /><span>Nenhum trecho adicionado</span></div>}
                {typeClips.map((clip) => <div className="clip-card" key={clip.id}>
                  <div className="clip-preview"><video src={clip.url} muted preload="metadata" /><span className="preview-play"><Play size={11} fill="currentColor" /></span></div>
                  <div className="clip-info"><strong>{clip.name}</strong><span>{formatDuration(clip.trimEnd - clip.trimStart)} selecionado · {formatBytes(clip.size)}</span>{(clip.trimStart > 0 || clip.trimEnd < clip.duration) && <em>Recortado</em>}</div>
                  <div className="clip-actions"><button className="clip-edit" aria-label={`Editar corte de ${clip.name}`} onClick={() => openClipEditor(clip)} title="Editar corte"><Scissors size={15} /></button><button className="clip-menu" aria-label={`Remover ${clip.name}`} onClick={() => void removeClip(clip)} title="Remover"><Trash2 size={15} /></button></div>
                </div>)}
              </div>
              <div className={`drop-zone ${uploadingType === type ? 'is-uploading' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, type)}>
                {uploadingType === type ? <><LoaderCircle className="spin" size={18} /><span>Salvando no projeto…</span></> : <><button onClick={() => openPicker(type)}><Plus size={17} /> Adicionar {info.short.toLowerCase()}</button><span>ou arraste o arquivo aqui</span></>}
              </div>
            </article>
          })}
        </section>

        {combinations.length > 0 && <section className="combination-section" aria-labelledby="combination-title">
          <div className="combination-heading">
            <div><p className="section-kicker">Escolha o que será produzido</p><h2 id="combination-title">Prévia das combinações</h2><p>Confira a sequência e desmarque as variações que não deseja exportar.</p></div>
            <div className="selection-overview"><strong>{selectedCombinations.length}</strong><span>de {combinations.length} selecionadas</span><small>{formatDuration(selectedDuration)} de conteúdo</small></div>
          </div>
          <div className="batch-toolbar">
            <label><span>Nome do lote</span><input value={batchName} maxLength={100} onChange={(event) => { setBatchName(event.target.value); setJob(null) }} placeholder="Ex.: Campanha de outubro" /></label>
            <div className="bulk-actions"><button onClick={() => selectAllCombinations(true)} disabled={selectedCombinations.length === combinations.length}>Selecionar todas</button><button onClick={() => selectAllCombinations(false)} disabled={!selectedCombinations.length}>Limpar seleção</button></div>
          </div>
          <div className="combination-list">
            {combinations.map((combination, index) => {
              const selected = selectedCombinationIds.has(combination.id)
              return <label className={`combination-card ${selected ? 'is-selected' : ''}`} key={combination.id}>
                <input type="checkbox" checked={selected} onChange={() => toggleCombination(combination.id)} aria-label={`Selecionar combinação ${index + 1}`} />
                <span className="combination-number">{String(index + 1).padStart(2, '0')}</span>
                {([combination.hook, combination.body, combination.cta] as Clip[]).map((clip) => <span className="combination-part" key={clip.id} style={{ '--part-color': clipLabels[clip.type].color } as React.CSSProperties}><i /><span><small>{clipLabels[clip.type].short}</small><strong>{clip.name}</strong></span></span>)}
                <span className="combination-duration"><small>Duração</small><strong>{formatDuration(combination.duration)}</strong></span>
              </label>
            })}
          </div>
        </section>}

        {combinations.length > 0 && <section className={`visual-style-section ${visualStyle.enabled ? 'is-enabled' : ''}`} aria-labelledby="visual-style-title">
          <div className="style-preview">
            <video src={(selectedCombinations[0] || combinations[0]).hook.url} muted autoPlay loop playsInline />
            <div className="preview-shade" />
            {visualStyle.headline && <strong className={`preview-headline position-${visualStyle.position}`} style={{ color: visualStyle.accentColor, background: hexToRgba(visualStyle.backgroundColor, visualStyle.backgroundOpacity) }}>{visualStyle.headline}</strong>}
            {visualStyle.brandName && <span className="preview-brand">{visualStyle.brandName}</span>}
            {!visualStyle.headline && !visualStyle.brandName && <span className="preview-placeholder"><Type size={21} /> Sua identidade aparece aqui</span>}
          </div>
          <div className="style-settings">
            <div className="style-heading"><span><Palette size={19} /></span><div><p className="section-kicker">Personalize o resultado</p><h2 id="visual-style-title">Texto e identidade visual</h2></div><label className="style-switch"><input type="checkbox" checked={visualStyle.enabled} onChange={(event) => updateVisualStyle({ enabled: event.target.checked })} /><span />{visualStyle.enabled ? 'Ativado' : 'Desativado'}</label></div>
            <p className="style-description">Adicione uma chamada de destaque e a assinatura da sua marca em todos os vídeos deste lote.</p>
            <div className="style-form">
              <label className="wide"><span>Texto principal</span><input value={visualStyle.headline} maxLength={80} disabled={!visualStyle.enabled} onChange={(event) => updateVisualStyle({ headline: event.target.value })} placeholder="Ex.: Você precisa conhecer este produto" /></label>
              <label><span>Assinatura da marca</span><input value={visualStyle.brandName} maxLength={40} disabled={!visualStyle.enabled} onChange={(event) => updateVisualStyle({ brandName: event.target.value })} placeholder="Ex.: @minhaloja" /></label>
              <label><span>Cor do texto</span><span className="color-field"><input aria-label="Cor do texto" type="color" value={visualStyle.accentColor} disabled={!visualStyle.enabled} onChange={(event) => updateVisualStyle({ accentColor: event.target.value.toUpperCase() })} /><b>{visualStyle.accentColor}</b></span></label>
              <label><span>Cor do fundo</span><span className="color-field"><input aria-label="Cor do fundo" type="color" value={visualStyle.backgroundColor} disabled={!visualStyle.enabled} onChange={(event) => updateVisualStyle({ backgroundColor: event.target.value.toUpperCase() })} /><b>{visualStyle.backgroundColor}</b></span></label>
              <label className="opacity-field"><span>Opacidade do fundo</span><span><input aria-label="Opacidade do fundo" type="range" min="0" max="100" step="1" value={visualStyle.backgroundOpacity} disabled={!visualStyle.enabled} onChange={(event) => updateVisualStyle({ backgroundOpacity: Number(event.target.value) })} /><b>{visualStyle.backgroundOpacity}%</b></span></label>
              <fieldset disabled={!visualStyle.enabled}><legend>Posição do texto</legend><div>{(['top', 'center', 'bottom'] as const).map((position) => <label key={position}><input type="radio" name="text-position" checked={visualStyle.position === position} onChange={() => updateVisualStyle({ position })} /><span>{position === 'top' ? 'Topo' : position === 'center' ? 'Centro' : 'Rodapé'}</span></label>)}</div></fieldset>
            </div>
          </div>
        </section>}

        <section className={`generate-panel ${job?.status === 'done' ? 'is-generated' : ''}`}>
          <div className="generate-copy"><span className="generate-symbol">{isProcessing ? <LoaderCircle className="spin" size={24} /> : <Video size={24} />}</span><div>
            <h2>{job?.status === 'done' ? 'Exportação disponível' : isProcessing ? 'Multiplicando seus vídeos' : 'Tudo pronto para multiplicar?'}</h2>
            <p>{job ? job.message : selectedCombinations.length ? `${selectedCombinations.length} combinação${selectedCombinations.length === 1 ? '' : 'ões'} pronta${selectedCombinations.length === 1 ? '' : 's'} para gerar.` : 'Selecione as combinações que deseja produzir.'}</p>
            {isProcessing && <div className="progress-track"><span style={{ width: `${job?.progress || 0}%` }} /></div>}
          </div></div>
          {job?.status === 'done' && job.zipUrl ? <a className="primary-button" href={job.zipUrl} download><Download size={18} /> Baixar pacote ZIP</a> : <button className="primary-button" onClick={() => void generateVideos()} disabled={isProcessing || !selectedCombinations.length}>{isProcessing ? `${job?.progress || 0}%` : `Gerar ${selectedCombinations.length} vídeo${selectedCombinations.length === 1 ? '' : 's'}`} <ArrowRight size={18} /></button>}
        </section>

        {job?.status === 'error' && <div className="error-box"><strong>O processamento foi interrompido.</strong><span>{job.message}</span></div>}

        {project.exports.length > 0 && <section className="history-section" id="history">
          <div className="results-title"><div><p className="section-kicker">Salvo no computador</p><h2>Histórico de exportações</h2></div><span>{project.exports.length} {project.exports.length === 1 ? 'lote' : 'lotes'}</span></div>
          <div className="history-list">{project.exports.map((item, index) => <button key={item.id} className={job?.id === item.id ? 'active' : ''} onClick={() => setJob(exportAsJob(item))}><span className="history-icon"><History size={17} /></span><span><strong>{item.name || `Exportação ${project.exports.length - index}`}</strong><small>{formatDate(item.createdAt)} · {item.total} vídeo{item.total === 1 ? '' : 's'}</small></span><Download size={16} /></button>)}</div>
        </section>}

        {job?.status === 'done' && <section className="results" id="exports">
          <div className="results-title"><div><p className="section-kicker">Prévia do lote</p><h2>Combinações geradas</h2></div><span>{job.files.length} {job.files.length === 1 ? 'variação' : 'variações'}</span></div>
          <div className="result-grid">{job.files.slice(0, 12).map((file, index) => <div className="result-card" key={file.name}>
            <video className="result-video" src={file.url} controls preload="metadata" />
            <div className="result-meta"><div><strong>Variação {String(index + 1).padStart(2, '0')}</strong><p>{file.name}</p></div><a href={file.url} download aria-label={`Baixar ${file.name}`}><Download size={15} /></a></div>
          </div>)}</div>
          {job.files.length > 12 && <p className="result-note">As demais {job.files.length - 12} variações estão no pacote ZIP.</p>}
        </section>}
        </>}

        {activeView === 'projects' && <section className="page-view">
          <div className="page-view-heading"><div><p className="section-kicker">Organização</p><h1>Seus projetos</h1><p>Abra um projeto existente ou comece uma nova produção.</p></div><button className="primary-button" onClick={() => void createProject()}><FolderPlus size={17} /> Novo projeto</button></div>
          <div className="project-grid">{projects.map((item) => <button className={`project-card ${item.id === project.id ? 'is-current' : ''}`} key={item.id} onClick={() => void openProject(item.id)}><span className="project-card-icon"><Film size={21} /></span><span className="project-card-copy"><small>{item.id === project.id ? 'Projeto atual' : 'Projeto salvo'}</small><strong>{item.name}</strong><span>Atualizado em {formatDate(item.updatedAt)}</span></span><span className="project-card-stats"><b>{item.clipCount}</b> trechos<i /><b>{item.exportCount}</b> lotes</span><ArrowRight size={18} /></button>)}</div>
        </section>}

        {activeView === 'exports' && <section className="page-view">
          <div className="page-view-heading"><div><p className="section-kicker">Arquivos produzidos</p><h1>Exportações</h1><p>Consulte, visualize e baixe os lotes do projeto selecionado.</p></div><label className="view-project-select"><span>Projeto</span><select value={project.id} onChange={(event) => void loadProject(event.target.value)}>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
          {project.exports.length === 0 ? <div className="empty-view"><History size={28} /><h2>Nenhuma exportação neste projeto</h2><p>Gere suas primeiras combinações no Estúdio.</p><button className="secondary-button" onClick={() => openView('studio')}>Ir para o Estúdio</button></div> : <>
            <div className="export-dashboard"><div><p className="section-kicker">Histórico</p><h2>{project.exports.length} {project.exports.length === 1 ? 'lote salvo' : 'lotes salvos'}</h2></div>{job?.status === 'done' && job.zipUrl && <a className="primary-button" href={job.zipUrl} download><Download size={17} /> Baixar lote selecionado</a>}</div>
            <div className="history-list export-history">{project.exports.map((item, index) => <button key={item.id} className={job?.id === item.id ? 'active' : ''} onClick={() => setJob(exportAsJob(item))}><span className="history-icon"><History size={17} /></span><span><strong>{item.name || `Exportação ${project.exports.length - index}`}</strong><small>{formatDate(item.createdAt)} · {item.total} vídeo{item.total === 1 ? '' : 's'}</small></span><Download size={16} /></button>)}</div>
            {job?.status === 'done' && <div className="export-preview"><div className="results-title"><div><p className="section-kicker">Lote selecionado</p><h2>Vídeos gerados</h2></div><span>{job.files.length} {job.files.length === 1 ? 'vídeo' : 'vídeos'}</span></div><div className="result-grid">{job.files.slice(0, 12).map((file, index) => <div className="result-card" key={file.name}><video className="result-video" src={file.url} controls preload="metadata" /><div className="result-meta"><div><strong>Variação {String(index + 1).padStart(2, '0')}</strong><p>{file.name}</p></div><a href={file.url} download aria-label={`Baixar ${file.name}`}><Download size={15} /></a></div></div>)}</div></div>}
          </>}
        </section>}
      </main>

      {editingClip && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setEditingClip(null)}>
        <section className="trim-modal" role="dialog" aria-modal="true" aria-labelledby="trim-title">
          <header><div><p className="section-kicker">Editor de trecho</p><h2 id="trim-title">Ajustar corte</h2></div><button aria-label="Fechar editor" onClick={() => setEditingClip(null)}><X size={20} /></button></header>
          <div className="trim-content">
            <div className="trim-preview"><video ref={editorVideoRef} src={editingClip.url} controls preload="metadata" /></div>
            <div className="trim-controls">
              <div className="trim-file"><span>{clipLabels[editingClip.type].short}</span><strong>{editingClip.name}</strong><small>Duração original: {formatDuration(editingClip.duration)}</small></div>
              <div className="trim-summary"><div><span>Início</span><strong>{trimStart.toFixed(1).replace('.', ',')} s</strong></div><i /><div><span>Fim</span><strong>{trimEnd.toFixed(1).replace('.', ',')} s</strong></div><div className="selection-time"><span>Trecho final</span><strong>{(trimEnd - trimStart).toFixed(1).replace('.', ',')} s</strong></div></div>
              <label className="range-field"><span><b>Início do trecho</b><small>Arraste até o primeiro momento útil</small></span><input aria-label="Início do trecho" type="range" min="0" max={Math.max(0, editingClip.duration - 0.1)} step="0.1" value={trimStart} onChange={(event) => changeTrimStart(Number(event.target.value))} /></label>
              <label className="range-field"><span><b>Fim do trecho</b><small>Remova pausas ou sobras do final</small></span><input aria-label="Fim do trecho" type="range" min="0.1" max={editingClip.duration} step="0.1" value={trimEnd} onChange={(event) => changeTrimEnd(Number(event.target.value))} /></label>
              <button className="reset-trim" onClick={() => { setTrimStart(0); setTrimEnd(editingClip.duration); if (editorVideoRef.current) editorVideoRef.current.currentTime = 0 }}><RotateCcw size={14} /> Usar vídeo completo</button>
            </div>
          </div>
          <div className="modal-footer"><button className="cancel-button" onClick={() => setEditingClip(null)}>Cancelar</button><button className="primary-button" onClick={() => void saveTrim()} disabled={isSavingTrim}>{isSavingTrim ? <LoaderCircle className="spin" size={17} /> : <Scissors size={17} />} Salvar recorte</button></div>
        </section>
      </div>}

      <footer><span>multiplica</span><p>Feito para transformar boas ideias em mais conteúdo.</p><small>MVP · 2026</small></footer>
      <input ref={inputRef} type="file" accept="video/mp4,video/quicktime,video/webm" multiple hidden onChange={handleFiles} />
      <input ref={fullVideoInputRef} type="file" accept="video/mp4,video/quicktime,video/webm" multiple hidden onChange={handleFullVideos} />
      {toast && <div className="toast"><Check size={16} /> {toast}</div>}
    </div>
  )
}

export default App
