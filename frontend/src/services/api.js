// --- API Client ---
export const api = {
  async login(service, username, password) {
    const base = service === 'citizen' ? '/api/reporting' : '/api/operations'
    try {
      const res = await fetch(`${base}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      return res.json()
    } catch (e) { return { success: false, error: "Network error" } }
  },

  async createReport(token, content, visibility, category) {
    const res = await fetch('/api/reporting/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ content, visibility, category })
    })
    return res.json()
  },

  async getMyReports(token) {
    const res = await fetch('/api/reporting/reports/me', { headers: { 'Authorization': `Bearer ${token}` } })
    return res.json()
  },

  async getPublicReports() {
    const res = await fetch('/api/reporting/reports/public')
    return res.json()
  },

  async upvote(token, reportId) {
    const res = await fetch(`/api/reporting/reports/${reportId}/upvote`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    })
    return res.json()
  },

  async getInbox(token) {
    const res = await fetch('/api/operations/cases/inbox', { headers: { 'Authorization': `Bearer ${token}` } })
    return res.json()
  },

  async updateStatus(token, reportId, status) {
    const res = await fetch(`/api/operations/cases/${reportId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ status })
    })
    return res.json()
  },

  async getNotifications(token) {
    const res = await fetch('/api/workflow/notifications/me', { headers: { 'Authorization': `Bearer ${token}` } })
    return res.json()
  },

  async getSLAStatus() {
    const res = await fetch('/api/workflow/sla/status')
    return res.json()
  },

  async getSLAConfig() {
    const res = await fetch('/api/workflow/sla/config')
    return res.json()
  },

  async setSLAConfig(durationSeconds) {
    const res = await fetch('/api/workflow/sla/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration_seconds: durationSeconds })
    })
    return res.json()
  }
}
