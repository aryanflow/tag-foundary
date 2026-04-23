export type GtmErrorCode =
  | 'not_found'
  | 'unclosed'
  | 'parse'
  | 'no_resource'
  | 'invalid_id'

export class GtmError extends Error {
  readonly code: GtmErrorCode
  constructor(code: GtmErrorCode, message: string) {
    super(message)
    this.name = 'GtmError'
    this.code = code
  }
}

const STRIP_ROOT_KEYS = [
  'runtime',
  'blob',
  'permissions',
  'security_groups',
  'entities',
] as const

export function isValidContainerId(id: string): boolean {
  return /^GTM-[A-Z0-9]+$/i.test(id.trim())
}

const DATA_DECL = /\b(?:var|let|const)\s+data\s*=\s*/

/**
 * Extract the first `var/let/const data = { ... }` object from gtm.js
 * (balanced braces, respecting double-quoted strings and escapes).
 */
export function extractDataObjectLiteral(js: string): string {
  const m = DATA_DECL.exec(js)
  if (!m) {
    throw new GtmError(
      'not_found',
      'No container payload found. Paste a full gtm.js response or use a public container id.'
    )
  }

  let i = m.index + m[0].length
  while (i < js.length && /\s/.test(js[i]!)) i++
  if (js[i] !== '{') {
    throw new GtmError('not_found', 'Container payload is not a plain object')
  }

  const start = i
  let depth = 0
  let inString = false
  let escape = false

  for (; i < js.length; i++) {
    const c = js[i]!
    if (inString) {
      if (escape) {
        escape = false
        continue
      }
      if (c === '\\') {
        escape = true
        continue
      }
      if (c === '"') {
        inString = false
        continue
      }
      continue
    }
    if (c === '"') {
      inString = true
      continue
    }
    if (c === '{') depth++
    if (c === '}') {
      depth--
      if (depth === 0) {
        return js.slice(start, i + 1)
      }
    }
  }
  throw new GtmError('unclosed', 'Unclosed container object in gtm.js')
}

function jsonOrJsObject(s: string): unknown {
  try {
    return JSON.parse(s) as unknown
  } catch {
    try {
      return (new Function(`return (${s})`) as () => unknown)()
    } catch (e) {
      throw new GtmError('parse', e instanceof Error ? e.message : 'Invalid container JSON')
    }
  }
}

export function parseGtmScript(js: string): unknown {
  const literal = extractDataObjectLiteral(js)
  return jsonOrJsObject(literal)
}

export function cleanGtmData(data: Record<string, unknown>) {
  const o = { ...data }
  for (const k of STRIP_ROOT_KEYS) {
    delete o[k]
  }
  return o
}

export function getResource(
  data: unknown
): Record<string, unknown> | undefined {
  if (!data || typeof data !== 'object') return undefined
  const r = (data as { resource?: unknown }).resource
  if (!r || typeof r !== 'object') return undefined
  return r as Record<string, unknown>
}

export function summarizeResource(resource: Record<string, unknown> | undefined) {
  if (!resource) {
    return {
      version: undefined,
      tagCount: 0,
      macroCount: 0,
      predicateCount: 0,
      ruleCount: 0,
    }
  }
  const version =
    typeof resource.version === 'string' ? resource.version : undefined
  const tags = Array.isArray(resource.tags) ? resource.tags : []
  const macros = Array.isArray(resource.macros) ? resource.macros : []
  const predicates = Array.isArray(resource.predicates)
    ? resource.predicates
    : []
  const rules = Array.isArray(resource.rules) ? resource.rules : []
  return {
    version,
    tagCount: tags.length,
    macroCount: macros.length,
    predicateCount: predicates.length,
    ruleCount: rules.length,
  }
}
