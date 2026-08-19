/**
 * Two-character codes for effect types, used by the v2 share-link format.
 *
 * This table is APPEND-ONLY. An existing code must never change or be reused
 * for a different effect — shared links already in the wild are decoded with
 * it. New effects get a new unused code. Codes must not start with `x`, which
 * marks a disabled node in the wire format.
 *
 * `presetCodes.test.ts` locks both rules.
 */
export const EFFECT_CODES: Readonly<Record<string, string>> = Object.freeze({
  grade: 'gr',
  pixelate: 'px',
  bayer: 'by',
  halftone: 'ht',
  palette: 'pa',
  floyd: 'fs',
  atkinson: 'at',
  jarvis: 'ja',
  stucki: 'st',
  sierra: 'si',
  burkes: 'bu',
  clusteredDot: 'cd',
  lineScreen: 'ls',
  crosshatch: 'ch',
  duotone: 'du',
  perChannel: 'pc',
})

export const TYPE_BY_CODE: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(Object.entries(EFFECT_CODES).map(([type, code]) => [code, type])),
)
