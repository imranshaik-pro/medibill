"""HTTP regressions; concurrency tests run only on real PostgreSQL."""
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from decimal import Decimal
from threading import Barrier
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event
from app.main import app
from app.db.session import engine, SessionLocal
from app.models import User, Role, Product, Customer, SalesInvoice, AuditLog, CommandReceipt, Company

if engine.dialect.name == "sqlite":
    @event.listens_for(engine, "connect")
    def sqlite_function(connection, _):
        # Functional harness only: cannot verify advisory or row locking.
        connection.create_function("pg_advisory_xact_lock", 1, lambda _: 0)

client = TestClient(app)
postgres = pytest.mark.skipif(engine.dialect.name != "postgresql", reason="Real PostgreSQL locks required")


def post(path, headers, payload, status=201):
    r=client.post('/api/v1/'+path, headers=headers, json=payload)
    assert r.status_code==status, r.text
    return r.json()


@pytest.fixture
def tenant():
    suffix=uuid4().hex[:10]; email=f'integrity-{suffix}@example.com'
    user=post('auth/register',{},dict(name='Admin',email=email,password='StrongPass123!',company_name='Original Seller'))
    token=post('auth/login',{},dict(email=email,password='StrongPass123!'),200)['access_token']
    h={'Authorization':'Bearer '+token}
    category=post('master-data/categories',h,dict(name='Tablets',is_active=True))
    product=post('master-data/products',h,dict(product_code='P-'+suffix,product_name='Original Medicine',category_id=category['id'],hsn_code='3004',gst_rate=0,unit='Strip',pack_size=10,default_mrp=100,default_selling_price=80,minimum_sale_rate=70,is_active=True))
    customer=post('master-data/customers',h,dict(customer_code='C-'+suffix,customer_name='Original Buyer',customer_type='PHARMACY',credit_limit=100000,opening_balance=0,is_active=True))
    supplier=post('purchases/suppliers',h,dict(supplier_code='S-'+suffix,supplier_name='Supplier',is_active=True))
    def purchase(batch_number='B1',quantity=10):
        return post('purchases/invoices',h,dict(purchase_number=uuid4().hex,purchase_date=str(date.today()),supplier_id=supplier['id'],items=[dict(product_id=product['id'],batch_number=batch_number,expiry_date=str(date.today()+timedelta(days=365)),quantity=quantity,mrp=100,purchase_rate=50,gst_rate=0)]))
    purchase_invoice=purchase();batch=purchase_invoice['items'][0]['batch_id']
    def payload(batch_id=batch,quantity=1):
        return dict(invoice_number=uuid4().hex,invoice_date=str(date.today()),customer_id=customer['id'],items=[dict(product_id=product['id'],batch_id=batch_id,quantity=quantity,selling_price=80,gst_rate=0)])
    return dict(h=h,user=user,product=product,customer=customer,supplier=supplier,batch=batch,payload=payload,purchase=purchase,purchase_invoice=purchase_invoice)


def stock(t,batch=None):
    r=client.get('/api/v1/inventory/stock',headers=t['h'],params={'product_id':t['product']['id'],'include_zero':True})
    assert r.status_code==200,r.text
    return next(x['quantity_on_hand'] for x in r.json() if x['batch_id']==(batch or t['batch']))


def set_role(t,name):
    with SessionLocal() as db:
        user=db.get(User,t['user']['id'])
        user.roles=[db.query(Role).filter_by(company_id=user.company_id,name=name).one()]
        db.commit()


def test_retry_conflict_and_legacy_client(tenant):
    t=tenant;payload=t['payload']();h=dict(t['h'],**{'Idempotency-Key':uuid4().hex})
    first=post('sales/invoices',h,payload)
    assert post('sales/invoices',h,payload)==first
    post('sales/invoices',h,dict(payload,notes='changed intent'),409)
    assert stock(t)==9
    post('sales/invoices',t['h'],t['payload']())
    assert stock(t)==8
    with SessionLocal() as db:
        assert db.query(CommandReceipt).filter_by(company_id=t['user']['company_id']).count()==1
        assert db.query(AuditLog).filter_by(company_id=t['user']['company_id'],action='SALE_POST').count()==2


def test_failed_post_rolls_back_receipt_audit_and_stock(tenant):
    t=tenant;h=dict(t['h'],**{'Idempotency-Key':uuid4().hex})
    payload=t['payload']();payload['items'].append(dict(payload['items'][0],quantity=11))
    post('sales/invoices',h,payload,409)
    assert stock(t)==10
    with SessionLocal() as db:
        assert db.query(CommandReceipt).filter_by(company_id=t['user']['company_id']).count()==0
        assert db.query(SalesInvoice).filter_by(company_id=t['user']['company_id']).count()==0
        assert db.query(AuditLog).filter_by(company_id=t['user']['company_id'],action='SALE_POST').count()==0


def test_document_snapshot_and_legacy_fallback(tenant):
    t=tenant;sale=post('sales/invoices',t['h'],t['payload']());url=f"/api/v1/documents/sales-invoices/{sale['id']}"
    original=client.get(url,headers=t['h']).json()
    with SessionLocal() as db:
        db.get(Product,t['product']['id']).product_name='Changed Medicine'
        db.get(Product,t['product']['id']).hsn_code='9999'
        db.get(Customer,t['customer']['id']).customer_name='Changed Buyer'
        db.get(Company,t['user']['company_id']).company_name='Changed Seller'
        db.commit()
    assert client.get(url,headers=t['h']).json()==original
    assert client.get(f"/api/v1/sales/invoices/{sale['id']}",headers=t['h']).json()['items'][0]['product_name']=='Original Medicine'
    with SessionLocal() as db:
        db.get(SalesInvoice,sale['id']).document_snapshot=None
        db.commit()
    legacy=client.get(url,headers=t['h'])
    assert legacy.status_code==200 and legacy.json()['lines'][0]['product_name']=='Changed Medicine'


def test_permission_boundaries(tenant):
    t=tenant;set_role(t,'Inventory Operator')
    post('sales/invoices',t['h'],t['payload'](),403)
    set_role(t,'Billing Operator')
    caps=client.get('/api/v1/users/me/capabilities',headers=t['h']).json()
    assert 'collect_payment' in caps and 'override_credit_limit' not in caps
    post('sales/invoices',t['h'],dict(t['payload'](),override_credit_limit=True,notes='reason'),403)
    post('sales/invoices',t['h'],dict(t['payload'](),override_expired_batch=True),400)
    sale=post('sales/invoices',t['h'],t['payload']())
    set_role(t,'Viewer')
    payment=dict(amount=10,payment_date=str(date.today()),payment_mode='CASH')
    post(f"sales/invoices/{sale['id']}/payments",t['h'],payment,403)
    set_role(t,'Accounts')
    post(f"sales/invoices/{sale['id']}/payments",t['h'],payment,200)


def test_payment_after_return_uses_net_due(tenant):
    t=tenant;sale=post('sales/invoices',t['h'],t['payload'](quantity=2))
    post('returns/sales',t['h'],dict(return_number=uuid4().hex,return_date=str(date.today()),sales_invoice_id=sale['id'],items=[dict(sales_invoice_item_id=sale['items'][0]['id'],quantity=1)]))
    paid=post(f"sales/invoices/{sale['id']}/payments",t['h'],dict(amount=80,payment_date=str(date.today()),payment_mode='CASH'),200)
    assert Decimal(paid['balance_due'])==0 and paid['payment_status']=='Paid'


def race(functions):
    barrier=Barrier(len(functions))
    def run(fn):
        barrier.wait(timeout=10)
        return fn()
    with ThreadPoolExecutor(max_workers=len(functions)) as executor:
        return list(executor.map(run,functions))


@postgres
def test_concurrent_identical_commands(tenant):
    t=tenant;h=dict(t['h'],**{'Idempotency-Key':uuid4().hex});payload=t['payload']()
    results=race([lambda:client.post('/api/v1/sales/invoices',headers=h,json=payload) for _ in range(2)])
    assert [r.status_code for r in results]==[201,201],[r.text for r in results]
    assert results[0].json()==results[1].json() and stock(t)==9


@postgres
def test_credit_limit_across_different_batches(tenant):
    t=tenant;second=t['purchase']('B2')['items'][0]['batch_id']
    with SessionLocal() as db:
        db.get(Customer,t['customer']['id']).credit_limit=100;db.commit()
    payloads=[t['payload'](),t['payload'](batch_id=second)]
    results=race([lambda p=p:client.post('/api/v1/sales/invoices',headers=t['h'],json=p) for p in payloads])
    assert sorted(r.status_code for r in results)==[201,409],[r.text for r in results]
    assert stock(t)+stock(t,second)==19


@postgres
def test_concurrent_sales_returns(tenant):
    t=tenant;sale=post('sales/invoices',t['h'],t['payload']())
    payloads=[dict(return_number=uuid4().hex,return_date=str(date.today()),sales_invoice_id=sale['id'],items=[dict(sales_invoice_item_id=sale['items'][0]['id'],quantity=1)]) for _ in range(2)]
    results=race([lambda p=p:client.post('/api/v1/returns/sales',headers=t['h'],json=p) for p in payloads])
    assert sorted(r.status_code for r in results)==[201,409],[r.text for r in results]
    assert stock(t)==10


@postgres
def test_concurrent_purchase_returns(tenant):
    t=tenant;purchase=t['purchase_invoice']
    payloads=[dict(return_number=uuid4().hex,return_date=str(date.today()),purchase_invoice_id=purchase['id'],items=[dict(purchase_invoice_item_id=purchase['items'][0]['id'],quantity=6)]) for _ in range(2)]
    results=race([lambda p=p:client.post('/api/v1/returns/purchases',headers=t['h'],json=p) for p in payloads])
    assert sorted(r.status_code for r in results)==[201,409],[r.text for r in results]
    assert stock(t)==4


@postgres
def test_concurrent_last_unit(tenant):
    t=tenant;post('sales/invoices',t['h'],t['payload'](quantity=9))
    other=post('master-data/customers',t['h'],dict(customer_code=uuid4().hex,customer_name='Other Counter Buyer',customer_type='PHARMACY',credit_limit=100000,is_active=True))
    payloads=[t['payload'](),dict(t['payload'](),customer_id=other['id'])]
    results=race([lambda p=p:client.post('/api/v1/sales/invoices',headers=t['h'],json=p) for p in payloads])
    assert sorted(r.status_code for r in results)==[201,409],[r.text for r in results]
    assert stock(t)==0


def test_receipt_scope_and_foreign_customer_rejected(tenant):
    t=tenant;key=uuid4().hex;headers=dict(t['h'],**{'Idempotency-Key':key})
    post('sales/invoices',headers,t['payload']())
    email=f'other-{uuid4().hex}@example.com'
    post('auth/register',{},dict(name='Other',email=email,password='StrongPass123!',company_name='Other Seller'))
    token=post('auth/login',{},dict(email=email,password='StrongPass123!'),200)['access_token']
    other={'Authorization':'Bearer '+token,'Idempotency-Key':key}
    post('sales/invoices',other,t['payload'](),400)
    assert stock(t)==9


def test_audit_and_stock_rollback_when_snapshot_fails(tenant,monkeypatch):
    t=tenant
    def fail(*args):
        raise RuntimeError('snapshot failure after stock deduction')
    monkeypatch.setattr('app.api.v1.sales.get_sales_invoice_document',fail)
    post('sales/invoices',dict(t['h'],**{'Idempotency-Key':uuid4().hex}),t['payload'](),500)
    assert stock(t)==10
    with SessionLocal() as db:
        assert db.query(SalesInvoice).filter_by(company_id=t['user']['company_id']).count()==0
        assert db.query(CommandReceipt).filter_by(company_id=t['user']['company_id']).count()==0


def test_conflict_outcome_header_distinguishes_rejection_from_key_mismatch(tenant):
    t=tenant;payload=t['payload']();headers=dict(t['h'],**{'Idempotency-Key':uuid4().hex})
    post('sales/invoices',headers,payload)
    rejected=client.post('/api/v1/sales/invoices',headers=dict(t['h'],**{'Idempotency-Key':uuid4().hex}),json=payload)
    assert rejected.status_code==409 and rejected.headers['X-Command-Outcome']=='rejected'
    mismatch=client.post('/api/v1/sales/invoices',headers=headers,json=dict(payload,notes='changed'))
    assert mismatch.status_code==409 and 'X-Command-Outcome' not in mismatch.headers
    stock_rejected=client.post('/api/v1/sales/invoices',headers=dict(t['h'],**{'Idempotency-Key':uuid4().hex}),json=t['payload'](quantity=11))
    assert stock_rejected.status_code==409 and stock_rejected.headers['X-Command-Outcome']=='rejected'
    cors=client.post('/api/v1/sales/invoices',headers=dict(t['h'],Origin='http://localhost:5173'),json=payload)
    assert cors.status_code==409 and 'X-Command-Outcome' in cors.headers['access-control-expose-headers']
    assert stock(t)==9
