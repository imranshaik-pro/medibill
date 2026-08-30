import axios, { AxiosInstance, AxiosError } from 'axios'
import { AuthResponse, LoginCredentials, RegisterData } from '@/types'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

class ApiClient {
  private client: AxiosInstance
  private token: string | null = null

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Load token from localStorage
    this.token = localStorage.getItem('access_token')
    this.updateAuthHeader()

    // Add response interceptor
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('access_token')
          window.location.href = '/login'
        }
        return Promise.reject(error)
      }
    )
  }

  private updateAuthHeader() {
    if (this.token) {
      this.client.defaults.headers.common['Authorization'] = `Bearer ${this.token}`
    } else {
      delete this.client.defaults.headers.common['Authorization']
    }
  }

  setToken(token: string) {
    this.token = token
    localStorage.setItem('access_token', token)
    this.updateAuthHeader()
  }

  clearToken() {
    this.token = null
    localStorage.removeItem('access_token')
    this.updateAuthHeader()
  }

  // Auth endpoints
  async register(data: RegisterData) {
    const response = await this.client.post('/auth/register', data)
    return response.data
  }

  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const response = await this.client.post('/auth/login', credentials)
    return response.data
  }

  async getCurrentUser() {
    const response = await this.client.get('/users/me')
    return response.data
  }

  // Health check
  async health() {
    const response = await this.client.get('/health')
    return response.data
  }
}

export const apiClient = new ApiClient()
