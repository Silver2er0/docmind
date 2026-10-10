import { useEffect, useState } from 'react'
import { Chat } from './components/Chat'
import { Sidebar } from './components/Sidebar'
import { docs, type Doc } from './lib/api'

export default function App() {
  const [items, setItems] = useState<Doc[]>([])
  const [selected, setSelected] = useState<string>()
  const refresh = () => docs.list().then(setItems)
  const active = items.find((d) => d.id === selected) ?? items[0]

  useEffect(() => {
    void docs.list().then(setItems)
  }, [])

  return (
    <div className="flex h-dvh">
      <Sidebar items={items} activeId={active?.id} onSelect={setSelected} onChange={refresh} />
      {active ? (
        <Chat key={active.id} documentId={active.id} />
      ) : (
        <p className="m-auto max-w-sm text-center text-slate-500">Upload a PDF (or try the sample) and ask it questions. Answers stream in with the pages they came from.</p>
      )}
    </div>
  )
}
