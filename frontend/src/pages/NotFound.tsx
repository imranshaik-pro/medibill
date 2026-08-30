import React from 'react'
import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-900">404</h1>
        <p className="mt-4 text-xl text-gray-600">Page not found</p>
        <Link to="/" className="mt-6 inline-block px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
          Go to Dashboard
        </Link>
      </div>
    </div>
  )
}
