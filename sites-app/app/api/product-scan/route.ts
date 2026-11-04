import { requestVision, VisionRequestError } from "@/lib/vision-request";
import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getMembership } from "@/lib/medibill";
import { PHARMA_VISION_SYSTEM_PROMPT, pharmaVisionSchema, publicScanData, validatePharmaScan, type RawPharmaScan } from "@/lib/pharma-vision";

const allowed=new Set(["image/jpeg","image/png","image/webp"]),MAX_EACH=8*1024*1024,MAX_TOTAL=20*1024*1024;
const privateNoStore={"Cache-Control":"no-store, no-cache, must-revalidate, private","Pragma":"no-cache","Expires":"0"};
function json(body:unknown,init?:ResponseInit){return NextResponse.json(body,{...init,headers:{...privateNoStore,...init?.headers}})}
function dataUrl(file:File){return file.arrayBuffer().then(buffer=>{const bytes=new Uint8Array(buffer);let binary="";for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return`data:${file.type};base64,${btoa(binary)}`})}

export async function POST(request:Request){
  const user=await getChatGPTUser();if(!user)return json({error:"Unauthorized"},{status:401});
  const member=await getMembership(user.userId);if(!member)return json({error:"Workspace required"},{status:403});
  const requestId=crypto.randomUUID();
  let form:FormData;
  try{form=await request.formData()}catch{return json({code:"INVALID_UPLOAD",error:"The image upload was interrupted or invalid. Please select the photos again.",requestId},{status:400})}
  const files=form.getAll("images").filter((x):x is File=>x instanceof File);
  if(files.length<2||files.length>3)return json({error:"Upload 2 or 3 photos of the same product"},{status:400});
  if(files.some(x=>!allowed.has(x.type)||x.size===0||x.size>MAX_EACH)||files.reduce((s,x)=>s+x.size,0)>MAX_TOTAL)return json({error:"Use 2–3 JPG, PNG or WebP photos, maximum 8 MB each and 20 MB total"},{status:400});
  const bindings=env as typeof env&{GEMINI_API_KEY?:string;GEMINI_VISION_MODEL?:string;OPENAI_API_KEY?:string;PRODUCT_VISION_MODEL?:string};
  if(!bindings.GEMINI_API_KEY&&!bindings.OPENAI_API_KEY)return json({error:"AI vision is not configured","code":"VISION_NOT_CONFIGURED"},{status:503});
  let urls:string[]=[];
  let content:Array<{type:"text";text:string}|{type:"image_url";image_url:{url:string;detail:"high"}}>=[];
  const userPrompt=`Analyze all ${files.length} images as one product in the supplied random order. Do not infer a role from image position. Search every image for brand typography and the anchors Composition, Each tablet/capsule contains, Pack, Net Volume, Batch/B.No/Lot, Mfg/Mfd, Exp/Use Before, MRP/Rs/₹, Marketed by, and Manufactured by. Return blank values when exact visible evidence is missing.`;
  try{
    // Product photos are intentionally memory-only: never write them to D1, R2, logs, or local disk.
    urls=await Promise.all(files.map(dataUrl));
    content=[{type:"text",text:userPrompt},...urls.map(url=>({type:"image_url" as const,image_url:{url,detail:"high" as const}}))];
    const call=(signal:AbortSignal)=>bindings.GEMINI_API_KEY?fetch(`https://generativelanguage.googleapis.com/v1beta/models/${bindings.GEMINI_VISION_MODEL||"gemini-3.8-flash"}:generateContent?key=${encodeURIComponent(bindings.GEMINI_API_KEY)}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({systemInstruction:{parts:[{text:PHARMA_VISION_SYSTEM_PROMPT}]},contents:[{role:"user",parts:[{text:userPrompt},...urls.map((url,i)=>({inlineData:{mimeType:files[i].type,data:url.split(",")[1]}}))]}],generationConfig:{temperature:0,responseMimeType:"application/json",responseJsonSchema:pharmaVisionSchema.schema}}),signal}):fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{authorization:`Bearer ${bindings.OPENAI_API_KEY}`,"content-type":"application/json"},body:JSON.stringify({model:bindings.PRODUCT_VISION_MODEL||"gpt-4o-mini",temperature:0,messages:[{role:"system",content:PHARMA_VISION_SYSTEM_PROMPT},{role:"user",content}],response_format:{type:"json_schema",json_schema:pharmaVisionSchema}}),signal});
    const raw=await requestVision(call) as {choices?:Array<{message?:{content?:string}}> ;candidates?:Array<{content?:{parts?:Array<{text?:string}>}}>};
    const text=bindings.GEMINI_API_KEY?raw?.candidates?.[0]?.content?.parts?.map(x=>x.text||"").join(""):raw?.choices?.[0]?.message?.content;
    if(!text)throw new VisionRequestError("VISION_EMPTY_RESULT","The vision service returned no extraction. Please retry or enter details manually.",422);
    let parsed:RawPharmaScan;
    try{parsed=JSON.parse(text) as RawPharmaScan;if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new Error("invalid")}
    catch{throw new VisionRequestError("VISION_INVALID_RESPONSE","The vision service returned invalid extraction data. Please retry.",502)}
    const data=validatePharmaScan(parsed,files.length);
    return json({requestId,engine:bindings.GEMINI_API_KEY?"gemini-multi-image-vision":"openai-multi-image-vision",imageCount:files.length,data:publicScanData(data),validation:{warnings:data.warnings,confidence:data.confidence,evidence:data.evidence}});
  }catch(error){
    const failure=error instanceof VisionRequestError?error:new VisionRequestError("VISION_INTERNAL_ERROR","The scan could not finish. Please retry or enter details manually.",500);
    console.error("Product scan failed",{requestId,code:failure.code,status:failure.status,upstreamStatus:failure.upstreamStatus,providerStatus:failure.providerStatus,provider:bindings.GEMINI_API_KEY?"gemini":"openai",model:bindings.GEMINI_API_KEY?(bindings.GEMINI_VISION_MODEL||"gemini-3.8-flash"):(bindings.PRODUCT_VISION_MODEL||"gpt-4o-mini")});
    return json({error:failure.message,code:failure.code,requestId},{status:failure.status});
  }finally{
    // Drop every large binary/base64 reference on success, provider failure, timeout, or validation failure.
    content.length=0;
    urls.fill("");
    urls.length=0;
    console.info("Product OCR temporary image references released",{tenantId:member.tenantId,imageCount:files.length});
  }
}
