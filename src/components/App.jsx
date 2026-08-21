import React, { useState, useRef } from 'react';
import Header from './Header';
import LabelSheet from './LabelSheet';
import ProductModal from './ProductModal';
import EditLabelModal from './EditLabelModal';
import { parsePdfToLabels, getWorkerMode } from '../utils/pdfParser';
import {
  Upload, Loader2, FileText,
  RotateCcw, Printer, Grid2X2, Rows, Plus, Layers,
  AlertTriangle,
} from 'lucide-react';

const EM  = '#10B981';
const EMH = '#059669';

/* ── Upload error copy, keyed by the `code` thrown in utils/pdfParser.js ──
 * 'invalid_pdf' renders the amber "wrong file" alert; 'error' the red one. */
const ERROR_COPY = {
  NOT_PDF:     { type: 'invalid_pdf' },
  EMPTY_FILE:  { type: 'invalid_pdf' },
  INVALID_PDF: { type: 'invalid_pdf' },
  PASSWORD:    { type: 'error' },
  CORRUPT_PDF: { type: 'error' },
  PDF_ENGINE:  { type: 'error' },
};

const FALLBACK_MESSAGE =
  'This PDF could not be read. Open the technical details below and send them to support.';

/* Everything needed to diagnose a failure from a phone, where there is no console. */
function buildDiagnostics(err) {
  const root = err?.cause ?? err;
  return [
    `${root?.name || 'Error'}: ${root?.message || 'Unknown error'}`,
    `code: ${err?.code || 'none'}`,
    `worker: ${getWorkerMode()}`,
    `ua: ${navigator.userAgent}`,
  ].join('\n');
}

/* ── Tiny inline responsive hook ── */
function useIsMobile() {
  const [mobile, setMobile] = React.useState(() => window.innerWidth < 640);
  React.useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 640);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return mobile;
}

/* ── Collapsible diagnostics — the only way to see a real error on a phone ── */
function ErrorDetails({ details }) {
  const [copied, setCopied] = useState(false);

  const copy = async (e) => {
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(details);
    } catch {
      // Clipboard API needs a secure context; fall back to the legacy path.
      const ta = document.createElement('textarea');
      ta.value = details;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* nothing else to try */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <details style={{ marginTop: 10 }}>
      <summary style={{
        fontSize: 11, fontWeight: 600, color: '#6B7280',
        cursor: 'pointer', listStyle: 'revert',
      }}>
        Technical details
      </summary>
      <pre style={{
        margin: '6px 0 0',
        padding: '8px 10px',
        background: '#F9FAFB',
        border: '1px solid #E5E7EB',
        borderRadius: 8,
        fontSize: 10,
        lineHeight: 1.5,
        color: '#374151',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        overflowX: 'auto',
      }}>
        {details}
      </pre>
      <button
        onClick={copy}
        style={{
          marginTop: 6, padding: '5px 12px',
          background: '#fff', color: '#374151',
          border: '1px solid #D1D5DB', borderRadius: 7,
          fontSize: 11, fontWeight: 600, cursor: 'pointer',
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </details>
  );
}

function App() {
  const isMobile = useIsMobile();

  const [labels,        setLabels]        = useState([]);
  const [selectedLabel, setSelectedLabel] = useState(null);
  const [editingLabel,  setEditingLabel]  = useState(null);
  const [gridCols,      setGridCols]      = useState(isMobile ? 1 : 2);
  const [isDragging,    setIsDragging]    = useState(false);
  const [isLoading,     setIsLoading]     = useState(false);
  const [uploadError,   setUploadError]   = useState(null);  // { type: 'invalid_pdf' | 'error', message: string }
  const fileRef = useRef(null);

  /* ── Auto-switch to 1-col on mobile ── */
  React.useEffect(() => {
    if (isMobile) setGridCols(1);
  }, [isMobile]);

  /* ── Process uploaded file ── */
  const processFile = async (file) => {
    if (!file) return;
    if (!file.name?.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setUploadError({
        type: 'invalid_pdf',
        message: 'That is not a PDF file. Please select a PDF.',
      });
      return;
    }
    setIsLoading(true);
    setUploadError(null);
    try {
      const parsed = await parsePdfToLabels(file);
      if (parsed.length === 0) {
        setUploadError({
          type: 'invalid_pdf',
          message: 'No label data found in this PDF.',
        });
      } else {
        setLabels(parsed);
      }
    } catch (err) {
      console.error('PDF parse error:', err);
      setUploadError({
        type: ERROR_COPY[err?.code]?.type || 'error',
        message: err?.message || FALLBACK_MESSAGE,
        details: buildDiagnostics(err),
      });
    } finally {
      setIsLoading(false);
      // Allow re-picking the same file after an error — without this, the
      // input keeps its value and `onChange` never fires again.
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDragOver  = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = ()  => setIsDragging(false);
  const handleDrop      = (e) => {
    e.preventDefault(); setIsDragging(false);
    processFile(e.dataTransfer.files?.[0]);
  };
  const handleDelete = (id) => setLabels(p => p.filter(l => l.id !== id));
  const handleSave   = (u)  => setLabels(p => p.map(l => l.id === u.id ? u : l));

  const handleAddLabel = () => {
    const nl = {
      id: `m-${Date.now()}`,
      pageNumber: labels.length + 1,
      recipientName: 'New Recipient',
      addressLines: ['Street Address', '75001 Paris'],
      country: 'France',
      phone: '0600000000',
      orderNumber: `405-${Math.floor(1e6 + Math.random()*9e6)}-${Math.floor(1e6 + Math.random()*9e6)}`,
      productDetails: { title: 'Vape de France Product', sku: 'SKU-001', asin: 'B000000000', quantity: '1' },
    };
    setLabels([nl, ...labels]);
    setEditingLabel(nl);
  };

  const px = isMobile ? 12 : 20; // horizontal page padding

  /* ──────────────────── RENDER ──────────────────── */
  return (
    <div style={{ minHeight: '100vh', background: '#EEF2FF', display: 'flex', flexDirection: 'column' }}>
      <Header labelCount={labels.length} />

      <main style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: labels.length === 0 ? 'center' : 'flex-start',
        padding: isMobile ? '16px 12px' : '28px 20px',
        maxWidth: 1280,
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
      }}>

        {labels.length === 0 ? (
          /* ══════════════ UPLOAD SCREEN ══════════════ */
          <div style={{ width: '100%', maxWidth: 520 }}>
            <div style={{
              background: '#fff',
              border: '1px solid #E0E0DE',
              borderRadius: 18,
              overflow: 'hidden',
              boxShadow: '0 4px 20px rgba(0,0,0,0.07)',
            }}>

              {/* Card header */}
              <div style={{
                background: '#F9F9F7',
                borderBottom: '1px solid #E8E8E6',
                padding: isMobile ? '12px 16px' : '14px 22px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  <FileText size={16} color={EM} style={{ flexShrink: 0 }} />
                  <span style={{
                    fontFamily: 'Outfit, sans-serif', fontWeight: 700,
                    fontSize: isMobile ? 13 : 15, color: '#111827',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    Upload Amazon Packing Slip PDF
                  </span>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 700, color: '#6B7280',
                  background: '#fff', border: '1px solid #E0E0DE',
                  borderRadius: 20, padding: '2px 10px', flexShrink: 0,
                }}>
                  Vape de France
                </span>
              </div>

              {/* How it works */}
              <div style={{ padding: isMobile ? '14px 16px 6px' : '18px 22px 6px' }}>
                <p style={{
                  fontSize: 10, fontWeight: 700, color: EM,
                  textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px',
                }}>
                  How it works
                </p>
                <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {[
                    'Upload your Amazon PDF (each page = one packing slip).',
                    'We extract each recipient address & order details automatically.',
                    'A QR label is generated per page — ready to print.',
                    'Scan the QR to instantly view the order number.',
                  ].map((text, i) => (
                    <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{
                        width: 20, height: 20, borderRadius: '50%',
                        background: EM, color: '#fff', fontSize: 10, fontWeight: 800,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, marginTop: 1,
                      }}>
                        {i + 1}
                      </span>
                      <span style={{ fontSize: 12, color: '#374151', lineHeight: 1.55 }}>{text}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Drop zone */}
              <div style={{ padding: isMobile ? '14px 16px 18px' : '18px 22px 22px' }}>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={e => processFile(e.target.files?.[0])}
                  style={{ display: 'none' }}
                />

                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileRef.current?.click()}
                  style={{
                    border: `2px dashed ${isDragging ? EM : '#C8C8C6'}`,
                    borderRadius: 12,
                    padding: isMobile ? '24px 16px' : '32px 20px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: isDragging ? '#F0FDF4' : '#F9F9F7',
                    transition: 'all 0.15s',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 12,
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={36} color={EM} style={{ animation: 'spin 1s linear infinite' }} />
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#111827', margin: 0 }}>
                        Parsing PDF & building labels…
                      </p>
                    </>
                  ) : (
                    <>
                      <div style={{
                        width: isMobile ? 52 : 60, height: isMobile ? 52 : 60,
                        borderRadius: 14, background: '#fff',
                        border: '1px solid #E0E0DE',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                      }}>
                        <Upload size={isMobile ? 22 : 26} color={EM} />
                      </div>
                      <div>
                        <p style={{
                          fontSize: isMobile ? 14 : 15, fontWeight: 800,
                          fontFamily: 'Outfit, sans-serif', color: '#111827',
                          margin: '0 0 3px',
                        }}>
                          {isMobile ? 'Tap to upload PDF' : 'Drop your Amazon PDF here'}
                        </p>
                        {!isMobile && (
                          <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>or click to browse files</p>
                        )}
                      </div>
                      <button
                        style={{
                          padding: isMobile ? '10px 28px' : '11px 32px',
                          background: EM, color: '#fff', border: 'none',
                          borderRadius: 10, fontWeight: 700,
                          fontSize: isMobile ? 13 : 14,
                          cursor: 'pointer',
                          boxShadow: '0 4px 14px rgba(16,185,129,0.3)',
                          width: isMobile ? '100%' : 'auto',
                        }}
                        onMouseOver={e => e.currentTarget.style.background = EMH}
                        onMouseOut={e => e.currentTarget.style.background = EM}
                      >
                        Upload PDF
                      </button>
                    </>
                  )}
                </div>

                {uploadError && (
                  <div style={{
                    marginTop: 12,
                    borderRadius: 12,
                    overflow: 'hidden',
                    border: `1.5px solid ${uploadError.type === 'invalid_pdf' ? '#F59E0B' : '#FECDD3'}`,
                  }}>
                    {/* Alert header */}
                    <div style={{
                      background: uploadError.type === 'invalid_pdf' ? '#FFFBEB' : '#FFF1F0',
                      padding: '10px 14px',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <AlertTriangle
                        size={16}
                        color={uploadError.type === 'invalid_pdf' ? '#D97706' : '#DC2626'}
                        style={{ flexShrink: 0 }}
                      />
                      <span style={{
                        fontWeight: 700,
                        fontSize: 13,
                        color: uploadError.type === 'invalid_pdf' ? '#92400E' : '#991B1B',
                      }}>
                        {uploadError.type === 'invalid_pdf' ? 'Invalid PDF' : 'Could not read this PDF'}
                      </span>
                    </div>
                    {/* Alert body */}
                    <div style={{
                      background: uploadError.type === 'invalid_pdf' ? '#FFFBEB' : '#FFF7F6',
                      borderTop: `1px solid ${uploadError.type === 'invalid_pdf' ? '#FDE68A' : '#FECDD3'}`,
                      padding: '10px 14px',
                    }}>
                      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6,
                        color: uploadError.type === 'invalid_pdf' ? '#78350F' : '#DC2626',
                        fontWeight: 500,
                      }}>
                        {uploadError.message}
                      </p>
                      {uploadError.type === 'invalid_pdf' && (
                        <p style={{ margin: '6px 0 0', fontSize: 11, color: '#92400E', opacity: 0.8 }}>
                          ⚠️ Make sure you upload an Amazon packing slip that contains an order number.
                        </p>
                      )}
                      {uploadError.details && (
                        <ErrorDetails details={uploadError.details} />
                      )}
                    </div>
                  </div>
                )}


              </div>
            </div>
          </div>

        ) : (
          /* ══════════════ LABEL SHEET ══════════════ */
          <div style={{ width: '100%' }}>

            {/* ── Toolbar ── */}
            <div
              className="no-print"
              style={{
                background: '#fff',
                border: '1px solid #E0E0DE',
                borderRadius: 12,
                padding: isMobile ? '10px 12px' : '10px 16px',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                marginBottom: 12,
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              }}
            >
              {/* Left: count */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: '#F3F4F6', border: '1px solid #E5E7EB',
                  borderRadius: 7, padding: '4px 10px',
                  fontSize: 12, fontWeight: 700, color: '#374151',
                }}>
                  <Layers size={13} color={EM} />
                  {labels.length} label{labels.length !== 1 ? 's' : ''}
                </div>
                {!isMobile && (
                  <span style={{ fontSize: 11, color: '#9CA3AF' }}>Ready to print</span>
                )}
              </div>

              {/* Right: actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {!isMobile && (
                  <button
                    onClick={handleAddLabel}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      fontSize: 12, fontWeight: 700, color: '#374151',
                      background: '#F9FAFB', border: '1px solid #E5E7EB',
                      borderRadius: 7, padding: '6px 12px', cursor: 'pointer',
                    }}
                  >
                    <Plus size={13} color={EM} /> Add
                  </button>
                )}

                <button
                  onClick={() => window.print()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    fontSize: 12, fontWeight: 700, color: '#fff',
                    background: EM, border: 'none', borderRadius: 7,
                    padding: '6px 14px', cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(16,185,129,0.25)',
                  }}
                >
                  <Printer size={13} /> Print
                </button>

                <button
                  onClick={() => { if (window.confirm('Clear all labels?')) setLabels([]); }}
                  style={{
                    padding: '6px 9px', background: '#FFF7F6',
                    border: '1px solid #FECDD3', borderRadius: 7,
                    cursor: 'pointer', color: '#F87171',
                    display: 'flex', alignItems: 'center',
                  }}
                  title="Clear all"
                >
                  <RotateCcw size={13} />
                </button>

                {/* Column toggle — only on tablet/desktop */}
                {!isMobile && (
                  <>
                    <div style={{ width: 1, height: 18, background: '#E5E7EB', margin: '0 2px' }} />
                    {[{ c: 1, Icon: Rows }, { c: 2, Icon: Grid2X2 }].map(({ c, Icon }) => (
                      <button
                        key={c}
                        onClick={() => setGridCols(c)}
                        style={{
                          padding: '6px 8px', borderRadius: 7, border: '1px solid',
                          cursor: 'pointer', transition: 'all 0.15s',
                          background: gridCols === c ? EM : '#F9FAFB',
                          borderColor: gridCols === c ? EM : '#E5E7EB',
                          color: gridCols === c ? '#fff' : '#9CA3AF',
                          display: 'flex', alignItems: 'center',
                        }}
                      >
                        <Icon size={14} />
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* ── Label Grid ── */}
            <div style={{
              background: '#fff',
              border: '1px solid #E0E0DE',
              borderRadius: 16,
              padding: isMobile ? 10 : 16,
              boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
            }}>
              <LabelSheet
                labels={labels}
                onSelectProduct={setSelectedLabel}
                onEditLabel={setEditingLabel}
                onDeleteLabel={handleDelete}
                gridCols={isMobile ? 1 : gridCols}
              />
            </div>
          </div>
        )}
      </main>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 380px) { .hidden-xs { display: none !important; } }
      `}</style>

      <ProductModal  label={selectedLabel}  onClose={() => setSelectedLabel(null)} />
      <EditLabelModal label={editingLabel} isOpen={!!editingLabel} onClose={() => setEditingLabel(null)} onSave={handleSave} />
    </div>
  );
}

export default App;
