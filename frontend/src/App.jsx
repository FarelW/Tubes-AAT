import { useState, useEffect } from 'react'
import './App.css'

// Services
import { api } from './services/api'

// Components
import { Layout } from './components/Layout'

// Pages
import { Login } from './pages/Login'
import { CitizenDashboard } from './pages/CitizenDashboard'
import { OfficerDashboard } from './pages/OfficerDashboard'

function App() {
  const [view, setView] = useState('login')
  const [role, setRole] = useState(null)
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState(null)

  // Shared Data
  const [myReports, setMyReports] = useState([])
  const [publicReports, setPublicReports] = useState([])
  const [inbox, setInbox] = useState([])
  const [notifications, setNotifications] = useState([])
  const [slaStatus, setSlaStatus] = useState([])

  // SLA Config
  const [slaConfig, setSlaConfig] = useState({ sla_duration_sec: 60 })
  const [slaInput, setSlaInput] = useState(60)

  const refreshInterval = 5000

  const showMessage = (msg, isError = false) => {
    setMessage({ text: msg, isError })
    setTimeout(() => setMessage(null), 3000)
  }

  // --- Actions ---

  const handleLogin = async (username, password, loginRole) => {
    setLoading(true)
    const result = await api.login(loginRole, username, password)
    if (result.success) {
      setToken(result.token)
      setUser(result.user)
      setRole(loginRole)
      setView(loginRole === 'citizen' ? 'citizen-dashboard' : 'officer-dashboard')
      showMessage(`Welcome back, ${result.user.id}`)
    } else {
      showMessage(result.error || 'Login failed', true)
    }
    setLoading(false)
  }

  const handleLogout = () => {
    setToken(null)
    setUser(null)
    setRole(null)
    setView('login')
  }

  const handleUpdateSLA = async () => {
    const result = await api.setSLAConfig(parseInt(slaInput))
    if (result.success) {
      showMessage(`SLA updated to ${result.sla_duration_str}`)
      loadSLAConfig()
    } else {
      showMessage(result.error, true)
    }
  }

  // --- Loaders ---
  const loadMyReports = async () => { const r = await api.getMyReports(token); if(r.success) setMyReports(r.data || []) }
  const loadPublicReports = async () => { const r = await api.getPublicReports(); if(r.success) setPublicReports(r.data || []) }
  const loadInbox = async () => { const r = await api.getInbox(token); if(r.success) setInbox(r.data || []) }
  const loadNotifications = async () => { const r = await api.getNotifications(token); if(r.success) setNotifications(r.data || []) }
  const loadSLAStatus = async () => { const r = await api.getSLAStatus(); if(r.success) setSlaStatus(r.data || []) }
  const loadSLAConfig = async () => { const r = await api.getSLAConfig(); if(r.success) { setSlaConfig(r); setSlaInput(r.sla_duration_sec) } }

  // Effects
  useEffect(() => { loadSLAConfig() }, [])
  useEffect(() => {
    if (!token) return
    const load = () => {
      if (role === 'citizen') { loadMyReports(); loadNotifications(); loadPublicReports() }
      else { loadInbox(); loadSLAStatus() }
    }
    load()
    const interval = setInterval(() => { load(); loadSLAConfig() }, refreshInterval)
    return () => clearInterval(interval)
  }, [role, token])


  // --- Render ---

  if (view === 'login') {
    return (
      <Login
        handleLogin={handleLogin}
        slaInput={slaInput}
        setSlaInput={setSlaInput}
        handleUpdateSLA={handleUpdateSLA}
      />
    )
  }

  return (
    <Layout role={role} user={user} handleLogout={handleLogout} message={message}>
      {role === 'citizen' ? (
        <CitizenDashboard
          token={token}
          myReports={myReports}
          publicReports={publicReports}
          notifications={notifications}
          loadMyReports={loadMyReports}
          loadPublicReports={loadPublicReports}
          showMessage={showMessage}
        />
      ) : (
        <OfficerDashboard
          token={token}
          user={user}
          inbox={inbox}
          slaStatus={slaStatus}
          slaInput={slaInput}
          setSlaInput={setSlaInput}
          slaConfig={slaConfig}
          handleUpdateSLA={handleUpdateSLA}
          loadInbox={loadInbox}
          showMessage={showMessage}
        />
      )}
    </Layout>
  )
}

export default App
