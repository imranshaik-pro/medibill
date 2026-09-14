import axios, { AxiosError } from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'
const client = axios.create({ baseURL: API_BASE_URL, headers:{'Content-Type':'application/json'} })
client.interceptors.request.use(config=>{const token=localStorage.getItem('access_token');if(token)config.headers.Authorization=`Bearer ${token}`;return config})
client.interceptors.response.use(r=>r,(error:AxiosError)=>{if(error.response?.status===401){localStorage.removeItem('access_token');window.location.href='/login'}return Promise.reject(error)})

export type PermissionInfo={id:number;name:string;description?:string}
export type RoleInfo={id:number;name:string;description?:string;is_active:boolean;permissions:PermissionInfo[]}
export type AdminUserInfo={id:number;name:string;email:string;mobile?:string;is_active:boolean;last_login_at?:string;created_at:string;roles:RoleInfo[]}
export type AuditLogInfo={id:number;user_id?:number;action:string;entity_type?:string;entity_id?:number;old_value?:string;new_value?:string;timestamp:string;user_name?:string}
export type BusinessControls={invoice_prefix?:string;next_invoice_number:number;default_payment_mode?:string;currency?:string;selected_invoice_template?:string}

export const adminApi={
  async users(search?:string):Promise<AdminUserInfo[]>{return (await client.get('/admin/users',{params:{search}})).data},
  async createUser(data:Record<string,unknown>):Promise<AdminUserInfo>{return (await client.post('/admin/users',data)).data},
  async updateUser(id:number,data:Record<string,unknown>):Promise<AdminUserInfo>{return (await client.patch(`/admin/users/${id}`,data)).data},
  async roles():Promise<RoleInfo[]>{return (await client.get('/admin/roles')).data},
  async createRole(data:Record<string,unknown>):Promise<RoleInfo>{return (await client.post('/admin/roles',data)).data},
  async updateRole(id:number,data:Record<string,unknown>):Promise<RoleInfo>{return (await client.patch(`/admin/roles/${id}`,data)).data},
  async permissions():Promise<PermissionInfo[]>{return (await client.get('/admin/permissions')).data},
  async audits(params?:Record<string,unknown>):Promise<AuditLogInfo[]>{return (await client.get('/admin/audit-logs',{params})).data},
  async controls():Promise<BusinessControls>{return (await client.get('/admin/business-controls')).data},
  async updateControls(data:Record<string,unknown>):Promise<BusinessControls>{return (await client.patch('/admin/business-controls',data)).data},
}
