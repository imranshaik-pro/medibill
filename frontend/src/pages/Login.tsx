import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

export default function Login() {
  const navigate = useNavigate(); const { login, isLoading, error } = useAuth()
  const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [show,setShow]=useState(false); const [localError,setLocalError]=useState('')
  const handleSubmit=async(e:React.FormEvent)=>{e.preventDefault();setLocalError('');try{await login(email,password);navigate('/dashboard')}catch(err:any){setLocalError(err.message)}}
  return <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4"><div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
    <div className="text-center mb-6"><h1 className="text-3xl font-bold text-gray-900">MediBill</h1><p className="text-gray-600 mt-2">Medical Agency Billing System</p></div><h2 className="text-xl font-bold mb-6 text-center">Login</h2>
    {(error||localError)&&<div className="mb-4 p-3 bg-red-100 text-red-700 rounded">{localError||error}</div>}
    <form onSubmit={handleSubmit} className="space-y-4"><div><label className="block text-sm font-medium">Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required className="mt-1 block w-full px-3 py-2 border rounded-md" placeholder="you@example.com"/></div><div><div className="flex justify-between"><label className="block text-sm font-medium">Password</label><Link to="/forgot-password" className="text-sm text-blue-600 hover:text-blue-700">Forgot password?</Link></div><input type={show?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} required className="mt-1 block w-full px-3 py-2 border rounded-md" placeholder="••••••••"/><label className="mt-2 flex gap-2 text-sm text-gray-600"><input type="checkbox" checked={show} onChange={e=>setShow(e.target.checked)}/> Show password</label></div><button type="submit" disabled={isLoading} className="w-full px-4 py-2 bg-blue-600 text-white rounded-md disabled:bg-gray-400">{isLoading?'Logging in...':'Login'}</button></form>
    <p className="mt-4 text-center text-sm text-gray-600">Don't have an account? <Link to="/register" className="text-blue-600">Register here</Link></p>
  </div></div>
}
