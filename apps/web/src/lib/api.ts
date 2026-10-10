export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3002'

/** Anonymous per-browser identity: documents are scoped to this id. */
const session = (() => {
  const saved = localStorage.getItem('docmind-session')
  if (saved) return saved
  const id = crypto.randomUUID()
  localStorage.setItem('docmind-session', id)
  return id
})()

const headers = { 'x-session-id': session }

async function fail(res: Response): Promise<never> {
  const body = await res.json().catch(() => null)
  const message = body?.message
  throw new Error((Array.isArray(message) ? message[0] : message) ?? `Request failed (${res.status})`)
}

export type Doc = { id: string; name: string; pages: number }

export const docs = {
  async list(): Promise<Doc[]> {
    const res = await fetch(`${API_URL}/documents`, { headers })
    return res.ok ? res.json() : fail(res)
  },
  async upload(file: File): Promise<Doc> {
    const body = new FormData()
    body.append('file', file)
    const res = await fetch(`${API_URL}/documents`, { method: 'POST', headers, body })
    return res.ok ? res.json() : fail(res)
  },
  async remove(id: string) {
    const res = await fetch(`${API_URL}/documents/${id}`, { method: 'DELETE', headers })
    if (!res.ok) await fail(res)
  },
}

export type Source = { page: number; content: string; score: number }

type Handlers = { onSources: (s: Source[]) => void; onToken: (t: string) => void }

/** POSTs a question and parses the Server-Sent Events stream (`sources`, `token`..., `done` | `error`). */
export async function ask(id: string, question: string, { onSources, onToken }: Handlers) {
  const res = await fetch(`${API_URL}/documents/${id}/ask`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  })
  if (!res.ok || !res.body) return fail(res)

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return
    buffer += value
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''
    for (const raw of events) {
      const [, event, data] = /^event: (\w+)\ndata: (.*)$/s.exec(raw) ?? []
      const payload = JSON.parse(data ?? 'null')
      if (event === 'sources') onSources(payload)
      else if (event === 'token') onToken(payload)
      else if (event === 'error') throw new Error(payload)
    }
  }
}
