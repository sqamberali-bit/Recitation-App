import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sheet } from '@/components/Sheet'
import { EmptyState } from '@/components/EmptyState'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { IconPlus, IconChevron, IconUser, IconLayers, IconTag, IconTrash } from '@/components/icons'
import { useLibrary } from '@/store/library'
import { deleteCollection, saveCollection } from '@/db/repository'

type Tab = 'collections' | 'authors' | 'categories' | 'topics' | 'occasions' | 'tags'

const TABS: { key: Tab; label: string }[] = [
  { key: 'collections', label: 'Collections' },
  { key: 'authors', label: 'Authors' },
  { key: 'categories', label: 'Categories' },
  { key: 'occasions', label: 'Occasions' },
  { key: 'topics', label: 'Topics' },
  { key: 'tags', label: 'Tags' },
]

export function BrowsePage() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { collections, authors, facets, poems } = useLibrary()
  const [tab, setTab] = useState<Tab>('collections')
  const [newOpen, setNewOpen] = useState(false)
  const [name, setName] = useState('')

  const go = (params: Record<string, string>) => {
    navigate({ pathname: '/browse/results', search: new URLSearchParams(params).toString() })
  }

  const createCollection = async () => {
    if (!name.trim()) return
    await saveCollection({ name })
    setName('')
    setNewOpen(false)
    toast.show('Collection created')
  }

  const removeCollection = async (id: string, label: string) => {
    const ok = await confirm({
      title: `Delete "${label}"?`,
      message: 'Poems in this collection are kept — only the collection itself is removed.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    await deleteCollection(id)
    toast.show('Collection deleted')
  }

  const countInCollection = (id: string) => poems.filter((p) => p.collectionIds.includes(id)).length
  const countByAuthor = (id: string) => poems.filter((p) => p.authorId === id).length

  return (
    <>
      <header className="appbar">
        <div className="appbar__title">Browse</div>
        <div className="appbar__spacer" />
        {tab === 'collections' && (
          <button className="iconbtn" onClick={() => setNewOpen(true)} aria-label="New collection"><IconPlus /></button>
        )}
      </header>

      <div className="shell">
        <div className="scroller" style={{ marginBottom: 18 }}>
          {TABS.map((t) => (
            <button key={t.key} className={`chip ${tab === t.key ? 'chip--active' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'collections' && (
          collections.length === 0 ? (
            <EmptyState icon="📚" title="No collections yet"
              message="Group poems into collections like “Ashura Night” or “Favourites for Majlis”."
              action={<button className="btn btn--primary" onClick={() => setNewOpen(true)}>New collection</button>} />
          ) : (
            <div className="rows">
              {collections.map((c) => (
                <div key={c.id} className="row" onClick={() => go({ collectionId: c.id, label: c.name })}>
                  <IconLayers style={{ color: 'var(--accent)' }} />
                  <div className="row__body">
                    <div className="row__title">{c.name}</div>
                    <div className="row__sub">{countInCollection(c.id)} poems</div>
                  </div>
                  <button className="iconbtn" style={{ color: 'var(--danger)' }} aria-label="Delete collection"
                    onClick={(e) => { e.stopPropagation(); void removeCollection(c.id, c.name) }}>
                    <IconTrash width={18} />
                  </button>
                  <IconChevron width={18} className="muted" />
                </div>
              ))}
            </div>
          )
        )}

        {tab === 'authors' && (
          authors.length === 0 ? (
            <EmptyState icon="✍️" title="No authors yet" message="Add a poet's name when creating a poem." />
          ) : (
            <div className="rows">
              {authors.map((a) => (
                <div key={a.id} className="row" onClick={() => go({ authorId: a.id, label: a.name })}>
                  <IconUser style={{ color: 'var(--accent)' }} />
                  <div className="row__body">
                    <div className="row__title">{a.name}</div>
                    <div className="row__sub">{countByAuthor(a.id)} poems</div>
                  </div>
                  <IconChevron width={18} className="muted" />
                </div>
              ))}
            </div>
          )
        )}

        {tab !== 'collections' && tab !== 'authors' && (
          <FacetList
            items={
              tab === 'categories' ? facets.categories
              : tab === 'topics' ? facets.topics
              : tab === 'occasions' ? facets.occasions
              : facets.tags
            }
            paramKey={tab === 'categories' ? 'category' : tab === 'topics' ? 'topic' : tab === 'occasions' ? 'occasion' : 'tag'}
            onPick={go}
          />
        )}
      </div>

      <Sheet open={newOpen} title="New collection" onClose={() => setNewOpen(false)}>
        <div className="field">
          <label>Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Shab-e-Ashura" autoFocus onKeyDown={(e) => e.key === 'Enter' && void createCollection()} />
        </div>
        <button className="btn btn--primary btn--block" onClick={createCollection}>Create</button>
      </Sheet>
    </>
  )
}

function FacetList({
  items,
  paramKey,
  onPick,
}: {
  items: { value: string; count: number }[]
  paramKey: string
  onPick: (p: Record<string, string>) => void
}) {
  if (items.length === 0) {
    return <EmptyState icon="🏷️" title="Nothing here yet" message="Add tags, topics, or occasions to your poems to browse them here." />
  }
  return (
    <div className="chips">
      {items.map((f) => (
        <button key={f.value} className="chip" onClick={() => onPick({ [paramKey]: f.value, label: f.value })}>
          <IconTag width={14} /> {f.value} <span className="chip__count">{f.count}</span>
        </button>
      ))}
    </div>
  )
}
