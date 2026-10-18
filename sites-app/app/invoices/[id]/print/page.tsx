import { notFound } from "next/navigation";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getSalesInvoice } from "@/lib/medibill";
import { PrintActions } from "./print-actions";

const money = (value: number) => new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(value || 0);
const number = (value: number) => new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2,
}).format(value || 0);

function Detail({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return <div className="invoice-detail"><dt>{label}</dt><dd>{value}</dd></div>;
}

export default async function InvoicePrint({ params }: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) notFound();

  let data;
  try {
    data = await getSalesInvoice(user.userId, (await params).id);
  } catch {
    notFound();
  }

  const { header, customer, profile, lines } = data;
  const agencyAddress = [profile.streetAddress, profile.city, profile.district, profile.state, profile.pinCode].filter(Boolean).join(", ");
  const buyerAddress = [customer.address, customer.city, customer.state].filter(Boolean).join(", ");
  const licences = [
    profile.dlNo20b && `20B: ${profile.dlNo20b}`,
    profile.dlNo21b && `21B: ${profile.dlNo21b}`,
  ].filter(Boolean).join("  |  ");
  const transport = [header.transportName, header.vehicleNo, header.lrNo].filter(Boolean).join("  ·  ");
  const terms = String(profile.terms || "").split("\n").map((term) => term.trim()).filter(Boolean);

  return (
    <main className="print-page">
      <PrintActions />
      <article className="tax-invoice">
        <div className="invoice-accent" />

        <header className="invoice-brand">
          <div className="agency-brand">
            {profile.logoKey && <div className="agency-logo"><img src="/api/agency-profile/asset/logo" alt={`${profile.tradeName} logo`} /></div>}
            <div className="agency-copy">
              <p className="eyebrow">Pharmaceutical Distributor</p>
              <h1>{profile.tradeName}</h1>
              {profile.legalEntity && <p className="legal-name">{profile.legalEntity}</p>}
              {profile.tagline && <p>{profile.tagline}</p>}
              {agencyAddress && <p>{agencyAddress}</p>}
              {(profile.phones || profile.email) && <p>{[profile.phones, profile.email].filter(Boolean).join("  ·  ")}</p>}
              {(profile.gstin || licences) && <div className="agency-compliance">
                {profile.gstin && <span>GSTIN <b>{profile.gstin}</b></span>}
                {licences && <span>D.L. No. <b>{licences}</b></span>}
              </div>}
            </div>
          </div>
          <div className="invoice-identity">
            <span className="copy-status">Original for Recipient</span>
            <p>{header.invoiceType.toUpperCase()}</p>
            <h2>{header.invoiceNo}</h2>
            <div className="identity-rule" />
            <small>Invoice Number</small>
          </div>
        </header>

        <section className="invoice-overview">
          <div className="buyer-card">
            <p className="section-label">Billed to / Consignee</p>
            <h3>{customer.name}</h3>
            {buyerAddress && <p>{buyerAddress}</p>}
            <div className="buyer-facts">
              {customer.gstin && <span><small>GSTIN</small><b>{customer.gstin}</b></span>}
              {customer.dlNo && <span><small>D.L. No.</small><b>{customer.dlNo}</b></span>}
              {customer.phone && <span><small>Phone</small><b>{customer.phone}</b></span>}
            </div>
          </div>
          <dl className="metadata-card">
            <Detail label="Invoice date" value={[header.invoiceDate, header.invoiceTime].filter(Boolean).join(" · ")} />
            <Detail label="Payment mode" value={header.paymentMode} />
            <Detail label="Payment terms" value={header.paymentTerms || "Immediate"} />
            <Detail label="Due date" value={header.dueDate} />
            <Detail label="Transport / Vehicle / LR" value={transport} />
            <Detail label="Booking location" value={profile.bookingLocation} />
            {header.complianceAcknowledged && <>
              <Detail label="Prescribing Doctor / RMP" value={header.prescriptionDoctorName} />
              <Detail label="RMP Registration No." value={header.prescriptionDoctorRegistration} />
            </>}
          </dl>
        </section>

        <section className="items-section">
          <div className="items-heading"><span>Medicine and batch details</span><small>{lines.length} line item{lines.length === 1 ? "" : "s"}</small></div>
          <div className="invoice-table">
            <table>
              <thead><tr>
                <th>#</th><th>Product description</th><th>Pack</th><th>Mfr</th><th>Batch</th><th>Expiry</th>
                <th className="numeric">Qty</th><th className="numeric">Free</th><th className="numeric">Rate</th>
                <th className="numeric">MRP</th><th className="numeric">Disc%</th><th className="numeric">GST%</th><th className="numeric">Amount</th>
              </tr></thead>
              <tbody>{lines.map((line, index) => <tr key={line.id}>
                <td>{index + 1}</td><td className="product-name"><b>{line.productName}</b></td><td>{line.pack}</td>
                <td>{line.manufacturer}</td><td>{line.batch}</td><td>{line.expiry}</td>
                <td className="numeric">{number(line.quantity)}</td><td className="numeric">{number(line.freeQuantity)}</td>
                <td className="numeric">{money(line.unitRate)}</td><td className="numeric">{money(line.mrp)}</td>
                <td className="numeric">{number(line.discountPercent)}</td><td className="numeric">{number(line.gstRate)}</td>
                <td className="numeric row-total">{money(line.lineTotal)}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>

        <section className="invoice-summary">
          <div className="summary-notes">
            <div className="delivery-facts">
              <div><small>Total quantity</small><b>{number(header.totalQuantity)}</b></div>
              {header.freightAmount > 0 && <div><small>Freight</small><b>₹{money(header.freightAmount)} <em>({number(header.freightGstRate)}% GST)</em></b></div>}
              {header.insuranceAmount > 0 && <div><small>Insurance / handling</small><b>₹{money(header.insuranceAmount)} <em>({number(header.insuranceGstRate)}% GST)</em></b></div>}
            </div>
            {terms.length > 0 && <div className="terms"><h3>Terms & Conditions</h3><ol>
              {terms.map((term, index) => <li key={index}>{term.replace(/^\d+[.)]\s*/, "")}</li>)}
            </ol></div>}
          </div>
          <div className="invoice-totals">
            <h3>Invoice Summary</h3>
            <p><span>Gross taxable value</span><b>₹{money(header.grossTaxable)}</b></p>
            {header.lineDiscount > 0 && <p><span>Line discount</span><b>− ₹{money(header.lineDiscount)}</b></p>}
            {header.cashDiscount > 0 && <p><span>Cash / scheme discount</span><b>− ₹{money(header.cashDiscount)}</b></p>}
            {header.cgst > 0 && <p><span>CGST</span><b>₹{money(header.cgst)}</b></p>}
            {header.sgst > 0 && <p><span>SGST</span><b>₹{money(header.sgst)}</b></p>}
            {header.igst > 0 && <p><span>IGST</span><b>₹{money(header.igst)}</b></p>}
            <p><span>Round off</span><b>{header.roundOff < 0 ? "− " : ""}₹{money(Math.abs(header.roundOff))}</b></p>
            <div className="net-payable"><span>Net Payable</span><b>₹{money(header.amount)}</b></div>
            {header.amountInWords && <p className="amount-words"><span>Amount in words</span><b>{header.amountInWords}</b></p>}
          </div>
        </section>

        <section className="settlement">
          <div className="bank-details">
            <p className="section-label">Payment settlement</p>
            {profile.bankName ? <>
              <h3>{profile.bankName}{profile.branchName && <small> · {profile.branchName}</small>}</h3>
              <div className="bank-grid">
                <span><small>Beneficiary</small><b>{profile.accountHolder || profile.tradeName}</b></span>
                {profile.accountNumber && <span><small>Account number</small><b>{profile.accountNumber}</b></span>}
                {profile.ifsc && <span><small>IFSC / RTGS</small><b>{profile.ifsc}</b></span>}
              </div>
            </> : <p className="muted">Payment details as agreed with the supplier.</p>}
          </div>
          <div className="signatory">
            <b>For {profile.tradeName}</b>
            {profile.signatureKey && <img src="/api/agency-profile/asset/signature" alt="Authorised signature" />}
            <span>{profile.signatoryTitle || "Authorised Signatory"}</span>
          </div>
        </section>

        <footer className="invoice-document-footer">
          <span>Computer-generated GST tax invoice</span>
          {(profile.website || profile.email) && <span>{profile.website || profile.email}</span>}
          <span>Page 1 of 1</span>
        </footer>
      </article>

      <style>{`
        :root{--ink:#0f172a;--navy:#1e293b;--blue:#334155;--slate:#64748b;--line:#dbe3ec;--soft:#f8fafc;--soft-2:#f1f5f9;--paper:#fff}
        *{box-sizing:border-box}body{margin:0;background:#e9eef4;color:var(--ink);font-family:Inter,Roboto,"Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}
        .print-page{width:min(1160px,calc(100% - 32px));margin:0 auto;padding:24px 0 48px}.print-actions{display:flex;justify-content:flex-end;gap:8px;margin-bottom:16px}
        .tax-invoice{position:relative;overflow:hidden;background:var(--paper);border:1px solid #cbd5e1;border-radius:14px;padding:30px 32px 20px;box-shadow:0 24px 70px rgba(15,23,42,.12);font-size:12px;line-height:1.45}
        .invoice-accent{position:absolute;inset:0 0 auto;height:7px;background:linear-gradient(90deg,#0f172a 0%,#1e3a5f 64%,#0891b2 100%)}
        .invoice-brand{display:grid;grid-template-columns:minmax(0,1fr) 270px;gap:30px;align-items:start;padding:8px 0 22px;border-bottom:1px solid var(--line)}
        .agency-brand{display:flex;gap:16px;min-width:0}.agency-logo{display:grid;place-items:center;flex:none;width:82px;height:82px;border:1px solid var(--line);border-radius:12px;background:var(--soft)}.agency-logo img{display:block;max-width:68px;max-height:68px;object-fit:contain}
        .agency-copy{min-width:0}.agency-copy .eyebrow,.section-label{margin:0 0 4px;color:#0e7490;font-size:9px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}.agency-copy h1{margin:0;color:var(--ink);font-size:27px;line-height:1.12;letter-spacing:-.035em}.agency-copy .legal-name{margin-top:4px;color:var(--blue);font-weight:700}.agency-copy p{margin:3px 0;color:#475569}.agency-compliance{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:8px}.agency-compliance span{color:var(--slate);font-size:10px}.agency-compliance b{color:var(--ink);font-weight:750}
        .invoice-identity{padding:18px 20px;border-radius:12px;background:var(--navy);color:#fff;text-align:right}.copy-status{display:inline-block;padding:4px 8px;border:1px solid rgba(255,255,255,.25);border-radius:999px;color:#cbd5e1;font-size:8px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.invoice-identity p{margin:17px 0 3px;color:#67e8f9;font-size:11px;font-weight:800;letter-spacing:.16em}.invoice-identity h2{margin:0;font-size:23px;line-height:1.2;font-variant-numeric:tabular-nums}.identity-rule{width:46px;height:2px;margin:12px 0 6px auto;background:#22d3ee}.invoice-identity small{color:#cbd5e1;font-size:9px;text-transform:uppercase;letter-spacing:.1em}
        .invoice-overview{display:grid;grid-template-columns:1.15fr .85fr;gap:14px;padding:16px 0}.buyer-card,.metadata-card{margin:0;padding:15px 17px;border:1px solid var(--line);border-radius:10px;background:var(--soft)}.buyer-card h3{margin:1px 0 5px;font-size:17px;line-height:1.2}.buyer-card>p:not(.section-label){margin:3px 0;color:#475569}.buyer-facts{display:flex;flex-wrap:wrap;gap:10px 24px;margin-top:12px}.buyer-facts span,.bank-grid span{display:grid;gap:1px}.buyer-facts small,.bank-grid small{color:var(--slate);font-size:8px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.buyer-facts b,.bank-grid b{font-size:10px;font-variant-numeric:tabular-nums}
        .metadata-card{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}.invoice-detail{display:grid;gap:2px;padding:7px 0;border-bottom:1px solid #e2e8f0}.invoice-detail:nth-last-child(-n+2){border-bottom:0}.invoice-detail dt{color:var(--slate);font-size:8px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.invoice-detail dd{margin:0;color:var(--ink);font-weight:700;font-variant-numeric:tabular-nums}
        .items-section{border:1px solid #cbd5e1;border-radius:10px;overflow:hidden}.items-heading{display:flex;align-items:center;justify-content:space-between;padding:8px 11px;background:var(--soft-2);border-bottom:1px solid var(--line);color:var(--blue);font-size:9px;font-weight:800;letter-spacing:.09em;text-transform:uppercase}.items-heading small{color:var(--slate);font-size:8px}.invoice-table{width:100%;overflow-x:auto}.invoice-table table{width:100%;border-collapse:collapse;table-layout:auto}.invoice-table th{padding:8px 4px;background:#e8eef5;color:#334155;border-bottom:1px solid #cbd5e1;font-size:7.5px;font-weight:800;letter-spacing:.025em;text-transform:uppercase;white-space:nowrap}.invoice-table tbody td{padding:9px 5px;border-bottom:1px solid #e5eaf0;color:#334155;font-size:12.5px;line-height:1.35;vertical-align:top;white-space:nowrap}.invoice-table tbody tr:nth-child(even){background:#fafcff}.invoice-table tbody tr:last-child td{border-bottom:0}.invoice-table th:first-child,.invoice-table td:first-child{padding-left:8px;text-align:center}.invoice-table .product-name{width:22%;min-width:150px;white-space:normal;color:var(--ink)}.numeric{text-align:right!important;font-variant-numeric:tabular-nums}.row-total{color:var(--ink)!important;font-weight:800}
        .invoice-summary{display:grid;grid-template-columns:1fr .82fr;gap:24px;padding:18px 0 16px}.summary-notes{display:grid;align-content:start;gap:18px}.delivery-facts{display:flex;flex-wrap:wrap;gap:10px}.delivery-facts>div{display:grid;gap:2px;min-width:110px;padding:9px 11px;border-radius:8px;background:var(--soft-2)}.delivery-facts small{color:var(--slate);font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.delivery-facts b{font-size:11px;font-variant-numeric:tabular-nums}.delivery-facts em{color:var(--slate);font-size:8px;font-style:normal;font-weight:600}.terms h3,.invoice-totals h3{margin:0 0 8px;color:var(--blue);font-size:9px;letter-spacing:.1em;text-transform:uppercase}.terms ol{margin:0;padding-left:16px;color:#475569;font-size:9px}.terms li{margin:3px 0;padding-left:2px}
        .invoice-totals{padding:14px 16px;border:1px solid var(--line);border-radius:10px;background:var(--soft)}.invoice-totals p{display:flex;justify-content:space-between;gap:20px;margin:0;padding:4px 0;color:#475569}.invoice-totals p b{color:var(--ink);font-weight:700;font-variant-numeric:tabular-nums}.net-payable{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:10px -16px -14px;padding:13px 16px;border-radius:0 0 9px 9px;background:var(--navy);color:#fff}.net-payable span{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.net-payable b{font-size:20px;font-variant-numeric:tabular-nums}.invoice-totals .amount-words{display:grid;gap:2px;margin:14px -4px 0;padding:8px 4px 0;border-top:1px solid var(--line)}.amount-words span{color:var(--slate);font-size:8px;font-weight:800;text-transform:uppercase}.amount-words b{font-size:9px;line-height:1.45;text-align:left;text-transform:capitalize}
        .settlement{display:grid;grid-template-columns:1.25fr .75fr;gap:28px;min-height:105px;padding:16px 0;border-top:1px solid var(--line)}.bank-details h3{margin:4px 0 10px;font-size:14px}.bank-details h3 small{color:var(--slate);font-size:10px;font-weight:600}.bank-grid{display:flex;flex-wrap:wrap;gap:8px 24px}.muted{color:var(--slate)}.signatory{display:flex;align-items:center;justify-content:flex-start;flex-direction:column;text-align:center}.signatory>b{font-size:11px}.signatory img{display:block;width:140px;height:46px;margin:5px 0;object-fit:contain}.signatory span{width:180px;margin-top:auto;padding-top:7px;border-top:1px solid #94a3b8;color:#475569;font-size:9px;font-weight:700}
        .invoice-document-footer{display:grid;grid-template-columns:1fr auto 1fr;gap:16px;padding-top:10px;border-top:1px solid var(--line);color:var(--slate);font-size:8px;letter-spacing:.04em}.invoice-document-footer span:nth-child(2){text-align:center}.invoice-document-footer span:last-child{text-align:right}
        @media(max-width:760px){.print-page{width:100%;padding:0}.print-actions{padding:12px;margin:0}.tax-invoice{border-radius:0;padding:22px 16px}.invoice-brand,.invoice-overview,.invoice-summary,.settlement{grid-template-columns:1fr}.invoice-identity{text-align:left}.identity-rule{margin-left:0}.metadata-card{grid-template-columns:1fr 1fr}.invoice-table table{min-width:820px}.invoice-document-footer{grid-template-columns:1fr}.invoice-document-footer span,.invoice-document-footer span:nth-child(2),.invoice-document-footer span:last-child{text-align:center}}
        @media print{
          html,body{width:210mm;min-height:297mm;background:#fff!important}body{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
          .print-page{width:auto;max-width:none;margin:0;padding:0;color:#000}.print-actions{display:none!important}.tax-invoice{min-height:280mm;border:0;border-radius:0;padding:5mm 5.5mm 4mm;box-shadow:none}.invoice-accent{height:2mm}
          .invoice-brand{grid-template-columns:minmax(0,1fr) 54mm;gap:5mm;padding:2mm 0 4mm}.agency-logo{width:17mm;height:17mm;border-radius:2mm}.agency-logo img{max-width:14mm;max-height:14mm}.agency-copy h1{font-size:17pt}.agency-copy p{margin:1px 0;font-size:7pt}.agency-copy .eyebrow{font-size:6pt}.agency-compliance{margin-top:1.5mm}.agency-compliance span{font-size:6.5pt}
          .invoice-identity{padding:3.5mm 4mm;border-radius:2mm}.invoice-identity p{margin:3mm 0 .5mm;font-size:7pt}.invoice-identity h2{font-size:14pt}.copy-status{font-size:5.5pt}.identity-rule{margin:2mm 0 1mm auto}.invoice-identity small{font-size:5.5pt}
          .invoice-overview{grid-template-columns:1.15fr .85fr;gap:2.5mm;padding:3mm 0}.buyer-card,.metadata-card{padding:2.5mm 3mm;border-radius:2mm}.buyer-card h3{font-size:10pt}.buyer-card>p:not(.section-label){font-size:7pt}.buyer-facts{gap:1.5mm 4mm;margin-top:2mm}.buyer-facts small,.bank-grid small,.invoice-detail dt{font-size:5.2pt}.buyer-facts b,.bank-grid b,.invoice-detail dd{font-size:6.4pt}.metadata-card{grid-template-columns:1fr 1fr;gap:0 2mm}.invoice-detail{padding:1.2mm 0}
          .items-section{border-radius:2mm;break-inside:auto}.items-heading{padding:1.4mm 2mm;font-size:6pt}.invoice-table{overflow:visible}.invoice-table table{min-width:0;table-layout:auto}.invoice-table thead{display:table-header-group}.invoice-table tr{break-inside:avoid;page-break-inside:avoid}.invoice-table th{padding:1.4mm .6mm;font-size:5.4pt;letter-spacing:0}.invoice-table tbody td{padding:1.8mm .65mm;font-size:8.6pt;line-height:1.25}.invoice-table .product-name{width:24%;min-width:28mm;max-width:38mm}.invoice-table th:first-child,.invoice-table td:first-child{padding-left:1mm}
          .invoice-summary{grid-template-columns:1fr .82fr;gap:5mm;padding:3mm 0}.summary-notes{gap:3mm}.delivery-facts{gap:2mm}.delivery-facts>div{min-width:22mm;padding:1.7mm 2mm;border-radius:1.5mm}.delivery-facts small,.terms h3,.invoice-totals h3{font-size:5.3pt}.delivery-facts b{font-size:6.5pt}.terms ol{font-size:6pt}.invoice-totals{padding:2.5mm 3mm;border-radius:2mm}.invoice-totals p{padding:.7mm 0;font-size:6.5pt}.net-payable{margin:2mm -3mm -2.5mm;padding:2.4mm 3mm;border-radius:0 0 2mm 2mm}.net-payable span{font-size:7pt}.net-payable b{font-size:12pt}.invoice-totals .amount-words{margin:2.5mm 0 0;padding:1.5mm 0 0}.amount-words b{font-size:6pt}
          .settlement{grid-template-columns:1.25fr .75fr;gap:5mm;min-height:21mm;padding:3mm 0}.bank-details h3{margin:1mm 0 2mm;font-size:8pt}.signatory>b{font-size:6.5pt}.signatory img{width:28mm;height:9mm;margin:1mm 0}.signatory span{width:36mm;padding-top:1mm;font-size:6pt}.invoice-document-footer{gap:3mm;padding-top:1.5mm;font-size:5.3pt}
          @page{size:A4 portrait;margin:6mm}
        }
      `}</style>
    </main>
  );
}
