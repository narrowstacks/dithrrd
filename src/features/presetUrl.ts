import type { Preset } from '@/features/preset'
import { parsePresetJson } from '@/features/preset'

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function encodePresetParam(preset: Preset): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(preset)))
}

export function decodePresetParam(param: string): Preset {
  const json = new TextDecoder().decode(base64UrlToBytes(param))
  return parsePresetJson(json)
}
