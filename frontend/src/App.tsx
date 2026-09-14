import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthContext'
import ProtectedRoute from '@/components/ProtectedRoute'
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import Dashboard from '@/pages/Dashboard'
import MasterData from '@/pages/MasterData'
import Inventory from '@/pages/Inventory'
import Purchases from '@/pages/Purchases'
import Sales from '@/pages/Sales'
import Receivables from '@/pages/Receivables'
import ExpiryManagement from '@/pages/ExpiryManagement'
import Returns from '@/pages/Returns'
import Accounting from '@/pages/Accounting'
import InvoicePrint from '@/pages/InvoicePrint'
import InvoiceDocuments from '@/pages/InvoiceDocuments'
import DocumentSettings from '@/pages/DocumentSettings'
import Reports from '@/pages/Reports'
import Admin from '@/pages/Admin'
import NotFound from '@/pages/NotFound'

function App() {
  return <BrowserRouter><AuthProvider><Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
    <Route path="/master-data" element={<ProtectedRoute><MasterData /></ProtectedRoute>} />
    <Route path="/inventory" element={<ProtectedRoute><Inventory /></ProtectedRoute>} />
    <Route path="/purchases" element={<ProtectedRoute><Purchases /></ProtectedRoute>} />
    <Route path="/sales" element={<ProtectedRoute><Sales /></ProtectedRoute>} />
    <Route path="/documents" element={<ProtectedRoute><InvoiceDocuments /></ProtectedRoute>} />
    <Route path="/sales/:invoiceId/print" element={<ProtectedRoute><InvoicePrint /></ProtectedRoute>} />
    <Route path="/receivables" element={<ProtectedRoute><Receivables /></ProtectedRoute>} />
    <Route path="/expiry" element={<ProtectedRoute><ExpiryManagement /></ProtectedRoute>} />
    <Route path="/returns" element={<ProtectedRoute><Returns /></ProtectedRoute>} />
    <Route path="/accounting" element={<ProtectedRoute><Accounting /></ProtectedRoute>} />
    <Route path="/document-settings" element={<ProtectedRoute><DocumentSettings /></ProtectedRoute>} />
    <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
    <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
    <Route path="/" element={<Navigate to="/dashboard" replace />} />
    <Route path="*" element={<NotFound />} />
  </Routes></AuthProvider></BrowserRouter>
}
export default App
