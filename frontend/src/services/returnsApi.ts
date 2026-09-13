import axios, { AxiosError } from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'
const client = axios.create({ baseURL: API_BASE_URL, headers: {'Content-Type':'application/json'} })
client.interceptors.request.use(config=>{const token=localStorage.getItem('access_token');if(token)config.headers.Authorization=`Bearer ${token}`;return config})
client.interceptors.response.use(r=>r,(error:AxiosError)=>{if(error.response?.status===401){localStorage.removeItem('access_token');window.location.href='/login'}return Promise.reject(error)})

export type SalesReturnItem={id:number;sales_invoice_item_id:number;product_id:number;batch_id:number;quantity:number;disposition:string;taxable_amount:string;cgst:string;sgst:string;igst:string;net_amount:string;reason?:string}
export type SalesReturn={id:number;company_id:number;return_number:string;return_date:string;sales_invoice_id:number;customer_id:number;taxable_total:string;cgst:string;sgst:string;igst:string;grand_total:string;reason?:string;created_by:number;created_at:string;items:SalesReturnItem[]}
export type PurchaseReturnItem={id:number;purchase_invoice_item_id:number;product_id:number;batch_id:number;quantity:number;free_quantity:number;taxable_amount:string;cgst:string;sgst:string;igst:string;net_amount:string;reason?:string}
export type PurchaseReturn={id:number;company_id:number;return_number:string;return_date:string;purchase_invoice_id:number;supplier_id:number;taxable_total:string;cgst:string;sgst:string;igst:string;grand_total:string;reason?:string;created_by:number;created_at:string;items:PurchaseReturnItem[]}

export const returnsApi={
  listSalesReturns:async(invoiceId?:number):Promise<SalesReturn[]>=> (await client.get('/returns/sales',{params:{invoice_id:invoiceId}})).data,
  createSalesReturn:async(data:Record<string,unknown>):Promise<SalesReturn>=> (await client.post('/returns/sales',data)).data,
  listPurchaseReturns:async(invoiceId?:number):Promise<PurchaseReturn[]>=> (await client.get('/returns/purchases',{params:{invoice_id:invoiceId}})).data,
  createPurchaseReturn:async(data:Record<string,unknown>):Promise<PurchaseReturn>=> (await client.post('/returns/purchases',data)).data,
}
