import { useMemo } from 'react'
import { ensureAnonUserId } from '../api'

export function useUser() {
  return useMemo(() => ({ anonymousUserId: ensureAnonUserId() }), [])
}
