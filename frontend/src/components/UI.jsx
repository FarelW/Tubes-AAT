export function StatusBadge({ status }) {
  const styles = {
    'RECEIVED': 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    'IN_PROGRESS': 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    'RESOLVED': 'bg-green-500/10 text-green-500 border-green-500/20',
    'ESCALATED': 'bg-red-500/10 text-red-500 border-red-500/20',
    'PENDING': 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20',
    'COMPLETED': 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
  }
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status] || styles['PENDING']}`}>
      {status}
    </span>
  )
}

export function Card({ children, className = "" }) {
  return (
    <div className={`bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden ${className}`}>
      {children}
    </div>
  )
}

export function timeUntil(dateStr) {
  const diff = new Date(dateStr) - new Date()
  if (diff < 0) return "Overdue"
  const mins = Math.floor(diff / 60000)
  const secs = Math.floor((diff % 60000) / 1000)
  return `${mins}m ${secs}s`
}
