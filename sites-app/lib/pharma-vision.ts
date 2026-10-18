export const pharmaFields=["product_name","composition","pack_size","batch_number","mfg_date","expiry_date","mrp","marketed_by","manufactured_by"] as const;
export type PharmaField=typeof pharmaFields[number];
export type RawPharmaScan={product_name:string;composition:string;pack_size:string;batch_number:string;mfg_date:string;expiry_date:string;mrp:string;marketed_by:string;manufactured_by:string;dosage_form:"liquid"|"tablet"|"capsule"|"injection"|"cream"|"powder"|"other"|"unknown";warnings:string[];evidence:Record<PharmaField,number[]>;source_text:Record<PharmaField,string>;confidence:Record<PharmaField,number>};
export type PharmaScanData=Record<PharmaField,string|null>;

export const PHARMA_VISION_SYSTEM_PROMPT=`You are a pharmaceutical packaging transcription engine. The user supplies 2–3 photographs of the same medicine in RANDOM ORDER.

MANDATORY SEARCH METHOD
- Do not assign meaning from image position or image index.
- Scan every image completely.
- Locate values only through printed visual anchors, typography, and nearby layout.
- Cross-reference duplicates across all images. If two images conflict, return an empty value and a warning.
- Never use product knowledge, web knowledge, likely spellings, common strengths, or date assumptions.

FIELD ANCHORS
1. product_name: the large prominent commercial brand/trade name. Exclude licence numbers, addresses, composition paragraphs, company names, and manufacturing stamps. Remove stray punctuation only when the full brand remains visibly readable; never restore clipped letters.
2. composition: text following anchors such as "Composition", "Each tablet contains", "Each hard gelatin capsule contains", or a clearly printed active-salt list. Preserve every ingredient and strength. Never copy the brand name as composition.
3. pack_size: text near "Pack", "Packing", "Net Volume", "Each bottle contains", strip counts, or package quantity. Liquids require visible volume such as "100 ml" or an explicitly printed unit such as "1*1"; never infer a tablet strip count for a bottle.
4. batch_number: exact token adjacent to "Batch No", "B.No", "Batch", or "Lot". Never use a drug licence, manufacturing licence, FSSAI, GSTIN, postal code, or address number. If O/0 or I/1 is ambiguous, return empty.
5. mfg_date: only a date explicitly anchored by "Mfg", "Mfd", "Manufactured", or "Mfg Date". Normalize to MM/YYYY. Never select it merely because it is the earlier date.
6. expiry_date: only a date explicitly anchored by "Exp", "Expiry", "Use Before", or "Best Before". Normalize to MM/YYYY. Never select it merely because it is the later date.
7. mrp: numeric price explicitly anchored by "MRP", "Maximum Retail Price", "Rs", or ₹. Exclude PTR, rates, quantities, licence numbers, and dates. Return numeric characters with two decimals as a string.
8. marketed_by: company and address block explicitly headed "Marketed by", "Distributed by", or equivalent. Do not swap it with manufacturer.
9. manufactured_by: manufacturing company, plant, licences, and location block explicitly headed "Manufactured by", "Mfg by", or equivalent. Do not swap it with marketer.

ZERO-HALLUCINATION CONTRACT
- Every non-empty value requires exact source_text and at least one supporting image number in evidence.
- source_text is a verbatim visible excerpt, not corrected or reconstructed text.
- confidence measures visual certainty only. Blurred, cropped, reflected, or partially hidden text must be empty.
- Missing fields are empty strings. Never guess.
- Return only the requested structured JSON.`;

export const pharmaVisionSchema={name:"pharma_product_scan",strict:true,schema:{type:"object",additionalProperties:false,properties:{product_name:{type:"string"},composition:{type:"string"},pack_size:{type:"string"},batch_number:{type:"string"},mfg_date:{type:"string"},expiry_date:{type:"string"},mrp:{type:"string"},marketed_by:{type:"string"},manufactured_by:{type:"string"},dosage_form:{type:"string",enum:["liquid","tablet","capsule","injection","cream","powder","other","unknown"]},warnings:{type:"array",items:{type:"string"}},evidence:{type:"object",additionalProperties:false,properties:Object.fromEntries(pharmaFields.map(x=>[x,{type:"array",items:{type:"integer",minimum:1,maximum:3}}])),required:[...pharmaFields]},source_text:{type:"object",additionalProperties:false,properties:Object.fromEntries(pharmaFields.map(x=>[x,{type:"string"}])),required:[...pharmaFields]},confidence:{type:"object",additionalProperties:false,properties:Object.fromEntries(pharmaFields.map(x=>[x,{type:"number",minimum:0,maximum:1}])),required:[...pharmaFields]}},required:[...pharmaFields,"dosage_form","warnings","evidence","source_text","confidence"]}};

const clean=(v:unknown)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().replace(/^[\s,;:()\[\]{}|]+|[|]+$/g,"").trim(),words=(v:string)=>v.toUpperCase().replace(/[^A-Z0-9]+/g," ").trim(),fragment=(v:string)=>!v||v.length<3||v.length>300||/^[^A-Z0-9]+/i.test(v)||/[�]|\.{3,}/.test(v)||((v.match(/[A-Z]/gi)||[]).length<3);
function monthYear(value:string){let m=value.match(/^(\d{1,2})[\/-](\d{2}|\d{4})$/);if(m){const mo=Number(m[1]),yr=Number(m[2].length===2?`20${m[2]}`:m[2]);return mo>=1&&mo<=12&&yr>=2000&&yr<=2100?`${String(mo).padStart(2,"0")}/${yr}`:""}m=value.match(/^(\d{4})[\/-](\d{1,2})$/);if(m){const yr=Number(m[1]),mo=Number(m[2]);return mo>=1&&mo<=12&&yr>=2000&&yr<=2100?`${String(mo).padStart(2,"0")}/${yr}`:""}return""}
export function validatePharmaScan(raw:RawPharmaScan,imageCount:number){const out:RawPharmaScan={...raw,warnings:Array.isArray(raw.warnings)?raw.warnings.map(clean).filter(Boolean):[],evidence:Object.fromEntries(pharmaFields.map(key=>[key,[]])) as Record<PharmaField,number[]>,source_text:Object.fromEntries(pharmaFields.map(key=>[key,""])) as Record<PharmaField,string>,confidence:Object.fromEntries(pharmaFields.map(key=>[key,0])) as Record<PharmaField,number>};for(const key of pharmaFields){out.evidence[key]=Array.isArray(raw.evidence?.[key])?[...new Set(raw.evidence[key].map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=imageCount))]:[];out.source_text[key]=clean(raw.source_text?.[key]);out.confidence[key]=Math.max(0,Math.min(1,Number(raw.confidence?.[key])||0));out[key]=clean(raw[key]);if(out[key]&&(!out.source_text[key]||!out.evidence[key].length)){out[key]="";out.confidence[key]=0;out.warnings.push(`${key.replaceAll("_"," ")} removed because visible source evidence was missing.`)}if(out[key]&&out.confidence[key]<.7){out[key]="";out.warnings.push(`${key.replaceAll("_"," ")} removed because visual confidence was below 70%.`)}else if(out[key]&&out.confidence[key]<.9)out.warnings.push(`${key.replaceAll("_"," ")} requires human verification.`)}
  const formOnly=/^(ORAL )?(SUSPENSION|SYRUP|TABLETS?|CAPSULES?|INJECTION|CREAM|GEL|POWDER)( USP| IP| BP)?$/;if(fragment(out.product_name)||formOnly.test(words(out.product_name))||/^(RAL|USP|IP|BP)\b/.test(words(out.product_name))){out.product_name="";out.confidence.product_name=0;out.warnings.push("Product name rejected as clipped, generic, or non-brand text.")}
  if(fragment(out.composition)||words(out.composition)===words(out.product_name)||formOnly.test(words(out.composition))){out.composition="";out.confidence.composition=0;out.warnings.push("Composition rejected because a distinct active-salt list was not readable.")}
  out.batch_number=out.batch_number.toUpperCase().replace(/\s+/g,"");if(out.batch_number&&(!/^[A-Z0-9][A-Z0-9\/-]{2,23}$/.test(out.batch_number)||!/[0-9\/-]/.test(out.batch_number)||/LIC|GST|FSSAI|PIN|SUSP|ORAL|TABLET|CAPSULE|BOTTLE/.test(out.batch_number))){out.batch_number="";out.confidence.batch_number=0;out.warnings.push("Batch rejected because it was not a complete batch/lot token.")}
  for(const key of ["mfg_date","expiry_date"] as const){const normalized=monthYear(out[key]);if(out[key]&&!normalized)out.warnings.push(`${key.replaceAll("_"," ")} rejected because it was not a valid anchored month/year.`);out[key]=normalized;if(!normalized)out.confidence[key]=0}
  const price=Number(out.mrp.replace(/[₹,\s]/g,""));if(!Number.isFinite(price)||price<=0||price>100000){if(out.mrp)out.warnings.push("MRP rejected because it was not a valid anchored price.");out.mrp="";out.confidence.mrp=0}else out.mrp=price.toFixed(2);
  for(const key of ["marketed_by","manufactured_by"] as const)if(fragment(out[key])){out[key]="";out.confidence[key]=0}
  if(out.pack_size&&out.dosage_form==="liquid"){const liquid=out.pack_size.match(/(\d+(?:\.\d+)?)\s*(ML|L)\b/i);if(liquid)out.pack_size=`${liquid[1]}${liquid[2].toLowerCase()} Bottle`;else if(!/^1\s*[x*]\s*1$/i.test(out.pack_size)){out.pack_size="";out.confidence.pack_size=0;out.warnings.push("Pack size rejected because liquid packaging needs a visible volume or explicit unit.")}}
  if(out.mfg_date&&out.expiry_date){const[a,b]=[out.mfg_date,out.expiry_date].map(x=>{const[m,y]=x.split("/").map(Number);return y*12+m});if(a>=b){out.mfg_date="";out.expiry_date="";out.confidence.mfg_date=0;out.confidence.expiry_date=0;out.warnings.push("Manufacturing and expiry dates were rejected because their chronology was invalid.")}}
  out.warnings=[...new Set(out.warnings)];return out}
export function publicScanData(scan:RawPharmaScan):PharmaScanData{return Object.fromEntries(pharmaFields.map(key=>[key,scan[key]||null])) as PharmaScanData}
