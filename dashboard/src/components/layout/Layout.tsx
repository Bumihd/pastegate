import { ReactNode } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { LanguageSelect } from '../ui/LanguageSelect'
import { Logo } from '../ui/Logo'
import { useLang } from '../../lib/LangContext'
import {
  LayoutDashboard, Globe, Key, Users, FileText, BarChart2,
  LogOut, Settings, Package, KeyRound, ShieldCheck,
  BookOpen, Code, Smartphone, Monitor, AlertTriangle, ScanSearch, Plug,
} from 'lucide-react'

function NavItem({ to, label, icon: Icon }: { to: string; label: string; icon: any }) {
  return (
    <NavLink to={to} style={({ isActive }) => ({
      position: 'relative',
      display: 'flex', alignItems: 'center', gap: 9,
      padding: '7px 10px', borderRadius: 'var(--radius)',
      color: isActive ? 'var(--text)' : 'var(--text-muted)',
      background: isActive ? 'var(--bg-elevated)' : 'transparent',
      // Green left indicator only on the active entry
      boxShadow: isActive ? 'inset 2px 0 0 var(--accent)' : 'none',
      textDecoration: 'none', fontSize: 13, fontWeight: isActive ? 500 : 400,
      transition: 'background 0.15s, color 0.15s',
    })}>
      {({ isActive }: { isActive: boolean }) => (
        <>
          <Icon size={14} strokeWidth={2} color={isActive ? 'var(--accent)' : 'currentColor'} />
          <span style={{ flex: 1 }}>{label}</span>
        </>
      )}
    </NavLink>
  )
}

function NavSection({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 500, color: 'var(--text-hint)',
      padding: '14px 10px 4px',
    }}>{label}</div>
  )
}

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const { lang, setLang, t } = useLang()
  const navigate = useNavigate()
  const location = useLocation()
  const role = user?.role
  const roleKey = role ? 'role_label_' + role : ''
  const roleLabel = role ? (t(roleKey) === roleKey ? role : t(roleKey)) : ''

  // Breadcrumb: path → section · page (i18n)
  const CRUMB: Record<string, [string, string]> = {
    '/dashboard':          ['sec_overview',  'nav_dashboard'],
    '/events':             ['sec_security',  'nav_events'],
    '/devices':            ['sec_security',  'nav_devices'],
    '/domain-rules':       ['sec_security',  'nav_domain_rules'],
    '/detection-rules':    ['sec_security',  'nav_detection_rules'],
    '/risk':               ['sec_reporting', 'nav_risk'],
    '/privacy':            ['sec_privacy',   'nav_privacy'],
    '/my-events':          ['sec_my_data',   'nav_my_events'],
    '/users':              ['sec_admin',     'nav_users'],
    '/users/new':          ['sec_admin',     'nav_users'],
    '/api-keys':           ['sec_admin',     'nav_api_keys'],
    '/build':              ['sec_admin',     'nav_build'],
    '/viewer-assignments': ['sec_admin',     'nav_assignments'],
    '/settings':           ['sec_admin',     'nav_settings'],
    '/docs':               ['sec_resources', 'nav_docs'],
    '/api-docs':           ['sec_resources', 'nav_api_docs'],
    '/mdm-guide':          ['sec_resources', 'nav_mdm'],
    '/change-password':    ['sec_account',   'nav_password'],
    '/2fa':                ['sec_account',   'nav_2fa'],
    '/api-access':         ['sec_account',   'nav_api_access'],
  }
  const crumb = CRUMB[location.pathname]

  const isITSec   = role === 'itsec' || role === 'infosec'
  const isAdmin   = role === 'admin'
  const isMgmt    = role === 'management'
  const isPrivacy = role === 'dataprivacy'
  const isViewer  = role === 'viewer'

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{
        width: 224, flexShrink: 0,
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
      }}>
        {/* Logo */}
        <div style={{ padding: '16px 14px', borderBottom: '1px solid var(--border)' }}>
          <Logo size={15} />
        </div>

        {/* Nav */}
        <nav aria-label={t('nav_aria_main')} style={{ flex: 1, padding: '6px 8px', display: 'flex', flexDirection: 'column' }}>
          <NavSection label={t('sec_overview')} />
          <NavItem to="/dashboard" icon={LayoutDashboard} label={t('nav_dashboard')} />

          {(isITSec || isAdmin) && <>
            <NavSection label={t('sec_security')} />
            <NavItem to="/events"       icon={AlertTriangle} label={t('nav_events')} />
            <NavItem to="/devices"      icon={Monitor}       label={t('nav_devices')} />
            <NavItem to="/domain-rules" icon={Globe}         label={t('nav_domain_rules')} />
            <NavItem to="/detection-rules" icon={ScanSearch} label={t('nav_detection_rules')} />
          </>}

          {isMgmt && <>
            <NavSection label={t('sec_reporting')} />
            <NavItem to="/risk" icon={BarChart2} label={t('nav_risk')} />
          </>}

          {isPrivacy && <>
            <NavSection label={t('sec_privacy')} />
            <NavItem to="/privacy" icon={FileText} label={t('nav_privacy')} />
          </>}

          {isViewer && <>
            <NavSection label={t('sec_my_data')} />
            <NavItem to="/my-events" icon={Monitor} label={t('nav_my_events')} />
          </>}

          {isAdmin && <>
            <NavSection label={t('sec_admin')} />
            <NavItem to="/users"              icon={Users}    label={t('nav_users')} />
            <NavItem to="/api-keys"           icon={Key}      label={t('nav_api_keys')} />
            <NavItem to="/build"              icon={Package}  label={t('nav_build')} />
            <NavItem to="/viewer-assignments" icon={Users}    label={t('nav_assignments')} />
            <NavItem to="/settings"           icon={Settings} label={t('nav_settings')} />
          </>}

          {(isITSec && !isAdmin) && (
            <NavItem to="/viewer-assignments" icon={Users} label={t('nav_assignments')} />
          )}

          <NavSection label={t('sec_resources')} />
          <NavItem to="/docs" icon={BookOpen} label={t('nav_docs')} />
          <NavItem to="/api-docs" icon={Code} label={t('nav_api_docs')} />
          {(isAdmin || isITSec) && <NavItem to="/mdm-guide" icon={Smartphone} label={t('nav_mdm')} />}

          <NavSection label={t('sec_account')} />
          <NavItem to="/change-password" icon={KeyRound}   label={t('nav_password')} />
          <NavItem to="/2fa"             icon={ShieldCheck} label={t('nav_2fa')} />
          <NavItem to="/api-access"      icon={Plug}        label={t('nav_api_access')} />
        </nav>

        {/* Footer */}
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {/* Lang-Switch */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6,
            padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 11, color: 'var(--text-hint)', flex: 1 }}>
              {t('lang_label')}
            </span>
            <LanguageSelect value={lang} onChange={setLang} label={t('lang_label')}
              style={{ padding: '3px 6px', fontSize: 11.5 }} />
          </div>

          {/* User + Logout */}
          <div style={{ padding: '6px 8px 8px' }}>
            <div style={{ padding: '4px 10px 6px', fontSize: 11, color: 'var(--text-hint)' }}>
              <span style={{
                display: 'inline-block', padding: '1px 6px', borderRadius: 4,
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                color: 'var(--text-muted)', fontSize: 10, fontWeight: 500, marginRight: 6,
              }}>{roleLabel}</span>
              {user?.username}
            </div>
            <button type="button" onClick={() => { logout(); navigate('/login') }} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '7px 10px', borderRadius: 'var(--radius)',
              background: 'none', border: '1px solid transparent',
              color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
            }}>
              <LogOut size={14} />{t('nav_logout')}
            </button>
          </div>
        </div>
      </aside>

      <main style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        {/* Topbar: Breadcrumb + User */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          height: 48, padding: '0 24px',
          background: 'var(--bg-canvas)', borderBottom: '1px solid var(--border)',
        }}>
          <nav aria-label={t('nav_aria_breadcrumb')} style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {crumb ? (
              <>
                {t(crumb[0])}
                <span style={{ color: 'var(--text-hint)', margin: '0 6px' }}>·</span>
                <span style={{ color: 'var(--text)' }}>{t(crumb[1])}</span>
              </>
            ) : 'Pastegate'}
          </nav>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
            <span>{user?.username}</span>
            <span aria-hidden="true" style={{
              width: 26, height: 26, borderRadius: '50%',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text)', fontSize: 11, textTransform: 'uppercase',
            }}>{user?.username?.[0] ?? '?'}</span>
          </div>
        </div>
        <div style={{ padding: '24px 24px', maxWidth: 1280, margin: '0 auto' }}>
          {children}
        </div>
      </main>
    </div>
  )
}
