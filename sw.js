/* Service Worker: يحفظ المكتبات ونماذج القراءة بعد أول تنزيل ليعمل الموقع دون إعادة تنزيلها */
const CACHE="dalilin-assets-v1";
const HOSTS=["cdnjs.cloudflare.com","cdn.jsdelivr.net","huggingface.co","cdn-lfs.huggingface.co","cdn-lfs-us-1.hf.co","tessdata.projectnaptha.com"];
self.addEventListener("install",e=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
self.addEventListener("fetch",e=>{
  const r=e.request;
  if(r.method!=="GET")return;
  const u=new URL(r.url);
  /* ملفات الموقع نفسه (script.js وغيره) لا تُخزَّن هنا حتى تصل التعديلات فوراً */
  if(u.origin===self.location.origin||!HOSTS.some(h=>u.hostname===h||u.hostname.endsWith("."+h)))return;
  e.respondWith((async()=>{
    const c=await caches.open(CACHE),hit=await c.match(r);
    if(hit)return hit;
    try{
      const res=await fetch(r);
      if(res&&(res.ok||res.type==="opaque"))c.put(r,res.clone()).catch(()=>{});
      return res;
    }catch(err){
      const any=await c.match(r,{ignoreVary:true});
      if(any)return any;
      throw err;
    }
  })());
});
