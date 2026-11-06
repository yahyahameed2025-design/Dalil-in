const FIXED_IBAN="BH71ALSA00447084100100";
const FIRST_EN="Dalilin W.L.L",FIRST_AR="دليل ان ذ.م.م";
const $=id=>document.getElementById(id);
/* تخزين المكتبات والنماذج في المتصفح: تُنزَّل مرة واحدة فقط ثم تعمل من الذاكرة */
if("serviceWorker" in navigator)window.addEventListener("load",()=>{navigator.serviceWorker.register("sw.js").catch(()=>{})});
try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch(e){}
let files=[];
try{pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"}catch(e){}

/* ---------- upload ---------- */
function addFiles(l){for(const f of l)files.push(f);draw()}
function draw(){
  $("thumbs").innerHTML="";
  files.forEach((f,i)=>{const d=document.createElement("div");d.className="th";
    const s=document.createElement("span");s.textContent=f.name;const b=document.createElement("button");b.textContent="×";b.onclick=()=>{files.splice(i,1);draw()};
    d.append(s,b);$("thumbs").append(d)});
  $("ext").disabled=!files.length;
}
$("drop").onclick=()=>$("file").click();
$("file").onchange=e=>{addFiles(e.target.files);e.target.value=""};
$("drop").ondragover=e=>{e.preventDefault();$("drop").classList.add("on")};
$("drop").ondragleave=()=>$("drop").classList.remove("on");
$("drop").ondrop=e=>{e.preventDefault();$("drop").classList.remove("on");addFiles(e.dataTransfer.files)};

/* ---------- القراءة عبر Gemini API ---------- */
$("ext").onclick=async()=>{
  const st=$("st");st.className="";$("ext").disabled=true;
  const R={},merge=o=>{for(const k in o)if(o[k]&&!R[k])R[k]=o[k]},errs=[];
  try{
    for(const f of files){
      st.textContent="جارٍ قراءة "+f.name+" بواسطة Gemini…";
      try{merge(await geminiReadFile(f))}catch(e){errs.push(f.name+": "+(e.message||e))}
    }
    $("nameAr").value=R.companyAr||R.personAr||"";$("nameEn").value=R.companyEn||R.personEn||"";
    $("addrAr").value=R.addrAr||"";$("addrEn").value=R.addrEn||"";$("cr").value=R.crNo||"";
    $("sigAr").value=R.personAr||"";$("sigEn").value=R.personEn||"";
    const note=errs.length?"تعذّرت قراءة: "+errs.join(" | ")+". ":"";
    if(Object.keys(R).length){st.className=errs.length?"err":"";st.textContent=note+"تمت القراءة. راجع الحقول أدناه وصحّح أي خطأ، ثم نزّل العقد."}
    else{st.className="err";st.textContent=(note||"لم أتمكن من التعرف على بيانات. ")+"جرّب صورة أوضح أو أدخل البيانات يدوياً."}
  }catch(e){st.className="err";st.textContent="تعذّرت القراءة: "+(e.message||e)+" — يمكنك إدخال البيانات يدوياً."}
  $("ext").disabled=!files.length;
};

/* ---------- التاريخ وإعادة الضبط ---------- */
function todayISO(){const d=new Date(),p=n=>String(n).padStart(2,"0");return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())}
function fmtDate(iso){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso||"");return m?m[3]+"/"+m[2]+"/"+m[1]:""}
$("date").value=todayISO();
$("iban").value=FIXED_IBAN;
function resetAll(){
  const dirty=files.length||["nameAr","nameEn","addrAr","addrEn","cr","com","sigAr","sigEn"].some(k=>$(k).value.trim());
  if(dirty&&!confirm("سيتم مسح كل الملفات والبيانات والبدء بعقد جديد. هل تريد المتابعة؟"))return;
  files=[];draw();
  for(const k of["nameAr","nameEn","addrAr","addrEn","cr","com","sigAr","sigEn"])$(k).value="";
  $("date").value=todayISO();$("iban").value=FIXED_IBAN;
  $("st").textContent="";$("st").className="";$("st2").textContent="";$("st2").className="";
  window.scrollTo({top:0,behavior:"smooth"});
}
$("reset").onclick=resetAll;

/* ---------- number to words ---------- */
const EO=["","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"],ET=["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
const AO=["","واحد","اثنان","ثلاثة","أربعة","خمسة","ستة","سبعة","ثمانية","تسعة","عشرة","أحد عشر","اثنا عشر","ثلاثة عشر","أربعة عشر","خمسة عشر","ستة عشر","سبعة عشر","ثمانية عشر","تسعة عشر"],AT=["","","عشرون","ثلاثون","أربعون","خمسون","ستون","سبعون","ثمانون","تسعون"];
function words(n){
  if(!Number.isInteger(n)||n<1||n>100)return null;
  if(n===100)return{en:"one hundred",ar:"مائة"};
  if(n<20)return{en:EO[n],ar:AO[n]};
  const t=Math.floor(n/10),u=n%10;
  return{en:ET[t]+(u?"-"+EO[u]:""),ar:(u?AO[u]+" و":"")+AT[t]};
}

/* ---------- PDF overlay ---------- */
const H=841.89;
function textPng(txt,w,h,rtl,align,maxW,bold){
  const S=5,c=document.createElement("canvas");c.width=Math.ceil(maxW*S);c.height=Math.ceil(h*S);
  const x=c.getContext("2d");x.fillStyle="#fff";x.fillRect(0,0,c.width,c.height);
  let fs=h*S*.85;x.direction=rtl?"rtl":"ltr";
  const f=s=>`${bold?"bold ":""}${s}px Tahoma, Arial, sans-serif`;
  x.font=f(fs);while(x.measureText(txt).width>c.width-4&&fs>8){fs-=2;x.font=f(fs)}
  x.fillStyle="#000";x.textBaseline="middle";
  const tw=x.measureText(txt).width;
  x.textAlign="left";
  let px=align==="r"?c.width-tw-2:align==="c"?(c.width-tw)/2:2;
  x.fillText(txt,px,c.height/2+fs*.04);
  return c;
}
/* each item: page, text, cover box [x0,yTop,x1,yBottom] (pt, top-origin), text area, rtl, align */
function items(v){
  const w=words(parseFloat(v.com)),n=v.com;
  const L=[];
  const T=(pg,t,cov,area,rtl,al,b)=>{if(t)L.push({pg,t,cov,area,rtl,al,b})};
  // page 1: الطرف الأول (الاسم + اسم الحساب البنكي)
  T(0,": "+FIRST_EN,[113.9,197.8,200,207.8],[113.9,197.8,200,207.8],0,"l");
  T(0,"( "+FIRST_AR+" ) :",[380,209.6,476,219],[380,209.6,476,219],1,"r");
  T(0,FIRST_EN,[94.8,297.4,223.4,307.6],[94.8,297.4,223.4,307.6],0,"l");
  T(0,FIRST_AR,[393.4,322,521.5,330.6],[393.4,322,521.5,330.6],1,"r");
  // page 1: التمهيد (اسم الشركة الأول بدون شرطة)
  T(0,"Dalilin W.L.L, a limited liability company specialized in wholesale",[115,333.2,302,341.9],[115,333.2,302,341.9],0,"l",1);
  T(0,"Dalilin)",[277.8,342.3,302,351],[277.8,342.3,302,351],0,"l",1);
  // page 1: التعريفات (Dalil-In بدون شرطة)
  T(0,"Dalilin Company- Second Party: The Subscriber (whether a",[115.5,167.9,300.5,177.5],[115.5,167.9,300.5,177.5],0,"l",1);
  // page 1: English
  T(0,v.nameEn,[124.9,238.8,194.5,246.7],[125,237.8,315,247.7],0,"l");
  T(0,v.addrEn,[75,248.9,257.4,256.7],[75,247.9,330,257.7],0,"l");
  T(0,v.cr,[102.1,258.5,137.1,266.3],[102,257.5,200,267.3],0,"l");
  // page 1: Arabic
  T(0,v.nameAr,[349.9,246.5,471.1,254.3],[340,245.5,471.1,255.3],1,"r");
  T(0,v.addrAr,[337.5,262,537.8,269.8],[335,261,537.8,270.8],1,"r");
  T(0,v.cr,[471.1,274.1,503.7,281.9],[400,273.1,503.7,283],1,"r");
  // commission
  if(n){
    if(w)T(0,w.en,[122.7,571.3,130.7,579.2],[118,570.3,135,580.2],0,"c");
    T(0,n,[156.5,570.4,161.8,579.5],[155,569.4,163,580.5],0,"c");
    T(0,n,[339.8,642.2,347.5,650.1],[338,641.2,349,651.1],1,"c");
    if(w)T(0,w.ar,[322.1,641.8,329.6,650.1],[316,640.8,331,651.1],1,"c");
  }
  // IBAN (ثابت) + إخفاء سطر الشرطات الزائد تحته
  T(0,v.iban,[88.1,308.4,212.1,317.6],[88.1,307.4,212.1,318.6],0,"l");
  T(0," ",[41.5,318.9,156.3,328.1],[41.5,317.9,156.3,329.1],0,"l");
  T(0,v.iban,[357.8,334.4,520.8,342.2],[357.8,333.4,520.8,343.2],0,"r");
  T(0," ",[423.9,346.4,570.6,354.2],[423.9,345.4,570.6,355.2],0,"l");
  // التاريخ
  T(0,v.date,[425.3,127.4,460.3,135.2],[421,126.4,463,136.2],0,"c");
  T(2,v.date,[63.2,494.9,103.2,506.6],[62,494,105,507.6],0,"c");
  T(2,v.date,[479.9,499.4,521.1,509.4],[478,498.4,522.5,510.4],0,"c");
  // page 2: signature (English)
  T(1,FIRST_EN,[135,739.8,230,750.6],[135,739.6,230,750.8],0,"l");
  T(1,v.nameEn||v.sigEn,[148,766,300,775.1],[148,765,300,776.1],0,"l");
  // page 3: addendum first party (الشرطات تُستبدل باسم الطرف الأول)
  T(2,FIRST_EN,[94.4,528.4,153.3,540.4],[94.4,527.4,230,541.4],0,"l");
  T(2,FIRST_AR,[352.3,530.2,472.4,543.8],[345,529.2,472.4,544.8],1,"r");
  // page 3: توقيع الطرف الثاني بالعربي تحت عبارة (الاسم و التوقيع : السيد/)
  T(2,FIRST_AR,[405,326.2,471,336.6],[405,326.2,471,336.6],1,"r");
  T(2,v.nameAr||v.sigAr,[339,362,470,375],[339,362,470,375],1,"r");
  // page 3: addendum second party
  T(2,v.nameEn,[100,562.2,330,573.9],[100,561.2,330,575],0,"l");
  T(2,v.nameAr,[352.4,562.2,472.3,573.9],[345,561.2,472.3,575],1,"r");
  return L;
}
async function build(v){
  const {PDFDocument}=PDFLib;
  const bytes=Uint8Array.from(atob(BASE64_PDF),c=>c.charCodeAt(0));
  const doc=await PDFDocument.load(bytes),pages=doc.getPages();
  for(const it of items(v)){
    const [ax0,ay0,ax1,ay1]=it.area,aw=ax1-ax0,ah=ay1-ay0;
    const cv=textPng(it.t,aw,ah,it.rtl,it.al,aw,it.b);
    const png=await new Promise(r=>cv.toBlob(r,"image/png"));
    const img=await doc.embedPng(new Uint8Array(await png.arrayBuffer()));
    pages[it.pg].drawImage(img,{x:ax0,y:H-ay1,width:aw,height:ah});
  }
  return await doc.save();
}
$("dl").onclick=async()=>{
  const s=$("st2");s.className="";s.textContent="جارٍ إنشاء الملف…";
  try{
    const v={nameAr:$("nameAr").value.trim(),nameEn:$("nameEn").value.trim(),addrAr:$("addrAr").value.trim(),addrEn:$("addrEn").value.trim(),cr:$("cr").value.trim(),com:$("com").value.trim(),sigAr:$("sigAr").value.trim(),sigEn:$("sigEn").value.trim(),date:fmtDate($("date").value),iban:FIXED_IBAN};
    const out=await build(v);
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([out],{type:"application/pdf"}));a.download="contract-filled.pdf";document.body.append(a);a.click();a.remove();s.textContent="تم."
  }catch(e){s.className="err";s.textContent="تعذّر إنشاء الملف: "+(e.message||e.code||e)}
};
