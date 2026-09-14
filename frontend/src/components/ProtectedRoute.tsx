import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import AppShell from '@/components/AppShell'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, token, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 text-sm font-medium text-slate-600 shadow-sm">
          Loading MediBill...
        </div>
      </div>
    )
  }

  if (!token || !user) {
    return <Navigate to="/login" replace />
  }

  return <AppShell>{children}</AppShell>
}
