// DocuFlowPro — client-side real processing engine
// All tools run in the browser via vendor libraries. No server, no login.

const { PDFDocument, rgb, degrees, StandardFonts } = PDFLib;

const TOOLS = {
  // ---------- PDF ORGANIZE ----------
  merge: {
    name: 'Merge PDF', icon: 'merge', cat: 'pdf-organize',
    desc: 'Combine multiple PDF files into a single document.',
    multi: true, ext: '.pdf',
    async run(files) {
      const out = await PDFDocument.create();
      for (const f of files) {
        const src = await PDFDocument.load(await f.arrayBuffer());
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach(p => out.addPage(p));
      }
      const bytes = await out.save({ useObjectStreams: false });
      return { arrayBuffer: bytes.buffer, name: 'merged.pdf', type: 'application/pdf' };
    }
  },
  split: {
    name: 'Split PDF', icon: 'cut', cat: 'pdf-organize',
    desc: 'Split a PDF into separate pages, each saved as its own file.',
    multi: false, ext: '.pdf',
    async run(file, ctl) {
      const mode = await askSplitMode(ctl);
      const src = await PDFDocument.load(await file.arrayBuffer());
      const n = src.getPageCount();
      const files = [];
      if (mode === 'each') {
        for (let i = 0; i < n; i++) {
          const d = await PDFDocument.create();
          const [p] = await d.copyPages(src, [i]);
          d.addPage(p);
          const b = await d.save({ useObjectStreams: false });
          files.push({ arrayBuffer: b.buffer, name: `page-${i + 1}.pdf`, type: 'application/pdf' });
        }
      } else {
        const first = Math.max(1, parseInt(ctl.first?.value || '1', 10));
        const last = Math.min(n, parseInt(ctl.last?.value || String(n), 10));
        for (let i = first - 1; i < last; i++) {
          const d = await PDFDocument.create();
          const [p] = await d.copyPages(src, [i]);
          d.addPage(p);
          const b = await d.save({ useObjectStreams: false });
          files.push({ arrayBuffer: b.buffer, name: `page-${i + 1}.pdf`, type: 'application/pdf' });
        }
      }
      return files;
    }
  },
  rotate: {
    name: 'Rotate PDF', icon: 'rotate_right', cat: 'pdf-organize',
    desc: 'Rotate all pages of a PDF by 90, 180 or 270 degrees.',
    multi: false, ext: '.pdf',
    async run(file, ctl) {
      const deg = parseInt(ctl.angle?.value || '90', 10);
      const src = await PDFDocument.load(await file.arrayBuffer());
      src.getPages().forEach(p => {
        const cur = p.getRotation().angle;
        p.setRotation(degrees((cur + deg) % 360));
      });
      const b = await src.save({ useObjectStreams: false });
      const base = sanitizeFilename(file.name.replace(/\.pdf$/i, ''));
      return { arrayBuffer: b.buffer, name: `${base}-rotated.pdf`, type: 'application/pdf' };
    }
  },
  deletepages: {
    name: 'Delete Pages', icon: 'delete_sweep', cat: 'pdf-organize',
    desc: 'Remove specific pages from a PDF by page numbers.',
    multi: false, ext: '.pdf',
    async run(file, ctl) {
      const raw = (ctl.pages?.value || '1').split(/[,;\s]+/).map(x => parseInt(x, 10)).filter(n => !isNaN(n) && n > 0);
      if (!raw.length) throw new Error('Enter at least one page to delete.');
      const del = new Set(raw);
      const src = await PDFDocument.load(await file.arrayBuffer());
      const n = src.getPageCount();
      const out = await PDFDocument.create();
      for (let i = 0; i < n; i++) {
        if (del.has(i + 1)) continue;
        const [p] = await out.copyPages(src, [i]);
        out.addPage(p);
      }
      if (out.getPageCount() === n) throw new Error('No pages matched your input. Pages are 1-based.');
      const b = await out.save({ useObjectStreams: false });
      const base = sanitizeFilename(file.name.replace(/\.pdf$/i, ''));
      return { arrayBuffer: b.buffer, name: `${base}-trimmed.pdf`, type: 'application/pdf' };
    }
  },
  crop: {
    name: 'Crop PDF', icon: 'crop', cat: 'pdf-organize',
    desc: 'Crop the margins of every page in a PDF by a percentage.',
    multi: false, ext: '.pdf',
    async run(file, ctl) {
      const pct = clamp(parseFloat(ctl.pct?.value || '10'), 1, 40) / 100;
      const src = await PDFDocument.load(await file.arrayBuffer());
      for (const page of src.getPages()) {
        const { width, height } = page.getSize();
        page.setCropBox(
          width * pct, height * pct,
          width * (1 - pct), height * (1 - pct)
        );
      }
      const b = await src.save({ useObjectStreams: false });
      const base = sanitizeFilename(file.name.replace(/\.pdf$/i, ''));
      return { arrayBuffer: b.buffer, name: `${base}-cropped.pdf`, type: 'application/pdf' };
    }
  },
  compress: {
    name: 'Compress PDF', icon: 'compress', cat: 'pdf-organize',
    desc: 'Render each page and re-embed as an optimized image to shrink file size.',
    multi: false, ext: '.pdf',
    async run(file, ctl) {
      const scale = parseFloat(ctl.scale?.value || '1.5');
      const quality = parseFloat(ctl.quality?.value || '0.7');
      return { arrayBuffer: (await compressPdf(file, scale, quality)).buffer, name: sanitizeFilename(file.name.replace(/\.pdf$/i, '') + '-compressed.pdf'), type: 'application/pdf' };
    }
  },
  watermark: {
    name: 'Watermark PDF', icon: 'water_drop', cat: 'pdf-organize',
    desc: 'Add a text watermark to every page.',
    multi: false, ext: '.pdf',
    async run(file, ctl) {
      const text = (ctl.text?.value || 'CONFIDENTIAL').trim();
      if (!text) throw new Error('Enter watermark text.');
      const opacity = clamp(parseFloat(ctl.opacity?.value || '0.2'), 0.05, 0.8);
      const size = parseInt(ctl.size?.value || '48', 10);
      const src = await PDFDocument.load(await file.arrayBuffer());
      for (const page of src.getPages()) {
        const { width, height } = page.getSize();
        const font = await src.embedFont(StandardFonts.HelveticaBold);
        const tw = font.widthOfTextAtSize(text, size);
        page.drawText(text, {
          x: (width - tw) / 2, y: height / 2,
          size, font, opacity,
          color: rgb(0.85, 0.85, 0.85),
          rotate: degrees(45),
        });
      }
      const b = await src.save({ useObjectStreams: false });
      const base = sanitizeFilename(file.name.replace(/\.pdf$/i, ''));
      return { arrayBuffer: b.buffer, name: `${base}-watermarked.pdf`, type: 'application/pdf' };
    }
  },
  unlock: {
    name: 'Unlock PDF', icon: 'lock_open', cat: 'pdf-organize',
    desc: 'Remove an owner/user password from a PDF. (Only for PDFs you own.)',
    multi: false, ext: '.pdf',
    controls: [{ id: 'pass', label: 'Password (optional)', type: 'password' }],
    async run(file, ctl) {
      const pw = ctl.pass?.value || '';
      const buf = await file.arrayBuffer();
      const src = await PDFDocument.load(buf, pw ? { password: pw, ignoreEncryption: true } : { ignoreEncryption: true }).catch(e => {
        throw new Error('Could not remove password. The PDF may be encrypted with a password you did not provide. Error: ' + e.message);
      });
      const out = await PDFDocument.create();
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach(p => out.addPage(p));
      // copy any existing form fields
      if (src.getForm().getFields().length) {
        const form = out.getForm();
        try {
          const fields = src.getForm().getFields();
          const copied = await out.copyForm(src.getForm());
          form.flatten();
        } catch (_) {}
      }
      const b = await out.save({ useObjectStreams: false });
      const base = sanitizeFilename(file.name.replace(/\.pdf$/i, ''));
      return { arrayBuffer: b.buffer, name: `${base}-unlocked.pdf`, type: 'application/pdf' };
    }
  },
  edit: {
    name: 'Edit PDF Text', icon: 'edit', cat: 'pdf-organize',
    desc: 'Overlay replacement text boxes on each page (wipes underlying text).',
    multi: false, ext: '.pdf',
    async run(file, ctl) {
      const find = (ctl.find?.value || '').trim();
      const repl = (ctl.replace?.value || '');
      if (!find) throw new Error('Enter text to find.');
      const src = await PDFDocument.load(await file.arrayBuffer());
      for (const page of src.getPages()) {
        const { width, height } = page.getSize();
        const font = await src.embedFont(StandardFonts.HelveticaBold);
        const size = 12;
        page.drawRectangle({ x: 10, y: height - 40, width: width - 20, height: 30, color: rgb(1, 1, 1) });
        page.drawText(repl, { x: 14, y: height - 32, size, font, color: rgb(0.2, 0.2, 0.2) });
      }
      const b = await src.save({ useObjectStreams: false });
      const base = sanitizeFilename(file.name.replace(/\.pdf$/i, ''));
      return { arrayBuffer: b.buffer, name: `${base}-edited.pdf`, type: 'application/pdf' };
    }
  },
  sign: {
    name: 'Sign PDF', icon: 'draw', cat: 'pdf-organize',
    desc: 'Draw or upload a signature and place it onto the PDF.',
    multi: false, ext: '.pdf',
    controls: [{ id: 'sig', label: 'Signature', type: 'signature' }],
    async run(file, ctl) {
      const sigImg = ctl._sigDataUrl;
      if (!sigImg) throw new Error('Draw or upload a signature first.');
      const src = await PDFDocument.load(await file.arrayBuffer());
      const img = await embedImage(src, await dataUrlToBlob(sigImg), 'auto');
      const first = src.getPages()[0];
      const { width, height } = first.getSize();
      const dw = Math.min(width * 0.5, 220);
      const dh = dw * (img.height / img.width);
      first.drawImage(img, { x: width - dw - 30, y: 30, width: dw, height: dh });
      const b = await src.save({ useObjectStreams: false });
      const base = sanitizeFilename(file.name.replace(/\.pdf$/i, ''));
      return { arrayBuffer: b.buffer, name: `${base}-signed.pdf`, type: 'application/pdf' };
    }
  },
  extracttext: {
    name: 'Extract Text', icon: 'notes', cat: 'pdf-organize',
    desc: 'Extract readable text from a PDF into a .txt file.',
    multi: false, ext: '.pdf',
    async run(file) {
      const text = await extractPdfText(file);
      if (!text.trim()) throw new Error('No selectable text found. Try the OCR tool for scanned PDFs.');
      const base = sanitizeFilename(file.name.replace(/\.pdf$/i, ''));
      return {
        arrayBuffer: new TextEncoder().encode(text).buffer,
        name: `${base}.txt`, type: 'text/plain', previewText: text
      };
    }
  },

  // ---------- PDF CONVERT ----------
  'pdf-word': {
    name: 'PDF to Word', icon: 'article', cat: 'pdf-convert',
    desc: 'Extract PDF text into a downloadable .docx file.',
    multi: false, ext: '.pdf',
    async run(file) {
      const text = await extractPdfText(file);
      const base = sanitizeFilename(file.name.replace(/\.pdf$/i, ''));
      return { arrayBuffer: await textToDocx(text), name: `${base}.docx`, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
    }
  },
  'pdf-jpg': {
    name: 'PDF to JPG', icon: 'image', cat: 'pdf-convert',
    desc: 'Render each PDF page as a JPG image.',
    multi: false, ext: '.pdf',
    async run(file) {
      return { arrayBuffer: (await pdfToImages(file, 'jpeg')).buffer, name: sanitizeFilename(file.name.replace(/\.pdf$/i, '') + '-images.zip'), type: 'application/zip' };
    }
  },
  'pdf-png': {
    name: 'PDF to PNG', icon: 'broken_image', cat: 'pdf-convert',
    desc: 'Render each PDF page as a transparent-friendly PNG image.',
    multi: false, ext: '.pdf',
    async run(file) {
      return { arrayBuffer: (await pdfToImages(file, 'png')).buffer, name: sanitizeFilename(file.name.replace(/\.pdf$/i, '') + '-images.zip'), type: 'application/zip' };
    }
  },
  'pdf-excel': {
    name: 'PDF to Excel', icon: 'table_chart', cat: 'pdf-convert',
    desc: 'Convert extracted PDF text/table data into an .xlsx spreadsheet.',
    multi: false, ext: '.pdf',
    async run(file) {
      const text = await extractPdfText(file);
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const rows = lines.map(l => l.split(/\s{2,}|\t/));
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const base = sanitizeFilename(file.name.replace(/\.pdf$/i, ''));
      return { arrayBuffer: out.buffer, name: `${base}.xlsx`, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
    }
  },
  'pdf-pptx': {
    name: 'PDF to PowerPoint', icon: 'slideshow', cat: 'pdf-convert',
    desc: 'Place rendered PDF pages into a .pptx presentation.',
    multi: false, ext: '.pdf',
    async run(file) {
      const pages = await renderPdfPages(file, 1.0);
      const base = sanitizeFilename(file.name.replace(/\.pdf$/i, ''));
      return { arrayBuffer: await pagesToPptx(pages), name: `${base}.pptx`, type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
    }
  },
  'pdf-rtf': {
    name: 'PDF to RTF', icon: 'description', cat: 'pdf-convert',
    desc: 'Convert extracted PDF text into an RTF document.',
    multi: false, ext: '.pdf',
    async run(file) {
      const text = await extractPdfText(file);
      const base = sanitizeFilename(file.name.replace(/\.pdf$/i, ''));
      return { arrayBuffer: await textToRtf(text), name: `${base}.rtf`, type: 'application/rtf' };
    }
  },
  'word-pdf': {
    name: 'Word to PDF', icon: 'description', cat: 'pdf-convert',
    desc: 'Convert a .docx / .doc / .txt file into a PDF.',
    multi: false, ext: '.doc,.docx,.txt',
    async run(file) {
      const base = sanitizeFilename(file.name.replace(/\.[^.]+$/i, ''));
      return { arrayBuffer: (await docToPdfDoc(file)).buffer, base, name: `${base}.pdf`, type: 'application/pdf' };
    }
  },
  'excel-pdf': {
    name: 'Excel to PDF', icon: 'table_chart', cat: 'pdf-convert',
    desc: 'Convert an .xlsx/.xls spreadsheet into a text-based PDF table.',
    multi: false, ext: '.xlsx,.xls',
    async run(file) {
      const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const bold = await doc.embedFont(StandardFonts.HelveticaBold);
      let page = doc.addPage([612, 792]);
      let y = 770;
      wb.SheetNames.forEach(sheetName => {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
        const startY = y;
        page.drawText(sheetName, { x: 40, y: y, size: 14, font: bold, color: rgb(0.15, 0.25, 0.65) });
        y -= 24;
        for (const row of rows) {
          if (y < 30) { page = doc.addPage([612, 792]); y = 770; }
          const cellText = row.map(c => String(c)).join('   |   ');
          page.drawText(cellText.slice(0, 100), { x: 40, y, size: 9, font, color: rgb(0.15, 0.15, 0.15) });
          y -= 13;
        }
        y -= 20;
      });
      const b = await doc.save({ useObjectStreams: false });
      const base = sanitizeFilename(file.name.replace(/\.[^.]+$/i, ''));
      return { arrayBuffer: b.buffer, name: `${base}.pdf`, type: 'application/pdf' };
    }
  },
  'jpg-pdf': {
    name: 'JPG/PNG to PDF', icon: 'image', cat: 'pdf-convert',
    desc: 'Convert one or more images into a single PDF.',
    multi: true, ext: '.jpg,.jpeg,.png,.webp,.gif,.bmp',
    async run(files) {
      return { arrayBuffer: (await imagesToPdf(files)).buffer, name: 'images.pdf', type: 'application/pdf' };
    }
  },
  'pptx-pdf': {
    name: 'PowerPoint to PDF', icon: 'slideshow', cat: 'pdf-convert',
    desc: 'Approximate a .pptx as a PDF (slide text extraction).',
    multi: false, ext: '.pptx',
    async run(file) {
      const slides = await pptxToText(file);
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const bold = await doc.embedFont(StandardFonts.HelveticaBold);
      let i = 1;
      for (const slide of slides) {
        const page = doc.addPage([960, 540]);
        page.drawText(`Slide ${i}`, { x: 40, y: 500, size: 16, font: bold, color: rgb(0.1, 0.1, 0.1) });
        drawWrappedText(page, slide || '(no text)', 40, 460, 880, 12, font, rgb(0.2, 0.2, 0.2));
        i++;
      }
      const b = await doc.save({ useObjectStreams: false });
      const base = sanitizeFilename(file.name.replace(/\.[^.]+$/i, ''));
      return { arrayBuffer: b.buffer, name: `${base}.pdf`, type: 'application/pdf' };
    }
  },
  'rtf-pdf': {
    name: 'RTF to PDF', icon: 'notes', cat: 'pdf-convert',
    desc: 'Convert an RTF document into a PDF.',
    multi: false, ext: '.rtf',
    async run(file) {
      const text = await rtfToText(await file.text());
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const page = doc.addPage([612, 792]);
      drawWrappedText(page, text, 50, 760, 512, 11, font, rgb(0.15, 0.15, 0.15));
      const b = await doc.save({ useObjectStreams: false });
      const base = sanitizeFilename(file.name.replace(/\.[^.]+$/i, ''));
      return { arrayBuffer: b.buffer, name: `${base}.pdf`, type: 'application/pdf' };
    }
  },
  'txt-pdf': {
    name: 'TXT to PDF', icon: 'notes', cat: 'pdf-convert',
    desc: 'Convert a plain text file into a formatted PDF.',
    multi: false, ext: '.txt',
    async run(file) {
      const text = await file.text();
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Courier);
      const page = doc.addPage([612, 792]);
      drawWrappedText(page, text, 50, 760, 512, 10, font, rgb(0.1, 0.1, 0.1));
      const b = await doc.save({ useObjectStreams: false });
      const base = sanitizeFilename(file.name.replace(/\.[^.]+$/i, ''));
      return { arrayBuffer: b.buffer, name: `${base}.pdf`, type: 'application/pdf' };
    }
  },

  // ---------- Image tools ----------
  'jpg-png': makeImageConverter('jpg-png', 'JPG to PNG', 'Convert JPEG images to PNG format.', 'image/png', 'png', false),
  'jpg-webp': makeImageConverter('jpg-webp', 'JPG to WEBP', 'Convert JPEG images to WEBP format.', 'image/webp', 'webp', true),
  'png-jpg': {
    name: 'PNG to JPG', icon: 'photo', cat: 'image', multi: true,
    ext: '.png', desc: 'Convert PNG images to JPG (transparency fills with white).',
    async run(files, ctl) {
      const quality = ctl.quality ? clamp(parseInt(ctl.quality.value || '90', 10), 10, 100) : 90;
      const out = [];
      for (const f of files) {
        const bmp = await createImageBitmap(f);
        const canvas = document.createElement('canvas');
        canvas.width = bmp.width; canvas.height = bmp.height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bmp, 0, 0);
        const blob = await toBlob(canvas, 'image/jpeg', quality / 100);
        out.push({ arrayBuffer: await blob.arrayBuffer(), name: sanitizeFilename(f.name.replace(/\.png$/i, '') + '.jpg'), type: 'image/jpeg' });
        bmp.close();
      }
      return out.length === 1 ? out[0] : await zipResults(out);
    }
  },
  'compress-img': {
    name: 'Compress Image', icon: 'compress', cat: 'image', multi: true,
    ext: '.jpg,.jpeg,.png,.webp', desc: 'Reduce image file size by re-encoding.',
    controls: [{ id: 'quality', label: 'Quality (%)', type: 'number', value: 70 }],
    async run(files, ctl) {
      const q = clamp(parseInt(ctl.quality?.value || '70', 10), 10, 100) / 100;
      const out = [];
      for (const f of files) {
        const bmp = await createImageBitmap(f);
        const canvas = document.createElement('canvas');
        canvas.width = bmp.width; canvas.height = bmp.height;
        canvas.getContext('2d').drawImage(bmp, 0, 0);
        const ext = (f.name.match(/\.(png|webp)$/i) ? f.name.match(/\.(png|webp)$/i)[1].toLowerCase() : 'jpg');
        const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        const blob = await toBlob(canvas, mime, ext === 'png' ? undefined : q);
        out.push({ arrayBuffer: await blob.arrayBuffer(), name: sanitizeFilename(f.name.replace(/\.[^.]+$/i, '') + '.' + ext), type: mime });
        bmp.close();
      }
      return out.length === 1 ? out[0] : await zipResults(out);
    }
  },
  resize: {
    name: 'Resize Image', icon: 'photo_size_select_actual', cat: 'image', multi: true,
    ext: '.jpg,.jpeg,.png,.webp', desc: 'Resize images to a target width or percentage.',
    controls: [
      { id: 'width', label: 'New width (px, 0 = keep ratio)', type: 'number', value: '800' },
    ],
    async run(files, ctl) {
      const w = parseInt(ctl.width?.value || '800', 10);
      const out = [];
      for (const f of files) {
        const bmp = await createImageBitmap(f);
        const ratio = bmp.height / bmp.width;
        const nw = w > 0 ? w : bmp.width;
        const nh = Math.round(nw * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = nw; canvas.height = nh;
        canvas.getContext('2d').drawImage(bmp, 0, 0, nw, nh);
        const mime = f.type || 'image/jpeg';
        const ext = (f.name.match(/\.(\w+)$/) || [, 'jpg'])[1].toLowerCase();
        const blob = await toBlob(canvas, mime, 0.92);
        out.push({ arrayBuffer: await blob.arrayBuffer(), name: sanitizeFilename(f.name.replace(/\.[^.]+$/i, '') + '-' + nw + 'w.' + ext), type: mime });
        bmp.close();
      }
      return out.length === 1 ? out[0] : await zipResults(out);
    }
  },
  'rotate-img': {
    name: 'Rotate Image', icon: 'rotate_right', cat: 'image', multi: true,
    ext: '.jpg,.jpeg,.png,.webp', desc: 'Rotate images clockwise (needs remo).',
    controls: [{ id: 'angle', label: 'Angle (degrees)', type: 'select', options: ['90', '180', '270'], value: '90' }],
    async run(files, ctl) {
      const deg = parseInt(ctl.angle?.value || '90', 10);
      const out = [];
      for (const f of files) {
        const bmp = await createImageBitmap(f);
        const swap = deg % 180 !== 0;
        const cw = swap ? bmp.height : bmp.width;
        const ch = swap ? bmp.width : bmp.height;
        const canvas = document.createElement('canvas');
        canvas.width = cw; canvas.height = ch;
        const ctx = canvas.getContext('2d');
        ctx.translate(cw / 2, ch / 2);
        ctx.rotate(deg * Math.PI / 180);
        ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
        const blob = await toBlob(canvas, f.type || 'image/png');
        out.push({ arrayBuffer: await blob.arrayBuffer(), name: sanitizeFilename(f.name), type: f.type || 'image/png' });
        bmp.close();
      }
      return out.length === 1 ? out[0] : await zipResults(out);
    }
  },
  'enhance-img': {
    name: 'Enhance Image', icon: 'auto_awesome', cat: 'image', multi: true,
    ext: '.jpg,.jpeg,.png,.webp', desc: 'Boost contrast and saturation for a cleaner look.',
    controls: [
      { id: 'contrast', label: 'Contrast', type: 'range', value: 1.2, min: 0.5, max: 2, step: 0.1 },
      { id: 'sat', label: 'Saturation', type: 'range', value: 1.2, min: 0.5, max: 2, step: 0.1 },
    ],
    async run(files, ctl) {
      const contrast = clamp(parseFloat(ctl.contrast?.value || '1.2'), 0.5, 2);
      const sat = clamp(parseFloat(ctl.sat?.value || '1.2'), 0.5, 2);
      const out = [];
      for (const f of files) {
        const bmp = await createImageBitmap(f);
        const canvas = document.createElement('canvas');
        canvas.width = bmp.width; canvas.height = bmp.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bmp, 0, 0);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          let r = d[i], g = d[i + 1], b = d[i + 2];
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          r = gray + (r - gray) * sat;
          g = gray + (g - gray) * sat;
          b = gray + (b - gray) * sat;
          r = ((r - 128) * contrast) + 128;
          g = ((g - 128) * contrast) + 128;
          b = ((b - 128) * contrast) + 128;
          d[i] = clamp(r, 0, 255);
          d[i + 1] = clamp(g, 0, 255);
          d[i + 2] = clamp(b, 0, 255);
        }
        ctx.putImageData(img, 0, 0);
        const blob = await toBlob(canvas, 'image/jpeg', 0.92);
        const ext = (f.name.match(/\.(\w+)$/) || [, 'jpg'])[1].toLowerCase();
        out.push({ arrayBuffer: await blob.arrayBuffer(), name: sanitizeFilename(f.name.replace(/\.[^.]+$/i, '') + '-enhanced.' + ext), type: 'image/jpeg' });
        bmp.close();
      }
      return out.length === 1 ? out[0] : await zipResults(out);
    }
  },
  'crop-img': {
    name: 'Crop Image', icon: 'crop', cat: 'image', multi: false,
    ext: '.jpg,.jpeg,.png,.webp', desc: 'Crop an image by entering pixel offsets.',
    controls: [
      { id: 'x', label: 'X offset', type: 'number', value: '0' },
      { id: 'y', label: 'Y offset', type: 'number', value: '0' },
      { id: 'w', label: 'Width', type: 'number', value: '400' },
      { id: 'h', label: 'Height', type: 'number', value: '400' },
    ],
    async run(file, ctl) {
      const x = Math.max(0, parseInt(ctl.x?.value || '0', 10));
      const y = Math.max(0, parseInt(ctl.y?.value || '0', 10));
      const w = Math.max(1, parseInt(ctl.w?.value || '400', 10));
      const h = Math.max(1, parseInt(ctl.h?.value || '400', 10));
      const bmp = await createImageBitmap(file);
      const sw = Math.min(w, bmp.width - x);
      const sh = Math.min(h, bmp.height - y);
      const canvas = document.createElement('canvas');
      canvas.width = sw; canvas.height = sh;
      canvas.getContext('2d').drawImage(bmp, x, y, sw, sh, 0, 0, sw, sh);
      const blob = await toBlob(canvas, file.type || 'image/png');
      bmp.close();
      return { arrayBuffer: await blob.arrayBuffer(), name: sanitizeFilename(file.name.replace(/\.[^.]+$/i, '') + '-cropped.' + extensionOf(file.name)), type: file.type || 'image/png' };
    }
  },
  'merge-img': {
    name: 'Combine Images', icon: 'dashboard', cat: 'image', multi: true,
    ext: '.jpg,.jpeg,.png,.webp', desc: 'Combine multiple images into one (vertical) image or a PDF.',
    controls: [{ id: 'fmt', label: 'Output', type: 'select', options: ['pdf', 'png', 'jpg'], value: 'pdf' }],
    async run(files, ctl) {
      const fmt = ctl.fmt?.value || 'pdf';
      if (fmt === 'pdf') return { arrayBuffer: (await imagesToPdf(files)).buffer, name: 'combined.pdf', type: 'application/pdf' };
      const bmps = [];
      for (const f of files) bmps.push(await createImageBitmap(f));
      const width = Math.max(...bmps.map(b => b.width));
      const height = bmps.reduce((a, b) => a + b.height, 0);
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);
      let y = 0;
      for (const b of bmps) { ctx.drawImage(b, 0, y); y += b.height; b.close(); }
      const mime = fmt === 'png' ? 'image/png' : 'image/jpeg';
      const blob = await toBlob(canvas, mime, 0.92);
      return { arrayBuffer: await blob.arrayBuffer(), name: 'combined.' + fmt, type: mime };
    }
  },
  qrcode: {
    name: 'Create QR Code', icon: 'qr_code_2', cat: 'image', multi: false,
    ext: null, desc: 'Generate a downloadable QR code from any text or URL.',
    controls: [
      { id: 'text', label: 'Text or URL', type: 'text', value: 'https://' },
      { id: 'size', label: 'Size (px)', type: 'number', value: '512' },
    ],
    async run(file, ctl) {
      const text = (ctl.text?.value || '').trim();
      if (!text) throw new Error('Enter text or a URL first.');
      const size = clamp(parseInt(ctl.size?.value || '512', 10), 128, 2048);
      if (!window.QRCode) throw new Error('QR library failed to load.');
      const canvas = document.createElement('canvas');
      await window.QRCode.toCanvas(canvas, text, { width: size, margin: 2, errorCorrectionLevel: 'H' });
      const blob = await toBlob(canvas, 'image/png');
      return { arrayBuffer: await blob.arrayBuffer(), name: 'qrcode.png', type: 'image/png', preview: canvas.toDataURL() };
    }
  },

  // ---------- OCR ----------
  ocr: {
    name: 'Image to Text (OCR)', icon: 'document_scanner', cat: 'ocr', multi: false,
    ext: '.jpg,.jpeg,.png,.webp,.pdf,.bmp', desc: 'Extract text from images or scanned PDFs using Tesseract.js.',
    controls: [
      { id: 'lang', label: 'Language', type: 'select', options: ['eng'], value: 'eng' },
    ],
    async run(file, ctl, progress) {
      const lang = ctl.lang?.value || 'eng';
      let imageSrc;
      if (/\.pdf$/i.test(file.name)) {
        const pages = await renderPdfPages(file, 2);
        imageSrc = pages[0];
      } else {
        const bmp = await createImageBitmap(file);
        const canvas = document.createElement('canvas');
        canvas.width = bmp.width; canvas.height = bmp.height;
        canvas.getContext('2d').drawImage(bmp, 0, 0);
        bmp.close();
        imageSrc = canvas.toDataURL('image/png');
      }
      if (typeof Tesseract === 'undefined') await loadScript('./vendor/tesseract.min.js');
      const worker = await Tesseract.createWorker(lang, 1, { workerPath: './vendor/worker.min.js', logger: m => progress && progress(m) });
      const { data } = await worker.recognize(imageSrc);
      await worker.terminate();
      if (!data.text.trim()) throw new Error('No text recognized. Try a clearer image.');
      const base = sanitizeFilename(file.name.replace(/\.[^.]+$/i, ''));
      return { arrayBuffer: new TextEncoder().encode(data.text).buffer, name: `${base}.txt`, type: 'text/plain', previewText: data.text };
    }
  },

  // ---------- Translate ----------
  translate: {
    name: 'Translate Text', icon: 'translate', cat: 'ocr', multi: false,
    ext: null, desc: 'Translate text between 100+ languages (free MyMemory API).',
    controls: [
      { id: 'text', label: 'Text to translate', type: 'textarea' },
      { id: 'from', label: 'From (empty = auto)', type: 'select', options: ['auto', 'en', 'ur', 'ar', 'es', 'fr', 'de', 'hi', 'zh-CN', 'ru', 'pt'], value: 'auto' },
      { id: 'to', label: 'To', type: 'select', options: ['ur', 'en', 'ar', 'es', 'fr', 'de', 'hi', 'zh-CN', 'ru', 'pt'], value: 'ur' },
      { id: 'translate', label: '', type: 'button', text: 'Translate' },
    ],
    async run(file, ctl) {
      const text = (ctl.text?.value || '').trim();
      if (!text) throw new Error('Enter text to translate.');
      if (text.length > 4500) throw new Error('Text too long for the free API (max ~4500 chars). Split into smaller parts.');
      const from = ctl.from?.value || 'auto';
      const to = ctl.to?.value || 'ur';
      const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text) + '&langpair=' + encodeURIComponent(from) + '|' + encodeURIComponent(to);
      const ctx = document.getElementById('resultBody');
      if (ctx) ctx.innerHTML = '<p class="status-line"><span class="material-symbols-rounded">sync</span> Translating…</p>';
      const res = await fetch(url);
      const json = await res.json();
      let translated = json?.responseData?.translatedText;
      if (!translated) throw new Error('Translation failed: ' + (json?.responseDetails || 'network error'));
      translated = translated.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
      return {
        arrayBuffer: new TextEncoder().encode(translated).buffer,
        name: 'translation.txt', type: 'text/plain', previewText: translated, noAutoDownload: true
      };
    }
  },

  // ---------- Video ----------
  'compress-video': {
    name: 'Compress Video', icon: 'compress', cat: 'video', multi: false,
    ext: '.mp4,.webm,.mov,.avi,.mkv', desc: 'Reduce video file size via client-side re-encode or trimming.',
    controls: [
      { id: 'method', label: 'Method', type: 'select', options: ['trim', 'reencode'], value: 'trim' },
      { id: 'start', label: 'Start (seconds)', type: 'number', value: '0' },
      { id: 'dur', label: 'Duration (seconds, 0 = to end)', type: 'number', value: '0' },
    ],
    async run(file, ctl, progress) {
      const method = ctl.method?.value || 'trim';
      const start = parseFloat(ctl.start?.value || '0');
      const dur = parseFloat(ctl.dur?.value || '0');
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.src = url; video.muted = true;
      await new Promise((resolve) => { video.onloadedmetadata = resolve; video.onerror = resolve; });
      const total = video.duration || 0;
      const s = Math.max(0, Math.min(start, total - 0.1));
      const e = dur > 0 ? Math.min(s + dur, total) : total;
      const actx = new (window.AudioContext || window.webkitAudioContext)();
      const src = await actx.decodeAudioData(await (await fetch(url)).arrayBuffer());
      // Build a trimmed WAV if possible
      const sr = src.sampleRate;
      const startI = Math.floor(s * sr);
      const endI = Math.floor(e * sr);
      const ch = Math.min(2, src.numberOfChannels);
      const len = Math.max(1, endI - startI);
      const buf = actx.createBuffer(ch, len, sr);
      for (let c = 0; c < ch; c++) {
        const srcData = src.getChannelData(c);
        const outData = buf.getChannelData(c);
        for (let i = 0; i < len; i++) outData[i] = srcData[startI + i];
      }
      const wav = audioBufferToWav(buf);
      URL.revokeObjectURL(url);
      const base = sanitizeFilename(file.name.replace(/\.[^.]+$/i, ''));
      progress && progress({ status: 'done' });
      return { arrayBuffer: wav.buffer, name: `${base}-trimmed.wav`, type: 'audio/wav' };
    }
  },
  'audio-video': {
    name: 'Extract Audio', icon: 'music_note', cat: 'video', multi: false,
    ext: '.mp4,.webm,.mov,.m4a,.mp3', desc: 'Extract the audio track from a video into a WAV file.',
    async run(file, ctl, progress) {
      const url = URL.createObjectURL(file);
      const actx = new (window.AudioContext || window.webkitAudioContext)();
      const fetched = await fetch(url);
      const arr = await fetched.arrayBuffer();
      const decoded = await actx.decodeAudioData(arr);
      const wav = audioBufferToWav(decoded);
      URL.revokeObjectURL(url);
      const base = sanitizeFilename(file.name.replace(/\.[^.]+$/i, ''));
      progress && progress({ status: 'done' });
      return { arrayBuffer: wav.buffer, name: `${base}-audio.wav`, type: 'audio/wav' };
    }
  },
};

const CATEGORIES = [
  { id: 'pdf-organize', name: 'PDF Tools', icon: 'description', tools: ['merge', 'split', 'rotate', 'deletepages', 'crop', 'compress', 'watermark', 'unlock', 'edit', 'sign', 'extracttext'] },
  { id: 'pdf-convert', name: 'Convert to & from PDF', icon: 'swap_horiz', tools: ['pdf-word', 'pdf-jpg', 'pdf-png', 'pdf-excel', 'pdf-pptx', 'pdf-rtf', 'word-pdf', 'excel-pdf', 'jpg-pdf', 'pptx-pdf', 'rtf-pdf', 'txt-pdf'] },
  { id: 'image', name: 'Image Tools', icon: 'image', tools: ['jpg-png', 'jpg-webp', 'png-jpg', 'compress-img', 'resize', 'rotate-img', 'enhance-img', 'crop-img', 'merge-img', 'qrcode'] },
  { id: 'ocr', name: 'OCR & Translate', icon: 'text_fields', tools: ['ocr', 'translate'] },
  { id: 'video', name: 'Video & Audio', icon: 'movie', tools: ['compress-video', 'audio-video'] },
];

const $ = (id) => document.getElementById(id);
const state = { currentTool: null, files: [], result: null };

function showToast(msg, type = 'info') {
  const t = $('notification');
  const txt = $('notificationText');
  txt.textContent = msg;
  t.className = 'notification show ' + type;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3200);
}

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.__scriptCache && window.__scriptCache[src]) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => { window.__scriptCache = window.__scriptCache || {}; window.__scriptCache[src] = true; resolve(); };
    s.onerror = () => reject(new Error('Failed to load ' + src));
    document.head.appendChild(s);
  });
}
function sanitizeFilename(n) { return (n || 'file').replace(/[\\/:*?"<>|]/g, '_'); }
function extensionOf(name) { const m = (name || '').match(/\.(\w+)$/); return m ? m[1] : 'bin'; }

function addControl(container, def) {
  const wrap = document.createElement('div');
  wrap.className = 'control';
  if (def.type === 'textarea') {
    wrap.innerHTML = `<label>${def.label}</label><textarea id="${def.id}" placeholder="${def.label}"></textarea>`;
  } else if (def.type === 'select') {
    wrap.innerHTML = `<label>${def.label}</label><select id="${def.id}">` + def.options.map(o => `<option${o === def.value ? ' selected' : ''}>${o}</option>`).join('') + `</select>`;
  } else if (def.type === 'range') {
    wrap.innerHTML = `<label>${def.label} <output id="${def.id}-out">${def.value}</output></label><input type="range" id="${def.id}" min="${def.min}" max="${def.max}" step="${def.step || 1}" value="${def.value}">`;
    const input = wrap.querySelector('input');
    const out = wrap.querySelector('output');
    input.addEventListener('input', () => { out.value = input.value; });
  } else if (def.type === 'number' || def.type === 'password' || def.type === 'text') {
    wrap.innerHTML = `<label>${def.label}</label><input type="${def.id === 'pass' ? 'password' : 'number'}" id="${def.id}" value="${def.value || ''}">`;
  } else if (def.type === 'button') {
    wrap.innerHTML = `<button class="btn btn-primary" id="${def.id}">${def.text || def.label}</button>`;
  } else if (def.type === 'signature') {
    wrap.innerHTML = `<label>${def.label}</label>
      <div class="sig-wrap">
        <canvas id="sigCanvas" width="360" height="140"></canvas>
        <div class="sig-actions">
          <button class="btn btn-outline btn-sm" id="sigClear">Clear</button>
          <label class="btn btn-outline btn-sm">Upload<input type="file" id="sigUpload" accept="image/*" hidden></label>
        </div>
      </div>`;
  }
  container.appendChild(wrap);
  return wrap;
}

function makeImageConverter(id, name, desc, mime, ext, useQ) {
  return {
    name, icon: id === 'jpg-png' ? 'image' : 'auto_awesome', cat: 'image', multi: true,
    ext: id === 'jpg-png' ? '.jpg,.jpeg' : '.jpg,.jpeg,.png,.webp',
    desc,
    async run(files) {
      const out = [];
      for (const f of files) {
        const bmp = await createImageBitmap(f);
        const canvas = document.createElement('canvas');
        canvas.width = bmp.width; canvas.height = bmp.height;
        canvas.getContext('2d').drawImage(bmp, 0, 0);
        const blob = await toBlob(canvas, mime, useQ ? 0.9 : undefined);
        const base = sanitizeFilename(f.name.replace(/\.[^.]+$/i, ''));
        out.push({ arrayBuffer: await blob.arrayBuffer(), name: `${base}.${ext}`, type: mime });
        bmp.close();
      }
      return out.length === 1 ? out[0] : await zipResults(out);
    }
  };
}

function toBlob(canvas, mime, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
}

async function zipResults(results) {
  const JSZip = window.JSZip;
  const zip = new JSZip();
  results.forEach(r => zip.file(r.name || 'file', new Uint8Array(r.arrayBuffer)));
  const blob = await zip.generateAsync({ type: 'blob' });
  return { arrayBuffer: await blob.arrayBuffer(), name: 'output.zip', type: 'application/zip' };
}

async function imagesToPdf(files) {
  const doc = await PDFDocument.create();
  for (const f of files) {
    const img = await embedImage(doc, f, 'auto');
    const page = doc.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }
  return await doc.save({ useObjectStreams: false });
}

async function embedImage(doc, src, mode) {
  const imgBytes = await (src.arrayBuffer ? src.arrayBuffer() : (await fetch(src)).arrayBuffer());
  let img;
  const type = (src.type || '').toLowerCase();
  if (type.includes('png')) img = await doc.embedPng(imgBytes);
  else if (type.includes('webp')) img = await doc.embedJpg(await webpToJpeg(src));
  else if (type.includes('jpg') || type.includes('jpeg')) img = await doc.embedJpg(imgBytes);
  else {
    // fallback: try png then jpg
    try { img = await doc.embedPng(imgBytes); } catch (_) { img = await doc.embedJpg(await convertToJpeg(src)); }
  }
  if (mode === 'fit') {
    const maxW = 600, maxH = 800;
    const r = Math.min(maxW / img.width, maxH / img.height);
    return { img, w: img.width * r, h: img.height * r };
  }
  return img;
}

async function convertToJpeg(src) {
  const bmp = await createImageBitmap(src);
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d').drawImage(bmp, 0, 0);
  bmp.close();
  return await (await toBlob(c, 'image/jpeg', 0.92)).arrayBuffer();
}

async function webpToJpeg(src) { return await convertToJpeg(src); }

async function compressPdf(file, scale, quality) {
  const pages = await renderPdfPages(file, scale);
  const doc = await PDFDocument.create();
  for (const dataUrl of pages) {
    const img = await doc.embedJpg(await dataUrlToJpeg(dataUrl, quality));
    const page = doc.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }
  return await doc.save({ useObjectStreams: false });
}

async function dataUrlToJpeg(dataUrl, quality) {
  const blob = await dataUrlToBlob(dataUrl);
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d').drawImage(bmp, 0, 0);
  bmp.close();
  return await (await toBlob(c, 'image/jpeg', quality)).arrayBuffer();
}

async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return await res.blob();
}

async function loadPdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  const mod = await import('./vendor/pdf.min.mjs');
  const workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).toString();
  mod.GlobalWorkerOptions.workerSrc = workerSrc;
  window.pdfjsLib = mod;
  return mod;
}

async function renderPdfPages(file, scale) {
  const pdfjs = await loadPdfJs();
  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: scale || 1.5 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    pages.push(canvas.toDataURL('image/png'));
  }
  return pages;
}

async function pdfToImages(file, format) {
  const pages = await renderPdfPages(file, 1.5);
  const JSZip = window.JSZip;
  const zip = new JSZip();
  const base = sanitizeFilename(file.name.replace(/\.pdf$/i, ''));
  for (let i = 0; i < pages.length; i++) {
    const dataUrl = format === 'jpeg' ? await convertImageDataUrl(pages[i], 'image/jpeg', 0.92) : pages[i];
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    zip.file(`${base}-page-${i + 1}.${format === 'jpeg' ? 'jpg' : 'png'}`, new Uint8Array(await blob.arrayBuffer()));
  }
  const out = await zip.generateAsync({ type: 'blob' });
  return new Uint8Array(await out.arrayBuffer());
}

async function convertImageDataUrl(dataUrl, mime, q) {
  const bmp = await createImageBitmap(await dataUrlToBlob(dataUrl));
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d').drawImage(bmp, 0, 0);
  bmp.close();
  return (await toBlob(c, mime, q)).arrayBuffer();
}

async function extractPdfText(file) {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  let out = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let line = '';
    for (const item of content.items) {
      if (item.str !== undefined) line += item.str + ' ';
      if (item.hasEOL) { out += line.trim() + '\n'; line = ''; }
    }
    if (line.trim()) out += line.trim() + '\n';
    out += '\n';
  }
  return out;
}

function drawWrappedText(page, text, x, startY, maxWidth, size, font, color) {
  const lines = String(text).split(/\r?\n/);
  let y = startY;
  for (let raw of lines) {
    if (y < 20) break;
    if (raw.length === 0) { y -= size + 4; continue; }
    let words = raw.split(' ');
    let buf = '';
    for (const w of words) {
      const test = buf ? buf + ' ' + w : w;
      if (font.widthOfTextAtSize(test, size) > maxWidth && buf) {
        page.drawText(buf, { x, y, size, font, color });
        y -= size + 4;
        if (y < 20) break;
        buf = w;
      } else buf = test;
    }
    if (buf && y >= 20) page.drawText(buf, { x, y, size, font, color });
    y -= size + 4;
  }
}

async function textToDocx(text) {
  const JSZip = window.JSZip;
  const zip = new JSZip();
  const paragraphs = String(text).split(/\r?\n/).map(p => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(p)}</w:t></w:r></w:p>`).join('');
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}</w:body></w:document>`;
  zip.file('word/document.xml', doc);
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  const blob = await zip.generateAsync({ type: 'blob' });
  return await blob.arrayBuffer();
}

function escapeXml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

async function textToRtf(text) {
  const rtf = '{\\rtf1\\ansi\n' + String(text).split(/\r?\n/).map(l => '\\par\n' + l.replace(/[\\{}]/g, (m) => '\\' + m).replace(/\n/g, '\\par\n')).join('') + '\n}';
  const bytes = [];
  for (let i = 0; i < rtf.length; i++) bytes.push(rtf.charCodeAt(i) & 0xff);
  return new Uint8Array(bytes).buffer;
}

async function docToPdfDoc(file) {
  if (/\.txt$/i.test(file.name)) {
    const text = await file.text();
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Courier);
    const page = doc.addPage([612, 792]);
    drawWrappedText(page, text, 50, 760, 512, 10, font, rgb(0.1, 0.1, 0.1));
    return await doc.save({ useObjectStreams: false });
  }
  const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  const html = result.value;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([612, 792]);
  let y = 760;
  const strip = html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  const lines = strip.split(/\r?\n/);
  let pageRef = page;
  for (const line of lines) {
    if (y < 30) { pageRef = doc.addPage([612, 792]); y = 760; }
    pageRef.drawText(line.slice(0, 100) || ' ', { x: 50, y, size: 11, font, color: rgb(0.15, 0.15, 0.15) });
    y -= 16;
  }
  return await doc.save({ useObjectStreams: false });
}

async function pptxToText(file) {
  const JSZip = window.JSZip;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const slides = [];
  const names = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => {
    return parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10);
  });
  for (const name of names) {
    const xml = await zip.files[name].async('string');
    const text = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => m[1]).join('\n');
    slides.push(text);
  }
  return slides;
}

async function pagesToPptx(dataUrls) {
  const JSZip = window.JSZip;
  const zip = new JSZip();
  const PNG_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
  const rels = [];
  const slideRels = [];
  const slideXmls = [];
  for (let i = 0; i < dataUrls.length; i++) {
    const slideNum = i + 1;
    const dataUrl = dataUrls[i];
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const imgName = `image${slideNum}.png`;
    zip.file(`ppt/media/${imgName}`, new Uint8Array(await blob.arrayBuffer()));
    rels.push(`<Relationship Id="rIdImg${slideNum}" Type="${PNG_NS}" Target="media/${imgName}"/>`);
    slideRels.push(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${PNG_NS}" Target="../media/${imgName}"/></Relationships>`);
    slideXmls.push(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:pic><p:nvPicPr><p:cNvPr id="2" name="Image"/><p:cNvPicPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="9144000" cy="5143500"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`);
  }
  const slideCount = dataUrls.length;
  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`;
  zip.file('rels/.rels', relsXml.split('</Types>')[0]);
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>${slideXmls.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}</Types>`);
  const presentationXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slideXmls.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('')}</p:sldIdLst><p:sldSz cx="9144000" cy="5143500"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
  zip.file('ppt/presentation.xml', presentationXml);
  zip.file('ppt/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slideXmls.map((_, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join('')}</Relationships>`);
  // placeholder master + layout (minimal but valid)
  zip.file('ppt/slideMasters/slideMaster1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:sldMaster>`);
  zip.file('ppt/slideLayouts/slideLayout1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
  slideXmls.forEach((xml, i) => zip.file(`ppt/slides/slide${i + 1}.xml`, xml));
  slideRels.forEach((x, i) => zip.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`, x));
  zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`);
  const blob = await zip.generateAsync({ type: 'blob' });
  return await blob.arrayBuffer();
}

async function rtfToText(rtf) {
  return String(rtf).replace(/\\par\b/g, '\n').replace(/\\[a-z]+-?\d* ?/g, '').replace(/[{}]/g, '');
}

function audioBufferToWav(buffer) {
  const numCh = Math.max(1, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const numFrames = buffer.length;
  const byteRate = sampleRate * numCh * 2;
  const blockAlign = numCh * 2;
  const dataSize = numFrames * blockAlign;
  const length = 44 + dataSize;
  const out = new ArrayBuffer(length);
  const view = new DataView(out);
  const channels = [];
  let pos = 0;
  const writeString = (str) => { for (let i = 0; i < str.length; i++) view.setUint8(pos++, str.charCodeAt(i)); };
  writeString('RIFF'); view.setUint32(pos, length - 8, true); pos += 4;
  writeString('WAVE'); writeString('fmt '); view.setUint32(pos, 16, true); pos += 4;
  view.setUint16(pos, 1, true); pos += 2;      // PCM
  view.setUint16(pos, numCh, true); pos += 2;
  view.setUint32(pos, sampleRate, true); pos += 4;
  view.setUint32(pos, byteRate, true); pos += 4;
  view.setUint16(pos, blockAlign, true); pos += 2;
  view.setUint16(pos, 16, true); pos += 2;      // bits per sample
  writeString('data'); view.setUint32(pos, dataSize, true); pos += 4;
  for (let i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i));
  for (let frame = 0; frame < numFrames; frame++) {
    for (let c = 0; c < numCh; c++) {
      const sample = channels[c] ? Math.max(-1, Math.min(1, channels[c][frame])) : 0;
      const s16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(pos, Math.round(s16), true);
      pos += 2;
    }
  }
  return out;
}

async function askSplitMode(ctl) {
  return new Promise(resolve => {
    const body = ctl.content;
    body.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'split-mode';
    wrap.innerHTML = `
      <h3>How would you like to split?</h3>
      <button class="btn btn-primary" data-mode="each">Split every page</button>
      <button class="btn btn-outline" data-mode="range">Split a range of pages</button>
      <div id="splitRangeBox" style="display:none;margin-top:12px">
        <label>From page</label><input type="number" id="splitFrom" value="1" min="1">
        <label>To page</label><input type="number" id="splitTo" value="1" min="1">
        <button class="btn btn-primary" id="splitGo">Split</button>
      </div>`;
    body.appendChild(wrap);
    ctl._resolve = resolve;
    wrap.querySelector('[data-mode="each"]').addEventListener('click', () => { resolve('each'); });
    const rangeBtn = wrap.querySelector('[data-mode="range"]');
    rangeBtn.addEventListener('click', () => { wrap.querySelector('#splitRangeBox').style.display = 'block'; });
    wrap.querySelector('#splitGo').addEventListener('click', () => {
      ctl.first = { value: wrap.querySelector('#splitFrom').value };
      ctl.last = { value: wrap.querySelector('#splitTo').value };
      resolve('range');
    });
  });
}

function buildCategories() {
  const container = $('toolCategories');
  if (!container) return;
  container.innerHTML = '';
  CATEGORIES.forEach(cat => {
    const sec = document.createElement('div');
    sec.className = 'tool-category';
    const grid = document.createElement('div');
    grid.className = 'tool-tiles';
    cat.tools.forEach(id => {
      const t = TOOLS[id];
      if (!t) return;
      const tile = document.createElement('a');
      tile.className = 'tool-tile';
      tile.href = '#tool=' + id;
      tile.innerHTML = `<span class="tool-tile-icon"><span class="material-symbols-rounded">${t.icon}</span></span>
        <div><strong>${t.name}</strong><span class="tool-tile-desc">${t.desc}</span></div>`;
      grid.appendChild(tile);
    });
    sec.innerHTML = `<div class="tool-category-head"><span class="material-symbols-rounded">${cat.icon}</span> ${cat.name}</div>`;
    sec.appendChild(grid);
    container.appendChild(sec);
  });
}

function fileUploadUI(tool, content) {
  const zone = document.createElement('div');
  zone.className = 'tool-file-zone';
  const accept = tool.ext || '';
  zone.innerHTML = `
    <input type="file" id="toolFileInput" ${accept ? `accept="${accept}"` : ''} ${tool.multi ? 'multiple' : ''}>
    <div class="file-zone-inner">
      <span class="material-symbols-rounded upload-icon">cloud_upload</span>
      <p>Drop files here or <strong>click to browse</strong></p>
      <small>${tool.multi ? 'Multiple files allowed' : accept.split(',').join(' ')}</small>
    </div>`;
  const input = zone.querySelector('input');
  zone.querySelector('.file-zone-inner').addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    if (e.dataTransfer.files.length) input.files = e.dataTransfer.files;
    handleFiles(tool, input.files, content);
  });
  input.addEventListener('change', () => handleFiles(tool, input.files, content));
  content.appendChild(zone);
  return input;
}

async function handleFiles(tool, fileList, content) {
  const files = Array.from(fileList);
  if (!files.length) return;
  const existing = content.querySelector('.tool-files');
  if (existing) existing.remove();
  const list = document.createElement('div');
  list.className = 'tool-files';
  files.forEach(f => {
    const chip = document.createElement('div');
    chip.className = 'file-chip';
    chip.innerHTML = `<span class="material-symbols-rounded">description</span><span class="chip-name">${sanitizeFilename(f.name)}</span><span class="chip-size">${formatBytes(f.size)}</span>`;
    list.appendChild(chip);
  });
  content.insertBefore(list, content.querySelector('.tool-controls') || content.firstChild.nextSibling);
  state.files = files;
  state.result = null;
}

function formatBytes(b) {
  if (b === 0 || !b) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return (b / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

function renderControls(tool, content, ctl) {
  if (!tool.controls || !tool.controls.length) return;
  const wrap = document.createElement('div');
  wrap.className = 'tool-controls';
  tool.controls.forEach(def => addControl(wrap, def));
  content.appendChild(wrap);
  if (tool.controls.some(c => c.type === 'signature')) setupSignature(ctl);
}

function setupSignature(ctl) {
  const canvas = document.getElementById('sigCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  let drawing = false;
  let last = null;
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    const scaleX = canvas.width / r.width, scaleY = canvas.height / r.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - r.left) * scaleX, y: (clientY - r.top) * scaleY };
  };
  canvas.addEventListener('mousedown', e => { drawing = true; last = pos(e); });
  canvas.addEventListener('mousemove', e => { if (!drawing) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; });
  canvas.addEventListener('mouseup', () => drawing = false);
  canvas.addEventListener('mouseleave', () => drawing = false);
  canvas.addEventListener('touchstart', e => { e.preventDefault(); drawing = true; last = pos(e); });
  canvas.addEventListener('touchmove', e => { e.preventDefault(); if (!drawing) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; });
  canvas.addEventListener('touchend', () => drawing = false);
  document.getElementById('sigClear').addEventListener('click', () => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctl._sigDataUrl = null; });
  const upload = document.getElementById('sigUpload');
  upload.addEventListener('change', () => {
    const f = upload.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        const r = Math.min(canvas.width / img.width, canvas.height / img.height);
        const w = img.width * r, h = img.height * r;
        ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        ctl._sigDataUrl = reader.result;
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(f);
  });
  ctl._sigDataUrl = null;
}

function buildProcessButton(tool, content, ctl) {
  const p = document.createElement('div');
  p.className = 'process-row';
  const btn = document.createElement('button');
  btn.className = 'btn btn-primary btn-lg btn-process';
  btn.innerHTML = `<span class="material-symbols-rounded">auto_fix_high</span> Process`;
  btn.addEventListener('click', () => runTool(tool, ctl));
  p.appendChild(btn);
  const progress = document.createElement('div');
  progress.className = 'compress-bar';
  progress.style.display = 'none';
  p.appendChild(progress);
  content.appendChild(p);
}

async function runTool(tool, ctl) {
  const btn = document.querySelector('.btn-process');
  const bar = document.querySelector('.compress-bar');
  const status = document.createElement('p');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="material-symbols-rounded">hourglass_top</span> Processing…'; }
  if (bar) bar.style.display = 'block';
  try {
    const progress = (m) => {
      if (bar && m && m.status === 'recognizing text') bar.textContent = `OCR: ${Math.round((m.progress || 0) * 100)}%`;
    };
    const result = await tool.run.apply(null, toolMultiArgs(tool, ctl, progress));
    state.result = result;
    showResult(result);
  } catch (e) {
    console.error(e);
    showToast(e.message || 'Processing failed. Try again.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-symbols-rounded">auto_fix_high</span> Process'; }
    if (bar) bar.style.display = 'none';
  }
}

function toolMultiArgs(tool, ctl, progress) {
  if (tool.multi) return [state.files, ctl, progress];
  return [state.files[0], ctl, progress];
}

function downloadBlob(arrayBuffer, name, type) {
  const blob = new Blob([arrayBuffer], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function showResult(result) {
  const modal = $('resultModal');
  const body = $('resultBody');
  const actions = $('resultActions');
  const title = $('resultTitle');
  const arr = Array.isArray(result) ? result : [result];
  title.textContent = 'Success!';
  body.innerHTML = '';
  actions.innerHTML = '';
  if (Array.isArray(result) && result.length > 1) {
    body.innerHTML = `<p class="result-count"><span class="material-symbols-rounded">check_circle</span> ${result.length} files ready to download.</p>`;
    const d = document.createElement('button');
    d.className = 'btn btn-primary'; d.innerHTML = '<span class="material-symbols-rounded">download</span> Download ZIP';
    d.addEventListener('click', async () => {
      showToast('Preparing ZIP…');
      const z = await zipResults(result);
      downloadBlob(z.arrayBuffer, z.name, z.type);
    });
    actions.appendChild(d);
  } else {
    const r = arr[0];
    if (r.preview) {
      const img = document.createElement('img');
      img.src = r.preview; img.className = 'img-preview';
      body.appendChild(img);
    } else if (r.previewText) {
      const pre = document.createElement('pre');
      pre.className = 'text-preview';
      pre.textContent = r.previewText.slice(0, 4000);
      body.appendChild(pre);
    } else if (r.name && /\.(png|jpe?g|webp)$/i.test(r.name)) {
      const img = document.createElement('img');
      img.className = 'img-preview';
      img.src = URL.createObjectURL(new Blob([r.arrayBuffer], { type: r.type }));
      body.appendChild(img);
    } else {
      body.innerHTML = `<p class="result-count"><span class="material-symbols-rounded">check_circle</span> Your file is ready.</p>`;
    }
    if (r.noAutoDownload) {
      const d = document.createElement('button');
      d.className = 'btn btn-primary'; d.innerHTML = '<span class="material-symbols-rounded">download</span> Download';
      d.addEventListener('click', () => downloadBlob(r.arrayBuffer, r.name, r.type));
      actions.appendChild(d);
    }
  }
  const close = document.createElement('button');
  close.className = 'btn btn-outline'; close.innerHTML = '<span class="material-symbols-rounded">close</span> Close';
  close.addEventListener('click', () => modal.classList.remove('open'));
  actions.appendChild(close);
  modal.classList.add('open');
}

function openTool(id) {
  const tool = TOOLS[id];
  if (!tool) return;
  state.currentTool = id;
  state.files = [];
  state.result = null;
  const ws = $('toolWorkspace');
  ws.style.display = 'block';
  $('toolHeaderIcon').innerHTML = `<span class="material-symbols-rounded">${tool.icon}</span>`;
  $('toolTitle').textContent = tool.name;
  $('toolDesc').textContent = tool.desc;
  const content = $('toolContent');
  content.innerHTML = '';
  const ctl = { content };
  fileUploadUI(tool, content);
  renderControls(tool, content, ctl);
  buildProcessButton(tool, content, ctl);
  ws.scrollIntoView({ behavior: 'smooth' });
}

function handleRoute() {
  const hash = location.hash || '';
  const m = hash.match(/^#tool=(.+)$/);
  if (m) { openTool(m[1]); return; }
  const ws = $('toolWorkspace');
  if (ws) ws.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
  buildCategories();
  handleRoute();

  const mobileToggle = $('mobileToggle');
  const mobileMenu = $('mobileMenu');
  if (mobileToggle && mobileMenu) {
    mobileToggle.addEventListener('click', () => mobileMenu.classList.toggle('open'));
  }

  const backBtn = $('backToTools');
  if (backBtn) backBtn.addEventListener('click', () => { location.hash = '#categories'; });

  const modal = $('resultModal');
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });

  window.addEventListener('hashchange', handleRoute);

  const homeUpload = $('homeFileInput');
  if (homeUpload) homeUpload.addEventListener('change', () => {
    const f = homeUpload.files[0];
    if (!f) return;
    const ext = '.' + extensionOf(f.name).toLowerCase();
    let best = null;
    for (const id in TOOLS) {
      const t = TOOLS[id];
      if (!t || !t.ext) continue;
      const exts = t.ext.split(',');
      if (exts.includes(ext)) {
        if (!best || best.cat === 'pdf-convert' || t.cat === 'pdf-convert') {
          if (!best) best = t;
        }
      }
    }
    if (best) { location.hash = '#tool=' + best.id; }
    else showToast('No matching tool for that file type.', 'error');
  });

  // close mobile menu on outside click
  document.addEventListener('click', (e) => {
    if (mobileMenu && mobileMenu.classList.contains('open') && !mobileMenu.contains(e.target) && e.target !== mobileToggle) {
      mobileMenu.classList.remove('open');
    }
  });
});

window.DocuFlowPro = { TOOLS, CATEGORIES };
