import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'
const client = axios.create({ baseURL: API_BASE_URL, headers: { 'Content-Type': 'application/json' } })
const token = localStorage.getItem('access_token')
if (token) client.defaults.headers.common['Authorization'] = `Bearer ${token}`

export const inventoryApi = {
  listBatches: async (productId?: string) => (await client.get('/inventory/batches', { params: productId ? { product_id: productId } : undefined })).data,
  createBatch: async (data: Record<string, unknown>) => (await client.post('/inventory/batches', data)).data,
  listStock: async (productId?: string, includeZero = false) => (await client.get('/inventory/stock', { params: { ...(productId ? { product_id: productId } : {}), include_zero: includeZero } })).data,
  adjustStock: async (data: Record<string, unknown>) => (await client.post('/inventory/adjustments', data)).data,
}
