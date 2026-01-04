import { Shield, MessageSquare, LogOut, CheckCircle, AlertTriangle } from 'lucide-react'

export function Layout({ children, role, user, handleLogout, message }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${role === 'citizen' ? 'bg-blue-600' : 'bg-emerald-600'}`}>
              {role === 'citizen' ? <MessageSquare className="w-5 h-5 text-white" /> : <Shield className="w-5 h-5 text-white" />}
            </div>
            <div>
              <h1 className="font-bold text-sm leading-tight text-zinc-100">{role === 'citizen' ? 'Citizen Portal' : 'Agency Operations'}</h1>
              <p className="text-xs text-zinc-500">Logged in as <span className="text-zinc-300 font-medium">{user.id}</span> {user.agency && `• ${user.agency}`}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Toast */}
      {message && (
        <div className={`fixed top-20 right-6 px-4 py-3 rounded-lg shadow-xl z-50 flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${message.isError ? 'bg-red-500/10 border border-red-500/20 text-red-200' : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-200'}`}>
          {message.isError ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
          <span className="text-sm font-medium">{message.text}</span>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  )
}
