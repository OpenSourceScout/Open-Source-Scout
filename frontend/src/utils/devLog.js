/** Log only in Vite dev builds — stripped from production bundle noise. */
export function devDebug(...args) {
  if (import.meta.env.DEV) {
    console.debug(...args)
  }
}
