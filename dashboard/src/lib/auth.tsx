import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { auth as authApi } from './api'
import type { User, Role } from '../types'

interface AuthCtx {
  user: User | null
  token: string | null
  login: (username: string, password: string, totp?: string) => Promise<{ totp_required: boolean }>
  logout: () => void
  loading: boolean
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]   = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(localStorage.getItem('pg_token'))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) { setLoading(false); return }
    authApi.me()
      .then(u => setUser(u as User))
      .catch(() => { localStorage.removeItem('pg_token'); setToken(null) })
      .finally(() => setLoading(false))
  }, [token])

  const login = async (username: string, password: string, totp?: string) => {
    const res = await authApi.login(username, password, totp)
    if (res.totp_required) return { totp_required: true }
    localStorage.setItem('pg_token', res.access_token)
    setToken(res.access_token)
    const u = await authApi.me()
    setUser(u as User)
    return { totp_required: false }
  }

  const logout = () => {
    // Server logout first (revoke token), then clear localStorage
    // .catch() so a network error does not block the local logout
    authApi.logout().finally(() => {
      localStorage.removeItem('pg_token')
      setToken(null)
      setUser(null)
    })
  }

  return <Ctx.Provider value={{ user, token, login, logout, loading }}>{children}</Ctx.Provider>
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}

export function useRole(...roles: Role[]) {
  const { user } = useAuth()
  return user ? roles.includes(user.role as Role) : false
}
