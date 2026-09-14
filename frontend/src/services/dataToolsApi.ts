import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

export type ImportEntity = 'customers' | 'suppliers' | 'categories' | 'manufacturers' | 'products'

export type GstLookupResult = {
  gstin: string
  legal_name?: string
  trade_name?: string
  status?: string
  taxpayer_type?: string
  business_constitution?: string
  registration_date?: string
  cancellation_date?: string
  state_code?: string
  state_jurisdiction?: string
  address?: string
  credits_remaining?: number
  provider: string
}

export type ImportResult = {
  entity: ImportEntity
  total_rows: number
  valid_rows: number
  error_rows: number
  errors: { row: number; error: string }[]
  preview: boolean
  imported: number
}

const client = axios.create({ baseURL: API_BASE_URL })
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export const dataToolsApi = {
  async verifyGstin(gstin: string): Promise<GstLookupResult> {
    return (await client.get(`/tools/gstin/${encodeURIComponent(gstin.trim().toUpperCase())}`)).data
  },

  async downloadTemplate(entity: ImportEntity): Promise<void> {
    const response = await client.get(`/tools/import-template/${entity}`, { responseType: 'blob' })
    const url = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url
    link.download = `medibill_${entity}_template.xlsx`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  },

  async importFile(entity: ImportEntity, file: File, preview = true): Promise<ImportResult> {
    const form = new FormData()
    form.append('file', file)
    return (await client.post(`/tools/import/${entity}`, form, {
      params: { preview },
      headers: { 'Content-Type': 'multipart/form-data' },
    })).data
  },
}
