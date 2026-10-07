document.addEventListener("DOMContentLoaded", () => {
  // =========================================================
  // CLIENT ID
  // =========================================================

  let clientId = localStorage.getItem("bank_client_id");

  if (!clientId) {
    clientId =
      "client_" +
      Math.random().toString(36).substring(2, 15);

    localStorage.setItem("bank_client_id", clientId);
  }

  // =========================================================
  // PRO TOKEN
  // =========================================================

  const savedToken =
    localStorage.getItem("pro_token") || "";

  // =========================================================
  // ELEMENT
  // =========================================================

  const mainEl = document.querySelector("main");

  const scriptBtn =
    document.getElementById("scriptBtn");

  const visualBtn =
    document.getElementById("visualBtn");

  const refreshBtn =
    document.getElementById("refresh");

  const titleInput =
    document.getElementById("title");

  const nicheInput =
    document.getElementById("niche");

  const audienceInput =
    document.getElementById("audience");

  const goalInput =
    document.getElementById("goal");

  const scriptArea =
    document.getElementById("script");

  const visualArea =
    document.getElementById("visual");

  const msgDiv =
    document.getElementById("msg");

  const saveBtn =
    document.getElementById("save");

  const listDiv =
    document.getElementById("list");

  // =========================================================
  // PRO SECTION
  // =========================================================

  if (
    mainEl &&
    !document.getElementById("pro-section")
  ) {
    const proDiv =
      document.createElement("div");

    proDiv.id = "pro-section";

    proDiv.style.cssText = `
      background:#111;
      color:#fff;
      padding:12px;
      border-radius:10px;
      margin-bottom:15px;
      font-size:13px;
    `;

    proDiv.innerHTML = `
      <div style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        flex-wrap:wrap;
        gap:10px;
      ">

        <div>
          <div id="quota-status">
            Memuat status kuota...
          </div>
        </div>

        <div style="
          display:flex;
          gap:6px;
          flex-wrap:wrap;
        ">

          <input
            type="text"
            id="tokenInput"
            placeholder="Token Pro"
            value="${escapeHTML(savedToken)}"
            style="
              padding:7px;
              border-radius:5px;
              border:1px solid #444;
              background:#222;
              color:#fff;
              font-size:12px;
            "
          >

          <button
            id="saveTokenBtn"
            style="
              padding:7px 10px;
              background:#28a745;
              color:#fff;
              border:none;
              border-radius:5px;
              font-size:12px;
            "
          >
            Aktivasi
          </button>

        </div>
      </div>
    `;

    mainEl.insertBefore(
      proDiv,
      mainEl.firstChild
    );

    const saveTokenBtn =
      document.getElementById(
        "saveTokenBtn"
      );

    if (saveTokenBtn) {
      saveTokenBtn.addEventListener(
        "click",
        () => {
          const input =
            document.getElementById(
              "tokenInput"
            );

          const val =
            input
              ? input.value.trim()
              : "";

          localStorage.setItem(
            "pro_token",
            val
          );

          alert(
            val
              ? "Token Pro disimpan!"
              : "Token Pro dikosongkan."
          );

          location.reload();
        }
      );
    }
  }

  // =========================================================
  // ESCAPE HTML
  // =========================================================

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // =========================================================
  // QUOTA DISPLAY
  // =========================================================

  function updateQuotaDisplay(
    isPro,
    usageCount,
    remaining
  ) {
    const quota =
      document.getElementById(
        "quota-status"
      );

    if (!quota) return;

    if (isPro) {
      quota.innerHTML =
        "✨ <b>Mode Pro Aktif</b> — Tanpa batas";

      return;
    }

    const count =
      Number(usageCount || 0);

    const left =
      typeof remaining === "number"
        ? remaining
        : Math.max(
            0,
            5 - count
          );

    quota.innerHTML =
      `🎁 Gratis: <b>${left}/5</b> generate tersisa hari ini`;
  }

  // =========================================================
  // LOAD QUEUE
  // =========================================================

  async function loadQueue() {
    if (!listDiv) return;

    listDiv.innerHTML =
      "<p style='color:#888;'>Memuat antrean...</p>";

    try {
      const response =
        await fetch(
          "/api/contents",
          {
            method: "GET",
            cache: "no-store"
          }
        );

      if (!response.ok) {
        throw new Error(
          "Gagal mengambil data queue."
        );
      }

      const data =
        await response.json();

      if (!Array.isArray(data)) {
        throw new Error(
          "Format data queue tidak valid."
        );
      }

      if (data.length === 0) {
        listDiv.innerHTML =
          "<p style='color:#888;'>Belum ada konten di database.</p>";

        return;
      }

      let html = "";

      data.forEach((item) => {
        const title =
          item.title ||
          "Tanpa Judul";

        const niche =
          item.niche ||
          "General";

        const script =
          item.script ||
          "Tidak ada script";

        const visual =
          item.visual ||
          "Tidak ada visual prompt";

        const stage =
          item.stage ||
          "IDE";

        html += `
          <div style="
            background:#1a1a1a;
            padding:12px;
            margin-bottom:10px;
            border-radius:8px;
            border:1px solid #333;
          ">

            <div style="
              display:flex;
              justify-content:space-between;
              gap:8px;
              align-items:center;
            ">

              <b>
                ${escapeHTML(title)}
              </b>

              <small style="
                color:#aaa;
                background:#27272a;
                padding:4px 7px;
                border-radius:20px;
              ">
                ${escapeHTML(stage)}
              </small>

            </div>

            <small style="
              color:#aaa;
              display:block;
              margin-top:5px;
            ">
              ${escapeHTML(niche)}
            </small>

            <div style="
              background:#0c0c0f;
              border:1px solid #333;
              border-radius:7px;
              padding:9px;
              margin-top:9px;
            ">

              <strong style="
                font-size:11px;
              ">
                SCRIPT
              </strong>

              <p style="
                white-space:pre-wrap;
                color:#ccc;
                font-size:12px;
                line-height:1.5;
                margin:6px 0;
              ">
                ${escapeHTML(script)}
              </p>

            </div>

            <div style="
              background:#0c0c0f;
              border:1px solid #333;
              border-radius:7px;
              padding:9px;
              margin-top:8px;
            ">

              <strong style="
                font-size:11px;
              ">
                VISUAL PROMPT
              </strong>

              <p style="
                white-space:pre-wrap;
                color:#ccc;
                font-size:12px;
                line-height:1.5;
                margin:6px 0;
              ">
                ${escapeHTML(visual)}
              </p>

            </div>

          </div>
        `;
      });

      listDiv.innerHTML = html;

    } catch (error) {
      console.error(
        "QUEUE ERROR:",
        error
      );

      listDiv.innerHTML = `
        <p style="color:#f87171;">
          Gagal memuat antrean online.
          Silakan tekan REFRESH lagi.
        </p>
      `;
    }
  }

  // =========================================================
  // GENERATE AI
  // =========================================================

  async function generateAI() {
    const title =
      titleInput
        ? titleInput.value.trim()
        : "";

    if (!title) {
      alert(
        "Mohon isi Judul / Ide terlebih dahulu!"
      );

      return null;
    }

    const proToken =
      localStorage.getItem(
        "pro_token"
      ) || "";

    try {
      if (msgDiv) {
        msgDiv.innerText =
          "🤖 AI sedang membuat Script + Visual...";
      }

      const response =
        await fetch(
          "/api/generate",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body: JSON.stringify({
              title,

              niche:
                nicheInput
                  ? nicheInput.value
                  : "",

              audience:
                audienceInput
                  ? audienceInput.value
                  : "",

              goal:
                goalInput
                  ? goalInput.value
                  : "",

              clientId,

              proToken
            })
          }
        );

      const data =
        await response.json();

      // =====================================================
      // QUOTA HABIS
      // =====================================================

      if (
        response.status === 429 ||
        data.error ===
          "QUOTA_EXCEEDED"
      ) {
        alert(
          "Jatah 5 ide gratis hari ini sudah habis! Masukkan Token Pro atau tunggu sampai besok."
        );

        if (msgDiv) {
          msgDiv.innerText =
            data.message ||
            "Kuota habis.";
        }

        updateQuotaDisplay(
          false,
          data.usageCount,
          0
        );

        return null;
      }

      // =====================================================
      // SERVER ERROR
      // =====================================================

      if (!response.ok) {
        throw new Error(
          data.message ||
          data.error ||
          "Terjadi kesalahan pada server."
        );
      }

      // =====================================================
      // ISI SCRIPT
      // =====================================================

      if (scriptArea) {
        scriptArea.value =
          data.script || "";
      }

      // =====================================================
      // ISI VISUAL
      // =====================================================

      if (visualArea) {
        visualArea.value =
          data.visual || "";
      }

      // =====================================================
      // UPDATE QUOTA
      // =====================================================

      updateQuotaDisplay(
        data.isPro,
        data.usageCount,
        data.remaining
      );

      // =====================================================
      // STATUS
      // =====================================================

      if (msgDiv) {
        msgDiv.innerText =
          data.isPro
            ? "✨ Mode Pro Aktif — Tanpa batas"
            : `✅ Berhasil generate — sisa ${data.remaining} generate hari ini`;
      }

      return data;

    } catch (error) {
      console.error(
        "GENERATE ERROR:",
        error
      );

      alert(
        "Error: " +
          error.message
      );

      if (msgDiv) {
        msgDiv.innerText =
          "❌ Gagal generate AI.";
      }

      return null;
    }
  }

  // =========================================================
  // INITIAL LOAD
  // =========================================================

  loadQueue();

  // =========================================================
  // REFRESH BUTTON
  // =========================================================

  if (refreshBtn) {
    refreshBtn.addEventListener(
      "click",
      async () => {
        refreshBtn.innerText =
          "MEMUAT...";

        refreshBtn.disabled = true;

        try {
          await loadQueue();
        } finally {
          refreshBtn.innerText =
            "REFRESH";

          refreshBtn.disabled =
            false;
        }
      }
    );
  }

  // =========================================================
  // GENERATE SCRIPT BUTTON
  // =========================================================

  if (scriptBtn) {
    scriptBtn.addEventListener(
      "click",
      async () => {
        scriptBtn.innerText =
          "Generating AI...";

        scriptBtn.disabled = true;

        try {
          await generateAI();
        } finally {
          scriptBtn.innerText =
            "GENERATE SCRIPT";

          scriptBtn.disabled =
            false;
        }
      }
    );
  }

  // =========================================================
  // GENERATE VISUAL BUTTON
  // =========================================================

  if (visualBtn) {
    visualBtn.addEventListener(
      "click",
      async () => {

        const title =
          titleInput
            ? titleInput.value.trim()
            : "";

        if (!title) {
          alert(
            "Mohon isi Judul / Ide terlebih dahulu!"
          );

          return;
        }

        // ---------------------------------------------------
        // JIKA VISUAL SUDAH ADA
        // ---------------------------------------------------

        const existingVisual =
          visualArea
            ? visualArea.value.trim()
            : "";

        if (existingVisual) {
          if (msgDiv) {
            msgDiv.innerText =
              "🎬 Visual prompt sudah tersedia.";
          }

          visualArea.focus();

          return;
        }

        // ---------------------------------------------------
        // VISUAL MASIH KOSONG
        // ---------------------------------------------------

        visualBtn.innerText =
          "Generating Visual...";

        visualBtn.disabled = true;

        try {
          const data =
            await generateAI();

          if (
            data &&
            data.visual &&
            visualArea
          ) {
            visualArea.value =
              data.visual;

            if (msgDiv) {
              msgDiv.innerText =
                "🎬 Visual prompt berhasil dibuat!";
            }

            visualArea.focus();
          }

        } finally {
          visualBtn.innerText =
            "🎬 GENERATE VISUAL";

          visualBtn.disabled =
            false;
        }
      }
    );
  }

  // =========================================================
  // SAVE TO DATABASE
  // =========================================================

  if (saveBtn) {
    saveBtn.addEventListener(
      "click",
      async () => {

        const title =
          titleInput
            ? titleInput.value.trim()
            : "";

        const script =
          scriptArea
            ? scriptArea.value.trim()
            : "";

        const visual =
          visualArea
            ? visualArea.value.trim()
            : "";

        if (!title) {
          alert(
            "Judul belum diisi!"
          );

          return;
        }

        saveBtn.innerText =
          "MENYIMPAN...";

        saveBtn.disabled = true;

        try {
          const response =
            await fetch(
              "/api/contents",
              {
                method: "POST",

                headers: {
                  "Content-Type":
                    "application/json"
                },

                body: JSON.stringify({
                  title,

                  niche:
                    nicheInput
                      ? nicheInput.value
                      : "",

                  audience:
                    audienceInput
                      ? audienceInput.value
                      : "",

                  goal:
                    goalInput
                      ? goalInput.value
                      : "",

                  script,

                  visual
                })
              }
            );

          const data =
            await response.json();

          if (!response.ok) {
            throw new Error(
              data.message ||
              data.error ||
              "Gagal menyimpan data."
            );
          }

          alert(
            "Berhasil disimpan ke database online!"
          );

          // -------------------------------------------------
          // RESET FORM
          // -------------------------------------------------

          if (titleInput) {
            titleInput.value = "";
          }

          if (nicheInput) {
            nicheInput.value = "";
          }

          if (audienceInput) {
            audienceInput.value = "";
          }

          if (goalInput) {
            goalInput.value = "";
          }

          if (scriptArea) {
            scriptArea.value = "";
          }

          if (visualArea) {
            visualArea.value = "";
          }

          if (msgDiv) {
            msgDiv.innerText =
              "☁️ Konten berhasil disimpan.";
          }

          // -------------------------------------------------
          // REFRESH QUEUE OTOMATIS
          // -------------------------------------------------

          await loadQueue();

        } catch (error) {
          console.error(
            "SAVE ERROR:",
            error
          );

          alert(
            "Gagal menyimpan: " +
              error.message
          );

        } finally {
          saveBtn.innerText =
            "☁️ SIMPAN KE DATABASE";

          saveBtn.disabled =
            false;
        }
      }
    );
  }
});
