const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS"
};

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json",...cors}})}
function clean(v,max=12000){return String(v??"").trim().slice(0,max)}

async function gemini(prompt, env){
  if(!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY belum dipasang di Worker Secrets.");
  const url="https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent";
  const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":env.GEMINI_API_KEY},body:JSON.stringify({contents:[{parts:[{text:prompt}]}]})});
  const d=await r.json();
  if(!r.ok) throw new Error(d?.error?.message||"Gemini API gagal.");
  return d?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("")||"";
}

export default {
 async fetch(request,env){
  if(request.method==="OPTIONS") return new Response(null,{headers:cors});
  const u=new URL(request.url);
  try{
   if(u.pathname==="/api/health") return json({ok:true,ai:!!env.GEMINI_API_KEY,database:!!env.DB});
   if(u.pathname==="/api/contents"&&request.method==="GET"){
    const {results}=await env.DB.prepare("SELECT * FROM contents ORDER BY id DESC LIMIT 100").all();
    return json({items:results});
   }
   if(u.pathname==="/api/contents"&&request.method==="POST"){
    const b=await request.json();
    const r=await env.DB.prepare("INSERT INTO contents(title,niche,audience,goal,script,visual,stage,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .bind(clean(b.title,300),clean(b.niche,200),clean(b.audience,300),clean(b.goal,80),clean(b.script),clean(b.visual),["IDE","SCRIPT","VISUAL","PRODUKSI","SELESAI"].includes(b.stage)?b.stage:"IDE",Date.now(),Date.now()).run();
    return json({ok:true,id:r.meta.last_row_id},201);
   }
   if(u.pathname.startsWith("/api/contents/")){
    const id=Number(u.pathname.split("/").pop()); if(!Number.isInteger(id)) return json({error:"ID tidak valid"},400);
    if(request.method==="PATCH"){const b=await request.json();const allowed=["IDE","SCRIPT","VISUAL","PRODUKSI","SELESAI"];if(!allowed.includes(b.stage))return json({error:"Stage tidak valid"},400);await env.DB.prepare("UPDATE contents SET stage=?,updated_at=? WHERE id=?").bind(b.stage,Date.now(),id).run();return json({ok:true})}
    if(request.method==="DELETE"){await env.DB.prepare("DELETE FROM contents WHERE id=?").bind(id).run();return json({ok:true})}
   }
   if(u.pathname==="/api/generate"&&request.method==="POST"){
    const b=await request.json(),type=b.type,title=clean(b.title,300),niche=clean(b.niche,200),audience=clean(b.audience,300),goal=clean(b.goal,80);
    if(!title)return json({error:"Judul wajib diisi"},400);
    let prompt="";
    if(type==="script") prompt=`Kamu adalah scriptwriter Shorts berbahasa Indonesia. Buat script singkat untuk judul "${title}". Niche: ${niche}. Target: ${audience}. Tujuan: ${goal}. Struktur: HOOK, OPENING, VALUE, CTA. Gaya natural, jelas, tidak bertele-tele. Jangan beri penjelasan tambahan, hanya script siap rekam.`;
    else if(type==="visual") prompt=`Kamu adalah creative director video pendek. Buat visual/video prompt berbahasa Indonesia untuk judul "${title}". Niche: ${niche}. Target: ${audience}. Tujuan: ${goal}. Buat arahan 5 scene untuk video vertikal 9:16: subject, lokasi, aksi, camera, lighting, mood, B-roll. Konsisten karakter dan wardrobe. Jangan membuat teks acak di footage.`;
    else return json({error:"Type AI tidak dikenal"},400);
    const out=await gemini(prompt,env);
    return json(type==="script"?{script:out}:{visual:out});
   }
   return env.ASSETS.fetch(request);
  }catch(e){return json({error:e.message||"Server error"},500)}
 }
}
