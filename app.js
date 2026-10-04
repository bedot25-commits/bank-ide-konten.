const $=id=>document.getElementById(id);
const msg=(t)=>{$("msg").textContent=t};
async function api(path,options={}){const r=await fetch(path,{headers:{"Content-Type":"application/json",...(options.headers||{})},...options});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||"Request gagal");return d}
async function generate(type){
 const title=$("title").value.trim(),niche=$("niche").value.trim(),audience=$("audience").value.trim(),goal=$("goal").value;
 if(!title){msg("Isi judul/ide dulu.");return}
 const btn=type==="script"?$("scriptBtn"):$("visualBtn");btn.classList.add("loading");btn.textContent="MEMPROSES...";
 try{const d=await api("/api/generate",{method:"POST",body:JSON.stringify({type,title,niche,audience,goal,script:$("script").value,visual:$("visual").value})});$("script").value=d.script||$("script").value;$("visual").value=d.visual||$("visual").value;msg("AI berhasil membuat "+type+" ✓")}
 catch(e){msg("Gagal: "+e.message)}finally{btn.classList.remove("loading");btn.textContent=type==="script"?"🤖 GENERATE SCRIPT":"🎬 GENERATE VISUAL"}}
$("scriptBtn").onclick=()=>generate("script");$("visualBtn").onclick=()=>generate("visual");
$("save").onclick=async()=>{const title=$("title").value.trim();if(!title){msg("Isi judul/ide dulu.");return}try{await api("/api/contents",{method:"POST",body:JSON.stringify({title,niche:$("niche").value,audience:$("audience").value,goal:$("goal").value,script:$("script").value,visual:$("visual").value,stage:"IDE"})});msg("Tersimpan ke database ✓");load()}catch(e){msg("Gagal simpan: "+e.message)}};
$("refresh").onclick=load;
async function move(id,stage){try{await api("/api/contents/"+id,{method:"PATCH",body:JSON.stringify({stage})});load()}catch(e){alert(e.message)}}
async function del(id){if(!confirm("Hapus konten ini?"))return;try{await api("/api/contents/"+id,{method:"DELETE"});load()}catch(e){alert(e.message)}}
function esc(s){return String(s||"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
const order=["IDE","SCRIPT","VISUAL","PRODUKSI","SELESAI"],labels={IDE:"💡 Ide",SCRIPT:"📝 Script",VISUAL:"🎬 Visual",PRODUKSI:"🎥 Produksi",SELESAI:"✅ Selesai"};
async function load(){try{const d=await api("/api/contents");$("list").innerHTML=d.items.length?d.items.map(x=>{let i=order.indexOf(x.stage),next=i<order.length-1?order[i+1]:x.stage;return `<article class="item"><span class="badge">${labels[x.stage]||x.stage}</span><h3>${esc(x.title)}</h3><div class="meta">${esc(x.niche||"")} • ${esc(x.audience||"")}</div>${x.script?`<div class="block"><strong>📝 SCRIPT</strong><p>${esc(x.script)}</p></div>`:""}${x.visual?`<div class="block"><strong>🎬 VISUAL</strong><p>${esc(x.visual)}</p></div>`:""}<div class="actions"><button onclick="move(${x.id},'${next}')">${next===x.stage?"SELESAI":"LANJUT →"}</button><button onclick="navigator.clipboard.writeText(${JSON.stringify((x.script||"")+"\n\n"+(x.visual||""))})">COPY</button><button class="danger" onclick="del(${x.id})">HAPUS</button></div></article>`}).join(""):'<div class="empty">Belum ada konten di database.</div>'}catch(e){$("list").innerHTML='<div class="empty">Database belum tersambung: '+esc(e.message)+'</div>'}}
load();