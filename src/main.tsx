import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import {
  ChevronDown,
  ChevronRight,
  FilePlus2,
  FolderPlus,
  Folder,
  FileText,
  Play,
  Pin,
  X,
  Settings2,
  LogOut,
  RotateCcw,
  PanelLeftClose,
  PanelRightClose,
  Sparkles,
  Copy,
  Check,
  Flame,
  Key
} from 'lucide-react'
import type { Run, TreeNode } from '../shared/types'
import { STEP_NAMES } from '../shared/types'
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

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [nodes, setNodes] = useState<TreeNode[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [saveState, setSaveState] = useState('已保存')
  const [run, setRun] = useState<Run | null>(null)
  const [keyOpen, setKeyOpen] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [keyReady, setKeyReady] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [leftWidth, setLeftWidth] = useState(260)
  const [rightWidth, setRightWidth] = useState(460)
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  const [popups, setPopups] = useState<{ id: string; card: Card; pinned: boolean }[]>([])
  const [creditsOpen, setCreditsOpen] = useState(false)
  const [copiedStep7, setCopiedStep7] = useState(false)

  const pending = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editing = useRef(false)
  const contentRef = useRef('')
  const selectedNode = nodes.find(n => n.id === selected)

  async function selectFile(id: string) {
    if (selected && editing.current) {
      if (pending.current) clearTimeout(pending.current)
      try {
        await api('nodes/' + selected, {
          method: 'PATCH',
          body: JSON.stringify({ content: contentRef.current })
        })
        editing.current = false
        setSaveState('已保存')
      } catch (e) {
        setError((e as Error).message)
        return
      }
    }
    setSelected(id)
  }

  const editor = useEditor({
    extensions: [StarterKit, Markdown],
    content: '',
    contentType: 'markdown',
    editorProps: {
      attributes: {
        class: 'editor-body',
        'aria-label': '敌人 Markdown 编辑区'
      }
    },
    onUpdate: ({ editor }) => {
      const value = editor.getMarkdown()
      contentRef.current = value
      setContent(value)
      setSaveState('保存中…')
      editing.current = true
    }
  })

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
    api<{ node: TreeNode }>('nodes/' + selected)
      .then(x => {
        if (editing.current) return
        const value = x.node.content || ''
        contentRef.current = value
        setContent(value)
        editor?.commands.setContent(value, { contentType: 'markdown' })
        setSaveState('已保存')
      })
      .catch(e => setError(e.message))

    api<{ runs: { id: string }[] }>('runs?file=' + selected)
      .then(x => {
        if (x.runs[0]) loadRun(x.runs[0].id)
        else setRun(null)
      })
      .catch(() => {})
  }, [selected, user, editor])

  useEffect(() => {
    if (!editing.current || !selected) return
    if (pending.current) clearTimeout(pending.current)
    pending.current = setTimeout(async () => {
      try {
        const value = contentRef.current
        await api('nodes/' + selected, {
          method: 'PATCH',
          body: JSON.stringify({ content: value })
        })
        setNodes(ns =>
          ns.map(n =>
            n.id === selected ? { ...n, updated_at: new Date().toISOString() } : n
          )
        )
        setSaveState('已保存')
        editing.current = false
      } catch (e) {
        setSaveState('保存失败')
        setError((e as Error).message)
      }
    }, 650)
    return () => {
      if (pending.current) clearTimeout(pending.current)
    }
  }, [content, selected])

  useEffect(() => {
    if (!run || !['queued', 'running'].includes(run.status)) return
    const timer = setInterval(() => loadRun(run.id), 1500)
    return () => clearInterval(timer)
  }, [run?.id, run?.status])

  async function loadRun(id: string) {
    try {
      const x = await api<{ run: Run }>('runs/' + id)
      setRun(x.run)
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

  async function create(kind: 'folder' | 'file', parent_id: string | null = null) {
    const name = prompt(kind === 'folder' ? '文件夹名称：' : '敌人文件名称：')
    if (!name) return
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
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function mutateNode(id: string, operation: 'rename' | 'move' | 'delete') {
    const node = nodes.find(n => n.id === id)
    if (!node) return
    try {
      if (operation === 'delete') {
        if (!confirm(`确定删除「${node.name}」及其所有子项吗？`)) return
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
        if (selected && remove.has(selected)) setSelected(null)
      } else {
        const folders = nodes.filter(n => n.kind === 'folder' && n.id !== id)
        const value = prompt(
          operation === 'rename'
            ? '新名称：'
            : `移到哪个文件夹？输入编号：\n0 根目录\n${folders
                .map((f, i) => `${i + 1} ${f.name}`)
                .join('\n')}`,
          operation === 'rename' ? node.name : '0'
        )
        if (value === null) return
        const target =
          operation === 'move'
            ? Number(value) === 0
              ? null
              : folders[Number(value) - 1]?.id
            : null
        if (operation === 'move' && Number(value) !== 0 && !target) {
          throw Error('目标编号无效')
        }
        await api('nodes/' + id, {
          method: 'PATCH',
          body: JSON.stringify(
            operation === 'rename' ? { name: value } : { parent_id: target }
          )
        })
        setNodes(ns =>
          ns.map(n =>
            n.id === id
              ? { ...n, ...(operation === 'rename' ? { name: value } : { parent_id: target }) }
              : n
          )
        )
      }
    } catch (e) {
      setError((e as Error).message)
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
    if (saveState !== '已保存') {
      try {
        await api('nodes/' + selected, {
          method: 'PATCH',
          body: JSON.stringify({ content: contentRef.current })
        })
        setSaveState('已保存')
      } catch (e) {
        setError((e as Error).message)
        return
      }
    }
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
    setPopups(ps =>
      ps.some(p => p.id === card.id)
        ? ps
        : [...ps.filter(p => p.pinned), { id: card.id, card, pinned: false }]
    )
  }

  function copyFinalMarkdown(text: string) {
    navigator.clipboard.writeText(text)
    setCopiedStep7(true)
    setTimeout(() => setCopiedStep7(false), 2000)
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
              opened ? <ChevronDown size={14} /> : <ChevronRight size={14} />
            ) : (
              <span className="chevron-gap" />
            )}
            {node.kind === 'folder' ? (
              <Folder size={15} color="#54aeff" />
            ) : (
              <FileText size={15} color="#656d76" />
            )}
            <span>{node.name}</span>
          </button>
          <span className="row-actions">
            {node.kind === 'folder' && (
              <button title="新建子项" onClick={() => create('file', node.id)}>
                ＋
              </button>
            )}
            <button
              title="更多操作"
              onClick={() => {
                const action = prompt('输入 rename（重命名）、move（移动）或 delete（删除）：')
                if (action === 'rename' || action === 'move' || action === 'delete') {
                  mutateNode(node.id, action)
                }
              }}
            >
              ⋯
            </button>
          </span>
        </div>
        {node.kind === 'folder' && opened && children.map(n => renderNode(n, depth + 1))}
      </React.Fragment>
    )
  }

  // 未登录界面（严格按照 GitHub 认证页面风格）
  if (!user) {
    return (
      <main className="auth-screen">
        <div className="auth-mark">
          <Flame size={44} color="#1f2328" />
        </div>
        <h1>{authMode === 'login' ? '登录敌人锻炉' : '注册新账号'}</h1>
        <p>匕首之心 Daggerheart 原创敌人审阅工作台</p>
        
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
            <Flame size={18} />
          </span>
          敌人锻炉
          <span className="brand-badge">SRD 2.0</span>
        </div>
        
        <div className="titlebar-center">
          <span>工作区</span> / <strong>{selectedNode?.name || '未打开文件'}</strong>
        </div>

        <div className="title-actions">
          <button title="切换文件侧栏" onClick={() => setLeftOpen(!leftOpen)}>
            <PanelLeftClose size={16} />
          </button>
          <button title="切换分析侧栏" onClick={() => setRightOpen(!rightOpen)}>
            <PanelRightClose size={16} />
          </button>
          <button title="设置 API Key" onClick={() => setKeyOpen(true)}>
            <Settings2 size={16} />
          </button>
          <button
            title="退出登录"
            onClick={async () => {
              await api('auth/logout', { method: 'POST' })
              setUser(null)
              setNodes([])
              setSelected(null)
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* 工作区主布局 */}
      <div className="workspace">
        {/* 左侧资源管理器 */}
        {leftOpen && (
          <>
            <aside className="explorer" style={{ width: leftWidth }}>
              <div className="pane-heading">
                <span>资源管理器</span>
                <div>
                  <button title="新建敌人" onClick={() => create('file')}>
                    <FilePlus2 size={15} />
                  </button>
                  <button title="新建文件夹" onClick={() => create('folder')}>
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
              {nodes.length === 0 && (
                <div className="empty-tree">点击右上角图标新建敌人文件。</div>
              )}
            </aside>
            <div
              className="resizer"
              onPointerDown={e => e.currentTarget.setPointerCapture(e.pointerId)}
              onPointerMove={e => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                  setLeftWidth(Math.max(200, Math.min(460, e.clientX)))
                }
              }}
            />
          </>
        )}

        {/* 中间 Markdown 编辑器 */}
        <main className="editor-pane">
          <div className="tabbar">
            {selectedNode && (
              <div className="tab">
                <FileText size={15} />
                <span>{selectedNode.name}</span>
                <span
                  className={
                    'save-state ' +
                    (saveState === '保存中…'
                      ? 'pending'
                      : saveState === '保存失败'
                        ? 'error'
                        : 'saved')
                  }
                >
                  {saveState}
                </span>
              </div>
            )}
          </div>
          {selectedNode ? (
            <div className="editor-scroll">
              <div className="editor-toolbar">
                <span>
                  <FileText size={13} /> MARKDOWN
                </span>
                <span>支持 #、##、-、** 等快捷排版</span>
              </div>
              <EditorContent editor={editor} />
            </div>
          ) : (
            <div className="welcome">
              <div className="welcome-symbol">
                <Flame size={48} />
              </div>
              <h2>开始创作原创敌人</h2>
              <p>从左侧资源管理器中选择文件，或点击下方按钮新建敌人数据草稿。</p>
              <button className="primary" onClick={() => create('file')}>
                <FilePlus2 size={16} /> 新建敌人文件
              </button>
            </div>
          )}
        </main>

        {/* 右侧敌人分析面板 */}
        {rightOpen && (
          <>
            <div
              className="resizer"
              onPointerDown={e => e.currentTarget.setPointerCapture(e.pointerId)}
              onPointerMove={e => {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                  setRightWidth(Math.max(360, Math.min(760, window.innerWidth - e.clientX)))
                }
              }}
            />
            <aside className="analysis" style={{ width: rightWidth }}>
              <div className="pane-heading">
                <span>敌人分析引擎</span>
                <span className="ai-badge">DEEPSEEK CHAT</span>
              </div>
              <div className="run-controls">
                <p>提取当前文件快照，执行固定七步审阅机制，结果不改动原稿。</p>
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
                    : '运行敌人锻造'}
                </button>
                {!keyReady && (
                  <button className="inline-link" onClick={() => setKeyOpen(true)}>
                    <Key size={13} style={{ marginRight: 4 }} />
                    请先配置 DeepSeek API Key
                  </button>
                )}
              </div>

              <div className="steps-scroll">
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
                    <div className="progress-track">
                      <div
                        style={{
                          width: `${(run.steps.filter(s => s.status === 'done').length / 7) * 100}%`
                        }}
                      />
                    </div>
                    {run.steps.map(s => (
                      <section className={'step-card ' + s.status} key={s.step}>
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
                            onCopyFinal={copyFinalMarkdown}
                            copied={copiedStep7}
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
                    <div>
                      <Sparkles size={36} />
                    </div>
                    <h3>就绪状态</h3>
                    <p>点击上方“运行敌人锻造”，分析步骤将在此实时推进。</p>
                  </div>
                )}
              </div>
            </aside>
          </>
        )}
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

      {/* 浮动 SRD 怪物卡片 */}
      {popups.map((p, i) => (
        <div
          className="card-popup"
          key={p.id}
          style={{
            right: Math.max(24, rightWidth - 40) + (i % 3) * 32,
            top: 72 + (i % 4) * 36,
            zIndex: 40 + i
          }}
          role="dialog"
          aria-label={p.card.name_zh}
        >
          <div className="popup-head">
            <strong>{p.card.name_zh}</strong>
            <span>
              T{p.card.tier} · {p.card.type}
            </span>
            <button
              title={p.pinned ? '取消固定' : '固定到前台'}
              className={p.pinned ? 'pinned' : ''}
              onClick={() =>
                setPopups(ps =>
                  ps.map(x => (x.id === p.id ? { ...x, pinned: !x.pinned } : x))
                )
              }
            >
              <Pin size={15} />
            </button>
            <button
              title="关闭"
              onClick={() => setPopups(ps => ps.filter(x => x.id !== p.id))}
            >
              <X size={15} />
            </button>
          </div>
          <div className="popup-body">
            <p>{p.card.description}</p>
            <p>
              <b>动机与战术：</b>
              {p.card.motives_tactics}
            </p>
            <div className="stats-line">
              难度 {p.card.difficulty} · 阈值 {p.card.threshold_major}/
              {p.card.threshold_severe} · 生命 {p.card.hp} · 压力 {p.card.stress}
            </div>
            <p>
              <b>攻击：</b>
              {p.card.attack_name} · {p.card.attack_range} · {p.card.attack_formula}{' '}
              {p.card.damage_type}
            </p>
            {p.card.features?.map((f: any, j: number) => (
              <div className="popup-feature" key={j}>
                <b>
                  {f.name} · {f.kind}
                </b>
                <p>{f.full_text}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function StepContent({
  step,
  result,
  openCard,
  onCopyFinal,
  copied
}: {
  step: number
  result: any
  openCard: (card: any) => void
  onCopyFinal?: (text: string) => void
  copied?: boolean
}) {
  if (step === 1) {
    return (
      <div className="step-body">
        {result.refs?.map((r: any) => (
          <div className="ref-row" key={r.card.id}>
            <button className="srd-enemy" onClick={() => openCard(r.card)}>
              {r.label} · {r.card.name_zh}
            </button>
            <span>
              T{r.card.tier} · {r.card.type}
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
        <p>官方 SRD 样本 {result.sample_count} 条 · 融合数值区间</p>
        <div className="metric-grid">
          {Object.entries(result.ranges || {}).map(([k, v]: [string, any]) => (
            <div key={k}>
              <span>{k}</span>
              <strong>{v?.range?.join('–') || '—'}</strong>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (step === 3) {
    return (
      <div className="step-body">
        <div className="metric-grid">
          {Object.entries(result.suggestions || {}).map(([k, v]: [string, any]) => (
            <div key={k} title={v.rationale}>
              <span>{k}</span>
              <strong>{String(v.value ?? '—')}</strong>
            </div>
          ))}
        </div>
        {result.basicCard && <pre className="final-card">{result.basicCard}</pre>}
        {result.warnings?.map((w: string, i: number) => (
          <p key={i} className="notice">
            {w}
          </p>
        ))}
      </div>
    )
  }

  if (step === 4) {
    return (
      <div className="step-body">
        {result.groups?.map((g: any) => (
          <div className="feature-group" key={g.index}>
            <b>{g.name}</b>
            <p>{g.original}</p>
            {g.matches?.length ? (
              g.matches.map((m: any, i: number) => (
                <div key={i} className="feature-match">
                  <button className="srd-feature">
                    <span>
                      {m.adversary} · {m.feature}
                    </span>
                    <span className="tooltip" role="tooltip">
                      <b>
                        {m.adversary}｜{m.feature}
                      </b>
                      <br />
                      {m.text}
                    </span>
                  </button>
                  <span>{m.text}</span>
                </div>
              ))
            ) : (
              <span className="muted">未在官方库中找到足够接近的特性</span>
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
              <button className="srd-feature">
                {c.basis.adversary} · {c.basis.feature}
                <span className="tooltip" role="tooltip">
                  {c.basis.text}
                </span>
              </button>
            </p>
          ))
        ) : (
          <p className="muted">词汇完全符合官方 Daggerheart 规则术语，无需修正。</p>
        )}
      </div>
    )
  }

  if (step === 6) {
    return (
      <div className="step-body">
        {result.warnings?.length ? (
          result.warnings.map((w: string, i: number) => (
            <p className="notice" key={i}>
              {w}
            </p>
          ))
        ) : (
          <p className="muted">未发现结构性机制冲突，数值与动作经济合理。</p>
        )}
      </div>
    )
  }

  if (step === 7) {
    return (
      <div className="step-body">
        <pre className="final-card">{result.markdown}</pre>
        <button
          className="secondary"
          onClick={() => onCopyFinal && onCopyFinal(result.markdown)}
        >
          {copied ? (
            <>
              <Check size={14} color="#1a7f37" /> 已复制数据块
            </>
          ) : (
            <>
              <Copy size={14} /> 复制完整数据块
            </>
          )}
        </button>
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
