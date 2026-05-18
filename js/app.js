const frame = document.getElementById("approveFrame");
const pdfModalMask = document.getElementById("pdfModalMask");
const pdfAttachmentListEl = document.getElementById("pdfAttachmentList");
const pdfSelectedListEl = document.getElementById("pdfSelectedList");
const pdfStatusEl = document.getElementById("pdfStatus");
const pdfModalCloseBtn = document.getElementById("pdfModalClose");
const pdfModalCancelBtn = document.getElementById("pdfModalCancel");
const pdfModalConfirmBtn = document.getElementById("pdfModalConfirm");

let currentDoc = null;
let modalAttachments = [];
let selectedOrder = [];
let pdfDownloading = false;
let draggingFileId = null;

frame.addEventListener("load", () => {
  try {
    const doc = frame.contentDocument || frame.contentWindow.document;
    if (!doc) return;
    currentDoc = doc;

    const oldStyle = doc.getElementById("approve-page-proxy-style");
    if (oldStyle) oldStyle.remove();
    const style = doc.createElement("style");
    style.id = "approve-page-proxy-style";
    style.textContent = `
      .approve-op-icons { display:inline-flex; align-items:center; justify-content:center; gap:10px; color:#9aa3b5; }
      .approve-op-icons .icon-btn { width:14px; height:14px; display:inline-flex; align-items:center; justify-content:center; line-height:1; }
      .approve-op-icons svg { width:14px; height:14px; stroke:currentColor; fill:none; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
      #attachments .approve-action-with-icon { display:inline-flex; align-items:center; justify-content:center; gap:2px; }
      #attachments .approve-action-with-icon svg { width:14px; height:14px; stroke:currentColor; fill:none; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
      #attachments .file-btn-box > i,
      #attachments .file-btn-box > svg,
      #attachments .file-btn-box > span > i,
      #attachments .file-btn-box > span > svg { display:none !important; }
      .approve-pager-arrow { display:inline-flex; align-items:center; justify-content:center; width:12px; height:12px; color:#f5222d; }
      .approve-pager-arrow svg { width:12px; height:12px; stroke:currentColor; fill:none; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
    `;
    doc.head.appendChild(style);

    const fillById = (id, value) => {
      const el = doc.getElementById(id);
      if (!el) return;
      if ("value" in el) {
        el.value = value;
        el.setAttribute("value", value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        el.textContent = value;
      }
    };

    const fillByLabel = (label, value) => {
      const labels = Array.from(doc.querySelectorAll("label, .component-item-label, .table-label, span"));
      const labelEl = labels.find((el) => (el.textContent || "").replace(/\s+/g, "").startsWith(label.replace(/\s+/g, "")));
      if (!labelEl) return;
      const row = labelEl.closest(".component-item, .section-child-body, .el-row, tr") || labelEl.parentElement;
      if (!row) return;
      const input = row.querySelector("input.el-input__inner, textarea, input[type='text'], input") || row.querySelector(".cell") || row.querySelector("span");
      if (!input) return;
      if ("value" in input) {
        input.value = value;
        input.setAttribute("value", value);
      } else {
        input.textContent = value;
      }
    };

    const fillData = () => {
      fillById("textbox7", "CR202605170018");
      fillById("applicationContent", "测试");
      fillById("vendingmachinebuyoutmatters", "是");
      fillById("hrdocuments", "是");
      fillByLabel("申请部门", "今麦郎食品股份有限公司/面品营销中心/湖南南益区");
      fillByLabel("主旨", "测试主旨-附件");
      fillByLabel("申请类型", "呆滞品费用核销");
      fillByLabel("业务类型", "面品业务");
      fillByLabel("是否需要添加抄送人", "是");
      fillByLabel("是否为电商分公司", "是");
      fillByLabel("审批意见", "同意");
    };

    const ensureOperationIcons = () => {
      const attachments = doc.getElementById("attachments");
      if (!attachments) return;
      const headers = Array.from(attachments.querySelectorAll("th .cell"));
      const nameIndex = headers.findIndex((el) => ((el.textContent || "").trim() === "附件名称"));
      const opIndex = headers.findIndex((el) => ((el.textContent || "").trim() === "操作"));
      if (opIndex < 0 || nameIndex < 0) return;
      const rows = Array.from(attachments.querySelectorAll(".el-table__body-wrapper tbody tr"));
      rows.forEach((row) => {
        const cells = row.querySelectorAll("td");
        if (!cells[opIndex] || !cells[nameIndex]) return;
        const nameCell = cells[nameIndex].querySelector(".cell") || cells[nameIndex];
        const fileName = (nameCell.textContent || "").trim().toLowerCase();
        const extMatch = fileName.match(/\.([a-z0-9]+)(?:\s|$)/i);
        const ext = extMatch ? extMatch[1] : "";
        const showPreview = ext === "pdf" || ext === "png";
        const showDownload = ext !== "png";
        const cell = cells[opIndex].querySelector(".cell") || cells[opIndex];
        cell.innerHTML = "";
        const wrap = doc.createElement("span");
        wrap.className = "approve-op-icons";
        wrap.innerHTML = `
          ${showPreview ? `<span class="icon-btn" title="预览" aria-label="预览"><svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"></path><circle cx="12" cy="12" r="2.8"></circle></svg></span>` : ""}
          ${showDownload ? `<span class="icon-btn" title="下载" aria-label="下载"><svg viewBox="0 0 24 24"><path d="M12 4v10"></path><path d="M8 10l4 4 4-4"></path><path d="M4 18h16"></path></svg></span>` : ""}
        `;
        cell.appendChild(wrap);
      });
    };

    const ensureAttachmentActionIcons = () => {
      const attachments = doc.getElementById("attachments");
      if (!attachments) return;
      const actionNodes = Array.from(attachments.querySelectorAll("button, span, a, div"));
      const isExactActionNode = (el, text) => {
        const ownText = (el.textContent || "").trim();
        if (ownText !== text) return false;
        return !Array.from(el.children).some((child) => ((child.textContent || "").trim() === text));
      };
      actionNodes.forEach((el) => {
        const txt = (el.textContent || "").trim();
        if (txt === "批量下载" && isExactActionNode(el, "批量下载")) {
          if (!el.querySelector(".approve-action-icon-download")) {
            el.classList.add("approve-action-with-icon");
            const icon = doc.createElement("span");
            icon.className = "approve-action-icon-download";
            icon.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 4v10"></path><path d="M8 10l4 4 4-4"></path><path d="M4 18h16"></path></svg>`;
            el.insertBefore(icon, el.firstChild);
          }
        }
        if (txt === "预览" && isExactActionNode(el, "预览")) {
          if (!el.querySelector(".approve-action-icon-preview")) {
            el.classList.add("approve-action-with-icon");
            const icon = doc.createElement("span");
            icon.className = "approve-action-icon-preview";
            icon.innerHTML = `<svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"></path><circle cx="12" cy="12" r="2.8"></circle></svg>`;
            el.insertBefore(icon, el.firstChild);
          }
        }
      });
    };

    const ensurePagerArrowIcons = () => {
      const view = doc.defaultView;
      if (!view) return;
      const candidates = Array.from(doc.querySelectorAll("button, .el-button, [role='button']"));
      const tinyBottomButtons = candidates.filter((btn) => {
        const text = (btn.textContent || "").trim();
        if (text.length > 0) return false;
        const rect = btn.getBoundingClientRect();
        if (rect.width < 16 || rect.width > 60 || rect.height < 16 || rect.height > 40) return false;
        if (rect.top < view.innerHeight - 180) return false;
        if (rect.left < view.innerWidth - 220) return false;
        return true;
      });
      if (tinyBottomButtons.length < 2) return;
      tinyBottomButtons.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
      const [leftBtn, rightBtn] = tinyBottomButtons;
      const addArrow = (btn, direction) => {
        const old = btn.querySelector(".approve-pager-arrow");
        if (old) return;
        const icon = doc.createElement("span");
        icon.className = "approve-pager-arrow";
        icon.innerHTML = direction === "left"
          ? `<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"></path></svg>`
          : `<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"></path></svg>`;
        btn.innerHTML = "";
        btn.appendChild(icon);
      };
      addArrow(leftBtn, "left");
      addArrow(rightBtn, "right");
    };

    const getSummaryName = () => {
      const textInputs = Array.from(doc.querySelectorAll("input.el-input__inner, input[type='text'], textarea"));
      const summaryInput = textInputs.find((el) => el.id === "theme" || el.id === "title" || el.id === "subject");
      if (summaryInput && summaryInput.value) return summaryInput.value.trim();
      const labels = Array.from(doc.querySelectorAll("label, .component-item-label, span"));
      const summaryLabel = labels.find((el) => (el.textContent || "").replace(/\s+/g, "").startsWith("主旨"));
      if (summaryLabel) {
        const row = summaryLabel.closest(".component-item, .section-child-body, .el-row") || summaryLabel.parentElement;
        const input = row && row.querySelector("input.el-input__inner, textarea, input");
        if (input && input.value) return input.value.trim();
      }
      return "通用申请";
    };

    const collectAttachments = () => {
      const attachments = doc.getElementById("attachments");
      if (!attachments) return [{ id: "__form_pdf__", name: "表单.pdf", url: "", ext: "pdf", isForm: true }];
      const headers = Array.from(attachments.querySelectorAll("th .cell"));
      const nameIndex = headers.findIndex((el) => ((el.textContent || "").trim() === "附件名称"));
      if (nameIndex < 0) return [{ id: "__form_pdf__", name: "表单.pdf", url: "", ext: "pdf", isForm: true }];
      const rows = Array.from(attachments.querySelectorAll(".el-table__body-wrapper tbody tr"));
      const files = rows.map((row, idx) => {
        const cells = row.querySelectorAll("td");
        const nameCell = cells[nameIndex] && (cells[nameIndex].querySelector(".cell") || cells[nameIndex]);
        const name = (nameCell && nameCell.textContent || "").trim();
        const linkEl = row.querySelector("a[href]");
        const url = linkEl ? linkEl.getAttribute("href") : "";
        const extMatch = name.toLowerCase().match(/\.([a-z0-9]+)$/i);
        const ext = extMatch ? extMatch[1] : "";
        return { id: `${idx}-${name}`, name, url, ext, isForm: false };
      }).filter((x) => x.name);
      return [{ id: "__form_pdf__", name: "表单.pdf", url: "", ext: "pdf", isForm: true }, ...files];
    };

    const setPdfStatus = (text) => { pdfStatusEl.textContent = text || ""; };

    const renderPdfModal = () => {
      pdfAttachmentListEl.innerHTML = "";
      pdfSelectedListEl.innerHTML = "";

      modalAttachments.forEach((file) => {
        const checked = selectedOrder.includes(file.id);
        const li = document.createElement("li");
        li.style.cursor = "pointer";
        li.innerHTML = `<input type="checkbox" ${checked ? "checked" : ""} /><span class="pdf-name" title="${file.name}">${file.name}</span>`;
        const checkbox = li.querySelector("input");
        const applyCheckedState = (nextChecked) => {
          if (nextChecked) {
            if (!selectedOrder.includes(file.id)) selectedOrder.push(file.id);
          } else {
            selectedOrder = selectedOrder.filter((id) => id !== file.id);
          }
          renderPdfModal();
        };
        checkbox.addEventListener("change", () => applyCheckedState(checkbox.checked));
        li.addEventListener("click", (event) => {
          if (event.target === checkbox) return;
          checkbox.checked = !checkbox.checked;
          applyCheckedState(checkbox.checked);
        });
        pdfAttachmentListEl.appendChild(li);
      });

      if (!selectedOrder.length) {
        pdfSelectedListEl.innerHTML = `<li class="pdf-empty">请先勾选附件</li>`;
      } else {
        selectedOrder.forEach((id, index) => {
          const file = modalAttachments.find((f) => f.id === id);
          if (!file) return;
          const li = document.createElement("li");
          li.classList.add("pdf-draggable-item");
          li.draggable = true;
          li.innerHTML = `
            <button class="pdf-drag-handle" type="button" title="拖拽排序">
              <svg viewBox="0 0 16 16">
                <circle cx="5" cy="3.5" r="1.1"></circle><circle cx="11" cy="3.5" r="1.1"></circle>
                <circle cx="5" cy="8" r="1.1"></circle><circle cx="11" cy="8" r="1.1"></circle>
                <circle cx="5" cy="12.5" r="1.1"></circle><circle cx="11" cy="12.5" r="1.1"></circle>
              </svg>
            </button>
            <span class="pdf-name" title="${file.name}">${index + 1}. ${file.name}</span>
            <button class="pdf-delete-btn" type="button" title="删除（取消勾选）">×</button>
          `;

          li.addEventListener("dragstart", (event) => {
            draggingFileId = id;
            li.classList.add("is-dragging");
            if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
          });
          li.addEventListener("dragend", () => {
            draggingFileId = null;
            li.classList.remove("is-dragging");
            pdfSelectedListEl.querySelectorAll(".drag-over-top, .drag-over-bottom").forEach((el) => {
              el.classList.remove("drag-over-top", "drag-over-bottom");
            });
          });
          li.addEventListener("dragover", (event) => {
            if (!draggingFileId || draggingFileId === id) return;
            event.preventDefault();
            const rect = li.getBoundingClientRect();
            const insertBefore = event.clientY < rect.top + rect.height / 2;
            li.classList.toggle("drag-over-top", insertBefore);
            li.classList.toggle("drag-over-bottom", !insertBefore);
          });
          li.addEventListener("dragleave", () => {
            li.classList.remove("drag-over-top", "drag-over-bottom");
          });
          li.addEventListener("drop", (event) => {
            event.preventDefault();
            if (!draggingFileId || draggingFileId === id) return;
            const fromIndex = selectedOrder.indexOf(draggingFileId);
            if (fromIndex < 0) return;
            const [moved] = selectedOrder.splice(fromIndex, 1);
            let targetIndex = selectedOrder.indexOf(id);
            const rect = li.getBoundingClientRect();
            if (!(event.clientY < rect.top + rect.height / 2)) targetIndex += 1;
            if (targetIndex < 0) targetIndex = selectedOrder.length;
            selectedOrder.splice(targetIndex, 0, moved);
            renderPdfModal();
          });
          li.querySelector(".pdf-delete-btn").addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            selectedOrder = selectedOrder.filter((x) => x !== id);
            renderPdfModal();
          });
          pdfSelectedListEl.appendChild(li);
        });
      }
    };

    const openPdfModal = () => {
      modalAttachments = collectAttachments();
      selectedOrder = modalAttachments.filter((f) => f.isForm).map((f) => f.id);
      setPdfStatus("");
      renderPdfModal();
      pdfModalMask.style.display = "flex";
    };

    const loadPdfLib = async () => {
      if (window.PDFLib) return window.PDFLib;
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js";
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
      return window.PDFLib;
    };

    const fetchBinary = async (url) => {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error("附件下载失败");
      return resp.arrayBuffer();
    };

    const createPlaceholderPdf = async (PDFLib, fileName, note) => {
      const pdf = await PDFLib.PDFDocument.create();
      const page = pdf.addPage([595, 842]);
      const font = await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
      page.drawText("Attachment To PDF Placeholder", { x: 40, y: 790, size: 16, font });
      page.drawText(`File: ${fileName}`, { x: 40, y: 760, size: 12, font });
      page.drawText(note || "Unsupported file type in pure frontend conversion.", { x: 40, y: 735, size: 11, font });
      return pdf.save();
    };

    const createFormPdf = async (PDFLib) => {
      const pdf = await PDFLib.PDFDocument.create();
      const page = pdf.addPage([595, 842]);
      const font = await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
      const summary = getSummaryName();
      const lines = [
        "Form Export PDF",
        `Summary: ${summary || "通用申请"}`,
        `Flow No: ${(currentDoc && currentDoc.getElementById("textbox7") && currentDoc.getElementById("textbox7").value) || "-"}`,
        `Generated: ${new Date().toLocaleString()}`
      ];
      lines.forEach((line, idx) => {
        page.drawText(line, { x: 40, y: 790 - idx * 24, size: idx === 0 ? 18 : 12, font });
      });
      return pdf.save();
    };

    const imageToPdf = async (PDFLib, bytes, ext) => {
      const pdf = await PDFLib.PDFDocument.create();
      const page = pdf.addPage([595, 842]);
      const img = ext === "png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const scale = Math.min((595 - 60) / img.width, (842 - 80) / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      page.drawImage(img, { x: (595 - w) / 2, y: (842 - h) / 2, width: w, height: h });
      return pdf.save();
    };

    const convertAttachmentToPdf = async (PDFLib, file) => {
      if (file.isForm) return createFormPdf(PDFLib);
      const ext = (file.ext || "").toLowerCase();
      if (!file.url) return createPlaceholderPdf(PDFLib, file.name, "No downloadable URL found in current prototype data.");
      if (ext === "pdf") return fetchBinary(file.url);
      if (["png", "jpg", "jpeg"].includes(ext)) {
        const bytes = await fetchBinary(file.url);
        return imageToPdf(PDFLib, bytes, ext === "png" ? "png" : "jpg");
      }
      return createPlaceholderPdf(PDFLib, file.name, "Converted as placeholder for non-image/non-pdf file.");
    };

    const mergeAndDownloadSelected = async () => {
      if (pdfDownloading) return;
      if (!selectedOrder.length) {
        setPdfStatus("请先勾选至少一个附件。");
        return;
      }
      pdfDownloading = true;
      pdfModalConfirmBtn.disabled = true;
      try {
        setPdfStatus("正在加载PDF能力...");
        const PDFLib = await loadPdfLib();
        const merged = await PDFLib.PDFDocument.create();
        const selectedFiles = selectedOrder.map((id) => modalAttachments.find((f) => f.id === id)).filter(Boolean);
        for (let i = 0; i < selectedFiles.length; i += 1) {
          const file = selectedFiles[i];
          setPdfStatus(`正在处理 (${i + 1}/${selectedFiles.length})：${file.name}`);
          const pdfBytes = await convertAttachmentToPdf(PDFLib, file);
          const srcDoc = await PDFLib.PDFDocument.load(pdfBytes);
          const pages = await merged.copyPages(srcDoc, srcDoc.getPageIndices());
          pages.forEach((p) => merged.addPage(p));
        }
        setPdfStatus("正在合并并下载...");
        const mergedBytes = await merged.save();
        const blob = new Blob([mergedBytes], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const summary = getSummaryName().replace(/[\\/:*?"<>|]/g, "_") || "通用申请";
        a.href = url;
        a.download = `${summary}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setPdfStatus("下载已触发。");
        setTimeout(() => {
          pdfModalMask.style.display = "none";
        }, 300);
      } catch (err) {
        setPdfStatus(`处理失败：${err.message || err}`);
      } finally {
        pdfDownloading = false;
        pdfModalConfirmBtn.disabled = false;
      }
    };
    window.__mergePdfDownload = mergeAndDownloadSelected;

    const bindPdfDownloadEntry = () => {
      const doc = currentDoc;
      if (!doc) return;
      const view = doc.defaultView;
      if (!view) return;

      const isVisible = (el) => {
        const css = view.getComputedStyle(el);
        if (css.display === "none" || css.visibility === "hidden" || Number(css.opacity) === 0) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      const isPdfEntry = (el) => {
        const text = (el.textContent || "").replace(/\s+/g, "");
        if (text !== "PDF下载") return false;
        if (!isVisible(el)) return false;
        const rect = el.getBoundingClientRect();
        return rect.top >= 0 && rect.top <= 220;
      };

      const candidates = Array.from(doc.querySelectorAll("button, a, span, div")).filter(isPdfEntry);
      candidates.forEach((el) => {
        el.style.cursor = "pointer";
      });

      if (doc.body.dataset.boundPdfDownloadDelegate === "1") return;
      doc.body.dataset.boundPdfDownloadDelegate = "1";
      doc.body.addEventListener(
        "click",
        (event) => {
          let node = event.target;
          while (node && node !== doc.body) {
            if (isPdfEntry(node)) {
              event.preventDefault();
              event.stopPropagation();
              openPdfModal();
              return;
            }
            node = node.parentElement;
          }
        },
        true
      );
    };

    const applyAll = () => {
      const doc = currentDoc;
      if (!doc) return;
      fillData(doc);
      ensureAttachmentActionIcons(doc);
      ensureOperationIcons(doc);
      ensurePagerArrowIcons(doc);
      bindPdfDownloadEntry();
    };

    applyAll();
    if (frame._approveFixObserver) frame._approveFixObserver.disconnect();
    const observer = new MutationObserver(() => {
      applyAll();
    });
    observer.observe(doc.body, { childList: true, subtree: true });
    frame._approveFixObserver = observer;
  } catch (e) {
    console.error("审批页面增强失败:", e);
  }
});

const closePdfModal = () => {
  if (pdfDownloading) return;
  pdfModalMask.style.display = "none";
};
pdfModalCloseBtn.addEventListener("click", closePdfModal);
pdfModalCancelBtn.addEventListener("click", closePdfModal);
pdfModalMask.addEventListener("click", (e) => {
  if (e.target === pdfModalMask) closePdfModal();
});
pdfModalConfirmBtn.addEventListener("click", async () => {
  if (typeof window.__mergePdfDownload === "function") {
    await window.__mergePdfDownload();
  }
});
