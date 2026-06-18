import type { Database } from '../schema/types'

export interface DesignSummary {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface Design extends DesignSummary {
  database: Database
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string })?.error ?? 'Request failed')
  return data as Record<string, unknown>
}

export async function listDesigns(): Promise<DesignSummary[]> {
  const data = await readJson(await fetch('/api/designs', { credentials: 'include' }))
  return data.designs as DesignSummary[]
}

export async function getDesign(id: string): Promise<Design> {
  const data = await readJson(await fetch(`/api/designs/${id}`, { credentials: 'include' }))
  return data.design as Design
}

export async function createDesign(name: string, database: Database): Promise<Design> {
  const res = await fetch('/api/designs', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, database }),
  })
  return (await readJson(res)).design as Design
}

export async function updateDesign(
  id: string,
  patch: { name?: string; database?: Database },
): Promise<Design> {
  const res = await fetch(`/api/designs/${id}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  })
  return (await readJson(res)).design as Design
}

export async function deleteDesign(id: string): Promise<void> {
  const res = await fetch(`/api/designs/${id}`, { method: 'DELETE', credentials: 'include' })
  if (!res.ok && res.status !== 204) throw new Error('Could not delete design')
}
