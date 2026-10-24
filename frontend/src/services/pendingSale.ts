import { apiClient, SalesInvoice } from './api'
type PendingSale = { key: string; payload: Record<string, unknown> }
const storageKey = (scope: string) => `medibill:pending-sale:${scope}`
export function pendingSale(scope: string): PendingSale | null {
  const raw = localStorage.getItem(storageKey(scope))
  if (!raw) return null
  const value = JSON.parse(raw) as PendingSale
  if (!value.key || !value.payload) throw new Error('Pending invoice record is invalid. Contact support before posting again.')
  return value
}
export async function postSale(scope: string, payload?: Record<string, unknown>): Promise<SalesInvoice> {
  let pending = pendingSale(scope)
  if (pending && payload && JSON.stringify(pending.payload) !== JSON.stringify(payload)) throw new Error('An earlier invoice has an unresolved result. Use Retry original invoice before posting another.')
  if (!pending) {
    if (!payload) throw new Error('No pending invoice to retry')
    pending = { key: crypto.randomUUID(), payload }
    localStorage.setItem(storageKey(scope), JSON.stringify(pending))
  }
  try {
    const result = await apiClient.createSale(pending.payload, pending.key)
    localStorage.removeItem(storageKey(scope))
    return result
  } catch (error: any) {
    if ([400, 403, 422].includes(error?.response?.status)) localStorage.removeItem(storageKey(scope))
    throw error
  }
}
