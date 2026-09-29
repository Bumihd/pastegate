import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { LangProvider, useLang } from './lib/LangContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { setupApi } from './lib/api'
import type { Role } from './types'

import Layout          from './components/layout/Layout'
import SetupWizard     from './pages/SetupWizard'
import Login           from './pages/Login'
import Dashboard       from './pages/Dashboard'
import Events          from './pages/itsec/Events'
import DomainRules     from './pages/admin/DomainRules'
import CustomRules     from './pages/admin/CustomRules'
import ApiKeys         from './pages/admin/ApiKeys'
import BuildExtension  from './pages/admin/BuildExtension'
import Devices         from './pages/admin/Devices'
import Users           from './pages/admin/Users'
import Settings        from './pages/admin/Settings'
import RiskMap         from './pages/management/RiskMap'
import Privacy         from './pages/dataprivacy/Privacy'
import TwoFactor       from './pages/admin/TwoFactor'
import UserCreate      from './pages/admin/UserCreate'
import ChangePassword  from './pages/admin/ChangePassword'
import ApiAccess       from './pages/admin/ApiAccess'
import ViewerDashboard from './pages/viewer/ViewerDashboard'
import ViewerAssignments from './pages/admin/ViewerAssignments'
import ApiDocs         from './pages/docs/ApiDocs'
import UserDocs        from './pages/docs/UserDocs'
import MdmGuide        from './pages/docs/MdmGuide'

// Start page per role: viewers have no overview dashboard (no stats permission)
function homeFor(role: string): string {
  return role === 'viewer' ? '/my-events' : '/dashboard'
}

function Guard({ roles, children }: { roles?: Role[]; children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const { t } = useLang()
  if (loading) return <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>{t('loading_short')}</div>
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role as Role)) return <Navigate to={homeFor(user.role)} replace />
  return <Layout>{children}</Layout>
}

function SetupGate() {
  // Query setup status on load. needs_setup → redirect ALL routes to /setup
  // and hide login. Once completed, /setup is locked.
  const [phase, setPhase] = useState<'loading' | 'setup' | 'ready'>('loading')
  const { t } = useLang()
  useEffect(() => {
    setupApi.status()
      .then(s => setPhase(s.needs_setup ? 'setup' : 'ready'))
      .catch(() => setPhase('ready'))  // Backend unreachable → don't lock the user out
  }, [])

  if (phase === 'loading')
    return <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>{t('loading_short')}</div>

  if (phase === 'setup')
    return (
      <Routes>
        <Route path="/setup" element={<SetupWizard />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    )

  return (
        <Routes>
          {/* Setup completed → /setup locked */}
          <Route path="/setup" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />

          <Route path="/dashboard"
            element={<Guard roles={['itsec','infosec','admin','management','dataprivacy']}><Dashboard /></Guard>} />

          {/* IT-Sec / InfoSec */}
          <Route path="/events"
            element={<Guard roles={['itsec','infosec','admin']}><Events /></Guard>} />
          <Route path="/devices"
            element={<Guard roles={['itsec','infosec','admin']}><Devices /></Guard>} />
          <Route path="/domain-rules"
            element={<Guard roles={['itsec','infosec','admin']}><DomainRules /></Guard>} />
          <Route path="/detection-rules"
            element={<Guard roles={['itsec','infosec','admin']}><CustomRules /></Guard>} />

          {/* Admin only */}
          <Route path="/api-keys"
            element={<Guard roles={['admin']}><ApiKeys /></Guard>} />
          <Route path="/users"
            element={<Guard roles={['admin']}><Users /></Guard>} />
          <Route path="/build"
            element={<Guard roles={['admin']}><BuildExtension /></Guard>} />
          <Route path="/settings"
            element={<Guard roles={['admin']}><Settings /></Guard>} />

          {/* Management */}
          <Route path="/risk"
            element={<Guard roles={['management','itsec','infosec','admin']}><RiskMap /></Guard>} />

          {/* Data Privacy */}
          <Route path="/privacy"
            element={<Guard roles={['dataprivacy','itsec','infosec','admin']}><Privacy /></Guard>} />

          {/* Account management */}
          <Route path="/2fa"
            element={<Guard><TwoFactor /></Guard>} />
          <Route path="/change-password"
            element={<Guard><ChangePassword /></Guard>} />
          <Route path="/api-access"
            element={<Guard><ApiAccess /></Guard>} />
          <Route path="/users/new"
            element={<Guard roles={['admin']}><UserCreate /></Guard>} />
          <Route path="/viewer-assignments"
            element={<Guard roles={['admin','itsec','infosec']}><ViewerAssignments /></Guard>} />

          {/* Viewer */}
          <Route path="/my-events"
            element={<Guard roles={['viewer']}><ViewerDashboard /></Guard>} />

          {/* Docs */}
          <Route path="/docs"
            element={<Guard><UserDocs /></Guard>} />
          <Route path="/api-docs"
            element={<Guard><ApiDocs /></Guard>} />
          <Route path="/mdm-guide"
            element={<Guard roles={['admin','itsec','infosec']}><MdmGuide /></Guard>} />

          <Route path="/auth/callback" element={<Login />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <LangProvider>
      <AuthProvider>
        <SetupGate />
      </AuthProvider>
      </LangProvider>
    </BrowserRouter>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
)
