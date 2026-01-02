import { useState } from 'react'
import { Send, Info, Activity, Bell, ThumbsUp } from 'lucide-react'
import { Card, StatusBadge } from '../components/UI'
import { api } from '../services/api'

export function CitizenDashboard({
  token,
  myReports,
  publicReports,
  notifications,
  loadMyReports,
  loadPublicReports,
  showMessage
}) {
  const [reportContent, setReportContent] = useState('')
  const [reportVisibility, setReportVisibility] = useState('PUBLIC')
  const [reportCategory, setReportCategory] = useState('infrastruktur')
  const [loading, setLoading] = useState(false)

  const handleCreateReport = async () => {
    if (!reportContent.trim()) return showMessage('Content cannot be empty', true)
    setLoading(true)
    const result = await api.createReport(token, reportContent, reportVisibility, reportCategory)
    if (result.success) {
      showMessage('Report submitted successfully')
      setReportContent('')
      loadMyReports() // Refresh parent state
    } else {
      showMessage(result.error, true)
    }
    setLoading(false)
  }

  const handleUpvote = async (reportId) => {
    await api.upvote(token, reportId)
    loadPublicReports()
  }

  return (
    <div className="grid grid-cols-12 gap-8">

      {/* Left Col: Main Actions */}
      <div className="col-span-12 lg:col-span-8 space-y-8">

        {/* Create Report */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
            <Send className="w-5 h-5 text-blue-500" /> New Report
          </h2>
          <p className="text-zinc-400 text-sm mb-6">Submit a validated report to the relevant city agency.</p>

          <div className="space-y-4">
            <div>
              <textarea
                value={reportContent} onChange={e => setReportContent(e.target.value)}
                placeholder="Describe the issue clearly..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-zinc-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-zinc-600 min-h-[120px]"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-500 ml-1">Category</label>
                <select
                  value={reportCategory} onChange={e => setReportCategory(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 focus:border-blue-500 outline-none text-sm appearance-none"
                >
                  <option value="infrastruktur">🏗️ Infrastructure (Roads, Bridges)</option>
                  <option value="kesehatan">🏥 Health (Sanitation, Outbreaks)</option>
                  <option value="keamanan">👮 Safety (Patrols, Hazards)</option>
                  <option value="kebersihan">🧹 Cleanliness (Waste, Garbage)</option>
                  <option value="kriminalitas">🚨 Crime (Theft, Vandalism)</option>
                  <option value="lainnya">📦 Other</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-500 ml-1">Visibility</label>
                <select
                  value={reportVisibility} onChange={e => setReportVisibility(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 focus:border-blue-500 outline-none text-sm appearance-none"
                >
                  <option value="PUBLIC">🌐 Public (Visible to all)</option>
                  <option value="ANONYMOUS">🕵️ Anonymous (Hide identity)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" />
                Report will be routed to <span className="text-zinc-300 font-medium">
                  {reportCategory === 'kesehatan' ? 'Health Agency' :
                   (reportCategory === 'keamanan' || reportCategory === 'kriminalitas') ? 'Safety Agency' : 'Infrastructure Agency'}
                </span>
              </p>
              <button onClick={handleCreateReport} disabled={loading}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors disabled:opacity-50 text-sm">
                {loading ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </div>
        </Card>

        {/* My Reports Timeline */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white px-1">My Reports History</h3>
          {myReports.length === 0 ? (
            <div className="text-center p-8 bg-zinc-900/50 rounded-xl border border-zinc-800 border-dashed">
              <p className="text-zinc-500">No reports submitted yet.</p>
            </div>
          ) : (
            myReports.map(r => (
              <Card key={r.report_id} className="p-5 flex gap-4 transition-colors hover:border-zinc-700">
                <div className="shrink-0 pt-1">
                  <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
                    <Activity className="w-5 h-5 text-zinc-400" />
                  </div>
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <StatusBadge status={r.current_status} />
                      <span className="text-xs text-zinc-500 ml-2 font-mono">#{r.report_id.slice(0,8)}</span>
                    </div>
                    <span className="text-xs text-zinc-500 bg-zinc-800/50 px-2 py-1 rounded">{r.visibility}</span>
                  </div>
                  <p className="text-zinc-300 text-sm leading-relaxed">{r.content}</p>
                  <div className="flex items-center gap-4 pt-1">
                     <span className="text-xs text-zinc-500 flex items-center gap-1"><ThumbsUp className="w-3 h-3"/> {r.vote_count}</span>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Right Col: Feed & Notifs */}
      <div className="col-span-12 lg:col-span-4 space-y-6">

        {/* Notifications */}
        <Card className="p-0">
          <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
            <h3 className="font-semibold text-white flex items-center gap-2"><Bell className="w-4 h-4 text-orange-500"/> Notifications</h3>
            <span className="text-xs bg-orange-500/10 text-orange-500 px-2 py-0.5 rounded-full">{notifications.length}</span>
          </div>
          <div className="max-h-[300px] overflow-y-auto p-2 scrollbar-thin">
            {notifications.length === 0 ? <p className="text-zinc-500 text-sm p-4 text-center">No new updates.</p> :
              notifications.map(n => (
                <div key={n.id} className="p-3 hover:bg-zinc-800/50 rounded-lg transition-colors border-b border-zinc-800/50 last:border-0">
                  <p className="text-sm text-zinc-300">{n.message}</p>
                  <span className="text-xs text-zinc-500 mt-1 block">{new Date(n.created_at).toLocaleTimeString()}</span>
                </div>
              ))
            }
          </div>
        </Card>

        {/* Public Feed */}
        <Card className="p-0">
          <div className="p-4 border-b border-zinc-800">
             <h3 className="font-semibold text-white">Public Feed</h3>
          </div>
          <div className="divide-y divide-zinc-800">
            {publicReports.slice(0, 5).map(r => (
              <div key={r.report_id} className="p-4 hover:bg-zinc-800/30 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-medium text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded capitalize">{r.category}</span>
                  <button onClick={() => handleUpvote(r.report_id)}
                    className="text-xs flex items-center gap-1 text-zinc-400 hover:text-white transition-colors bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded">
                    <ThumbsUp className="w-3 h-3" /> {r.vote_count}
                  </button>
                </div>
                <p className="text-sm text-zinc-300 line-clamp-2 mb-1">{r.content}</p>
              </div>
            ))}
          </div>
        </Card>

      </div>
    </div>
  )
}
