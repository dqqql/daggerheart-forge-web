import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ChevronDown,
  ChevronRight,
  FilePlus2,
  FolderPlus,
  Folder,
  FileText,
  Play,
  X,
  Settings2,
  LogOut,
  RotateCcw,
  Copy,
  Check,
  Flame,
  Key,
  Sun,
  Moon,
  AlertCircle,
  Plus,
  MoreHorizontal,
  Pencil,
  FolderInput,
  Trash2
} from 'lucide-react'
import type { Run, TreeNode } from '../shared/types'
import { STEP_NAMES, TYPES } from '../shared/types'
import './style.css'

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch('/api/' + path, {
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...options.headers },
    ...options
  })
  const data = await response.json()
  if (!response.ok) throw Error(data.error || '请求失败')
  return data as T
}

type User = { id: string; username: string }
type Card = any

const TYPE_NAMES_ZH: Record<string, string> = {
  standard: '标准',
  bruiser: '斗士',
  horde: '集群',
  leader: '头目',
  minion: '杂兵',
  ranged: '远程',
  skulk: '潜伏',
  social: '社交',
  solo: '独狼',
  support: '辅助'
}

function formatEnemyType(type: string): string {
  return TYPE_NAMES_ZH[type] || type || '标准'
}

const STAT_LABELS_ZH: Record<string, string> = {
  difficulty: '难度',
  threshold_major: '重度阈值',
  threshold_severe: '严重阈值',
  hp: '生命点',
  stress: '压力点',
  attack_bonus: '攻击加值',
  damage_expected: '期望伤害',
  damage_min: '最小伤害',
  damage_max: '最大伤害',
  attack_formula: '攻击骰式',
  attack_name: '攻击名称',
  attack_range: '攻击距离',
  damage_type: '伤害类型',
  experience: '经历',
  feature_passive: '被动特性数',
  feature_action: '动作特性数',
  feature_reaction: '反应特性数'
}

const STEP_SHORT_NAMES = ['参照', '区间', '推荐', '匹配', '术语', '复核', '卡片']

type PopupCard = {
  id: string
  card: Card
  x: number
  y: number
  zIndex: number
}

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'light'
  })
  const [user, setUser] = useState<User | null>(null)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [nodes, setNodes] = useState<TreeNode[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [openTabs, setOpenTabs] = useState<string[]>([])
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [run, setRun] = useState<Run | null>(null)
  const [activeStep, setActiveStep] = useState(1)
  const [keyOpen, setKeyOpen] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [keyReady, setKeyReady] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [leftWidth, setLeftWidth] = useState(280)
  const [rightWidth, setRightWidth] = useState(540)
  const [popups, setPopups] = useState<PopupCard[]>([])
  const [hoveredCard, setHoveredCard] = useState<Card | null>(null)
  const [highestZIndex, setHighestZIndex] = useState(40)
  const [creditsOpen, setCreditsOpen] = useState(false)
  const [copiedAction, setCopiedAction] = useState<'none' | 'copy' | 'insert' | 'overwrite'>('none')
  const [nodeMenu, setNodeMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [nodeDialog, setNodeDialog] = useState<{ action: 'create' | 'rename' | 'move' | 'delete'; kind?: 'folder' | 'file'; id?: string; parentId?: string | null } | null>(null)
  const [nodeValue, setNodeValue] = useState('')
  const [nodeBusy, setNodeBusy] = useState(false)

  const drafts = useRef(new Map<string, string>())
  const pending = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const saving = useRef(new Map<string, Promise<boolean>>())
  const versions = useRef(new Map<string, number>())
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const lineNumbers = useRef<HTMLDivElement>(null)
  const stepsScrollRef = useRef<HTMLDivElement>(null)

  const selectedNode = nodes.find(n => n.id === selected)
  const menuNode = nodes.find(n => n.id === nodeMenu?.id)
  const path: string[] = []
  let ancestor = selectedNode?.parent_id
  while (ancestor) {
    const folder = nodes.find(n => n.id === ancestor)
    if (!folder) break
    path.unshift(folder.name)
    ancestor = folder.parent_id
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNodeMenu(null)
        setNodeDialog(null)
      }
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [])

  // 监听步骤滚动位置，实时更新中央进度条高亮
  useEffect(() => {
    const container = stepsScrollRef.current
    if (!container || !run) return

    const handleScroll = () => {
      const cards = container.querySelectorAll<HTMLElement>('.step-card')
      let current = 1
      const containerTop = container.scrollTop
      cards.forEach((card, i) => {
        if (card.offsetTop - container.offsetTop <= containerTop + 80) {
          current = i + 1
        }
      })
      setActiveStep(current)
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [run])

  function selectFile(id: string) {
    setOpenTabs(tabs => (tabs.includes(id) ? tabs : [...tabs, id]))
    setSelected(id)
  }

  async function saveFile(id: string): Promise<boolean> {
    const timer = pending.current.get(id)
    if (timer) clearTimeout(timer)
    pending.current.delete(id)
    const previous = saving.current.get(id) || Promise.resolve(true)
    const task = previous.then(async () => {
      const value = drafts.current.get(id)
      if (value === undefined) return true
      const version = versions.current.get(id)
      try {
        await api('nodes/' + id, { method: 'PATCH', body: JSON.stringify({ content: value }) })
        if (versions.current.get(id) === version) {
          setDirtyIds(ids => {
            const next = new Set(ids)
            next.delete(id)
            return next
          })
        }
        return true
      } catch (e) {
        setError((e as Error).message)
        return false
      }
    })
    saving.current.set(id, task)
    const result = await task
    if (saving.current.get(id) === task) saving.current.delete(id)
    return result
  }

  function updateContent(value: string) {
    if (!selected) return
    drafts.current.set(selected, value)
    versions.current.set(selected, (versions.current.get(selected) || 0) + 1)
    setContent(value)
    setDirtyIds(ids => new Set(ids).add(selected))
    const timer = pending.current.get(selected)
    if (timer) clearTimeout(timer)
    pending.current.set(selected, setTimeout(() => saveFile(selected), 650))
  }

  async function closeTab(id: string) {
    if (dirtyIds.has(id) && !(await saveFile(id))) return
    const index = openTabs.indexOf(id)
    const remaining = openTabs.filter(tab => tab !== id)
    setOpenTabs(remaining)
    if (selected === id) setSelected(remaining[Math.min(index, remaining.length - 1)] || null)
  }

  useEffect(() => {
    api<{ user: User }>('auth/me')
      .then(x => setUser(x.user))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!user) return
    api<{ nodes: TreeNode[] }>('nodes')
      .then(x => setNodes(x.nodes))
      .catch(e => setError(e.message))
    api<{ configured: boolean }>('key')
      .then(x => setKeyReady(x.configured))
      .catch(() => {})
  }, [user])

  useEffect(() => {
    if (!selected || !user) {
      setRun(null)
      return
    }
    let active = true
    setRun(null)
    const cached = drafts.current.get(selected)
    setContent(cached ?? '')
    api<{ node: TreeNode }>('nodes/' + selected)
      .then(x => {
        if (drafts.current.has(x.node.id)) return
        const value = x.node.content || ''
        drafts.current.set(x.node.id, value)
        if (active) setContent(value)
      })
      .catch(e => setError(e.message))

    api<{ runs: { id: string }[] }>('runs?file=' + selected)
      .then(x => {
        if (!active) return
        if (x.runs[0]) loadRun(x.runs[0].id)
        else setRun(null)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [selected, user])

  useEffect(() => {
    if (!run || !['queued', 'running'].includes(run.status)) return
    const timer = setInterval(() => loadRun(run.id), 1500)
    return () => clearInterval(timer)
  }, [run?.id, run?.status])

  async function loadRun(id: string) {
    try {
      const x = await api<{ run: Run }>('runs/' + id)
      setRun(current => (selectedRef.current === x.run.file_id ? x.run : current))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function submitAuth(e: React.FormEvent) {
    e.preventDefault()
    setAuthError('')
    try {
      const x = await api<{ user: User }>('auth/' + authMode, {
        method: 'POST',
        body: JSON.stringify({ username, password })
      })
      setUser(x.user)
      setPassword('')
    } catch (e) {
      setAuthError((e as Error).message)
    }
  }

  function openNodeDialog(action: 'create' | 'rename' | 'move' | 'delete', id?: string, kind?: 'folder' | 'file', parentId: string | null = null) {
    setNodeMenu(null)
    const node = nodes.find(n => n.id === id)
    setNodeValue(action === 'rename' ? node?.name || '' : action === 'move' ? node?.parent_id || '' : '')
    setNodeDialog({ action, id, kind, parentId })
  }

  async function create(kind: 'folder' | 'file', name: string, parent_id: string | null = null): Promise<boolean> {
    try {
      const x = await api<{ id: string }>('nodes', {
        method: 'POST',
        body: JSON.stringify({ kind, name, parent_id })
      })
      setNodes(ns => [
        ...ns,
        { id: x.id, parent_id, kind, name, updated_at: new Date().toISOString() }
      ])
      if (parent_id) setExpanded(s => new Set(s).add(parent_id))
      if (kind === 'file') selectFile(x.id)
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    }
  }

  async function mutateNode(id: string, operation: 'rename' | 'move' | 'delete', value?: string | null): Promise<boolean> {
    const node = nodes.find(n => n.id === id)
    if (!node) return false
    try {
      if (operation === 'delete') {
        await api('nodes/' + id, { method: 'DELETE' })
        const remove = new Set([id])
        let changed = true
        while (changed) {
          changed = false
          for (const n of nodes) {
            if (n.parent_id && remove.has(n.parent_id) && !remove.has(n.id)) {
              remove.add(n.id)
              changed = true
            }
          }
        }
        setNodes(ns => ns.filter(n => !remove.has(n.id)))
        setOpenTabs(tabs => tabs.filter(tab => !remove.has(tab)))
        if (selected && remove.has(selected)) setSelected(null)
        remove.forEach(removed => {
          const timer = pending.current.get(removed)
          if (timer) clearTimeout(timer)
          pending.current.delete(removed)
          drafts.current.delete(removed)
          versions.current.delete(removed)
        })
      } else {
        const target = operation === 'move' ? value ?? null : null
        await api('nodes/' + id, {
          method: 'PATCH',
          body: JSON.stringify(operation === 'rename' ? { name: value } : { parent_id: target })
        })
        setNodes(ns =>
          ns.map(n =>
            n.id === id
              ? { ...n, ...(operation === 'rename' ? { name: String(value).trim() } : { parent_id: target }) }
              : n
          )
        )
        if (operation === 'move' && target) setExpanded(s => new Set(s).add(target))
      }
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    }
  }

  async function submitNodeDialog() {
    if (!nodeDialog || nodeBusy) return
    const { action, kind, id, parentId } = nodeDialog
    const name = nodeValue.trim()
    if ((action === 'create' || action === 'rename') && !name) return
    setNodeBusy(true)
    try {
      let succeeded = false
      if (action === 'create' && kind) succeeded = await create(kind, name, parentId)
      else if (id && action !== 'create') succeeded = await mutateNode(id, action, action === 'rename' ? name : action === 'move' ? nodeValue || null : undefined)
      if (succeeded) setNodeDialog(null)
    } finally {
      setNodeBusy(false)
    }
  }

  async function saveKey() {
    try {
      await api('key', { method: 'PUT', body: JSON.stringify({ key: apiKey }) })
      setApiKey('')
      setKeyReady(true)
      setKeyOpen(false)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function startRun() {
    if (!selected) return
    if (dirtyIds.has(selected) && !(await saveFile(selected))) return
    try {
      const x = await api<{ id: string }>('runs', {
        method: 'POST',
        body: JSON.stringify({ file_id: selected })
      })
      loadRun(x.id)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function openCard(card: Card) {
    setHoveredCard(null)
    setHighestZIndex(prevZ => {
      const nextZ = prevZ + 1
      setPopups(ps => {
        const existing = ps.find(p => p.id === card.id)
        if (existing) {
          return ps.map(p => (p.id === card.id ? { ...p, zIndex: nextZ } : p))
        }
        const cardWidth = 380
        const stagger = (ps.length % 5) * 28
        const dividerX = window.innerWidth - rightWidth
        const initX = Math.max(16, dividerX - cardWidth - 16 - stagger)
        const initY = 72 + stagger
        return [...ps, { id: card.id, card, x: initX, y: initY, zIndex: nextZ }]
      })
      return nextZ
    })
  }

  function handlePopupPointerDown(id: string, e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest('button')) return
    const currentPopup = popups.find(p => p.id === id)
    if (!currentPopup) return

    const startX = e.clientX
    const startY = e.clientY
    const origX = currentPopup.x
    const origY = currentPopup.y
    const nextZ = highestZIndex + 1
    setHighestZIndex(nextZ)

    setPopups(ps => ps.map(p => (p.id === id ? { ...p, zIndex: nextZ } : p)))

    const onPointerMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      const nextX = Math.max(10, Math.min(window.innerWidth - 320, origX + dx))
      const nextY = Math.max(10, Math.min(window.innerHeight - 80, origY + dy))
      setPopups(ps => ps.map(p => (p.id === id ? { ...p, x: nextX, y: nextY, zIndex: nextZ } : p)))
    }

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  function scrollToStep(stepIndex: number) {
    setActiveStep(stepIndex)
    const el = document.getElementById(`step-card-${stepIndex}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  function handleProgressScrub(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const progressRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const step = Math.min(7, Math.max(1, Math.round(progressRatio * 6) + 1))
    scrollToStep(step)
  }

  function copyFinalMarkdown(text: string) {
    navigator.clipboard.writeText(text)
    setCopiedAction('copy')
    setTimeout(() => setCopiedAction('none'), 2000)
  }

  function insertFinalMarkdown(text: string) {
    if (!selected) return
    const sep = content.trim() ? '\n\n---\n\n' : ''
    const next = content.trimEnd() + sep + text
    updateContent(next)
    setCopiedAction('insert')
    setTimeout(() => setCopiedAction('none'), 2000)
  }

  function overwriteFinalMarkdown(text: string) {
    if (!selected) return
    if (content.trim() && !confirm('确定用推荐的完整数据块覆盖当前文件内容吗？已修改未保存的草稿将被替换。')) {
      return
    }
    updateContent(text)
    setCopiedAction('overwrite')
    setTimeout(() => setCopiedAction('none'), 2000)
  }

  function renderNode(node: TreeNode, depth = 0): React.ReactNode {
    const children = nodes
      .filter(n => n.parent_id === node.id)
      .sort((a, b) =>
        a.kind === b.kind
          ? a.name.localeCompare(b.name)
          : a.kind === 'folder'
            ? -1
            : 1
      )
    const opened = expanded.has(node.id)

    return (
      <React.Fragment key={node.id}>
        <div
          className={'tree-row ' + (selected === node.id ? 'active' : '')}
          style={{ paddingLeft: 8 + depth * 16 }}
        >
          <button
            className="tree-main"
            onClick={() =>
              node.kind === 'folder'
                ? setExpanded(s => {
                    const next = new Set(s)
                    opened ? next.delete(node.id) : next.add(node.id)
                    return next
                  })
                : selectFile(node.id)
            }
          >
            {node.kind === 'folder' ? (
              opened ? <ChevronDown size={15} /> : <ChevronRight size={15} />
            ) : (
              <span className="chevron-gap" />
            )}
            {node.kind === 'folder' ? (
              <Folder size={17} color="#54aeff" />
            ) : (
              <FileText size={17} color="var(--color-fg-muted)" />
            )}
            <span>{node.name}</span>
          </button>
          <span className="row-actions">
            {node.kind === 'folder' && (
              <button aria-label={`在${node.name}中新建文件`} onClick={() => openNodeDialog('create', undefined, 'file', node.id)}>
                ＋
              </button>
            )}
            <button
              aria-label={`${node.name}的更多操作`}
              aria-expanded={nodeMenu?.id === node.id}
              onClick={e => {
                const rect = e.currentTarget.getBoundingClientRect()
                setNodeMenu(current => current?.id === node.id ? null : {
                  id: node.id,
                  x: Math.min(rect.right, window.innerWidth - 188),
                  y: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - (node.kind === 'folder' ? 268 : 168)))
                })
              }}
            >
              <MoreHorizontal size={17} />
            </button>
          </span>
        </div>
        {node.kind === 'folder' && opened && children.map(n => renderNode(n, depth + 1))}
      </React.Fragment>
    )
  }

  // 未登录界面
  if (!user) {
    return (
      <main className="auth-screen">
        <div className="auth-mark">
          <Flame size={44} color="var(--color-fg-default)" />
        </div>
        <h1>{authMode === 'login' ? '登录敌人锻炉' : '注册新账号'}</h1>

        <div className="auth-card">
          <form onSubmit={submitAuth}>
            <label>
              用户名
              <input
                autoComplete="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
              />
            </label>
            <label>
              密码
              <input
                type="password"
                autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </label>
            {authError && (
              <div className="error" role="alert">
                {authError}
              </div>
            )}
            <button className="primary" type="submit">
              {authMode === 'login' ? '登 录' : '创建账号'}
            </button>
          </form>
        </div>

        <div className="auth-toggle-box">
          {authMode === 'login' ? (
            <span>
              新用户？{' '}
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register')
                  setAuthError('')
                }}
              >
                创建一个账号
              </button>
            </span>
          ) : (
            <span>
              已有账号？{' '}
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login')
                  setAuthError('')
                }}
              >
                直接登录
              </button>
            </span>
          )}
        </div>
      </main>
    )
  }

  return (
    <div className="app">
      {/* 顶部 GitHub 经典深色 Header */}
      <header className="titlebar">
        <div className="brand">
          <span className="brand-icon">
            <Flame size={22} />
          </span>
          敌人锻炉
        </div>

        <div className="titlebar-center">
          <span>工作区</span> /{' '}
          {path.map((name, index) => (
            <React.Fragment key={index}>
              <span>{name}</span> /{' '}
            </React.Fragment>
          ))}
          <strong>{selectedNode?.name || '未打开文件'}</strong>
        </div>

        <div className="title-actions">
          <button
            title={theme === 'dark' ? '切换为浅色模式' : '切换为深色模式'}
            aria-label="切换深色/浅色模式"
            onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            title="设置"
            aria-label="设置"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen(open => !open)}
          >
            <Settings2 size={19} />
          </button>
          {settingsOpen && (
            <div className="settings-menu">
              <button onClick={() => setTheme(t => (t === 'dark' ? 'light' : 'dark'))}>
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                {theme === 'dark' ? '浅色模式' : '深色模式'}
              </button>
              <button
                onClick={() => {
                  setKeyOpen(true)
                  setSettingsOpen(false)
                }}
              >
                <Key size={16} /> 填写 API Key
              </button>
              <button
                onClick={async () => {
                  const saved = await Promise.all([...dirtyIds].map(id => saveFile(id)))
                  if (saved.some(ok => !ok)) return
                  await api('auth/logout', { method: 'POST' })
                  setUser(null)
                  setNodes([])
                  setSelected(null)
                  setOpenTabs([])
                  setDirtyIds(new Set())
                  drafts.current.clear()
                  pending.current.forEach(timer => clearTimeout(timer))
                  pending.current.clear()
                  versions.current.clear()
                  setSettingsOpen(false)
                }}
              >
                <LogOut size={16} /> 退出登录
              </button>
            </div>
          )}
        </div>
      </header>

      {/* 工作区主布局 */}
      <div className="workspace">
        {/* 左侧资源管理器（字体与行高放大，更清晰） */}
        <aside className="explorer" style={{ width: leftWidth }}>
          <div className="pane-heading">
            <span>资源管理器</span>
            <div>
              <button aria-label="新建敌人文件" onClick={() => openNodeDialog('create', undefined, 'file')}>
                <FilePlus2 size={15} />
              </button>
              <button aria-label="新建文件夹" onClick={() => openNodeDialog('create', undefined, 'folder')}>
                <FolderPlus size={15} />
              </button>
            </div>
          </div>
          <div className="section-caption">
            我的敌人 <span>{nodes.filter(n => n.kind === 'file').length}</span>
          </div>
          <nav aria-label="文件树">
            {nodes
              .filter(n => !n.parent_id)
              .sort((a, b) =>
                a.kind === b.kind
                  ? a.name.localeCompare(b.name)
                  : a.kind === 'folder'
                    ? -1
                    : 1
              )
              .map(n => renderNode(n))}
          </nav>
        </aside>
        <div
          className="resizer"
          onPointerDown={e => e.currentTarget.setPointerCapture(e.pointerId)}
          onPointerMove={e => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              setLeftWidth(Math.max(220, Math.min(480, e.clientX)))
            }
          }}
        />

        {/* 中间 Markdown 编辑器 */}
        <main className="editor-pane">
          <div className="tabbar">
            {openTabs.map(id => {
              const node = nodes.find(n => n.id === id)
              if (!node) return null
              return (
                <div className={'tab ' + (selected === id ? 'active' : '')} key={id}>
                  <button className="tab-select" onClick={() => selectFile(id)} title={node.name}>
                    <FileText size={15} />
                    <span>{node.name}</span>
                  </button>
                  <button
                    className={'tab-close ' + (dirtyIds.has(id) ? 'dirty' : '')}
                    title={dirtyIds.has(id) ? '保存并关闭' : '关闭'}
                    aria-label={`关闭 ${node.name}`}
                    onClick={() => closeTab(id)}
                  >
                    {dirtyIds.has(id) ? <span className="dirty-dot" /> : <X size={15} />}
                  </button>
                </div>
              )
            })}
          </div>
          {selectedNode ? (
            <div className="code-editor">
              <div className="line-numbers" aria-hidden="true" ref={lineNumbers}>
                {Array.from({ length: content.split('\n').length }, (_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>
              <textarea
                aria-label="敌人 Markdown 编辑区"
                spellCheck={false}
                value={content}
                onChange={e => updateContent(e.target.value)}
                onScroll={e => {
                  if (lineNumbers.current) lineNumbers.current.scrollTop = e.currentTarget.scrollTop
                }}
                onKeyDown={e => {
                  if (e.key === 'Tab') {
                    e.preventDefault()
                    const target = e.currentTarget
                    const start = target.selectionStart
                    updateContent(content.slice(0, start) + '  ' + content.slice(target.selectionEnd))
                    requestAnimationFrame(() => {
                      target.selectionStart = target.selectionEnd = start + 2
                    })
                  }
                }}
              />
            </div>
          ) : (
            <div className="welcome">
              <div className="welcome-symbol">
                <Flame size={48} />
              </div>
              <h2>开始创作原创敌人</h2>
              <button className="primary" onClick={() => openNodeDialog('create', undefined, 'file')}>
                <FilePlus2 size={16} /> 新建敌人文件
              </button>
            </div>
          )}
        </main>

        {/* 分析栏左侧分界栏：加宽且中央带拖拽手柄 */}
        <div
          className="analysis-resizer"
          title="按住左右拖动调整分析面板宽度"
          onPointerDown={e => e.currentTarget.setPointerCapture(e.pointerId)}
          onPointerMove={e => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              setRightWidth(Math.max(380, Math.min(840, window.innerWidth - e.clientX)))
            }
          }}
        />

        {/* 右侧敌人分析面板 */}
        <aside className="analysis" style={{ width: rightWidth }}>
          <div className="pane-heading">
            <span>分析引擎</span>
          </div>

          {/* 中央进度条：点击、拖动平滑滚动跳转步骤 */}
          {run && (
            <div className="step-nav-bar">
              <div
                className="step-nav-track-wrapper"
                onPointerDown={e => {
                  e.currentTarget.setPointerCapture(e.pointerId)
                  handleProgressScrub(e)
                }}
                onPointerMove={e => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    handleProgressScrub(e)
                  }
                }}
                title="点击或拖动跳转到对应步骤"
              >
                <div className="step-nav-track">
                  <div
                    className="step-nav-fill"
                    style={{ width: `${((activeStep - 1) / 6) * 100}%` }}
                  />
                  <div className="step-nav-nodes">
                    {STEP_SHORT_NAMES.map((name, i) => {
                      const stepNum = i + 1
                      const isDone = (run.steps.find(s => s.step === stepNum)?.status || '') === 'done'
                      const isActive = activeStep === stepNum
                      return (
                        <button
                          key={stepNum}
                          className={`step-nav-node ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}
                          onClick={ev => {
                            ev.stopPropagation()
                            scrollToStep(stepNum)
                          }}
                          title={`#${stepNum} ${STEP_NAMES[i]}`}
                        >
                          <span className="step-nav-dot">{stepNum}</span>
                          <span className="step-nav-label">{name}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 运行过时在顶部展示运行按钮（居中、非满宽） */}
          {run && (
            <div className="run-controls">
              <button
                className="primary run-button"
                disabled={
                  !selected ||
                  !keyReady ||
                  run?.status === 'running' ||
                  run?.status === 'queued'
                }
                onClick={startRun}
              >
                <Play size={15} />
                {run?.status === 'running' || run?.status === 'queued'
                  ? '分析执行中…'
                  : '重新运行分析'}
              </button>
            </div>
          )}

          <div className="steps-scroll" ref={stepsScrollRef}>
            {run ? (
              <>
                <div className="run-meta">
                  任务时间：{new Date(run.created_at).toLocaleString('zh-CN')} ·{' '}
                  {run.status === 'done'
                    ? '全部完成'
                    : run.status === 'failed'
                      ? '执行异常'
                      : '分析中'}
                </div>
                {run.steps.map(s => (
                  <section
                    className={'step-card ' + s.status}
                    key={s.step}
                    id={`step-card-${s.step}`}
                  >
                    <div className="step-head">
                      <span className="step-number">#{s.step}</span>
                      <h3>{STEP_NAMES[s.step - 1]}</h3>
                      <span className="step-status">
                        {s.status === 'done'
                          ? '完成'
                          : s.status === 'running'
                            ? '执行中'
                            : s.status === 'failed'
                              ? '失败'
                              : '待执行'}
                      </span>
                    </div>
                    {s.status === 'failed' && <div className="error">{s.error}</div>}
                    {s.result !== null && (
                      <StepContent
                        step={s.step}
                        result={s.result}
                        openCard={openCard}
                        onHoverCard={setHoveredCard}
                        onCopyFinal={copyFinalMarkdown}
                        onInsertFinal={insertFinalMarkdown}
                        onOverwriteFinal={overwriteFinalMarkdown}
                        copiedAction={copiedAction}
                        step3Warnings={
                          (run.steps.find(st => st.step === 3)?.result as any)?.warnings
                        }
                      />
                    )}
                  </section>
                ))}
                {run.status === 'failed' && (
                  <button
                    className="secondary retry"
                    onClick={async () => {
                      try {
                        await api('runs/' + run.id + '/retry', { method: 'POST' })
                        loadRun(run.id)
                      } catch (e) {
                        setError((e as Error).message)
                      }
                    }}
                  >
                    <RotateCcw size={14} /> 重试失败步骤
                  </button>
                )}
              </>
            ) : (
              <div className="analysis-empty">
                <button
                  className="primary run-button"
                  disabled={!selected || !keyReady}
                  onClick={startRun}
                >
                  <Play size={15} /> 运行分析
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* 底部状态栏 */}
      <footer className="statusbar">
        <span>
          <Flame size={14} color="#1f883d" /> 敌人锻炉 · Daggerheart SRD 2.0
          <button className="credit-link" onClick={() => setCreditsOpen(true)}>
            版权与来源
          </button>
        </span>
        <span>{selectedNode ? `${selectedNode.name} · UTF-8` : '等待打开文件'}</span>
      </footer>

      {/* 错误提示 Toast */}
      {error && (
        <div className="toast" role="alert">
          <span>{error}</span>
          <button onClick={() => setError('')} aria-label="关闭提示">
            <X size={15} />
          </button>
        </div>
      )}

      {nodeMenu && (
        <>
          <div className="menu-dismiss" onClick={() => setNodeMenu(null)} />
          <div className="node-menu" role="menu" style={{ left: nodeMenu.x, top: nodeMenu.y }}>
            {menuNode?.kind === 'folder' && (
              <>
                <button autoFocus role="menuitem" onClick={() => openNodeDialog('create', undefined, 'file', menuNode.id)}><FilePlus2 size={15} /> 新建文件</button>
                <button role="menuitem" onClick={() => openNodeDialog('create', undefined, 'folder', menuNode.id)}><FolderPlus size={15} /> 新建文件夹</button>
                <div className="node-menu-separator" />
              </>
            )}
            <button autoFocus={menuNode?.kind !== 'folder'} role="menuitem" onClick={() => openNodeDialog('rename', nodeMenu.id)}><Pencil size={15} /> 重命名</button>
            <button role="menuitem" onClick={() => openNodeDialog('move', nodeMenu.id)}><FolderInput size={15} /> 移动到…</button>
            <div className="node-menu-separator" />
            <button className="danger" role="menuitem" onClick={() => openNodeDialog('delete', nodeMenu.id)}><Trash2 size={15} /> 删除</button>
          </div>
        </>
      )}

      {nodeDialog && (
        <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setNodeDialog(null) }}>
          <form className="modal node-dialog" role="dialog" aria-modal="true" aria-label="文件操作" onSubmit={e => { e.preventDefault(); void submitNodeDialog() }}>
            <button type="button" className="close" onClick={() => setNodeDialog(null)} aria-label="关闭"><X size={17} /></button>
            <h2>{nodeDialog.action === 'create' ? `新建${nodeDialog.kind === 'folder' ? '文件夹' : '敌人文件'}` : nodeDialog.action === 'rename' ? '重命名' : nodeDialog.action === 'move' ? '移动到' : '删除'}</h2>
            {nodeDialog.action === 'create' || nodeDialog.action === 'rename' ? (
              <label>名称
                <input autoFocus value={nodeValue} onChange={e => setNodeValue(e.target.value)} maxLength={100} placeholder="输入名称" />
              </label>
            ) : nodeDialog.action === 'move' ? (
              <div className="move-choices" role="radiogroup" aria-label="目标文件夹">
                {[{ id: '', name: '根目录', parent_id: null }, ...nodes.filter(n => {
                  if (n.kind !== 'folder' || n.id === nodeDialog.id) return false
                  let parent = n.parent_id
                  while (parent) {
                    if (parent === nodeDialog.id) return false
                    parent = nodes.find(item => item.id === parent)?.parent_id || null
                  }
                  return true
                })].map(folder => (
                  <label key={folder.id} className="move-choice">
                    <input type="radio" name="destination" checked={nodeValue === folder.id} onChange={() => setNodeValue(folder.id)} />
                    <Folder size={16} /> {folder.name}
                  </label>
                ))}
              </div>
            ) : (
              <p>确定删除「{nodes.find(n => n.id === nodeDialog.id)?.name}」{nodes.some(n => n.parent_id === nodeDialog.id) ? '及其中的所有内容' : ''}吗？此操作无法撤销。</p>
            )}
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setNodeDialog(null)}>取消</button>
              <button type="submit" className={nodeDialog.action === 'delete' ? 'secondary danger-button' : 'primary'} disabled={nodeBusy || ((nodeDialog.action === 'create' || nodeDialog.action === 'rename') && !nodeValue.trim())}>
                {nodeDialog.action === 'delete' ? '删除' : nodeDialog.action === 'move' ? '移动' : '确定'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* DeepSeek Key 设置弹窗 */}
      {keyOpen && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true" aria-label="DeepSeek 设置">
            <button className="close" onClick={() => setKeyOpen(false)} aria-label="关闭">
              <X size={17} />
            </button>
            <h2>DeepSeek API Key 设置</h2>
            <p>密钥将使用 AES-GCM 独立加密存储于云端服务器，永不回传到客户端。</p>
            <label>
              API Key
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="sk-…"
              />
            </label>
            <div className="modal-actions">
              <button
                className="secondary"
                onClick={async () => {
                  await api('key', { method: 'DELETE' })
                  setKeyReady(false)
                  setKeyOpen(false)
                }}
              >
                清除已存密钥
              </button>
              <button className="primary" onClick={saveKey}>
                保存密钥
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 版权与来源弹窗 */}
      {creditsOpen && <Credits onClose={() => setCreditsOpen(false)} />}

      {/* 悬浮预览窗口：移开即消失，去除了“悬浮预览”徽章 */}
      {hoveredCard && !popups.some(p => p.id === hoveredCard.id) && (
        <div
          className="card-hover-preview"
          style={{
            right: rightWidth + 16,
            top: 80
          }}
        >
          <div className="popup-head">
            <strong>{hoveredCard.name_zh}</strong>
            <span>
              位阶 {hoveredCard.tier} · {formatEnemyType(hoveredCard.type)}
            </span>
          </div>
          <div className="popup-body">
            <p>{hoveredCard.description}</p>
            {hoveredCard.motives_tactics && (
              <p>
                <b>动机与战术：</b>
                {hoveredCard.motives_tactics}
              </p>
            )}
            <div className="stats-line">
              难度 {hoveredCard.difficulty ?? '—'} · 重度阈值 {hoveredCard.threshold_major ?? '—'}／严重阈值{' '}
              {hoveredCard.threshold_severe ?? '—'} · 生命点 {hoveredCard.hp ?? '—'} · 压力点{' '}
              {hoveredCard.stress ?? '—'}
            </div>
            {hoveredCard.attack_name && (
              <p>
                <b>普通攻击：</b>
                {hoveredCard.attack_name} · {hoveredCard.attack_range} · {hoveredCard.attack_formula}{' '}
                {hoveredCard.damage_type}
              </p>
            )}
            {hoveredCard.features?.map((f: any, j: number) => (
              <div className="popup-feature" key={j}>
                <b>
                  {f.name} · {f.kind}
                </b>
                <p>{f.text || f.full_text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 点击弹出的 SRD 怪物卡片：位于分界栏左侧、可拖动、去除了钉子按钮、保留关闭 */}
      {popups.map(p => (
        <div
          className="card-popup"
          key={p.id}
          style={{
            left: p.x,
            top: p.y,
            zIndex: p.zIndex
          }}
          role="dialog"
          aria-label={p.card.name_zh}
        >
          <div
            className="popup-head"
            onPointerDown={e => handlePopupPointerDown(p.id, e)}
            title="按住标题栏拖动窗口"
          >
            <strong>{p.card.name_zh}</strong>
            <span>
              位阶 {p.card.tier} · {formatEnemyType(p.card.type)}
            </span>
            <button
              title="关闭"
              onClick={() => setPopups(ps => ps.filter(x => x.id !== p.id))}
            >
              <X size={15} />
            </button>
          </div>
          <div className="popup-body">
            <p>{p.card.description}</p>
            {p.card.motives_tactics && (
              <p>
                <b>动机与战术：</b>
                {p.card.motives_tactics}
              </p>
            )}
            <div className="stats-line">
              难度 {p.card.difficulty ?? '—'} · 重度阈值 {p.card.threshold_major ?? '—'}／严重阈值{' '}
              {p.card.threshold_severe ?? '—'} · 生命点 {p.card.hp ?? '—'} · 压力点{' '}
              {p.card.stress ?? '—'}
            </div>
            {p.card.attack_name && (
              <p>
                <b>普通攻击：</b>
                {p.card.attack_name} · {p.card.attack_range} · {p.card.attack_formula}{' '}
                {p.card.damage_type}
              </p>
            )}
            {p.card.features?.map((f: any, j: number) => (
              <div className="popup-feature" key={j}>
                <b>
                  {f.name} · {f.kind}
                </b>
                <p>{f.text || f.full_text}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// 严谨纯净的 Markdown 卡片渲染器（处理所有 ** 加粗与特性，杜绝任何未渲染的 ** 标记）
function RenderedMarkdownCard({ markdown }: { markdown: string }) {
  const lines = markdown.split(/\r?\n/)
  let title = ''
  let badge = ''
  const descriptions: string[] = []
  const stats: { key: string; value: string }[] = []
  const features: { name: string; kind: string; text: string }[] = []

  let inFeatures = false

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    if (line.startsWith('# ')) {
      title = line.replace(/^#\s+/, '').trim()
      continue
    }

    if (/^\*\*(?:T|Tier|位阶)\s*\d+/i.test(line)) {
      const clean = line.replace(/\*\*/g, '').trim()
      const tMatch = clean.match(/(?:T|Tier|位阶)\s*([1-4])/i)
      const typeMatch =
        Object.keys(TYPES).find(t => clean.includes(t)) ||
        Object.keys(TYPE_NAMES_ZH).find(t => clean.toLowerCase().includes(t))
      if (tMatch) {
        badge = `位阶 ${tMatch[1]} · ${typeMatch ? TYPE_NAMES_ZH[typeMatch] || typeMatch : '标准'}`
      } else {
        badge = clean
      }
      continue
    }

    if (line.startsWith('## 特性') || line.startsWith('##特性')) {
      inFeatures = true
      continue
    }

    if (!inFeatures) {
      if (line.startsWith('- ') || line.startsWith('* ')) {
        const item = line.replace(/^[-*]\s+/, '').trim()
        const match = item.match(/^(?:\*\*)?([^：:*]+?)(?:\*\*)?\s*[：:]\s*(.+)$/)
        if (match) {
          const rawKey = match[1].replace(/\*\*/g, '').replace(/[：:]$/, '').trim()
          let key = rawKey
          // 普通攻击格式化：若包含待命名或直接是普通攻击
          if (key.includes('待命名') || key === '普通攻击——普通攻击') {
            key = '普通攻击'
          }
          const value = match[2].replace(/\*\*/g, '').trim()
          stats.push({ key, value })
        } else {
          descriptions.push(item.replace(/\*\*/g, '').trim())
        }
      } else {
        descriptions.push(line.replace(/\*\*/g, '').trim())
      }
    } else {
      const item = line.replace(/^[-*]\s+/, '').replace(/\*\*/g, '').trim()
      if (!item || item === '（未提供）' || item === '(未提供)') continue
      const fMatch = /^(.+?)\s*[-—–]\s*(被动|动作|反应)\s*[：:]\s*(.+)$/.exec(item)
      if (fMatch) {
        features.push({ name: fMatch[1].trim(), kind: fMatch[2].trim(), text: fMatch[3].trim() })
      } else {
        const parts = item.split(/[：:]/)
        features.push({
          name: parts[0] || '特性',
          kind: '',
          text: parts.slice(1).join('：') || item
        })
      }
    }
  }

  return (
    <div className="rendered-card">
      {title && (
        <h3>
          <span>{title}</span>
          {badge && <span className="card-badge">{badge}</span>}
        </h3>
      )}
      {descriptions.length > 0 && (
        <div className="rendered-card-desc">
          {descriptions.map((d, i) => (
            <p key={i}>{d}</p>
          ))}
        </div>
      )}
      {stats.length > 0 && (
        <div className="rendered-card-stats">
          {stats.map((b, i) => (
            <div key={i} className="rendered-stat-row">
              <span className="stat-label">
                <b>{b.key}：</b>
              </span>
              <span className="stat-value">{b.value}</span>
            </div>
          ))}
        </div>
      )}
      {features.length > 0 && (
        <div className="rendered-card-section">
          <h4>特性</h4>
          <div className="rendered-features-list">
            {features.map((f, i) => (
              <div key={i} className="rendered-feature-item">
                <div className="rendered-feature-head">
                  <span className="rendered-feature-name">{f.name}</span>
                  {f.kind && <span className="rendered-feature-kind">{f.kind}</span>}
                </div>
                <div className="rendered-feature-text">{f.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StepContent({
  step,
  result,
  openCard,
  onHoverCard,
  onCopyFinal,
  onInsertFinal,
  onOverwriteFinal,
  copiedAction,
  step3Warnings
}: {
  step: number
  result: any
  openCard: (card: any) => void
  onHoverCard?: (card: any) => void
  onCopyFinal?: (text: string) => void
  onInsertFinal?: (text: string) => void
  onOverwriteFinal?: (text: string) => void
  copiedAction?: 'none' | 'copy' | 'insert' | 'overwrite'
  step3Warnings?: string[]
}) {
  if (step === 1) {
    return (
      <div className="step-body">
        {result.refs?.map((r: any, idx: number) => (
          <div className="ref-row" key={r.card.id}>
            <button
              className="srd-enemy"
              onClick={() => openCard(r.card)}
              onMouseEnter={() => onHoverCard && onHoverCard(r.card)}
              onMouseLeave={() => onHoverCard && onHoverCard(null)}
            >
              参考 {idx + 1} · {r.card.name_zh}
            </button>
            <span>
              位阶 {r.card.tier} · {formatEnemyType(r.card.type)}
            </span>
            <p>{r.reason}</p>
          </div>
        ))}
      </div>
    )
  }

  if (step === 2) {
    return (
      <div className="step-body">
        <p>官方 SRD 样本 {result.sample_count} 条</p>
        <div className="metric-grid">
          {Object.entries(result.ranges || {}).map(([k, v]: [string, any]) => (
            <div key={k}>
              <span>{STAT_LABELS_ZH[k] || k}</span>
              <strong>{v?.range?.join('–') || '—'}</strong>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // 步骤3：全块显示，不需要下面的渲染卡片，全部数据用块显示出来
  if (step === 3) {
    const suggestions = result.suggestions || {}
    return (
      <div className="step-body">
        <div className="metric-grid">
          {Object.entries(suggestions).map(([k, v]: [string, any]) => {
            let val = String(v?.value ?? '—')
            if (k === 'attack_name') {
              if (!val || val === '—' || val === '普通攻击（待命名）' || val.includes('待命名')) {
                val = '普通攻击'
              }
            }
            return (
              <div key={k}>
                <div className="metric-header">
                  <span>{STAT_LABELS_ZH[k] || k}</span>
                  {v?.rationale && (
                    <span className="rationale-btn" tabIndex={0} aria-label="设计理由">
                      <AlertCircle size={13} />
                      <span className="tooltip" role="tooltip">
                        {v.rationale}
                      </span>
                    </span>
                  )}
                </div>
                <strong>{val}</strong>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  if (step === 4) {
    return (
      <div className="step-body">
        {result.groups?.map((g: any) => (
          <div className="feature-group" key={g.index}>
            <div className="feature-title">{g.name}</div>
            <div className="feature-original">{g.original}</div>
            <hr className="feature-divider" />
            {g.matches?.length ? (
              g.matches.slice(0, 3).map((m: any, i: number) => (
                <div key={i} className="feature-match-item">
                  <div className="feature-match-title">
                    <span>
                      {m.adversary} · {m.feature}
                    </span>
                    <span className="feature-match-tag">
                      位阶 {m.tier} · {formatEnemyType(m.type)}
                    </span>
                  </div>
                  <div className="feature-match-body">{m.text}</div>
                </div>
              ))
            ) : (
              <div className="muted">未在官方库中找到足够接近的特性</div>
            )}
          </div>
        ))}
      </div>
    )
  }

  if (step === 5) {
    return (
      <div className="step-body">
        {result.corrections?.length ? (
          result.corrections.map((c: any, i: number) => (
            <p key={i}>
              <b>{c.name}</b>：{c.original} → {c.recommended}{' '}
              <span className="feature-match-tag">
                {c.basis.adversary} · {c.basis.feature}
              </span>
            </p>
          ))
        ) : (
          <p className="muted">词汇完全符合官方 Daggerheart 规则术语，无需修正。</p>
        )}
      </div>
    )
  }

  if (step === 6) {
    const cleanPrefix = (str: string) =>
      str
        .replace(
          /^(\[|【|\(|（)?(确定问题|待确认|待作者决定|建议|问题|警告|待定)(\]|】|\)|）)?\s*[：:、\s-]*/i,
          ''
        )
        .replace(/^(确定问题|待确认|待作者决定|建议|问题|警告)[：:、\s-]*/i, '')
        .trim()

    const rawList = [...(step3Warnings || []), ...(result.warnings || [])]
    const cleanedList = Array.from(new Set(rawList.map(cleanPrefix)))
      .filter(w => w && !/^(?:attack_name|features|locked_stats)\b/i.test(w) && !/\[object Object\]/i.test(w))
      .slice(0, 5)

    return (
      <div className="step-body">
        {cleanedList.length ? (
          <div className="mechanism-list">
            {cleanedList.map((w, i) => (
              <div className="mechanism-item" key={i}>
                <span className="dot" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">未发现机制冲突与遗漏。</p>
        )}
      </div>
    )
  }

  // 步骤7：最终完整数据块渲染，复制、插入、覆盖
  if (step === 7) {
    return (
      <div className="step-body">
        <RenderedMarkdownCard markdown={result.markdown} />
        <div className="card-actions-group">
          <button
            className="secondary"
            onClick={() => onCopyFinal && onCopyFinal(result.markdown)}
            aria-label="复制完整数据块"
          >
            {copiedAction === 'copy' ? (
              <>
                <Check size={14} color="#1a7f37" /> 已复制
              </>
            ) : (
              <>
                <Copy size={14} /> 复制
              </>
            )}
          </button>
          <button
            className="secondary"
            onClick={() => onInsertFinal && onInsertFinal(result.markdown)}
            aria-label="将数据块插入当前文件"
          >
            {copiedAction === 'insert' ? (
              <>
                <Check size={14} color="#1a7f37" /> 已插入
              </>
            ) : (
              <>
                <Plus size={14} /> 插入
              </>
            )}
          </button>
          <button
            className="secondary"
            onClick={() => onOverwriteFinal && onOverwriteFinal(result.markdown)}
            aria-label="用数据块覆盖当前文件"
          >
            {copiedAction === 'overwrite' ? (
              <>
                <Check size={14} color="#1a7f37" /> 已覆盖
              </>
            ) : (
              <>
                <RotateCcw size={14} /> 覆盖
              </>
            )}
          </button>
        </div>
      </div>
    )
  }

  return null
}

function Credits({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal credits-modal"
        role="dialog"
        aria-modal="true"
        aria-label="版权与来源"
        onClick={e => e.stopPropagation()}
      >
        <button className="close" onClick={onClose} aria-label="关闭">
          <X size={17} />
        </button>
        <h2>版权与来源说明</h2>
        <p>
          This product includes materials from the Daggerheart System Reference Document 2.0, ©
          Critical Role, LLC. All rights reserved.
        </p>
        <p>
          《匕首之心》（Daggerheart）SRD 2.0 由 Darrington Press 创建，依据{' '}
          <a
            href="https://darringtonpress.com/license/"
            target="_blank"
            rel="noreferrer"
          >
            Darrington Press Community Gaming License 2.0
          </a>{' '}
          使用。<a href="https://www.daggerheart.com/srd/" target="_blank" rel="noreferrer">
            官方 SRD
          </a>{' '}
          提供原始规则内容。
        </p>
        <p>
          本站所用敌人资料快照由
          <a
            href="https://daggerheart.cn/SRD/adversaries-and-environments/adversary-data/"
            target="_blank"
            rel="noreferrer"
          >
            匕首之心中文站
          </a>
          翻译、整理；本站仅将该快照结构化后用于本地创作建议。本站与 Darrington Press、Critical Role
          无官方隶属关系。
        </p>
      </div>
    </div>
  )
}

createRoot(document.getElementById('app')!).render(<App />)
