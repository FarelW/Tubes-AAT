import { useState } from 'react'
import { Shield, LayoutDashboard, User, ChevronRight, Clock, Settings } from 'lucide-react'
import { Card } from '../components/UI'

export function Login({ handleLogin, slaInput, setSlaInput, handleUpdateSLA }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="max-w-5xl w-full grid grid-cols-1 md:grid-cols-2 gap-12 items-center">

        {/* Intro Section */}
        <div className="space-y-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight text-white">Citizen Reporting System</h1>
            <p className="text-zinc-400 text-lg">A modern, event-driven microservices PoC.</p>
          </div>

          <div className="space-y-4">
            <Card className="p-4 bg-zinc-900/50 border-zinc-800/10">
              <h3 className="font-semibold text-zinc-100 flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-blue-500" /> Secure & Dedicated
              </h3>
              <p className="text-sm text-zinc-400">
                Reports are routed to specific agencies (Infrastructure, Health, Safety) based on category.
                Only authorized officers can view their agency's reports.
              </p>
            </Card>

            <Card className="p-4 bg-zinc-900/50 border-zinc-800/10">
              <h3 className="font-semibold text-zinc-100 flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-orange-500" /> SLA & Escalation
              </h3>
              <p className="text-sm text-zinc-400">
                Each report has a strict SLA deadline. If not resolved in time, the system automatically
                escalates the issue and notifies supervisors.
              </p>
            </Card>
          </div>

          {/* SLA Settings */}
          <div className="pt-6 border-t border-zinc-800">
            <h4 className="text-sm font-medium text-zinc-500 mb-3 flex items-center gap-2">
              <Settings className="w-4 h-4" /> System Control (PoC)
            </h4>
            <div className="flex gap-2 items-center">
              <div className="relative">
                <input
                  type="number"
                  value={slaInput}
                  onChange={e => setSlaInput(e.target.value)}
                  className="bg-zinc-900 border border-zinc-700 text-white text-sm rounded-lg pl-3 pr-12 py-2 w-32 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                />
                <span className="absolute right-3 top-2 text-zinc-500 text-xs text-sm">sec</span>
              </div>
              <button onClick={handleUpdateSLA} className="text-sm px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors">
                Update SLA
              </button>
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              Default: 60s. Set to 10-30s to test auto-escalation quickly.
            </p>
          </div>
        </div>

        {/* Login Section */}
        <Card className="p-8 shadow-2xl shadow-blue-900/10 border-zinc-800 bg-zinc-900/80 backdrop-blur-xl">
          <div className="mb-8 text-center">
            <div className="w-12 h-12 bg-blue-600 rounded-xl mx-auto mb-4 flex items-center justify-center">
              <LayoutDashboard className="text-white w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-white">Select User Role</h2>
            <p className="text-sm text-zinc-400">Click a user to login instantly</p>
          </div>

          <div className="space-y-6">
            <div>
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3 block">Citizens (Reporters)</label>
              <div className="grid grid-cols-1 gap-2">
                {['citizen1', 'citizen2', 'citizen3'].map(u => (
                  <button key={u} onClick={() => handleLogin(u, 'password', 'citizen')}
                    className="flex items-center justify-between p-3 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 rounded-lg group transition-all">
                    <span className="text-sm font-medium text-zinc-300 group-hover:text-white flex items-center gap-2">
                      <User className="w-4 h-4 text-zinc-500" /> {u}
                    </span>
                    <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400" />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3 block">Officers (Resolvers)</label>
              <div className="grid grid-cols-1 gap-2">
                {[
                  { u: 'officer1', agency: 'Infrastructure', color: 'text-blue-400', border: 'group-hover:border-blue-500/50' },
                  { u: 'officer2', agency: 'Health', color: 'text-emerald-400', border: 'group-hover:border-emerald-500/50' },
                  { u: 'officer3', agency: 'Safety', color: 'text-orange-400', border: 'group-hover:border-orange-500/50' }
                ].map(o => (
                  <button key={o.u} onClick={() => handleLogin(o.u, 'password', 'officer')}
                    className={`flex items-center justify-between p-3 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 ${o.border} rounded-lg group transition-all`}>
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-md bg-zinc-900 ${o.color.replace('text-', 'bg-')}/10`}>
                        <Shield className={`w-4 h-4 ${o.color}`} />
                      </div>
                      <div className="text-left">
                        <span className="text-sm font-medium text-zinc-300 group-hover:text-white block capitalize">
                          {o.u.replace(/(\d+)/, ' $1')}
                        </span>
                        <span className={`text-xs ${o.color} opacity-80`}>{o.agency} Agency</span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
