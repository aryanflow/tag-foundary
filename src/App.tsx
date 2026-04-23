import { useCallback, useMemo, useState } from 'react'
import {
  cleanGtmData,
  getResource,
  GtmError,
  isValidContainerId,
  parseGtmScript,
  summarizeResource,
} from './lib/gtmParser'
import {
  insightSearchBlob,
  interpretResourceTracking,
  type TagTrackingInsight,
} from './lib/interpretTracking'

type Tab =
  | 'overview'
  | 'tracking'
  | 'tags'
  | 'predicates'
  | 'macros'
  | 'rules'
  | 'json'

function asRecordArray(x: unknown): Record<string, unknown>[] {
  if (!Array.isArray(x)) return []
  return x.filter((i): i is Record<string, unknown> => i !== null && typeof i === 'object')
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const tabs: { id: Tab; label: string; hint: string }[] = [
  { id: 'overview', label: 'Overview', hint: 'Container shape and quick stats' },
  {
    id: 'tracking',
    label: 'How it tracks',
    hint: 'Plain-language firing: clicks, page load, custom events, and what each tag does',
  },
  { id: 'tags', label: 'Tags', hint: 'Tags compiled into the public snippet' },
  { id: 'predicates', label: 'Predicates', hint: 'Condition trees that drive firing' },
  { id: 'macros', label: 'Variables', hint: 'Macros referenced by the container' },
  { id: 'rules', label: 'Rules', hint: 'How predicates map to tag slots' },
  { id: 'json', label: 'Export', hint: 'Copy or download JSON' },
]

export default function App() {
  const [containerId, setContainerId] = useState('GTM-XXXXX')
  const [paste, setPaste] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [raw, setRaw] = useState<string | null>(null)
  const [data, setData] = useState<unknown | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [q, setQ] = useState('')

  const resource = useMemo(() => getResource(data ?? undefined), [data])
  const summary = useMemo(
    () => summarizeResource(resource),
    [resource]
  )
  const trackingInsights = useMemo(
    () => interpretResourceTracking(resource),
    [resource]
  )

  const runParse = useCallback(
    (js: string) => {
      setErr(null)
      setRaw(js)
      const parsed = parseGtmScript(js)
      setData(parsed)
      setTab('tracking')
    },
    [setData]
  )

  const onLoadFromId = useCallback(async () => {
    const id = containerId.trim()
    if (!isValidContainerId(id)) {
      setErr('Use a public container id like GTM-XXXXXXX (letters and numbers).')
      return
    }
    setLoading(true)
    setErr(null)
    try {
      const r = await fetch(`/api/gtm?id=${encodeURIComponent(id)}`, {
        headers: { Accept: 'text/javascript,*/*' },
      })
      if (!r.ok) {
        const msg = r.status === 404 ? 'Container not found' : `Request failed (${r.status})`
        setErr(msg)
        return
      }
      const text = await r.text()
      try {
        runParse(text)
      } catch (e) {
        if (e instanceof GtmError) {
          setErr(e.message)
          return
        }
        setErr(e instanceof Error ? e.message : 'Could not parse container from gtm.js')
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }, [containerId, runParse])

  const onParsePaste = useCallback(() => {
    setErr(null)
    if (!paste.trim()) {
      setErr('Paste the full gtm.js response, or the “var data = {…}” section.')
      return
    }
    try {
      runParse(paste)
    } catch (e) {
      if (e instanceof GtmError) {
        setErr(e.message)
        return
      }
      setErr(e instanceof Error ? e.message : 'Parse error')
    }
  }, [paste, runParse])

  const clean = useMemo(() => {
    if (!data || typeof data !== 'object') return null
    return cleanGtmData({ ...(data as Record<string, unknown>) })
  }, [data])

  const filterStr = (row: Record<string, unknown>) => {
    if (!q.trim()) return true
    const s = q.toLowerCase()
    return JSON.stringify(row).toLowerCase().includes(s)
  }
  const filterTracking = (ins: TagTrackingInsight) => {
    if (!q.trim()) return true
    return insightSearchBlob(ins).includes(q.trim().toLowerCase())
  }

  const tagRows = asRecordArray(resource?.tags)
  const predRows = asRecordArray(resource?.predicates)
  const macroRows = asRecordArray(resource?.macros)
  const rules = Array.isArray(resource?.rules) ? resource?.rules : []

  return (
    <div className="min-h-svh text-basalt-100">
      <header className="border-b border-basalt-800/80 bg-basalt-900/50 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <p className="font-mono text-xs tracking-[0.2em] text-ember-300/90">
            GOOGLE TAG MANAGER · CONTAINER
          </p>
          <h1 className="mt-2 font-display text-4xl tracking-tight text-basalt-50 sm:text-5xl">
            Tag Foundry
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-base text-basalt-100/85 sm:text-lg">
            Load a <strong className="text-basalt-50">public</strong> GTM web container from{' '}
            <code className="rounded bg-basalt-800 px-1.5 py-0.5 font-mono text-sm text-ember-300/95">
              gtm.js
            </code>
            , explore tags, predicates, and variables, then export a clean JSON snapshot without
            runtime noise.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <section
          className="rounded-2xl border border-basalt-800/90 bg-basalt-900/40 p-5 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] sm:p-7"
          aria-labelledby="ingest-title"
        >
          <h2 id="ingest-title" className="font-display text-2xl text-basalt-50">
            Load container
          </h2>
          <p className="mt-2 text-sm text-basalt-100/75">
            Fetches the same public file the browser loads for your site. If your network blocks
            the proxy, paste the script body instead.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="gtm-id" className="text-xs font-medium text-basalt-100/70">
                Public container id
              </label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <input
                  id="gtm-id"
                  className="w-full min-w-[12rem] flex-1 rounded-lg border border-basalt-700 bg-basalt-950/80 px-3 py-2.5 font-mono text-sm text-basalt-50 outline-none ring-0 transition focus:border-copper-500/80 focus:ring-2 focus:ring-copper-500/25"
                  value={containerId}
                  onChange={(e) => setContainerId(e.target.value.toUpperCase())}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="GTM-XXXXXXX"
                />
                <button
                  type="button"
                  onClick={onLoadFromId}
                  disabled={loading}
                  className="shrink-0 rounded-lg bg-copper-500 px-4 py-2.5 text-sm font-semibold text-basalt-950 shadow-sm transition hover:bg-copper-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? 'Loading…' : 'Fetch gtm.js'}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <label htmlFor="paste" className="text-xs font-medium text-basalt-100/70">
              Or paste gtm.js (full response)
            </label>
            <textarea
              id="paste"
              rows={4}
              className="mt-1.5 w-full resize-y rounded-lg border border-basalt-700 bg-basalt-950/60 px-3 py-2 font-mono text-xs leading-relaxed text-basalt-100/90 outline-none focus:border-copper-500/80 focus:ring-2 focus:ring-copper-500/25"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder="/* Copyright Google … */  var data = { …"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onParsePaste}
                className="rounded-lg border border-basalt-600 bg-basalt-800/50 px-3 py-2 text-sm font-medium text-basalt-50 transition hover:border-basalt-500 hover:bg-basalt-800"
              >
                Parse pasted script
              </button>
              {data ? (
                <button
                  type="button"
                  onClick={() => {
                    setData(null)
                    setRaw(null)
                    setErr(null)
                    setTab('overview')
                  }}
                  className="rounded-lg px-3 py-2 text-sm text-basalt-100/70 hover:text-basalt-50"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>

          {err ? (
            <p
              className="mt-4 rounded-lg border border-copper-500/40 bg-copper-500/10 px-3 py-2 text-sm text-ember-300"
              role="status"
            >
              {err}
            </p>
          ) : null}
        </section>

        {data && clean ? (
          <>
            <div className="mt-8 flex flex-col gap-3 border-b border-basalt-800/80 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Container sections">
                {tabs.map((t) => {
                  const active = tab === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={[
                        'rounded-full px-3.5 py-1.5 text-sm font-medium transition',
                        active
                          ? 'bg-basalt-100 text-basalt-950 shadow-sm'
                          : 'bg-basalt-800/50 text-basalt-100/80 hover:bg-basalt-800',
                      ].join(' ')}
                      onClick={() => setTab(t.id)}
                      title={t.hint}
                    >
                      {t.label}
                    </button>
                  )
                })}
              </div>
              <div className="flex w-full min-w-0 flex-1 items-center gap-2 sm:max-w-sm sm:justify-end">
                <label className="sr-only" htmlFor="filter">
                  Filter rows
                </label>
                <input
                  id="filter"
                  className="w-full rounded-lg border border-basalt-700 bg-basalt-950/50 px-3 py-1.5 text-sm outline-none focus:border-copper-500/80"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Filter current tab…"
                />
              </div>
            </div>

            <p className="mt-2 text-xs text-basalt-100/50">{tabs.find((t) => t.id === tab)?.hint}</p>

            {tab === 'tracking' ? (
              <TrackingReadout
                insights={trackingInsights.filter(filterTracking)}
              />
            ) : null}

            {tab === 'overview' ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Stat
                  label="Resource version"
                  value={summary.version ?? '-'}
                />
                <Stat label="Tags" value={String(summary.tagCount)} />
                <Stat label="Variables (macros)" value={String(summary.macroCount)} />
                <Stat label="Predicates" value={String(summary.predicateCount)} />
                <Stat label="Rules" value={String(summary.ruleCount)} />
                <div className="rounded-xl border border-basalt-800/90 bg-basalt-900/30 p-4 sm:col-span-2 lg:col-span-1">
                  <p className="text-xs font-medium text-basalt-100/60">Bytes loaded</p>
                  <p className="mt-1 font-mono text-2xl text-basalt-50">
                    {raw ? `${(raw.length / 1024).toFixed(1)} KB` : '-'}
                  </p>
                </div>
              </div>
            ) : null}

            {tab === 'tags' ? (
              <JsonList rows={tagRows.filter(filterStr)} empty="No tags in this snapshot." />
            ) : null}
            {tab === 'predicates' ? (
              <JsonList
                rows={predRows.filter(filterStr)}
                empty="No predicates in this snapshot."
              />
            ) : null}
            {tab === 'macros' ? (
              <JsonList
                rows={macroRows.filter(filterStr)}
                empty="No macros in this snapshot."
              />
            ) : null}
            {tab === 'rules' ? (
              <div className="mt-4 rounded-xl border border-basalt-800/80 bg-basalt-950/30 p-3">
                <pre className="max-h-[min(60vh,640px)] overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-basalt-100/90">
                  {JSON.stringify(rules, null, 2)}
                </pre>
              </div>
            ) : null}
            {tab === 'json' ? (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => downloadJson('tag-foundry-clean.json', clean)}
                    className="rounded-lg bg-copper-500 px-3 py-2 text-sm font-semibold text-basalt-950 hover:bg-copper-400"
                  >
                    Download clean snapshot
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      resource
                        ? downloadJson('tag-foundry-resource.json', resource)
                        : undefined
                    }
                    className="rounded-lg border border-basalt-600 bg-basalt-800/40 px-3 py-2 text-sm font-medium text-basalt-50 hover:bg-basalt-800"
                  >
                    Download resource only
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(JSON.stringify(clean, null, 2))
                      } catch {
                        setErr('Clipboard not available in this context.')
                      }
                    }}
                    className="rounded-lg px-3 py-2 text-sm text-basalt-100/80 hover:text-basalt-50"
                  >
                    Copy clean JSON
                  </button>
                </div>
                <div className="rounded-xl border border-basalt-800/80 bg-basalt-950/30 p-3">
                  <pre className="max-h-[min(60vh,720px)] overflow-auto font-mono text-xs leading-relaxed text-basalt-100/90">
                    {JSON.stringify(clean, null, 2)}
                  </pre>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="mt-10 rounded-2xl border border-dashed border-basalt-800/80 bg-basalt-900/20 p-8 text-center text-basalt-100/60">
            <p className="font-display text-lg text-basalt-100/80">Ready when you are</p>
            <p className="mt-2 text-sm">
              Fetch a container or paste a script to turn a minified <span className="text-basalt-100">gtm.js</span>{' '}
              into something you can read and version.
            </p>
          </div>
        )}
      </main>

      <footer className="mt-10 border-t border-basalt-800/60 py-6 text-center text-xs text-basalt-100/40">
        Tag Foundry is an independent tool; Google Tag Manager is a trademark of Google LLC.
      </footer>
    </div>
  )
}

function TrackingReadout({ insights }: { insights: TagTrackingInsight[] }) {
  return (
    <div className="mt-5 space-y-4">
      <div className="rounded-xl border border-copper-500/25 bg-copper-500/5 px-4 py-3 text-sm text-basalt-100/90">
        <p className="font-medium text-basalt-50">What you’d see in GTM Preview</p>
        <p className="mt-1 text-basalt-100/80">
          Firing rules are inferred from the public <code className="font-mono text-ember-300/95">rules</code> and{' '}
          <code className="font-mono text-ember-300/95">predicates</code> in <code className="font-mono text-ember-300/95">gtm.js</code>. “If”
          lists are <strong className="text-basalt-50">OR</strong> (any match). “Except when” is an UNLESS block. Consent,
          tag sequencing, and server containers are not fully represented here. Use GTM for edge cases.
        </p>
      </div>

      {insights.length === 0 ? (
        <p className="text-sm text-basalt-100/60">No tags in this snapshot.</p>
      ) : (
        <ul className="space-y-4">
          {insights.map((ins) => (
            <li
              key={ins.slotIndex}
              className={[
                'rounded-2xl border p-4 sm:p-5',
                ins.notInRuleTable
                  ? 'border-amber-500/35 bg-amber-500/[0.06]'
                  : 'border-basalt-800/90 bg-basalt-900/35',
              ].join(' ')}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-display text-lg text-basalt-50">
                  Tag ID {ins.gtmTagId ?? '-'}{" "}
                  <span className="text-basalt-100/70">·</span>{' '}
                  <span className="font-sans text-base font-medium text-ember-300/95">{ins.typeLabel}</span>
                </h3>
                <span className="font-mono text-xs text-basalt-100/45">slot {ins.slotIndex}</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-basalt-100/88">{ins.purpose}</p>

              {ins.notInRuleTable ? (
                <p className="mt-3 text-xs text-amber-200/80">
                  Not listed in the public <code className="font-mono">rules</code> table (paused, fired only from another
                  tag’s setup, consent mode, or a trigger type compiled elsewhere). Check the Tags tab for full JSON.
                </p>
              ) : null}

              {ins.details.length > 0 ? (
                <ul className="mt-3 list-inside list-disc space-y-0.5 text-sm text-basalt-100/75">
                  {ins.details.slice(0, 8).map((d, i) => (
                    <li key={i} className="font-mono text-xs">
                      {d}
                    </li>
                  ))}
                </ul>
              ) : null}

              {!ins.notInRuleTable && ins.scenarios.length > 0 ? (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-basalt-100/50">
                    Fires when
                  </p>
                  <ul className="mt-2 space-y-3">
                    {ins.scenarios.map((s, si) => (
                      <li
                        key={si}
                        className="rounded-lg border border-basalt-800/80 bg-basalt-950/40 p-3"
                      >
                        <p className="text-sm leading-snug text-basalt-50">{s.summary}</p>
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-copper-400/95 hover:text-copper-300">
                            Predicate breakdown
                          </summary>
                          <ul className="mt-2 space-y-1.5 border-t border-basalt-800/60 pt-2 text-xs text-basalt-100/75">
                            {s.predicateDetails.map((p) => (
                              <li key={p.id}>
                                <span className="font-mono text-basalt-100/45">#{p.id}</span> {p.text}
                              </li>
                            ))}
                          </ul>
                        </details>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-basalt-800/90 bg-basalt-900/30 p-4">
      <p className="text-xs font-medium text-basalt-100/60">{label}</p>
      <p className="mt-1 font-mono text-2xl text-basalt-50">{value}</p>
    </div>
  )
}

function JsonList({ rows, empty }: { rows: Record<string, unknown>[]; empty: string }) {
  if (!rows.length) {
    return <p className="mt-6 text-sm text-basalt-100/55">{empty}</p>
  }
  return (
    <ul className="mt-4 space-y-2">
      {rows.map((row, i) => (
        <li
          key={i}
          className="rounded-xl border border-basalt-800/80 bg-basalt-950/25 p-3"
        >
          <pre className="max-h-48 overflow-auto font-mono text-xs leading-relaxed text-basalt-100/90">
            {JSON.stringify(row, null, 2)}
          </pre>
        </li>
      ))}
    </ul>
  )
}
