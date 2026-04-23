/**
 * Heuristic interpretation of GTM’s public gtm.js `resource` (rules, predicates, tags).
 * This mirrors the mental model of GTM’s “Preview / Tag Assistant” for common shapes.
 */

export type TrackingScenario = {
  /** Plain-language, one rule chain (OR of if-predicates, with optional UNLESS). */
  summary: string
  /** Predicate ids referenced on this path */
  ifPredicateIds: number[]
  unlessPredicateIds: number[]
  /** How each predicate reads (same order as ids, deduped by id) */
  predicateDetails: { id: number; text: string }[]
}

export type TagTrackingInsight = {
  /** 0-based index in `resource.tags` (matches `add` in rules) */
  slotIndex: number
  gtmTagId: string | null
  /** Short name for the kind of tag */
  typeLabel: string
  /** What the tag is doing (sends, measurement id, custom HTML, etc.) */
  purpose: string
  /** Bullet points from vtp_* and related */
  details: string[]
  /** Firing scenarios from `rules` table */
  scenarios: TrackingScenario[]
  /** True if this slot never appears in an `add` in rules */
  notInRuleTable: boolean
}

const GTM_BUILTIN_EVENTS: Record<string, string> = {
  'gtm.js': 'All pages: container first load (each page, once when GTM runs)',
  'gtm.start': 'GTM started',
  'gtm.init_consent': 'Default consent (Consent Initialization)',
  'gtm.consent': 'Consent update',
  'gtm.dom': 'DOM ready',
  'gtm.load': 'Window loaded',
  'gtm.click': 'All element clicks (Click — All elements)',
  'gtm.linkClick': 'Link clicks (just links)' ,
  'gtm.formSubmit': 'Form submit',
  'gtm.formStart': 'Form start',
  'gtm.historyChange': 'History / SPA route change',
  'gtm.scrollDepth': 'Scroll depth (threshold)',
  'gtm.timer': 'Timer',
  'gtm.elementVisibility': 'Element visibility',
  'gtm.message': 'Message / postMessage',
  'gtm.yt': 'YouTube (video) events',
  gtm1: 'GTM internal',
  'gtm.triggerGroup': 'Trigger group',
  custom: 'Data Layer / custom event (check name in predicate)',
}

const TAG_TYPE_LABEL: Record<string, string> = {
  __e: 'Variable (Event)',
  __f: 'Variable (URL/fragment)',
  __u: 'Variable (URL / hostname / path)',
  __v: 'Variable (Data Layer / generic)',
  __aev: 'Variable (Auto event)',
  __gas: 'Variable (GA settings / UA ref)',
  __c: 'Variable (Constant)',
  __d: 'Variable (DOM)',
  __html: 'Custom HTML',
  __img: 'Custom image',
  __flc: 'Floodlight',
  __gclidw: 'GCLID (conversion linker helper)',
  __cl: 'Conversion Linker',
  __googtag: 'Google tag (config)',
  __ga4: 'GA4 (legacy name)',
  __gaawe: 'GA4 (Google Analytics: GA4 Event)',
  __gct: 'Google tag event',
  __ogt: 'Google opt-in',
  __ogt_ads_deny: 'Ads / consent',
  __ogt_sgtm: 'sGTM',
  __ua: 'Universal Analytics',
  __ga: 'Google Analytics (Universal, legacy)',
  __sp: 'Google tag / shared config',
  __bzi: 'LinkedIn Insight',
  __twitter_website_tag: 'X (Twitter) tag',
  __crl: 'Cookie reparation',
  __baut: 'Bing UET',
  __fsl: 'Form submission trigger (listener built into tag table)',
  __lcl: 'Link click trigger (listener)',
  __sdl: 'Scroll depth trigger (listener)',
  __paused: 'Paused (often keeps original type in vtp_originalTagType)',
  _detect_form_submit_events: 'Form detection (internal)',
  _detect_link_click_events: 'Link click detection (internal)',
  _detect_youtube_events: 'YouTube detection (internal)',
}

const PRED_FN: Record<string, string> = {
  _eq: 'equals',
  _cn: 'contains',
  _re: 'matches regex',
  _ew: 'ends with',
  _sw: 'starts with',
  _le: 'less than or equal',
  _lt: 'less than',
  _ge: 'greater or equal',
  _gt: 'greater than',
  _css: 'CSS selector (matches element)',
  _k: 'in list',
}

function str(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

function macroVarLabel(
  m: Record<string, unknown> | undefined,
  idx: number
): string {
  if (!m) return `variable #${idx}`
  const fn = typeof m.function === 'string' ? m.function : 'macro'
  if (fn === '__v' && m.vtp_name) return `Data Layer: ${str(m.vtp_name)}`
  if (fn === '__u' && m.vtp_component) return `URL component: ${str(m.vtp_component)}`
  if (fn === '__e') return 'Event name (GTM)'
  if (fn === '__f' && m.vtp_component) return `URL/fragment: ${str(m.vtp_component)}`
  if (fn === '__aev' && m.vtp_varType) return `Auto event: ${str(m.vtp_varType)}`
  if (fn === '__gas' && m.vtp_trackingId) return `UA / GA setting ref (${str(m.vtp_trackingId)})`
  if (fn === '__remm') return 'RegEx table / lookup'
  if (fn === '__d') return 'DOM / element'
  return `${fn.replace(/^__/, '') || 'macro'} [#${idx}]`
}

function describeEventValue(raw: string): string {
  if (GTM_BUILTIN_EVENTS[raw]) return GTM_BUILTIN_EVENTS[raw]!
  if (raw.startsWith('gtm.')) return `GTM event: ${raw}`
  if (raw) return `Data Layer event “${raw}”`
  return 'empty / custom'
}

export function describePredicate(
  p: Record<string, unknown> | undefined,
  macros: Record<string, unknown>[] | undefined,
  index: number
): string {
  if (!p) return `Predicate #${index} (missing)`
  const fn = (p.function as string) || 'predicate'
  const pFn = PRED_FN[fn] || fn
  const arg0 = p.arg0
  const arg1 = p.arg1
  if (arg0 == null) return `Predicate #${index}: ${fn} (incomplete predicate)`

  let left = 'value'
  if (Array.isArray(arg0) && arg0[0] === 'macro' && typeof arg0[1] === 'number') {
    const mi = arg0[1]
    const m = macros?.[mi] as Record<string, unknown> | undefined
    left = macroVarLabel(m, mi)
  } else {
    left = str(arg0)
  }

  const right = str(arg1)

  if (fn === '_eq') {
    if (left === 'Event name (GTM)' && typeof arg1 === 'string') {
      return `Event is “${arg1}” — ${describeEventValue(arg1)}`
    }
    if (String(left).toLowerCase().includes('url') && typeof arg1 === 'string') {
      return `${pFn} (${left}): “${arg1}”`
    }
    if (String(left).includes('HOST') || String(left).includes('hostname')) {
      return `Page host ${pFn} “${right}”`
    }
    return `${left} ${pFn} “${right}”`
  }
  if (fn === '_cn' || fn === '_sw' || fn === '_ew') {
    return `${left} ${pFn} “${right}”`
  }
  if (fn === '_re') {
    return `${left} ${pFn} /${String(arg1)}/`
  }
  if (fn === '_css' || fn === 'css' || (fn as string) === 'css') {
    return `Element matches CSS ${right}`
  }
  return `Predicate #${index}: ${fn} — ${left} vs “${right}”`
}

export function parseRuleChain(
  chain: unknown
): { ifOr: number[]; unless: number[]; add: number[] } | null {
  if (!Array.isArray(chain)) return null
  const ifOr: number[] = []
  const unless: number[] = []
  const add: number[] = []
  for (const el of chain) {
    if (!Array.isArray(el) || el.length < 1) continue
    const op = el[0]
    if (op === 'if') {
      for (const x of el.slice(1)) {
        if (typeof x === 'number' && !Number.isNaN(x)) ifOr.push(x)
        else if (typeof x === 'string' && /^\d+$/.test(x)) ifOr.push(Number(x))
      }
    } else if (op === 'unless') {
      for (const x of el.slice(1)) {
        if (typeof x === 'number' && !Number.isNaN(x)) unless.push(x)
        else if (typeof x === 'string' && /^\d+$/.test(x)) unless.push(Number(x))
      }
    } else if (op === 'add') {
      for (const x of el.slice(1)) {
        if (typeof x === 'number' && !Number.isNaN(x)) add.push(x)
        else if (typeof x === 'string' && /^\d+$/.test(x)) add.push(Number(x))
      }
    }
  }
  if (add.length === 0) return null
  return { ifOr, unless, add }
}

function oneLineSummary(
  ifOr: number[],
  unless: number[],
  describe: (id: number) => string
): string {
  const orPart =
    ifOr.length === 0
      ? 'No if-predicates (unusual in public containers)'
      : ifOr.length === 1
        ? describe(ifOr[0]!)
        : ifOr.map(describe).join('  OR  ')
  if (unless.length === 0) return orPart
  return `${orPart}  —  except when: ${unless.map(describe).join(' or ')}`
}

function buildScenarios(
  ifOr: number[],
  unless: number[],
  macros: Record<string, unknown>[],
  preds: Record<string, unknown>[]
): TrackingScenario {
  const describe = (id: number) => describePredicate(preds[id], macros, id)
  const ids = [...new Set([...ifOr, ...unless])].sort((a, b) => a - b)
  return {
    summary: oneLineSummary(ifOr, unless, describe),
    ifPredicateIds: ifOr,
    unlessPredicateIds: unless,
    predicateDetails: ids.map((id) => ({ id, text: describe(id) })),
  }
}

function getTagGtmId(tag: Record<string, unknown> | undefined): string | null {
  if (!tag) return null
  const t = tag.tag_id ?? tag.tagId
  if (t != null) return String(t)
  return null
}

function describeTagPurpose(tag: Record<string, unknown>): { typeLabel: string; purpose: string; details: string[] } {
  const details: string[] = []
  const fn = (tag.function as string) || 'unknown'
  const orig = tag.vtp_originalTagType
  const base = typeof orig === 'string' ? TAG_TYPE_LABEL[orig] || str(orig) : null
  let typeLabel = TAG_TYPE_LABEL[fn] || (fn || 'Tag').replace(/^__/, '')

  if (fn === '__paused' && base) {
    typeLabel = `Paused (${base})`
  } else if (['__fsl', '__lcl', '__sdl', '__ecl', '__hcl', '__smm'].some((x) => x === fn)) {
    const triggerKind =
      {
        __fsl: 'Form',
        __lcl: 'Link',
        __sdl: 'Scroll depth',
        __ecl: 'Error',
        __hcl: 'Click',
        __smm: 'Form submit (legacy)',
      }[fn] || 'Auto-event'
    typeLabel = `Trigger: ${triggerKind} listener`
  }

  const vtp: Record<string, string> = {}
  for (const [k, v] of Object.entries(tag)) {
    if (k.startsWith('vtp_') && k !== 'vtp_html' && v != null) {
      const key = k.replace(/^vtp_/, '')
      vtp[key] = typeof v === 'object' ? str(v) : str(v)
    }
  }
  if (fn === '__html' && tag.vtp_html) {
    const h = str(tag.vtp_html)
    details.push(`Custom HTML: ${h.length > 160 ? h.slice(0, 160) + '…' : h}`)
  } else {
    for (const key of [
      'eventName',
      'trackType',
      'eventCategory',
      'eventAction',
      'eventLabel',
      'measurementId',
      'tagId',
      'gaSettings',
      'trackingId',
    ]) {
      const v = (tag as Record<string, unknown>)[`vtp_${key}`]
      if (v != null && typeof v === 'string') details.push(`${key}: ${v}`)
      if (v != null && (typeof v === 'number' || typeof v === 'boolean')) details.push(`${key}: ${v}`)
    }
  }

  if (tag.vtp_measurementIdOverride) details.push(`GA4: ${str(tag.vtp_measurementIdOverride)}`)
  if (tag.vtp_tagId) details.push(`G tag / ID: ${str(tag.vtp_tagId)}`)
  if (tag.vtp_trackingId) details.push(`Property / UA: ${str(tag.vtp_trackingId)}`)
  if (tag.vtp_eventName) details.push(`Event name: ${str(tag.vtp_eventName)}`)
  if (tag.vtp_eventSettingsTable) {
    const s = str(tag.vtp_eventSettingsTable)
    if (s.length < 400) details.push(`Event params: ${s}`)
  }
  if (tag.vtp_uniqueTriggerId) details.push(`GTM internal trigger id: ${str(tag.vtp_uniqueTriggerId)}`)

  let purpose = 'Runs a tag in this container (see GTM for full configuration).'
  if (fn === '__html') purpose = 'Injects a Custom HTML block when it fires.'
  if (fn === '__ua' || fn === 'UA') {
    if (str(tag.vtp_trackType) === 'TRACK_PAGEVIEW') {
      purpose = 'Sends a Universal Analytics pageview (legacy UA) when it fires.'
    } else {
      purpose = 'Sends a Universal Analytics event when it fires.'
    }
  }
  if (fn === '__gaawe' || fn === 'ga4') {
    purpose = 'Sends a Google Analytics 4 (GA4) event when it fires.'
  }
  if (fn === '__googtag') purpose = 'Loads the Google tag (config / gtag) when it fires.'
  if (fn === '__cl' || fn === 'Conversion Linker') {
    purpose = 'Stores ad-click information for better attribution (Conversion Linker).'
  }
  if (['__fsl', '__lcl', '__sdl'].includes(fn)) {
    purpose = 'GTM’s compiled listener/validator for a built-in trigger type (clicks, forms, scroll).'
  }
  if (Object.keys(vtp).length > 0 && !details.length) {
    const brief = Object.entries(vtp)
      .slice(0, 4)
      .map(([a, b]) => `${a}: ${b.length > 60 ? b.slice(0, 60) + '…' : b}`)
    details.push(...brief)
  }
  if (!details.length) {
    for (const [k, v] of Object.entries(tag)) {
      if (k === 'function' || k === 'metadata' || k === 'tag_id' || k === 'priority' || k === 'once_per_event' || k === 'once_per_load' || k === 'setup_tags') {
        if (k === 'setup_tags') {
          const s = str(v)
          if (s && s.length < 200) {
            details.push('Setup / sequencing: ' + s)
          }
        }
        continue
      }
    }
  }

  return { typeLabel, purpose, details }
}

export function interpretResourceTracking(
  resource: Record<string, unknown> | undefined
): TagTrackingInsight[] {
  if (!resource) return []
  const tags = Array.isArray(resource.tags) ? (resource.tags as Record<string, unknown>[]) : []
  const preds = Array.isArray(resource.predicates) ? (resource.predicates as Record<string, unknown>[]) : []
  const macros = Array.isArray(resource.macros) ? (resource.macros as Record<string, unknown>[]) : []
  const rules = Array.isArray(resource.rules) ? (resource.rules as unknown[]) : []

  const bySlot: Map<
    number,
    { ifOr: number[]; unless: number[]; add: number[] }[]
  > = new Map()
  for (const chain of rules) {
    const parsed = parseRuleChain(chain)
    if (!parsed) continue
    for (const slot of parsed.add) {
      const ar = bySlot.get(slot) ?? []
      ar.push({ ifOr: parsed.ifOr, unless: parsed.unless, add: [slot] })
      bySlot.set(slot, ar)
    }
  }

  return tags.map((tag, slotIndex) => {
    const { typeLabel, purpose, details: det } = describeTagPurpose(tag)
    const gtmId = getTagGtmId(tag)
    const chains = bySlot.get(slotIndex) ?? []
    const scenarios: TrackingScenario[] = chains.map((c) =>
      buildScenarios(c.ifOr, c.unless, macros, preds)
    )

    return {
      slotIndex,
      gtmTagId: gtmId,
      typeLabel,
      purpose,
      details: det,
      scenarios,
      notInRuleTable: scenarios.length === 0,
    } satisfies TagTrackingInsight
  })
}

/**
 * For filters: flat string of insight
 */
export function insightSearchBlob(ins: TagTrackingInsight): string {
  return [ins.gtmTagId, ins.typeLabel, ins.purpose, ...ins.details, ...ins.scenarios.map((s) => s.summary), ...ins.scenarios.flatMap((s) => s.predicateDetails.map((p) => p.text))].filter(Boolean).join(' ').toLowerCase()
}
