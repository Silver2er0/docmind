import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { ask, type Source } from '../lib/api'

type Message = { question: string; answer: string; sources: Source[]; error?: string; pending?: boolean }

/** Remount with `key={documentId}` to start a fresh conversation per document. */
export function Chat({ documentId }: { documentId: string }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [question, setQuestion] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const busy = messages.at(-1)?.pending ?? false

  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth' }), [messages])

  const patchLast = (patch: (m: Message) => Partial<Message>) =>
    setMessages((all) => all.map((m, i) => (i === all.length - 1 ? { ...m, ...patch(m) } : m)))

  async function submit(e: SubmitEvent) {
    e.preventDefault()
    const text = question.trim()
    if (text.length < 2 || busy) return
    setQuestion('')
    setMessages((all) => [...all, { question: text, answer: '', sources: [], pending: true }])
    try {
      await ask(documentId, text, { onSources: (sources) => patchLast(() => ({ sources })), onToken: (t) => patchLast((m) => ({ answer: m.answer + t })) })
      patchLast(() => ({ pending: false }))
    } catch (err) {
      patchLast(() => ({ error: (err as Error).message, pending: false }))
    }
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        {!messages.length && <p className="mt-24 text-center text-slate-500">Ask anything about this document.</p>}
        {messages.map((m, i) => (
          <div key={i} className="mx-auto max-w-3xl space-y-3">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl bg-violet-600 px-4 py-2 text-white">{m.question}</p>
            <div className="max-w-[90%] rounded-2xl bg-slate-100 px-4 py-3 dark:bg-slate-900">
              <p className="whitespace-pre-wrap">
                {m.answer || (m.pending && !m.error ? <span className="animate-pulse text-slate-500">Searching the document...</span> : null)}
                {m.pending && m.answer && <span className="animate-pulse">▍</span>}
              </p>
              {m.error && (
                <p role="alert" className="text-sm text-rose-600">
                  {m.error}
                </p>
              )}
              {m.sources.length > 0 && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-slate-500">Sources: {m.sources.map((s) => `p. ${s.page}`).join(', ')}</summary>
                  <ul className="mt-2 space-y-2">
                    {m.sources.map((s, j) => (
                      <li key={j} className="rounded-lg border border-slate-200 p-2 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-400">
                        <b>Page {s.page}</b> · {Math.round(s.score * 100)}% match
                        <br />
                        {s.content}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => void submit(e)} className="mx-auto flex w-full max-w-3xl gap-2 p-4">
        <input className="input" placeholder="Ask a question..." maxLength={500} value={question} onChange={(e) => setQuestion(e.target.value)} aria-label="Question" />
        <button className="btn btn-primary" disabled={busy || question.trim().length < 2}>
          Ask
        </button>
      </form>
    </section>
  )
}
