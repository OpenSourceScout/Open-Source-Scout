import { test, expect } from '@playwright/test'

test.describe('Live integration: UI + FastAPI + GitHub (unmocked)', () => {
  test.beforeEach(async ({ context }) => {
    test.skip(
      process.env.E2E_LIVE_BACKEND !== '1',
      'Set E2E_LIVE_BACKEND=1 with backend :8001 and Vite dev :5173',
    )
    await context.addInitScript(() => {
      window.localStorage.setItem('scout_access_token', 'e2e-live-token')
      window.localStorage.setItem(
        'scout_user',
        JSON.stringify({
          id: 1,
          email: 'e2e@live.local',
          display_name: 'E2E Live',
          role: 'user',
        }),
      )
    })
  })

  test('editor loads public README via backend Contents API', async ({ page }) => {
    await page.goto(
      '/editor?owner=octocat&repo=Hello-World&path=README.md&ref=HEAD',
    )

    await expect(page.getByText('PR Pipeline Editor')).toBeVisible()
    await expect(page.getByTestId('editor-monaco-wrapper')).toBeVisible({
      timeout: 90_000,
    })

    await expect(page.locator('.view-lines')).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('.view-lines')).toContainText(/hello|world/i, {
      timeout: 60_000,
    })
  })
})
