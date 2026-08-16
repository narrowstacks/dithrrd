import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor, SunMoon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { useStore } from '@/store/store'
import { VIEWPORT_BG_PRESETS, type ViewportBgPreset } from '@/features/uiPrefs'
import { viewportBgStyle } from '@/features/viewportBgStyle'

const THEME_OPTIONS = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
] as const

type FlatPreset = Exclude<ViewportBgPreset, 'custom'>

const BG_PRESET_LABELS: Record<FlatPreset, string> = {
  checkerboard: 'Checkerboard',
  white: 'White',
  lightGray: 'Light Gray',
  mediumGray: 'Medium Gray',
  darkGray: 'Dark Gray',
  black: 'Black',
}

const FLAT_PRESETS = VIEWPORT_BG_PRESETS.filter((p): p is FlatPreset => p !== 'custom')

// A popover (rather than the dropdown-menu used elsewhere in the toolbar) is
// used here because the "Custom" swatch embeds a native <input type="color">.
// Base UI's menu closes on outside pointer/focus events, which fights with
// opening the browser's native color picker; a plain popover has no such
// role="menu" dismissal semantics and holds interactive form controls cleanly.
export function AppearanceMenu() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  // next-themes only knows the resolved theme after the client mounts (it
  // reads localStorage/matchMedia post-hydration). Render a stable, theme-
  // agnostic trigger icon until then so we never flash the wrong icon.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const viewportBg = useStore((s) => s.viewportBg)
  const setViewportBg = useStore((s) => s.setViewportBg)

  const TriggerIcon = mounted ? (resolvedTheme === 'dark' ? Moon : Sun) : SunMoon

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Appearance settings">
            <TriggerIcon className="size-4" />
          </Button>
        }
      />
      <PopoverContent align="end">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Theme</p>
          <div className="flex gap-1" role="radiogroup" aria-label="Theme">
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
              const active = mounted && theme === value
              return (
                <Button
                  key={value}
                  type="button"
                  variant={active ? 'secondary' : 'outline'}
                  size="sm"
                  className="flex-1"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setTheme(value)}
                >
                  <Icon className="mr-1 size-3.5" /> {label}
                </Button>
              )
            })}
          </div>
        </div>
        <Separator />
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Image background</p>
          {/* 3 columns (not 4) at the popover's full width so the longest label
              — "Checkerboard" — fits on one line instead of overflowing its tile. */}
          <div className="grid grid-cols-3 gap-1.5">
            {FLAT_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                aria-label={BG_PRESET_LABELS[preset]}
                aria-pressed={viewportBg.preset === preset}
                onClick={() => setViewportBg({ ...viewportBg, preset })}
                className={`flex min-w-0 flex-col items-center gap-1 overflow-hidden rounded-md border p-1.5 text-muted-foreground hover:bg-accent ${
                  viewportBg.preset === preset ? 'border-primary text-foreground' : 'border-border'
                }`}
              >
                <span
                  className="size-6 shrink-0 rounded border"
                  style={viewportBgStyle({ preset, customColor: viewportBg.customColor })}
                  aria-hidden
                />
                <span className="w-full text-center text-[10px] leading-tight break-words">
                  {BG_PRESET_LABELS[preset]}
                </span>
              </button>
            ))}
            <label
              className={`flex min-w-0 cursor-pointer flex-col items-center gap-1 overflow-hidden rounded-md border p-1.5 text-muted-foreground hover:bg-accent ${
                viewportBg.preset === 'custom' ? 'border-primary text-foreground' : 'border-border'
              }`}
            >
              <input
                type="color"
                aria-label="Custom image background color"
                className="size-6 shrink-0 cursor-pointer rounded border bg-transparent p-0"
                value={viewportBg.customColor}
                onChange={(e) => setViewportBg({ preset: 'custom', customColor: e.target.value })}
              />
              <span className="w-full text-center text-[10px] leading-tight break-words">Custom</span>
            </label>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
