import axios, { AxiosInstance, AxiosError } from 'axios'
import { AuthResponse, LoginCredentials, RegisterData } from '@/types'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'
export type MasterDataType = 'customers' | 'categories' | 'manufacturers' | 'products'

export type Supplier = { id:number; company_id:number; supplier_code:string; supplier_name:string; contact_person?:string; phone?:string; email?:string; address?:string; gstin?:string; credit_days:number; credit_limit?:string; is_active:boolean }
export type PurchaseItem = { id:number; product_id:number; batch_id:number; quantity:number; free_quantity:number; total_received_quantity:number; mrp:string; purchase_rate:string; effective_unit_cost:string; discount_percent:string; discount_amount:string; taxable_amount:string; gst_rate:string; cgst:string; sgst:string; igst:string; net_amount:string; batch_number?:string; product_name?:string }
export type PurchaseInvoice = { id:number; company_id:number; purchase_number:string; purchase_date:string; supplier_id:number; subtotal:string; discount_total:string; taxable_total:string; cgst:string; sgst:string; igst:string; round_off:string; grand_total:string; payment_status:string; notes?:string; created_by:number; created_at:string; updated_at:string; supplier_name?:string; items:PurchaseItem[] }
export type SalesItem = { id:number; product_id:number; batch_id:number; quantity:number; mrp:string; selling_price:string; discount_percent:string; discount_amount:string; taxable_amount:string; gst_rate:string; cgst:string; sgst:string; igst:string; net_amount:string; batch_number?:string; product_name?:string }
export type SalesInvoice = { id:number; company_id:number; invoice_number:string; invoice_date:string; customer_id:number; subtotal:string; discount_total:string; taxable_total:string; cgst:string; sgst:string; igst:string; round_off:string; grand_total:string; payment_status:string; amount_paid:string; balance_due:string; notes?:string; created_by:number; created_at:string; updated_at:string; customer_name?:string; items:SalesItem[] }
export type ReceivableCustomer = { customer_id:number; customer_code:string; customer_name:string; phone?:string; credit_limit:string; total_invoiced:string; total_paid:string; balance_due:string; open_invoices:number }
export type ReceivableInvoice = { invoice_id:number; invoice_number:string; invoice_date:string; grand_total:string; amount_paid:string; balance_due:string; payment_status:string }
export type CustomerLedger = { customer:ReceivableCustomer; invoices:ReceivableInvoice[] }
export type FefoBatch = { batch_id:number; product_id:number; batch_number:string; expiry_date:string; days_to_expiry:number; quantity_on_hand:number; quantity_reserved:number; quantity_available:number; mrp:string; purchase_rate:string; recommended:boolean }
export type ExpiryStockRow = { product_id:number; product_code:string; product_name:string; batch_id:number; batch_number:string; expiry_date:string; days_to_expiry:number; expiry_bucket:string; quantity_available:number; purchase_rate:string; mrp:string; purchase_value:string; mrp_value:string }
export type ExpiryDashboard = { expired_count:number; within_30_count:number; days_31_60_count:number; days_61_90_count:number; days_91_180_count:number; rows:ExpiryStockRow[] }
export type CustomerCreditProfile = { customer_id:number; customer_name:string; credit_limit:string|null; opening_balance:string; outstanding:string; available_credit:string|null; credit_days:number; drug_license_number?:string; drug_license_expiry_date?:string; licence_status:string }
export type DashboardSummary = { today_sales:string; monthly_sales:string; total_sales:string; today_purchases:string; monthly_purchases:string; today_collections:string; total_receivables:string; current_stock_units:number; current_stock_value:string; low_stock_items:number; near_expiry_batches:number; expired_batches:number; today_estimated_gross_profit:string }

class ApiClient {
  private client: AxiosInstance
  constructor() {
    this.client = axios.create({ baseURL: API_BASE_URL, headers: {'Content-Type':'application/json'} })
    this.client.interceptors.request.use(config => {
      const token = localStorage.getItem('access_token')
      if (token) config.headers.Authorization = `Bearer ${token}`
      else delete config.headers.Authorization
      return config
    })
    this.client.interceptors.response.use(r => r, (error: AxiosError) => {
      if (error.response?.status === 401) { localStorage.removeItem('access_token'); window.location.href='/login' }
      return Promise.reject(error)
    })
  }
  setToken(token:string){localStorage.setItem('access_token',token)}
  clearToken(){localStorage.removeItem('access_token')}
  async register(data:RegisterData){return (await this.client.post('/auth/register',data)).data}
  async login(credentials:LoginCredentials):Promise<AuthResponse>{return (await this.client.post('/auth/login',credentials)).data}
  async getCurrentUser(){return (await this.client.get('/users/me')).data}
  async health(){return (await this.client.get('/health')).data}
  async listMasterData(type:MasterDataType){return (await this.client.get(`/master-data/${type}`)).data}
  async createMasterData(type:MasterDataType,data:Record<string,unknown>){return (await this.client.post(`/master-data/${type}`,data)).data}
  async listSuppliers(search?:string, activeOnly=true):Promise<Supplier[]>{return (await this.client.get('/purchases/suppliers',{params:{search,active_only:activeOnly}})).data}
  async createSupplier(data:Record<string,unknown>):Promise<Supplier>{return (await this.client.post('/purchases/suppliers',data)).data}
  async updateSupplier(id:number,data:Record<string,unknown>):Promise<Supplier>{return (await this.client.patch(`/purchases/suppliers/${id}`,data)).data}
  async listPurchases(params?:Record<string,unknown>):Promise<PurchaseInvoice[]>{return (await this.client.get('/purchases/invoices',{params})).data}
  async createPurchase(data:Record<string,unknown>):Promise<PurchaseInvoice>{return (await this.client.post('/purchases/invoices',data)).data}
  async getPurchase(id:number):Promise<PurchaseInvoice>{return (await this.client.get(`/purchases/invoices/${id}`)).data}
  async listSales(params?:Record<string,unknown>):Promise<SalesInvoice[]>{return (await this.client.get('/sales/invoices',{params})).data}
  async createSale(data:Record<string,unknown>):Promise<SalesInvoice>{return (await this.client.post('/sales/invoices',data)).data}
  async getSale(id:number):Promise<SalesInvoice>{return (await this.client.get(`/sales/invoices/${id}`)).data}
  async recordSalePayment(id:number,data:Record<string,unknown>):Promise<SalesInvoice>{return (await this.client.post(`/sales/invoices/${id}/payments`,data)).data}
  async listReceivables(params?:Record<string,unknown>):Promise<ReceivableCustomer[]>{return (await this.client.get('/receivables/customers',{params})).data}
  async getCustomerLedger(customerId:number):Promise<CustomerLedger>{return (await this.client.get(`/receivables/customers/${customerId}`)).data}
  async getFefoBatches(productId:number, includeExpired=false):Promise<FefoBatch[]>{return (await this.client.get(`/pharma/fefo/${productId}`,{params:{include_expired:includeExpired}})).data}
  async getExpiryDashboard(maxDays=180, includeExpired=true):Promise<ExpiryDashboard>{return (await this.client.get('/pharma/expiry-dashboard',{params:{max_days:maxDays,include_expired:includeExpired}})).data}
  async getCustomerCredit(customerId:number):Promise<CustomerCreditProfile>{return (await this.client.get(`/pharma/customers/${customerId}/credit`)).data}
  async getDashboardSummary():Promise<DashboardSummary>{return (await this.client.get('/dashboard/summary')).data}
}
export const apiClient = new ApiClient()
