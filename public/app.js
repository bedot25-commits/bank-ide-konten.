document.addEventListener("DOMContentLoaded", () => {
  // Generate atau Ambil Client ID unik untuk perangkat ini
  let clientId = localStorage.getItem("bank_client_id");
  if (!clientId) {
    clientId = "client_" + Math.random().toString(36).substring(2, 15);
    localStorage.setItem("bank_client_id", clientId);
  }

  // Cek apakah sudah ada token Pro yang tersimpan di browser
  let savedToken = localStorage.getItem("pro_token") || "";

  // Tambahkan elemen UI status kuota & input token Pro secara otomatis di bawah header/atas card
  const mainEl = document.querySelector("main");
  if (mainEl && !document.getElementById("pro-section")) {
    const proDiv = document.createElement("div");
    proDiv.id = "pro-section";
    proDiv.style.cssText = "background: #111; color: #fff; padding: 10px; border-radius: 8px; margin-bottom: 15px; font-size: 14px;";
    proDiv.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
        <span id="quota-status">Memuat status kuota...</span>
        <div>
          <input type="text" id="tokenInput" placeholder="Masukkan Token Pro" value="${savedToken}" style="padding: 5px; border-radius: 4px; border: 1px solid #444; background: #222; color: #fff; font-size: 12px;">
          <button id="saveTokenBtn" style="padding: 5px 10px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">Aktivasi</button>
        </div>
      </div>
    `;
    mainEl.insertBefore(proDiv, mainEl.firstChild);

    document.getElementById("saveTokenBtn").addEventListener("click", () => {
      const val = document.getElementById("tokenInput").value.trim();
      localStorage.setItem("pro_token", val);
      alert(val ? "Token Pro disimpan!" : "Token Pro dikosongkan.");
      location.reload();
    });
  }

  const scriptBtn = document.getElementById("scriptBtn");
  const titleInput = document.getElementById("title");
  const nicheInput = document.getElementById("niche");
  const audienceInput = document.getElementById("audience");
  const goalInput = document.getElementById("goal");
  const scriptArea = document.getElementById("script");
  const visualArea = document.getElementById("visual");
  const msgDiv = document.getElementById("msg");
  const saveBtn = document.getElementById("save");
  const listDiv = document.getElementById("list");

  // Fungsi Load Queue Online
  async function loadQueue() {
    try {
      const res = await fetch("/api/contents");
      const data = await res.json();
      if (Array.isArray(data)) {
        if (data.length === 0) {
          listDiv.innerHTML = "<p style='color: #888;'>Belum ada konten di database.</p>";
          return;
        }
        let html = "";
        data.forEach(item => {
          html += `
            <div style="background: #1a1a1a; padding: 10px; margin-bottom: 8px; border-radius: 6px; border: 1px solid #333;">
              <b>${item.title}</b> <small style="color: #aaa;">(${item.niche || 'General'})</small>
              <p style="margin: 5px 0 0 0; font-size: 13px; color: #ccc;">${item.script ? item.script.substring(0, 100) + '...' : 'Tidak ada script'}</p>
            </div>
          `;
        });
        listDiv.innerHTML = html;
      }
    } catch (e) {
      listDiv.innerHTML = "<p style='color: red;'>Gagal memuat antrean online.</p>";
    }
  }

  loadQueue();

  // Tombol Generate AI + Cek Kuota
  if (scriptBtn) {
    scriptBtn.addEventListener("click", async () => {
      const title = titleInput ? titleInput.value.trim() : "";
      if (!title) {
        alert("Mohon isi Judul / Ide terlebih dahulu!");
        return;
      }

      scriptBtn.innerText = "Generating AI...";
      scriptBtn.disabled = true;
      if (msgDiv) msgDiv.innerText = "";

      const proToken = localStorage.getItem("pro_token") || "";

      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            niche: nicheInput ? nicheInput.value : "",
            audience: audienceInput ? audienceInput.value : "",
            goal: goalInput ? goalInput.value : "",
            clientId: clientId,
            proToken: proToken
          })
        });

        const data = await res.json();

        if (res.status === 429 || data.error === "QUOTA_EXCEEDED") {
          alert("Jatah 5 ide gratis hari ini sudah habis! Masukkan Token Pro dari Lynk.id atau tunggu sampai besok.");
          if (msgDiv) msgDiv.innerText = data.message || "Kuota h habis.";
          scriptBtn.innerText = "Generate Script & Visual";
          scriptBtn.disabled = false;
          return;
        }

        if (!res.ok) {
          throw new Error(data.error || "Terjadi kesalahan pada server.");
        }

        if (scriptArea) scriptArea.value = data.script || "";
        if (visualArea) visualArea.value = data.visual || "";
        if (msgDiv) msgDiv.innerText = data.isPro ? "✨ Mode Pro Aktif (Tanpa Batas)" : "✅ Berhasil generate (Sisa kuota terpotong)";

      } catch (err) {
        alert("Error: " + err.message);
      } finally {
        scriptBtn.innerText = "Generate Script & Visual";
        scriptBtn.disabled = false;
      }
    });
  }

  // Tombol Simpan ke Database D1
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const title = titleInput ? titleInput.value.trim() : "";
      const script = scriptArea ? scriptArea.value.trim() : "";
      const visual = visualArea ? visualArea.value.trim() : "";

      if (!title) {
        alert("Judul belum diisi!");
        return;
      }

      saveBtn.innerText = "Menyimpan...";
      try {
        const res = await fetch("/api/contents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            niche: nicheInput ? nicheInput.value : "",
            audience: audienceInput ? audienceInput.value : "",
            goal: goalInput ? goalInput.value : "",
            script,
            visual
          })
        });
        if (res.ok) {
          alert("Berhasil disimpan ke database online!");
          titleInput.value = "";
          if(scriptArea) scriptArea.value = "";
          if(visualArea) visualArea.value = "";
          loadQueue();
        } else {
          alert("Gagal menyimpan data.");
        }
      } catch (e) {
        alert("Error simpan: " + e.message);
      } finally {
        saveBtn.innerText = "☁️ SIMPAN KE DATABASE";
      }
    });
  }
});
