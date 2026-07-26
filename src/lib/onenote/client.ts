import { getToken } from './auth'

const GRAPH = 'https://graph.microsoft.com/v1.0'

async function graphFetch(urlOrPath: string): Promise<Response> {
  const token = await getToken()
  const url = urlOrPath.startsWith('https://') ? urlOrPath : `${GRAPH}${urlOrPath}`
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (resp.status === 429) {
    const retry = Number(resp.headers.get('Retry-After') || 5)
    await delay(retry * 1000)
    return graphFetch(urlOrPath)
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`Graph API ${resp.status}: ${body.slice(0, 200)}`)
  }
  return resp
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

interface GraphList<T> {
  value: T[]
  '@odata.nextLink'?: string
}

async function fetchAll<T>(path: string): Promise<T[]> {
  const items: T[] = []
  let url: string | undefined = path
  while (url) {
    const resp = await graphFetch(url)
    const data: GraphList<T> = await resp.json()
    items.push(...data.value)
    url = data['@odata.nextLink']
  }
  return items
}

export interface OneNoteNotebook {
  id: string
  displayName: string
  createdDateTime: string
  lastModifiedDateTime: string
}

export interface OneNoteSection {
  id: string
  displayName: string
  createdDateTime: string
  lastModifiedDateTime: string
}

export interface OneNoteSectionGroup {
  id: string
  displayName: string
}

export interface OneNotePage {
  id: string
  title: string
  createdDateTime: string
  lastModifiedDateTime: string
}

export function listNotebooks(): Promise<OneNoteNotebook[]> {
  return fetchAll('/me/onenote/notebooks?$orderby=displayName')
}

export function listSections(notebookId: string): Promise<OneNoteSection[]> {
  return fetchAll(`/me/onenote/notebooks/${enc(notebookId)}/sections`)
}

export function listSectionGroups(notebookId: string): Promise<OneNoteSectionGroup[]> {
  return fetchAll(`/me/onenote/notebooks/${enc(notebookId)}/sectionGroups`)
}

export function listSectionsInGroup(groupId: string): Promise<OneNoteSection[]> {
  return fetchAll(`/me/onenote/sectionGroups/${enc(groupId)}/sections`)
}

export function listPages(sectionId: string): Promise<OneNotePage[]> {
  return fetchAll(
    `/me/onenote/sections/${enc(sectionId)}/pages?$orderby=createdDateTime&$top=100`,
  )
}

export async function getPageContent(pageId: string): Promise<string> {
  const resp = await graphFetch(`/me/onenote/pages/${enc(pageId)}/content`)
  return resp.text()
}

export async function getResource(url: string): Promise<Blob> {
  const token = await getToken()
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!resp.ok) throw new Error(`Resource fetch ${resp.status}`)
  return resp.blob()
}

function enc(id: string): string {
  return encodeURIComponent(id)
}
