import axios, { AxiosInstance, AxiosError } from 'axios'
import { AuthResponse, LoginCredentials, RegisterData } from '@/types'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

export type MasterDataType = 'customers' | 'categories' | 'manufacturers' | 'products'

class ApiClient {
  private client: AxiosInstance
  private token: string | null = null
  constructor() {
    this.client = axios.create({ baseURL: API_BASE_URL, headers: {'Content-Type':'application/json'} })
    this.token = localStorage.getItem('access_token')
    this.updateAuthHeader()
    this.client.interceptors.response.use(r => r, (error: AxiosError) => {
      if (error.response?.status === 401) { localStorage.removeItem('access_token'); window.location.href='/login' }
      return Promise.reject(error)
    })
  }
  private updateAuthHeader() { if(this.token) this.client.defaults.headers.common['Authorization']=`Bearer ${this.token}`; else delete this.client.defaults.headers.common['Authorization'] }
  setToken(token:string){this.token=token;localStorage.setItem('access_token',token);this.updateAuthHeader()}
  clearToken(){this.token=null;localStorage.removeItem('access_token');this.updateAuthHeader()}
  async register(data:RegisterData){return (await this.client.post('/auth/register',data)).data}
  async login(credentials:LoginCredentials):Promise<AuthResponse>{return (await this.client.post('/auth/login',credentials)).data}
  async getCurrentUser(){return (await this.client.get('/users/me')).data}
  async health(){return (await this.client.get('/health')).data}
  async listMasterData(type:MasterDataType){return (await this.client.get(`/master-data/${type}`)).data}
  async createMasterData(type:MasterDataType,data:Record<string,string>){return (await this.client.post(`/master-data/${type}`,data)).data}
}
export const apiClient = new ApiClient()
