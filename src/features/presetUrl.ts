import type { ParamValue, Palette, Params } from '@/effects/types'
import type { StackNode } from '@/engine/planPasses'
import type { Preset } from '@/features/preset'
import { parsePresetJson, PRESET_VERSION } from '@/features/preset'
import { EFFECT_CODES, TYPE_BY_CODE } from '@/features/presetCodes'
import { registry } from '@/effects/registry'
import { rgb01ToHex, hexToRgb01 } from '@/color/hex'

function base64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const V2_PREFIX = '2~'

/**
 * Percent-style escaping that survives `URLSearchParams.get()`, which would
 * silently decode real `%` escapes before our parser ever sees them. Keeps
 * `A-Za-z0-9`, encodes every other UTF-8 byte as `.` + two hex digits — so an
 * escaped string can never contain a `~`, `_` or `-` delimiter.
 */
function escText(s: string): string {
  let out = ''
  for (const b of new TextEncoder().encode(s)) {
    const c = String.fromCharCode(b)
    out += /[A-Za-z0-9]/.test(c) ? c : '.' + b.toString(16).padStart(2, '0')
  }
  return out
}

/** Compact decimal, with `-` swapped for `n` so it can't be read as a delimiter. */
function encodeNumber(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`cannot encode non-finite number: ${n}`)
  return String(n).replace(/-/g, 'n')
}

function encodeValue(value: ParamValue): string {
  if (typeof value === 'number') return encodeNumber(value)
  if (typeof value === 'boolean') return value ? '1' : '0'
  return escText(value)
}

export function encodePresetParam(preset: Preset): string {
  // Custom palettes travel by position, so their (UUID-length) ids never hit the wire.
  const indexById = new Map(preset.palettes.map((p, i) => [p.id, i]))

  const nodes = preset.stack.map((node) => {
    if (!Object.hasOwn(EFFECT_CODES, node.type)) throw new Error(`no share-link code for effect: ${node.type}`)
    const code = EFFECT_CODES[node.type]
    if (!Object.hasOwn(registry, node.type)) throw new Error(`unknown effect: ${node.type}`)
    const effect = registry[node.type]
    const paletteKeys = new Set(effect.controls.filter((c) => c.type === 'palette').map((c) => c.key))

    // One field per default-param key, in declaration order. A field is empty
    // when the value matches the default; trailing empties are dropped.
    const fields = Object.keys(effect.defaultParams).map((key) => {
      const value = node.params[key]
      if (value === undefined || value === effect.defaultParams[key]) return ''
      if (paletteKeys.has(key) && typeof value === 'string' && indexById.has(value)) {
        return String(indexById.get(value))
      }
      return encodeValue(value)
    })
    while (fields.length > 0 && fields[fields.length - 1] === '') fields.pop()

    return [(node.enabled ? '' : 'x') + code, ...fields].join('-')
  })

  const palettes = preset.palettes.map((p) => {
    // The decoder reads colors as fixed-width hex triplets and cannot represent
    // an empty run, so refuse here rather than hand out a link that won't open.
    if (p.colors.length === 0) throw new Error(`palette has no colors: ${p.name}`)
    return [escText(p.name), p.colors.map((c) => rgb01ToHex(c).slice(1)).join('')].join('-')
  })

  return V2_PREFIX + nodes.join('_') + (palettes.length > 0 ? '~' + palettes.join('_') : '')
}

function unescText(s: string): string {
  const bytes: number[] = []
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '.') {
      const hex = s.slice(i + 1, i + 3)
      if (!/^[0-9a-f]{2}$/.test(hex)) throw new Error('share link has a bad escape sequence')
      bytes.push(parseInt(hex, 16))
      i += 2
    } else {
      if (!/[A-Za-z0-9]/.test(c)) throw new Error(`share link has a stray character: ${c}`)
      bytes.push(c.charCodeAt(0))
    }
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes))
}

function decodeNumber(field: string): number {
  const n = Number(field.replace(/n/g, '-'))
  if (!Number.isFinite(n)) throw new Error(`share link has an invalid number: ${field}`)
  return n
}

function decodePalette(record: string): Palette {
  const fields = record.split('-')
  if (fields.length !== 2) throw new Error('share link has a malformed palette')
  const [name, hex] = fields
  if (hex.length === 0 || hex.length % 6 !== 0) throw new Error('share link has malformed palette colors')
  const colors: [number, number, number][] = []
  for (let i = 0; i < hex.length; i += 6) colors.push(hexToRgb01(hex.slice(i, i + 6)))
  // A fresh id: the sender's id never travels, and reusing a guessable one
  // could clobber a palette the recipient already has.
  return { id: crypto.randomUUID(), name: unescText(name), colors }
}

function decodeNode(record: string, index: number, palettes: Palette[]): StackNode {
  const fields = record.split('-')
  const enabled = !fields[0].startsWith('x')
  const code = enabled ? fields[0] : fields[0].slice(1)
  // hasOwn, not truthiness: the code comes from a URL, and a bare `constructor`
  // would otherwise resolve through Object.prototype.
  if (!Object.hasOwn(TYPE_BY_CODE, code)) throw new Error(`share link has an unknown effect code: ${code}`)
  const type = TYPE_BY_CODE[code]
  if (!Object.hasOwn(registry, type)) throw new Error(`share link references a missing effect: ${type}`)
  const effect = registry[type]

  const keys = Object.keys(effect.defaultParams)
  if (fields.length - 1 > keys.length) throw new Error(`share link has too many params for ${type}`)
  const paletteKeys = new Set(effect.controls.filter((c) => c.type === 'palette').map((c) => c.key))

  const params: Params = structuredClone(effect.defaultParams)
  for (let i = 1; i < fields.length; i++) {
    const field = fields[i]
    if (field === '') continue // empty field means "keep the default"
    const key = keys[i - 1]
    const fallback = effect.defaultParams[key]
    if (typeof fallback === 'number') params[key] = decodeNumber(field)
    else if (typeof fallback === 'boolean') params[key] = field === '1'
    else if (paletteKeys.has(key) && /^\d+$/.test(field) && Number(field) < palettes.length) {
      params[key] = palettes[Number(field)].id
    } else params[key] = unescText(field)
  }

  // Ids only need to be unique within the stack — loadPreset replaces it wholesale.
  return { id: `n${index}`, type, enabled, params }
}

function decodeV2(body: string): Preset {
  const sections = body.split('~')
  if (sections.length > 2) throw new Error('share link has too many sections')
  const [stackSection, paletteSection = ''] = sections
  const palettes = paletteSection === '' ? [] : paletteSection.split('_').map(decodePalette)
  const stack = stackSection === ''
    ? []
    : stackSection.split('_').map((record, i) => decodeNode(record, i, palettes))
  return { v: PRESET_VERSION, stack, palettes }
}

export function decodePresetParam(param: string): Preset {
  if (param.startsWith(V2_PREFIX)) return decodeV2(param.slice(V2_PREFIX.length))
  // Links shared before the short format existed: base64url of the preset JSON.
  const json = new TextDecoder().decode(base64UrlToBytes(param))
  return parsePresetJson(json)
}
