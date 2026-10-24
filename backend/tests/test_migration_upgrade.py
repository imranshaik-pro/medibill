"""Rehearse an upgrade of populated revision 0002 in an isolated PG schema."""
import os
import subprocess
from pathlib import Path
from uuid import uuid4
import pytest
from sqlalchemy import create_engine, text
from app.db.session import engine


@pytest.mark.skipif(engine.dialect.name != 'postgresql', reason='PostgreSQL migration rehearsal')
def test_populated_previous_revision_upgrade_preserves_business_data():
    schema='upgrade_'+uuid4().hex
    with engine.begin() as c:
        c.execute(text(f'CREATE SCHEMA {schema}'))
    isolated_url=engine.url.update_query_dict({'options':f'-csearch_path={schema}'})
    env=dict(os.environ,DATABASE_URL=isolated_url.render_as_string(hide_password=False))
    backend=Path(__file__).resolve().parents[1]
    isolated=create_engine(isolated_url)
    def migrate(target):
        result=subprocess.run(['alembic','upgrade',target],cwd=backend,env=env,capture_output=True,text=True)
        assert result.returncode==0,result.stderr
    try:
        migrate('20260916_0002')
        with isolated.begin() as c:
            c.execute(text("INSERT INTO companies(id,company_name,created_at,updated_at) VALUES(1,'Existing Seller',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"))
            c.execute(text("INSERT INTO users(id,company_id,name,email,password_hash,created_at,updated_at) VALUES(1,1,'Existing User','upgrade@example.com','not-a-login',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"))
            c.execute(text("INSERT INTO customers(id,company_id,customer_code,customer_name,created_at,updated_at) VALUES(1,1,'C1','Existing Buyer',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"))
            c.execute(text("INSERT INTO sales_invoices(id,company_id,invoice_number,invoice_date,customer_id,subtotal,taxable_total,grand_total,created_by,created_at,updated_at) VALUES(1,1,'ORIGINAL',CURRENT_DATE,1,80,80,80,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"))
            for i,name in enumerate(('Admin','Accounts','Inventory Operator','Custom'),1):
                c.execute(text("INSERT INTO roles(id,company_id,name,created_at) VALUES(:id,1,:name,CURRENT_TIMESTAMP)"),dict(id=i,name=name))
            before=c.execute(text('SELECT id,invoice_number,grand_total,created_at FROM sales_invoices')).all()
        migrate('head')
        with isolated.begin() as c:
            assert c.execute(text('SELECT id,invoice_number,grand_total,created_at FROM sales_invoices')).all()==before
            assert c.execute(text('SELECT document_snapshot FROM sales_invoices WHERE id=1')).scalar() is None
            grants=c.execute(text('SELECT r.name,p.name FROM roles r JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id')).all()
            assert ('Accounts','collect_payment') in grants
            assert not any(role in ('Inventory Operator','Custom') for role,_ in grants)
            # An old application can still insert using only its original columns.
            c.execute(text("INSERT INTO sales_invoices(company_id,invoice_number,invoice_date,customer_id,subtotal,taxable_total,grand_total,created_by,created_at,updated_at) VALUES(1,'OLD-CLIENT',CURRENT_DATE,1,10,10,10,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"))
            assert c.execute(text('SELECT COUNT(*) FROM sales_invoices')).scalar()==2
    finally:
        isolated.dispose()
        with engine.begin() as c:
            c.execute(text(f'DROP SCHEMA {schema} CASCADE'))
