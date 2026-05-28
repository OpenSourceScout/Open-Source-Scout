import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const SITE = 'Open Source Scout'

const ROUTE_TITLES = {
  '/': `${SITE} — Find Good First Issues & Beginner Open Source Help`,
  '/login': `Sign In | ${SITE}`,
  '/signup': `Sign Up | ${SITE}`,
  '/dashboard': `Dashboard | ${SITE}`,
  '/analysis': `Analysis | ${SITE}`,
  '/analysis/repositories': `Repositories | ${SITE}`,
  '/analysis/issues': `Issue Analysis | ${SITE}`,
  '/analysis/code': `Code Locator | ${SITE}`,
  '/analysis/briefing': `Contributor Briefing | ${SITE}`,
  '/analysis/qa-report': `QA Report | ${SITE}`,
  '/editor': `Editor | ${SITE}`,
  '/profile': `Profile | ${SITE}`,
  '/projects': `My Projects | ${SITE}`,
  '/admin/decision-trace': `Decision Trace | ${SITE}`,
  '/admin/agent-memory': `Agent Memory | ${SITE}`,
}

export function PageTitleUpdater() {
  const { pathname } = useLocation()

  useEffect(() => {
    document.title =
      ROUTE_TITLES[pathname] ||
      `${SITE} — Open Source Contribution Help for Beginners`
  }, [pathname])

  return null
}
