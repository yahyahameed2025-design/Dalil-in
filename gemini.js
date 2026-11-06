/* قراءة الهوية والسجل التجاري عبر Gemini API (صور أو PDF) وإرجاع حقول جاهزة للتعبئة */
const GEMINI_MODELS=["gemini-2.5-flash","gemini-2.5-flash-lite","gemini-flash-latest"];
/* مهلة كل محاولة: إن لم يرد Gemini خلال 20 ثانية ننتقل للنموذج التالي بدل الانتظار الطويل */
const GEMINI_TIMEOUT=20000;
const geminiSignal=()=>{try{return AbortSignal.timeout(GEMINI_TIMEOUT)}catch(e){const c=new AbortController();setTimeout(()=>c.abort(),GEMINI_TIMEOUT);return c.signal}};
const GEMINI_PROXY=()=>String(window.GEMINI_PROXY||"").trim().replace(/\/+$/,"");
const GEMINI_URL=m=>(GEMINI_PROXY()||"https://generativelanguage.googleapis.com")+"/v1beta/models/"+m+":generateContent";

const GEMINI_PROMPT=`You are reading a Bahrain document: either a Commercial Registration (CR) certificate, or a personal ID card (CPR), as an image or PDF. Extract the fields below exactly as printed. Never guess: if a field is not visible or not applicable, return an empty string. Use Western digits (0-9).

Fields:
- docType: "cr" for commercial registration, "id" for ID card, otherwise "other".
- companyEn: trade/company name in English including the legal suffix, written as W.L.L, S.P.C, B.S.C or similar (CR only).
- companyAr: trade/company name in Arabic including the legal suffix, written as ذ.م.م, ش.ش.و, ش.م.ب or similar (CR only).
- crNo: commercial registration number in the form "12345 - 1" (number, space, dash, space, branch/suffix number) (CR only).
- addrEn: English address built from the printed parts, in this order and only the parts that exist: "Flat N, Building N, Road N, Block N, AREA" (CR only).
- addrAr: the same address in Arabic: "شقة N، مبنى N، طريق N، مجمع N، المنطقة" (CR only).
- personAr: the person's full name in Arabic exactly as printed on the ID card, without labels (ID only).
- personEn: the person's full name in English, uppercase as printed, without labels (ID only).

Return only JSON.`;

const GEMINI_SCHEMA={
  type:"OBJECT",
  properties:Object.fromEntries(["docType","companyEn","companyAr","crNo","addrEn","addrAr","personAr","personEn"].map(k=>[k,{type:"STRING"}])),
  required:["docType","companyEn","companyAr","crNo","addrEn","addrAr","personAr","personEn"]
};

function geminiKey(){
  let k="";
  const i=document.getElementById("gkey");
  if(i)k=i.value;
  try{if(!k.trim())k=localStorage.getItem("gemini_key")||""}catch(e){}
  if(!String(k).trim())k=window.GEMINI_API_KEY||"";
  return String(k).trim();
}
/* خانة المفتاح: يُحفظ في متصفح المستخدم فقط (localStorage) ولا يوجد في ملفات الموقع */
(function(){
  const i=document.getElementById("gkey");if(!i)return;
  if(GEMINI_PROXY()){const c=i.closest(".card");if(c)c.style.display="none";return}
  try{i.value=localStorage.getItem("gemini_key")||""}catch(e){}
  i.addEventListener("input",()=>{try{localStorage.setItem("gemini_key",i.value.trim())}catch(e){}});
})();
function blobToB64(b){
  return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(",")[1]);r.onerror=()=>rej(new Error("تعذّر قراءة الملف"));r.readAsDataURL(b)});
}
/* الصور تُصغَّر إلى 2000px وتُرسل JPEG لتقليل الحجم؛ ملفات PDF تُرسل كما هي */
async function geminiPrepFile(f){
  if(f.type==="application/pdf"||/\.pdf$/i.test(f.name))return{mime:"application/pdf",data:await blobToB64(f)};
  const bmp=await createImageBitmap(f),k=Math.min(1,1600/Math.max(bmp.width,bmp.height));
  const c=document.createElement("canvas");c.width=Math.max(1,Math.round(bmp.width*k));c.height=Math.max(1,Math.round(bmp.height*k));
  const x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);x.drawImage(bmp,0,0,c.width,c.height);
  const blob=await new Promise(r=>c.toBlob(r,"image/jpeg",.92));
  return{mime:"image/jpeg",data:await blobToB64(blob)};
}
async function geminiReadFile(f){
  const proxy=GEMINI_PROXY(),key=proxy?"":geminiKey();
  if(!proxy&&!key)throw new Error("أدخل مفتاح Gemini في الخانة أعلى الصفحة");
  const {mime,data}=await geminiPrepFile(f);
  /* إيقاف "التفكير" في gemini-2.5-flash لتسريع الاستخراج */
  const mkBody=m=>JSON.stringify({
    contents:[{role:"user",parts:[{inlineData:{mimeType:mime,data}},{text:GEMINI_PROMPT}]}],
    generationConfig:Object.assign({temperature:0,responseMimeType:"application/json",responseSchema:GEMINI_SCHEMA},m==="gemini-2.5-flash"?{thinkingConfig:{thinkingBudget:0}}:{})
  });
  let lastErr=null,busy=false;
  for(const m of GEMINI_MODELS){
    let res;
    try{res=await fetch(GEMINI_URL(m),{method:"POST",headers:proxy?{"Content-Type":"application/json"}:{"Content-Type":"application/json","x-goog-api-key":key},body:mkBody(m),signal:geminiSignal()})}
    catch(e){if(e&&(e.name==="TimeoutError"||e.name==="AbortError")){busy=true;continue}throw new Error("تعذّر الاتصال بـ Gemini، تحقق من الإنترنت")}
    const j=await res.json().catch(()=>({}));
    if(!res.ok){
      lastErr=new Error((j.error&&j.error.message)||("خطأ Gemini "+res.status));
      /* 404 غير متاح، 429/500/503 ازدحام مؤقت: جرّب النموذج التالي بعد لحظة */
      if([404,429,500,502,503,504,524].includes(res.status)){busy=busy||res.status!==404;if(res.status!==404)await new Promise(r=>setTimeout(r,1500));continue}
      throw lastErr;
    }
    const parts=(j.candidates&&j.candidates[0]&&j.candidates[0].content&&j.candidates[0].content.parts)||[];
    const txt=parts.map(p=>p.text||"").join("").trim();
    if(!txt)throw new Error("لم يرجع Gemini نتيجة (ربما حُجب المحتوى)");
    let o;try{o=JSON.parse(txt.replace(/^```(?:json)?|```$/g,"").trim())}catch(e){throw new Error("نتيجة Gemini ليست JSON صالحاً")}
    const clean={};
    for(const k of["companyEn","companyAr","crNo","addrEn","addrAr","personAr","personEn"])clean[k]=String(o[k]||"").replace(/\s+/g," ").trim();
    return clean;
  }
  if(busy)throw new Error("Gemini مزدحم حالياً، أعد المحاولة بعد لحظات");
  throw lastErr||new Error("لا يوجد نموذج Gemini متاح");
}
