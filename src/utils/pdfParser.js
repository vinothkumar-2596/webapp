/**
 * Why the `legacy/` build?
 * ========================
 * pdfjs-dist v6's DEFAULT build calls Promise.try, Promise.withResolvers,
 * Math.sumPrecise and URL.parse — and ships no polyfills for them. Chrome only
 * gained Math.sumPrecise in 137, so on any older engine (older Android
 * WebViews, Samsung Internet, iOS Safari, Firefox) parsing throws and the UI
 * blames the file: "This PDF cannot be read."
 *
 * The `legacy/` build is upstream's answer: identical API, but it bundles
 * core-js polyfills for 36+ built-ins and installs them into whatever scope it
 * loads in — main thread AND worker. Verified: importing legacy/pdf.worker.min
 * .mjs restores all four built-ins; importing the default build restores none.
 * Cost is ~50 KB on the worker and ~57 KB on the main bundle.
 *
 * Do not "optimise" these back to 'pdfjs-dist' — that reintroduces the bug.
 */
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

/**
 * PDF Worker Strategy
 * ===================
 * Attempt 1 — inline blob worker:
 *   ?worker&inline  → Vite bundles the worker as IIFE and embeds it as
 *                     a same-origin blob:// URL inside the main JS bundle.
 *   new PDFWorker({ port }) → we create the Web Worker ourselves and hand it to
 *                     pdfjs, which then takes its #initializeFromPort branch and
 *                     never runs `new Worker(url, {type:'module'})`. ES-module
 *                     workers are unreliable on older iOS Safari.
 *
 * Attempt 2 — main thread ("fake worker"):
 *   pdfjs checks `globalThis.pdfjsWorker?.WorkerMessageHandler` and, when it is
 *   present, routes the worker code through a LoopbackPort on the main thread.
 *   Slower, but needs no Worker, no blob URL and no network — so it survives
 *   locked-down WebViews and CSPs that block blob: workers.
 */
import PdfWorkerInline from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker&inline';

// Reuse a single PDFWorker across multiple document loads
let _pdfWorker = null;

// Which path actually served the last load — surfaced in the UI diagnostics.
let _workerMode = 'unknown';

/** 'inline-blob' | 'main-thread' | 'unknown' — for error diagnostics. */
export function getWorkerMode() {
  return _workerMode;
}

/**
 * Options applied to every getDocument() call.
 * Text extraction never needs FontFace/document.fonts or eval, and disabling
 * them removes failure modes on mobile WebViews and strict CSPs.
 * This does NOT remove the need for the Math.sumPrecise polyfill — the
 * worker-side font sanitizer still runs.
 */
const DOC_OPTIONS = {
  isEvalSupported: false,
  disableFontFace: true,
  useSystemFonts: false,
};

/** Route pdfjs's worker code onto the main thread for the fallback attempt. */
async function enableMainThreadWorker() {
  if (!globalThis.pdfjsWorker) {
    globalThis.pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs');
  }
}

/**
 * Load a PDF document, degrading from a real worker to main-thread parsing.
 *
 * Each attempt gets its own copy of the bytes: `new Uint8Array(buffer)` is a
 * VIEW, and pdfjs may transfer (detach) the underlying buffer — which would
 * leave attempt 2 holding a detached buffer.
 */
async function loadDocument(arrayBuffer) {
  // Attempt 1 — dedicated inline blob worker.
  try {
    if (!_pdfWorker || _pdfWorker.destroyed) {
      _pdfWorker = new pdfjsLib.PDFWorker({ port: new PdfWorkerInline() });
    }
    const doc = await pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer.slice(0)),
      worker: _pdfWorker,
      ...DOC_OPTIONS,
    }).promise;
    _workerMode = 'inline-blob';
    return doc;
  } catch (err) {
    console.warn('[pdfjs] worker path failed, retrying on the main thread:', err);
    try { _pdfWorker?.destroy(); } catch { /* already gone */ }
    _pdfWorker = null;
  }

  // Attempt 2 — main-thread parse.
  await enableMainThreadWorker();
  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer.slice(0)),
    ...DOC_OPTIONS,
  }).promise;
  _workerMode = 'main-thread';
  return doc;
}

/**
 * Wrap an exception thrown by pdfjs itself in a stable `code` the UI can switch
 * on, keeping the original around as `cause` for the diagnostics block.
 */
function asPdfEngineError(err) {
  if (err?.code) return err;                 // already one of ours

  let code = 'PDF_ENGINE';
  let message = 'This PDF could not be opened. It may be damaged or use an unsupported format.';

  if (err?.name === 'PasswordException') {
    code = 'PASSWORD';
    message = 'This PDF is password-protected. Remove the password and upload it again.';
  } else if (err?.name === 'InvalidPDFException') {
    code = 'CORRUPT_PDF';
    message = 'This PDF appears to be damaged or incomplete. Try re-downloading it from Amazon.';
  }

  const wrapped = new Error(message, { cause: err });
  wrapped.code = code;
  return wrapped;
}



/**
 * Extracts raw text page by page from a PDF File or ArrayBuffer.
 * Groups text items into visual lines based on Y-coordinates.
 */
export async function extractPdfPagesText(fileOrBuffer) {
  let arrayBuffer;

  if (fileOrBuffer instanceof File || fileOrBuffer instanceof Blob) {
    // Guard: iOS sometimes returns an empty File when the PDF is in iCloud
    // and hasn't been downloaded to device yet.
    if (fileOrBuffer.size === 0) {
      const err = new Error(
        'This file is empty. Make sure the PDF is downloaded to your device (not only stored in iCloud or Drive).'
      );
      err.code = 'EMPTY_FILE';
      throw err;
    }

    // Read the file — use FileReader as fallback for older iOS
    try {
      arrayBuffer = await fileOrBuffer.arrayBuffer();
    } catch {
      arrayBuffer = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(fileOrBuffer);
      });
    }
  } else {
    arrayBuffer = fileOrBuffer;
  }

  // Guard: verify PDF magic bytes (%PDF)
  const header = new Uint8Array(arrayBuffer, 0, 4);
  const isPdf  = header[0] === 0x25 && header[1] === 0x50 &&
                 header[2] === 0x44 && header[3] === 0x46; // %PDF
  if (!isPdf) {
    const err = new Error(
      'This file is not a valid PDF. Please select a PDF file.'
    );
    err.code = 'NOT_PDF';
    throw err;
  }

  let pdfDoc;
  try {
    pdfDoc = await loadDocument(arrayBuffer);
  } catch (err) {
    throw asPdfEngineError(err);
  }

  const pagesText = [];

  try {
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page        = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();

      const lineMap = new Map();
      for (const item of textContent.items) {
        if (!item.str || !item.str.trim()) continue;
        const y = Math.round(item.transform[5] / 4) * 4;
        if (!lineMap.has(y)) lineMap.set(y, []);
        lineMap.get(y).push({ x: item.transform[4], text: item.str });
      }

      const sortedY  = Array.from(lineMap.keys()).sort((a, b) => b - a);
      const pageLines = sortedY.map((y) => {
        return lineMap.get(y).sort((a, b) => a.x - b.x).map(it => it.text).join(' ');
      });

      pagesText.push({ pageNumber: i, rawText: pageLines.join('\n'), lines: pageLines });

      page.cleanup();
    }
  } catch (err) {
    throw asPdfEngineError(err);
  } finally {
    // Release page/font caches — matters on phones across repeated uploads.
    try { await pdfDoc.destroy(); } catch { /* nothing to release */ }
  }

  return pagesText;
}


/**
 * Parse an Amazon packing slip page into structured label data
 */
export function parseAmazonPackingSlip(pageData, index = 0) {
  const lines = pageData.lines.map((l) => l.trim()).filter((l) => l.length > 0);
  const text = pageData.rawText;

  let recipientName = '';
  let addressLines = [];
  let postalCode = '';
  let city = '';
  let country = 'France';
  let phone = '';
  let orderNumber = `405-${Math.floor(1000000 + Math.random() * 9000000)}-${Math.floor(1000000 + Math.random() * 9000000)}`;
  let productDetails = {
    title: 'Product Item',
    sku: '',
    asin: '',
    quantity: '1',
    price: '',
    vendor: '',
  };

  // 1. Extract Order Number — track whether it was genuinely found
  let _hasRealOrderNumber = false;
  const orderMatch = text.match(/(?:Num[eé]ro de la commande|Order ID|Commande n[oº])[\s:]*([0-9]{3}-[0-9]{7}-[0-9]{7})/i);
  if (orderMatch) {
    orderNumber = orderMatch[1];
    _hasRealOrderNumber = true;
  } else {
    const genericOrder = text.match(/([0-9]{3}-[0-9]{7}-[0-9]{7})/);
    if (genericOrder) {
      orderNumber = genericOrder[1];
      _hasRealOrderNumber = true;
    }
  }

  // 2. Extract Phone Number
  const phoneMatch = text.match(/(?:N°\s*portable|Téléphone|Phone|Tél)[\s:]*([0-9+\s.()-]{8,20})/i);
  if (phoneMatch) {
    phone = phoneMatch[1].trim();
  }

  // 3. Extract Shipping Address (Adresse d'expédition)
  let expIndex = lines.findIndex((l) => /Adresse d['’]expédition/i.test(l) || /Ship To/i.test(l) || /Livrer à/i.test(l));
  
  if (expIndex !== -1 && expIndex + 1 < lines.length) {
    // Next 4-6 lines are the address
    const addrBlock = lines.slice(expIndex + 1, expIndex + 7);
    
    // Clean header lines if any
    const cleanAddr = addrBlock.filter((l) => 
      !/Numéro de la commande|Date de commande|Merci pour votre achat|Quantité|Détails/i.test(l)
    );

    if (cleanAddr.length > 0) {
      recipientName = cleanAddr[0].replace(/^[-•\s]+/, '');
      addressLines = cleanAddr.slice(1);
    }
  } else {
    // Fallback: search for Postal code + City pattern (e.g., 92370 Chaville or 03130 santa pola)
    const postalMatchIdx = lines.findIndex((l) => /^[0-9]{4,5}\s+[A-Za-z\s-]+/.test(l));
    if (postalMatchIdx > 0) {
      recipientName = lines[Math.max(0, postalMatchIdx - 2)].replace(/^[-•\s]+/, '');
      addressLines = lines.slice(Math.max(0, postalMatchIdx - 1), postalMatchIdx + 2);
    }
  }

  // Find country (France, Espagne, Spain, etc.)
  for (let i = 0; i < addressLines.length; i++) {
    const line = addressLines[i];
    if (/^(France|Espagne|Spain|Belgique|Deutschland|Italy|Italie|Portugal|United Kingdom)/i.test(line)) {
      country = line;
      break;
    }
  }

  // Extract Postal Code & City from lines if possible
  for (const line of addressLines) {
    const pcMatch = line.match(/\b([0-9]{5})\s+(.+)/);
    if (pcMatch) {
      postalCode = pcMatch[1];
      city = pcMatch[2];
      break;
    }
  }

  // 4. Extract Product details
  const asinMatch = text.match(/ASIN\s*:?\s*([A-Z0-9]{10})/i);
  if (asinMatch) productDetails.asin = asinMatch[1];

  const skuMatch = text.match(/SKU\s*:?\s*([^\n\r]+)/i);
  if (skuMatch) productDetails.sku = skuMatch[1].trim();

  // Item title detection
  const qtyIdx = lines.findIndex((l) => /Quantité|Détails de l['’]article|Prix/i.test(l));
  if (qtyIdx !== -1 && qtyIdx + 1 < lines.length) {
    productDetails.title = lines[qtyIdx + 1].substring(0, 120);
  }

  // Create unique ID for this label
  const id = `label-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 7)}`;

  return {
    id,
    pageNumber: pageData.pageNumber,
    recipientName: recipientName || `Customer ${index + 1}`,
    addressLines: addressLines.length > 0 ? addressLines : ['Address Line 1', 'City / Country'],
    postalCode,
    city,
    country: country || 'France',
    phone: phone || '',
    orderNumber,
    _hasRealOrderNumber,   // internal flag — used for validation
    productDetails: {
      title: productDetails.title || 'Product details from invoice',
      sku: productDetails.sku || 'SKU-DEFAULT',
      asin: productDetails.asin || 'ASIN-DEFAULT',
      quantity: productDetails.quantity || '1',
      vendor: productDetails.vendor || 'Amazon Marketplace',
    },
  };
}

/**
 * Process entire PDF and return array of label objects.
 * Throws INVALID_PDF error if no page contains a "Numéro de la commande".
 */
export async function parsePdfToLabels(file) {
  try {
    const pages = await extractPdfPagesText(file);
    const labels = pages.map((page, idx) => parseAmazonPackingSlip(page, idx));

    // Validate — at least one page must have a real order number
    const validCount = labels.filter(l => l._hasRealOrderNumber).length;
    if (validCount === 0) {
      const err = new Error(
        'This PDF does not contain an order number. ' +
        'Please upload a valid Amazon packing slip.'
      );
      err.code = 'INVALID_PDF';
      throw err;
    }

    return labels;
  } catch (error) {
    console.error('Error parsing PDF:', error);
    throw error;
  }
}

