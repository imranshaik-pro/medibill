import axios, { AxiosError } from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

const client = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  } else {
    delete config.headers.Authorization
  }
  return config
})

client.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)

export const inventoryApi = {
  listBatches: async (productId?: string) =>
    (
      await client.get('/inventory/batches', {
        params: productId ? { product_id: productId } : undefined,
      })
    ).data,
  createBatch: async (data: Record<string, unknown>) =>
    (await client.post('/inventory/batches', data)).data,
  listStock: async (productId?: string, includeZero = false) =>
    (
      await client.get('/inventory/stock', {
        params: {
          ...(productId ? { product_id: productId } : {}),
          include_zero: includeZero,
        },
      })
    ).data,
  adjustStock: async (data: Record<string, unknown>) =>
    (await client.post('/inventory/adjustments', data)).data,
}
