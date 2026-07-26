import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconBack, IconTrash } from '@/components/icons'
import { EmptyState } from '@/components/EmptyState'
import { useToast } from '@/components/Toast'
import { useConfirm } from '@/components/Confirm'
import { deletePoem, findDuplicateGroups, type DuplicateGroup } from '@/db/repository'
import { excerpt } from '@/lib/text'

export function DuplicatesPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const [groups, setGroups] = useState<DuplicateGroup[] | null>(null)

  const load = useCallback(() => {
    void findDuplicateGroups().then(setGroups)
  }, [])

  useEffect(load, [load])

  const removeOne = async (id: string, title: string) => {
    const ok = await confirm({
      title: 'Delete this copy?',
      message: `“${title}” will be permanently removed.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    await deletePoem(id)
    toast.show('Duplicate deleted')
    load()
  }

  return (
    <>
      <header className="appbar">
        <button className="iconbtn" onClick={() => navigate(-1)} aria-label="Back"><IconBack /></button>
        <div className="appbar__title">Duplicates</div>
      </header>
      <div className="shell">
        {groups === null ? (
          <div className="skeleton" style={{ height: 200 }} />
        ) : groups.length === 0 ? (
          <EmptyState icon="✅" title="No duplicates" message="Every poem in your library has unique text." />
        ) : (
          <>
            <p className="page-sub">
              These poems have identical text after normalising spacing and diacritics.
              Keep the best copy and delete the rest.
            </p>
            {groups.map((g) => (
              <div key={g.hash} style={{ marginBottom: 22 }}>
                <div className="section-head" style={{ marginTop: 0 }}>
                  <h2>{g.poems.length} copies</h2>
                </div>
                <div className="rows">
                  {g.poems.map((p, i) => (
                    <div key={p.id} className="row" onClick={() => navigate(`/poem/${p.id}`)}>
                      <div className="row__body">
                        <div className="row__title" dir="auto">
                          {p.titleNative || p.title} {i === 0 && <span className="badge">oldest</span>}
                        </div>
                        <div className="row__sub" dir="auto">{excerpt(p.text, 60)}</div>
                      </div>
                      <button className="iconbtn" style={{ color: 'var(--danger)' }} aria-label="Delete copy"
                        onClick={(e) => { e.stopPropagation(); void removeOne(p.id, p.title) }}>
                        <IconTrash width={18} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </>
  )
}
