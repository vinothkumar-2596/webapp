import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';

const inputStyle = {
  width: '100%',
  padding: '9px 12px',
  background: '#F9FAFB',
  border: '1px solid #E5E7EB',
  borderRadius: 8,
  fontSize: 13,
  color: '#111827',
  outline: 'none',
  fontFamily: 'Poppins, sans-serif',
  boxSizing: 'border-box',
};

const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: '#6B7280',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 4,
};

export default function EditLabelModal({ label, isOpen, onClose, onSave }) {
  const [form, setForm] = useState({
    recipientName: '',
    addressLines:  '',
    phone:         '',
    orderNumber:   '',
    sku:           '',
    asin:          '',
    title:         '',
  });

  // Sync form whenever the label being edited changes
  useEffect(() => {
    if (label) {
      setForm({
        recipientName: label.recipientName || '',
        addressLines:  (label.addressLines || []).join('\n'),
        phone:         label.phone         || '',
        orderNumber:   label.orderNumber   || '',
        sku:           label.productDetails?.sku   || '',
        asin:          label.productDetails?.asin  || '',
        title:         label.productDetails?.title || '',
      });
    }
  }, [label]);

  if (!isOpen || !label) return null;

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...label,
      recipientName: form.recipientName,
      addressLines:  form.addressLines.split('\n').filter(l => l.trim()),
      // country is preserved from original label (not editable here)
      phone:         form.phone,
      orderNumber:   form.orderNumber,
      productDetails: { ...label.productDetails, sku: form.sku, asin: form.asin, title: form.title },
    });
    onClose();
  };

  return (
    /* ── Backdrop — centred on screen ── */
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
        padding: '16px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* ── Modal card ── */}
      <div style={{
        background: '#fff',
        border: '1px solid #E5E7EB',
        borderRadius: 20,
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
        width: '100%',
        maxWidth: 500,
        maxHeight: '90dvh',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}>

        {/* Header */}
        <div style={{
          background: '#F9FAFB', borderBottom: '1px solid #E5E7EB',
          padding: '16px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, zIndex: 1,
        }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' }}>
            ✏️ Edit Shipping Label
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          <div>
            <label style={labelStyle}>Recipient Name</label>
            <input style={inputStyle} value={form.recipientName} onChange={set('recipientName')} required />
          </div>

          <div>
            <label style={labelStyle}>Address Lines (one per line)</label>
            <textarea style={{ ...inputStyle, resize: 'vertical' }} rows={3} value={form.addressLines} onChange={set('addressLines')} required />
          </div>

          <div>
            <label style={labelStyle}>Phone</label>
            <input style={inputStyle} value={form.phone} onChange={set('phone')} placeholder="e.g. 0612345678" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Order Number</label>
              <input style={inputStyle} value={form.orderNumber} onChange={set('orderNumber')} />
            </div>
            <div>
              <label style={labelStyle}>SKU</label>
              <input style={inputStyle} value={form.sku} onChange={set('sku')} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Product Title</label>
            <input style={inputStyle} value={form.title} onChange={set('title')} />
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 8, borderTop: '1px solid #F3F4F6', marginTop: 4 }}>
            <button type="button" onClick={onClose}
              style={{ padding: '9px 20px', background: '#F3F4F6', border: '1px solid #E5E7EB', borderRadius: 9, fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit"
              style={{ padding: '9px 22px', background: '#10B981', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 4px 12px rgba(16,185,129,0.3)' }}>
              <Save size={14} /> Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
