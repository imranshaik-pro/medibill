import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiClient } from '@/services/api'

export default function ForgotPassword() {
  const navigate = useNavigate()
  const [email,setEmail]=useState(''); const [message,setMessage]=useState(''); const [error,setError]=useState(''); const [loading,setLoading]=useState(false)
  const submit=async(e:FormEvent)=>{e.preventDefault();setLoading(true);setError('');try{const r=await apiClient.forgotPassword(email);setMessage(r.message);if(r.reset_token){sessionStorage.setItem('medibill_reset_token',r.reset_token);setTimeout(()=>navigate(`/reset-password?token=${encodeURIComponent(r.reset_token!)}`),700)}}catch(err:any){setError(err.response?.data?.detail||'Unable to start password recovery')}finally{setLoading(false)}}
  return <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4"><div className="max-w-md w-full bg-white rounded-xl shadow-md p-8">
    <h1 className="text-3xl font-bold text-gray-900 text-center">MediBill</h1><p className="text-gray-600 text-center mt-2">Recover your account</p>
    <h2 className="text-xl font-semibold mt-7">Forgot password</h2><p className="text-sm text-gray-600 mt-2">Enter the email registered with MediBill. Reset access expires after 30 minutes and can be used only once.</p>
    {message&&<div className="mt-4 p-3 rounded bg-green-50 text-green-800 text-sm">{message}</div>}{error&&<div className="mt-4 p-3 rounded bg-red-50 text-red-700 text-sm">{error}</div>}
    <form onSubmit={submit} className="mt-5 space-y-4"><div><label className="block text-sm font-medium">Registered email</label><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-md" placeholder="you@example.com"/></div><button disabled={loading} className="w-full px-4 py-2 bg-blue-600 text-white rounded-md disabled:bg-gray-400">{loading?'Checking...':'Continue'}</button></form>
    <p className="mt-5 text-center text-sm"><Link className="text-blue-600" to="/login">Back to login</Link></p>
  </div></div>
}
