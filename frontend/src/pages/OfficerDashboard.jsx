import { CheckCircle, Clock, AlertTriangle } from 'lucide-react'
import { Card, StatusBadge, timeUntil } from '../components/UI'
import { api } from '../services/api'

export function OfficerDashboard({
  token,
  user,
  inbox,
  slaStatus,
  slaInput,
  setSlaInput,
  slaConfig,
  handleUpdateSLA,
  loadInbox,
  showMessage
}) {

  const handleUpdateStatus = async (reportId, newStatus) => {
    const result = await api.updateStatus(token, reportId, newStatus)
    if (result.success) {
      showMessage(`Status updated to ${newStatus}`)
      loadInbox()
    } else {
      showMessage(result.error, true)
    }
  }

  return (
    <div className="grid grid-cols-12 gap-8">
      {/* Main Inbox */}
      <div className="col-span-8">
        <div className="flex items-center justify-between mb-6">
          <div>
             <h2 className="text-2xl font-bold text-white">Agency Inbox</h2>
             <p className="text-zinc-400 text-sm">Manage and resolve citizen reports assigned to {user.agency}</p>
          </div>
          <div className="flex gap-2 text-sm text-zinc-500 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg">
             <span>Total Cases: <span className="text-white font-medium">{inbox.length}</span></span>
          </div>
        </div>

        <div className="space-y-4">
          {inbox.length === 0 ? (
             <div className="bg-zinc-900/50 border border-zinc-800 p-12 text-center rounded-xl">
               <CheckCircle className="w-12 h-12 text-zinc-800 mx-auto mb-4" />
               <h3 className="text-zinc-300 font-medium">All Caught Up!</h3>
               <p className="text-zinc-500 text-sm">No pending cases in your inbox.</p>
             </div>
          ) : (
             inbox.map(c => (
               <Card key={c.report_id} className="p-5 hover:border-zinc-700 transition-all group">
                 <div className="flex justify-between items-start mb-3">
                   <div className="flex items-center gap-3">
                     <StatusBadge status={c.status} />
                     <span className="text-xs text-zinc-500 font-mono">ID: {c.report_id.slice(0,8)}</span>
                   </div>
                   <span className="text-xs text-zinc-500">From: {c.reporter_user_id || 'Anonymous'}</span>
                 </div>

                 <p className="text-base text-zinc-200 mb-6">{c.content}</p>

                 <div className="flex items-center justify-between pt-4 border-t border-zinc-800/50">
                   <div className="text-xs text-zinc-500 flex gap-4">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date().toLocaleDateString()}</span>
                   </div>
                   <div className="flex gap-2">
                     {c.status !== 'IN_PROGRESS' && c.status !== 'RESOLVED' && (
                       <button onClick={() => handleUpdateStatus(c.report_id, 'IN_PROGRESS')}
                         className="px-3 py-1.5 bg-blue-600/10 text-blue-500 hover:bg-blue-600 hover:text-white border border-blue-600/20 rounded text-xs font-medium transition-all">
                         Start Progress
                       </button>
                     )}
                     {c.status !== 'RESOLVED' && (
                       <button onClick={() => handleUpdateStatus(c.report_id, 'RESOLVED')}
                         className="px-3 py-1.5 bg-green-600/10 text-green-500 hover:bg-green-600 hover:text-white border border-green-600/20 rounded text-xs font-medium transition-all">
                         Mark Resolved
                       </button>
                     )}
                     {c.status === 'RESOLVED' && <span className="text-xs text-green-500 flex items-center gap-1"><CheckCircle className="w-3 h-3"/> Complete</span>}
                   </div>
                 </div>
               </Card>
             ))
          )}
        </div>
      </div>

      {/* Right Sidebar: SLA Monitor */}
      <div className="col-span-4 space-y-6">
        <Card className="p-5 border-orange-500/20 bg-orange-500/5">
           <h3 className="font-semibold text-orange-200 mb-1 flex items-center gap-2">
             <AlertTriangle className="w-4 h-4"/> SLA Monitor
           </h3>
           <p className="text-xs text-orange-200/60 mb-4">Real-time tracking of resolution deadlines.</p>

           <div className="space-y-2">
              {slaStatus.slice(0,8).map(s => (
                <div key={s.report_id} className="bg-zinc-900 border border-zinc-800 p-3 rounded-lg flex justify-between items-center">
                   <div>
                     <div className="flex items-center gap-2 mb-1">
                       <span className="text-xs font-mono text-zinc-500">{s.report_id.slice(0,6)}</span>
                       {s.is_overdue && <span className="text-[10px] bg-red-500 text-white px-1 rounded font-bold">LATE</span>}
                     </div>
                     <StatusBadge status={s.sla_status} />
                   </div>
                   <div className="text-right">
                     <span className="text-xs text-zinc-400 block">Due in</span>
                     <span className={`text-xs font-mono font-medium ${s.is_overdue ? 'text-red-500' : 'text-zinc-200'}`}>
                       {timeUntil(s.due_at)}
                     </span>
                   </div>
                </div>
              ))}
           </div>
        </Card>

        {/* Config */}
        <Card className="p-4">
          <h4 className="text-sm font-medium text-zinc-400 mb-3">System Config</h4>
          <div className="flex gap-2">
             <input type="number" value={slaInput} onChange={e => setSlaInput(e.target.value)}
               className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 w-20 text-sm text-white focus:border-blue-500 outline-none"/>
             <button onClick={handleUpdateSLA} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white text-xs rounded transition-colors">
               Update SLA Secs
             </button>
          </div>
           <p className="text-[10px] text-zinc-500 mt-2 text-center">Current Global SLA: {slaConfig.sla_duration_str}</p>
        </Card>
      </div>
    </div>
  )
}
