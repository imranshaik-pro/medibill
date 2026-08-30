import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, token, isLoading } = useAuth()

  if (isLoading) {
    return <div>Loading...</div>
  }

  if (!token || !user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
