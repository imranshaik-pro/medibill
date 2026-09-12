import axios, { AxiosInstance, AxiosError } from 'axios'
import { AuthResponse, LoginCredentials, RegisterData } from '@/types'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'
export type MasterDataType = 'customers' | 'categories' | 'manufacturers' | 'products'

export type Supplier = { id:number; company_id:number; supplier_code:string; supplier_name:string; contact_person?:string; phone?:string; email?:string; address?:string; gstin?:string; credit_days:number; credit_limit?:string; is_active:boolean }
export type PurchaseItem = { id:number; product_id:number; batch_id:number; quantity:number; mrp:string; purchase_rate:string; discount_percent:string; discount_amount:string; taxable_amount:string; gst_rate:string; cgst:string; sgst:string; igst:string; net_amount:string; batch_number?:string; product_name?:string }
export type PurchaseInvoice = { id:number; company_id:number; purchase_number:string; purchase_date:string; supplier_id:number; subtotal:string; discount_total:string; taxable_total:string; cgst:string; sgst:string; igst:string; round_off:string; grand_total:string; payment_status:string; notes?:string; created_by:number; created_at:string; updated_at:string; supplier_name?:string; items:PurchaseItem[] }
export type SalesItem = { id:number; product_id:number; batch_id:number; quantity:number; mrp:string; selling_price:string; discount_percent:string; discount_amount:string; taxable_amount:string; gst_rate:string; cgst:string; sgst:string; igst:string; net_amount:string; batch_number?:string; product_name?:string }
export type SalesInvoice = { id:number; company_id:number; invoice_number:string; invoice_date:string; customer_id:number; subtotal:string; discount_total:string; taxable_total:string; cgst:string; sgst:string; igst:string; round_off:string; grand_total:string; payment_status:string; amount_paid:string; balance_due:string; notes?:string; created_by:number; created_at:string; updated_at:string; customer_name?:string; items:SalesItem[] }

class ApiClient {
  private client: AxiosInstance
  private token: string | null = null
  constructor() {
    this.client = axios.create({ baseURL: API_BASE_URL, headers: {'Content-Type':'application/json'} })
    this.token = localStorage.getItem('access_token'); this.updateAuthHeader()
    this.client.interceptors.response.use(r => r, (error: AxiosError) => { if (error.response?.status === 401) { localStorage.removeItem('access_token'); window.location.href='/login' }; return Promise.reject(error) })
  }
  private updateAuthHeader() { if(this.token) this.client.defaults.headers.common['Authorization']=`Bearer ${this.token}`; else delete this.client.defaults.headers.common['Authorization'] }
  setToken(token:string){this.token=token;localStorage.setItem('access_token',token);this.updateAuthHeader()}
  clearToken(){this.token=null;localStorage.removeItem('access_token');this.updateAuthHeader()}
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
}
export const apiClient = new ApiClient()
