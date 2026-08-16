import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'next-themes'
import { AppearanceMenu } from '@/ui/AppearanceMenu'
import { appStore } from '@/store/store'

function reset() {
  localStorage.clear()
  appStore.getState().setViewportBg({ preset: 'checkerboard', customColor: '#808080' })
  document.documentElement.classList.remove('dark')
}

function renderMenu() {
  return render(
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="dithrrd.theme.v1">
      <AppearanceMenu />
    </ThemeProvider>,
  )
}

describe('AppearanceMenu', () => {
  beforeEach(reset)

  it('opens to show theme and image-background controls', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(screen.getByRole('button', { name: /appearance settings/i }))
    expect(await screen.findByRole('radio', { name: /dark/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^white$/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/custom image background color/i)).toBeInTheDocument()
  })

  it('switches the UI theme to dark and flips the html class', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(screen.getByRole('button', { name: /appearance settings/i }))
    await user.click(await screen.findByRole('radio', { name: /dark/i }))
    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })
  })

  it('changes the image background preset independently of the UI theme', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(screen.getByRole('button', { name: /appearance settings/i }))
    await user.click(await screen.findByRole('button', { name: /^white$/i }))
    expect(appStore.getState().viewportBg.preset).toBe('white')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('sets a custom background color from the color input', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(screen.getByRole('button', { name: /appearance settings/i }))
    const colorInput = await screen.findByLabelText(/custom image background color/i)
    fireEvent.change(colorInput, { target: { value: '#123456' } })
    expect(appStore.getState().viewportBg).toEqual({ preset: 'custom', customColor: '#123456' })
  })
})
