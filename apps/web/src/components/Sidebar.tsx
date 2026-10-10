import { useRef, useState } from 'react'
import { docs, type Doc } from '../lib/api'

type Props = {
  items: Doc[]
  activeId?: string
  onSelect: (id: string) => void
  onChange: () => Promise<unknown>
}

export function Sidebar({ items, activeId, onSelect, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function upload(file?: File) {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const doc = await docs.upload(file)
      await onChange()
      onSelect(doc.id)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  async function remove(id: string) {
    await docs.remove(id)
    await onChange()
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-4 border-r border-slate-200 p-4 dark:border-slate-800">
      <h1 className="text-xl font-bold tracking-tight text-violet-600 dark:text-violet-400">DocMind</h1>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          void upload(e.dataTransfer.files[0])
        }}
        className="rounded-xl border-2 border-dashed border-slate-300 p-4 text-center text-sm dark:border-slate-700"
      >
        <input ref={input} type="file" accept="application/pdf" hidden onChange={(e) => void upload(e.target.files?.[0])} />
        <button className="btn btn-primary w-full" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Reading and embedding...' : 'Upload a PDF'}
        </button>
        <p className="mt-2 text-xs text-slate-500">or drop it here. Up to 5 MB, 60 pages.</p>
        <button
          className="mt-2 text-xs font-medium text-violet-600 hover:underline disabled:opacity-50 dark:text-violet-400"
          disabled={busy}
          onClick={async () => upload(new File([await (await fetch('/sample.pdf')).blob()], 'DocMind-overview.pdf', { type: 'application/pdf' }))}
        >
          Try a sample PDF
        </button>
        {error && (
          <p role="alert" className="mt-2 text-xs text-rose-600">
            {error}
          </p>
        )}
      </div>
      <ul className="space-y-1 overflow-y-auto">
        {items.map((doc) => (
          <li key={doc.id} className={`group flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${doc.id === activeId ? 'bg-violet-100 dark:bg-violet-950' : 'hover:bg-slate-100 dark:hover:bg-slate-900'}`}>
            <button className="min-w-0 flex-1 text-left" onClick={() => onSelect(doc.id)}>
              <span className="block truncate font-medium">{doc.name}</span>
              <span className="text-xs text-slate-500">{doc.pages} pages</span>
            </button>
            <button aria-label={`Delete ${doc.name}`} className="text-slate-400 opacity-0 hover:text-rose-600 group-hover:opacity-100 focus:opacity-100" onClick={() => void remove(doc.id)}>
              ✕
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
