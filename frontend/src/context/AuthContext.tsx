import React, { createContext, useContext, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { apiClient } from '@/services/api'
import { User } from '@/types'

interface AuthContextType {
  user: User | null
  token: string | null
  isLoading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string, companyName: string, mobile?: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { user, token, isLoading, error, setUser, setToken, setLoading, setError, logout: storeLogout } = useAuthStore()

  useEffect(() => {
    const initAuth = async () => {
      if (token) {
        setLoading(true)
        try {
          const currentUser = await apiClient.getCurrentUser()
          setUser(currentUser)
        } catch (err) {
          storeLogout()
          setError('Session expired. Please login again.')
        } finally {
          setLoading(false)
        }
      }
    }
    initAuth()
  }, [token])

  const login = async (email: string, password: string) => {
    setLoading(true); setError(null)
    try {
      const response = await apiClient.login({ email, password })
      apiClient.setToken(response.access_token); setToken(response.access_token)
      setUser(await apiClient.getCurrentUser())
    } catch (err: any) {
      const message = err.response?.data?.detail || 'Login failed'
      setError(message); throw new Error(message)
    } finally { setLoading(false) }
  }

  const register = async (name: string, email: string, password: string, companyName: string, mobile?: string) => {
    setLoading(true); setError(null)
    try {
      await apiClient.register({ name, email, password, company_name: companyName, mobile: mobile || undefined })
      await login(email, password)
    } catch (err: any) {
      const detail = err.response?.data?.detail
      const message = typeof detail === 'string' ? detail : (detail?.[0]?.msg || 'Registration failed')
      setError(message); throw new Error(message)
    } finally { setLoading(false) }
  }

  const logout = () => { apiClient.clearToken(); storeLogout() }
  return <AuthContext.Provider value={{ user, token, isLoading, error, login, register, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) throw new Error('useAuth must be used within AuthProvider')
  return context
}
