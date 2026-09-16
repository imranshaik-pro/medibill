from datetime import date, timedelta
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_password_recovery_single_use_token():
    suffix = uuid4().hex[:8]
    email = f"recovery-{suffix}@example.com"
    old_password = "StrongPass123!"
    new_password = "NewStrong456!"
    r = client.post("/api/v1/auth/register", json={"name":"Recovery Admin","email":email,"password":old_password,"company_name":f"Recovery {suffix}"})
    assert r.status_code == 201, r.text

    unknown = client.post("/api/v1/auth/forgot-password", json={"email":f"unknown-{suffix}@example.com"})
    known = client.post("/api/v1/auth/forgot-password", json={"email":email})
    assert unknown.status_code == known.status_code == 200
    assert unknown.json()["message"] == known.json()["message"]
    token = known.json().get("reset_token")
    assert token, "development/test mode should expose reset token for E2E"

    r = client.post("/api/v1/auth/reset-password", json={"token":token,"new_password":new_password})
    assert r.status_code == 200, r.text
    assert client.post("/api/v1/auth/login", json={"email":email,"password":old_password}).status_code == 401
    assert client.post("/api/v1/auth/login", json={"email":email,"password":new_password}).status_code == 200
    assert client.post("/api/v1/auth/reset-password", json={"token":token,"new_password":"Another789!"}).status_code == 400


def test_purchase_sale_free_scheme_receivable_and_document_flow():
    suffix = uuid4().hex[:8]
    email = f"e2e-{suffix}@example.com"
    password = "StrongPass123!"

    r = client.post("/api/v1/auth/register", json={
        "name": "E2E Admin",
        "email": email,
        "mobile": "9000000000",
        "password": password,
        "company_name": f"E2E Pharma {suffix}",
    })
    assert r.status_code == 201, r.text

    r = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    headers = auth_headers(r.json()["access_token"])

    r = client.post("/api/v1/master-data/categories", headers=headers, json={"name": f"Tablets {suffix}", "is_active": True})
    assert r.status_code == 201, r.text
    category_id = r.json()["id"]

    r = client.post("/api/v1/master-data/manufacturers", headers=headers, json={"name": f"Maker {suffix}", "is_active": True})
    assert r.status_code == 201, r.text
    manufacturer_id = r.json()["id"]

    r = client.post("/api/v1/master-data/products", headers=headers, json={
        "product_code": f"P-{suffix}", "product_name": "E2E Medicine", "manufacturer_id": manufacturer_id,
        "category_id": category_id, "hsn_code": "30049099", "gst_rate": 5, "unit": "Strip", "pack_size": 10,
        "default_mrp": 100, "default_selling_price": 80, "minimum_sale_rate": 70, "reorder_level": 5, "is_active": True,
    })
    assert r.status_code == 201, r.text
    product_id = r.json()["id"]

    r = client.post("/api/v1/master-data/customers", headers=headers, json={"customer_code":f"C-{suffix}","customer_name":"E2E Pharmacy","customer_type":"PHARMACY","phone":f"91{suffix[:8]}","credit_limit":100000,"credit_days":30,"opening_balance":0,"is_active":True})
    assert r.status_code == 201, r.text
    customer_id = r.json()["id"]

    r = client.post("/api/v1/purchases/suppliers", headers=headers, json={"supplier_code":f"S-{suffix}","supplier_name":"E2E Supplier","credit_days":30,"is_active":True})
    assert r.status_code == 201, r.text
    supplier_id = r.json()["id"]

    r = client.post("/api/v1/purchases/invoices", headers=headers, json={"purchase_number":f"PUR-{suffix}","purchase_date":date.today().isoformat(),"supplier_id":supplier_id,"tax_mode":"INTRA_STATE","items":[{"product_id":product_id,"batch_number":f"B-{suffix}","expiry_date":(date.today()+timedelta(days=365)).isoformat(),"quantity":10,"free_quantity":2,"mrp":100,"purchase_rate":50,"discount_percent":0,"gst_rate":5}]})
    assert r.status_code == 201, r.text
    purchase=r.json(); batch_id=purchase["items"][0]["batch_id"]; assert purchase["items"][0]["total_received_quantity"] == 12
    r=client.get("/api/v1/inventory/stock",headers=headers,params={"product_id":product_id}); assert r.status_code==200; assert r.json()[0]["quantity_on_hand"]==12

    r=client.post("/api/v1/sales/invoices",headers=headers,json={"invoice_number":f"INV-{suffix}","invoice_date":date.today().isoformat(),"customer_id":customer_id,"tax_mode":"INTRA_STATE","payment_mode":"CREDIT","amount_paid":0,"items":[{"product_id":product_id,"batch_id":batch_id,"quantity":3,"free_quantity":1,"selling_price":80,"discount_percent":0,"gst_rate":5}]})
    assert r.status_code==201,r.text
    sale=r.json();invoice_id=sale["id"];assert sale["items"][0]["quantity"]==3;assert sale["items"][0]["free_quantity"]==1;assert sale["items"][0]["total_issued_quantity"]==4
    r=client.get("/api/v1/inventory/stock",headers=headers,params={"product_id":product_id});assert r.status_code==200;assert r.json()[0]["quantity_on_hand"]==8
    r=client.get(f"/api/v1/documents/sales-invoices/{invoice_id}",headers=headers);assert r.status_code==200;assert r.json()["lines"][0]["free_quantity"]==1
    r=client.get("/api/v1/reports/sales-register",headers=headers);assert r.status_code==200;report_row=next(row for row in r.json() if row["invoice_id"]==invoice_id);assert report_row["billed_units"]==3;assert report_row["free_units"]==1
    r=client.get(f"/api/v1/receivables/customers/{customer_id}",headers=headers);assert r.status_code==200;original_balance=float(r.json()["customer"]["balance_due"]);assert original_balance>0
    r=client.post(f"/api/v1/sales/invoices/{invoice_id}/payments",headers=headers,json={"amount":100,"payment_date":date.today().isoformat(),"payment_mode":"CASH"});assert r.status_code==200
    r=client.get(f"/api/v1/receivables/customers/{customer_id}",headers=headers);assert r.status_code==200;assert float(r.json()["customer"]["balance_due"])==original_balance-100


def test_tenant_isolation_for_customer_lookup():
    suffix=uuid4().hex[:8]
    def register(name:str):
        email=f"{name}-{suffix}@example.com";password="StrongPass123!"
        assert client.post("/api/v1/auth/register",json={"name":name,"email":email,"password":password,"company_name":f"{name} Co {suffix}"}).status_code==201
        login=client.post("/api/v1/auth/login",json={"email":email,"password":password});assert login.status_code==200
        return auth_headers(login.json()["access_token"])
    h1=register("TenantA");h2=register("TenantB")
    created=client.post("/api/v1/master-data/customers",headers=h1,json={"customer_code":f"C-{suffix}","customer_name":"Private Customer","customer_type":"PHARMACY","is_active":True});assert created.status_code==201
    customer_id=created.json()["id"];blocked=client.get(f"/api/v1/master-data/customers/{customer_id}",headers=h2);assert blocked.status_code==404
