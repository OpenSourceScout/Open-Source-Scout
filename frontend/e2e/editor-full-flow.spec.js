import { test, expect } from '@playwright/test'

const FILE_BODY = '# scout e2e\nprint("ok")\n'

function authInitScript() {
  return () => {
    window.localStorage.setItem('scout_access_token', 'e2e-test-token')
    window.localStorage.setItem(
      'scout_user',
      JSON.stringify({
        id: 1,
        email: 'e2e@test.local',
        display_name: 'E2E',
        role: 'user',
      }),
    )
  }
}

async function mockBackend(page) {
  await page.route('**/api/**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()

    if (url.includes('/tree/with-analysis') && method === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ files: [], highlighted_count: 0, total: 0 }),
      })
    }

    if (url.includes('/repos/') && url.includes('/files/') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          content: FILE_BODY,
          path: 'src/hello.py',
          ref: 'main',
        }),
      })
    }

    if (url.includes('/push-batch') && method === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          commit_sha: 'e2eabc',
          branch: 'scout-e2e-branch',
          branch_url: 'https://github.com/e2e-user/testrepo/tree/scout-e2e-branch',
          fork_owner: 'e2e-user',
          fork_repo: 'testrepo',
          upstream_owner: 'testowner',
          upstream_repo: 'testrepo',
          pr_url:
            'https://github.com/testowner/testrepo/compare/main...e2e-user:scout-e2e-branch',
          files_count: 1,
        }),
      })
    }

    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'e2e: unmocked ' + url }),
    })
  })
}

test.describe('Editor: view, edit, diff review, push (slide coverage)', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.addInitScript(authInitScript())
    await mockBackend(page)
  })

  test('loads file, edits in Monaco, opens review diff, completes push', async ({ page }) => {
    await page.goto(
      '/editor?owner=testowner&repo=testrepo&path=src%2Fhello.py&ref=main',
    )

    await expect(page.getByText('PR Pipeline Editor')).toBeVisible()
    await expect(page.getByTestId('editor-monaco-wrapper')).toBeVisible({ timeout: 60_000 })

    const monaco = page.locator('.monaco-editor')
    await monaco.click({ timeout: 30_000 })
    await page.keyboard.press('Control+A')
    await page.keyboard.type('# edited by e2e\nprint("x")\n', { delay: 5 })

    await expect(page.getByText('🟠 Modified')).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: 'Review & Push' }).click()

    await expect(page.getByTestId('review-changes-modal')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Review changes' })).toBeVisible()

    await expect(page.locator('.review-diff')).toBeVisible()

    await page.getByRole('button', { name: /Final Push/ }).click()

    await expect(page.getByText(/Pushed/)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Open Pull Request →')).toBeVisible({ timeout: 15_000 })
  })
})
