export default function FeedbackToast({ message }) {
  if (!message) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-xl border border-primary-500/30 bg-app-surface px-4 py-2.5 text-sm font-medium text-app-text shadow-lg shadow-black/20"
    >
      {message}
    </div>
  )
}
