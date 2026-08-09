/* =========================================================
   View-Only Document Viewer
   Renders PDFs page-by-page to <canvas> using PDF.js so there
   is no direct file link for visitors to save, and disables
   the common shortcuts for saving/printing while the viewer
   is open. This is a deterrent, not an absolute guarantee —
   no client-side technique can make a rendered page 100%
   impossible to capture (e.g. a screenshot always works).
   ========================================================= */

(function () {
  const PDFJS_VERSION = "3.11.174";
  const WORKER_SRC = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;

  let pdfjsReady = null;
  let currentPdf = null;
  let currentPage = 1;
  let totalPages = 1;
  let renderToken = 0;

  function loadPdfJs() {
    if (pdfjsReady) return pdfjsReady;
    pdfjsReady = new Promise((resolve, reject) => {
      if (window["pdfjsLib"]) {
        resolve(window["pdfjsLib"]);
        return;
      }
      const script = document.createElement("script");
      script.src = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
      script.onload = () => {
        window["pdfjsLib"].GlobalWorkerOptions.workerSrc = WORKER_SRC;
        resolve(window["pdfjsLib"]);
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return pdfjsReady;
  }

  const overlay = document.getElementById("viewer-overlay");
  const panelTitle = document.getElementById("viewer-title");
  const body = document.getElementById("viewer-body");
  const closeBtn = document.getElementById("viewer-close");
  const prevBtn = document.getElementById("viewer-prev");
  const nextBtn = document.getElementById("viewer-next");
  const pageIndicator = document.getElementById("viewer-page-indicator");

  function base64ToBytes(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  // `source` is either:
  //  - a key into window.PDF_DATA (embedded base64, works from file:// too), or
  //  - a plain URL/path (fetched normally; requires the page to be served,
  //    not opened directly from disk, due to browser CORS rules for file://).
  function openViewer(source, title) {
    if (!overlay) return;
    panelTitle.textContent = title || "Document";
    body.innerHTML = '<div class="viewer-loading">Loading document…</div>';
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";

    const myToken = ++renderToken;
    const embedded = window.PDF_DATA && window.PDF_DATA[source];
    const docSource = embedded
      ? { data: base64ToBytes(embedded) }
      : source;

    loadPdfJs()
      .then((pdfjsLib) => pdfjsLib.getDocument(docSource).promise)
      .then((pdf) => {
        if (myToken !== renderToken) return;
        currentPdf = pdf;
        currentPage = 1;
        totalPages = pdf.numPages;
        body.innerHTML = "";
        renderPage(currentPage);
        updateNav();
      })
      .catch((err) => {
        if (myToken !== renderToken) return;
        body.innerHTML =
          '<div class="viewer-loading">This document could not be loaded.</div>';
        console.error(err);
      });
  }

  function renderPage(num) {
    if (!currentPdf) return;
    currentPdf.getPage(num).then((page) => {
      const scale = 1.3;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      body.innerHTML = "";
      body.appendChild(canvas);
      page.render({ canvasContext: ctx, viewport });
    });
    updateNav();
  }

  function updateNav() {
    if (pageIndicator) {
      pageIndicator.textContent = `Page ${currentPage} of ${totalPages}`;
    }
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
  }

  function closeViewer() {
    overlay.classList.remove("open");
    document.body.style.overflow = "";
    currentPdf = null;
    body.innerHTML = "";
  }

  if (closeBtn) closeBtn.addEventListener("click", closeViewer);
  if (overlay) {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeViewer();
    });
  }
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage -= 1;
        renderPage(currentPage);
      }
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      if (currentPage < totalPages) {
        currentPage += 1;
        renderPage(currentPage);
      }
    });
  }
  document.addEventListener("keydown", (e) => {
    if (!overlay || !overlay.classList.contains("open")) return;
    if (e.key === "Escape") closeViewer();
    if (e.key === "ArrowRight" && nextBtn && !nextBtn.disabled) nextBtn.click();
    if (e.key === "ArrowLeft" && prevBtn && !prevBtn.disabled) prevBtn.click();
  });

  // Deterrents: block right-click / drag / common save-print shortcuts
  // while the viewer is open. These reduce casual downloading but
  // cannot prevent a determined visitor (e.g. a screenshot).
  document.addEventListener("contextmenu", (e) => {
    if (overlay && overlay.classList.contains("open")) e.preventDefault();
  });
  document.addEventListener("dragstart", (e) => {
    if (overlay && overlay.classList.contains("open")) e.preventDefault();
  });
  document.addEventListener("keydown", (e) => {
    if (!overlay || !overlay.classList.contains("open")) return;
    const key = e.key.toLowerCase();
    const blocked =
      ((e.ctrlKey || e.metaKey) && (key === "s" || key === "p")) ||
      (e.ctrlKey && key === "u");
    if (blocked) e.preventDefault();
  });

  // Expose a single global used by inline triggers across pages.
  window.openDocViewer = openViewer;
})();
