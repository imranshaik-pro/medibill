export interface User {
  id: number
  name: string
  email: string
  company_id: number
  is_active: boolean
  created_at: string
}

export interface LoginCredentials {
  email: string
  password: string
}

export interface RegisterData {
  name: string
  email: string
  password: string
  company_name: string
  mobile?: string
}

export interface AuthResponse {
  access_token: string
  token_type: string
  expires_in: number
}
