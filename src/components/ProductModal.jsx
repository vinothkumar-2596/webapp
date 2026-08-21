import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, PackageCheck, CheckCircle2, Hash, Tag, ShoppingBag, MapPin, Phone } from 'lucide-react';

const row = (Icon, label, value, iconColor = '#10B981') => (
  <div key={label} style={{ padding: '12px 14px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10 }}>
    <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
      <Icon size={12} color={iconColor} /> {label}
    </div>
    <p style={{ fontSize: 13, fontWeight: 700, color: '#111827', margin: 0, wordBreak: 'break-all' }}>{value || 'N/A'}</p>
  </div>
);

export default function ProductModal({ label, onClose }) {
  if (!label) return null;
  const p = label.productDetails || {};

  // QR shows only the order number
  const qrVal = label.orderNumber || 'N/A';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', padding: 0 }}>
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: '20px 20px 0 0', boxShadow: '0 -8px 40px rgba(0,0,0,0.15)', maxWidth: 520, width: '100%', maxHeight: '90dvh', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>

        {/* Header */}
        <div style={{ background: '#F0FDF4', borderBottom: '1px solid #D1FAE5', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PackageCheck size={17} color="#fff" />
            </div>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#111827' }}>Product Details</p>
              <p style={{ margin: 0, fontSize: 11, color: '#10B981', fontWeight: 600 }}>Order #{label.orderNumber}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* QR + item title */}
          <div style={{ display: 'flex', gap: 14, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 12, padding: 14, alignItems: 'flex-start' }}>
            <div style={{ background: '#fff', padding: 8, borderRadius: 8, border: '1px solid #E5E7EB', flexShrink: 0 }}>
              <QRCodeSVG value={qrVal} size={72} fgColor="#000" bgColor="#fff" level="H" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                <CheckCircle2 size={13} color="#10B981" />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#10B981' }}>QR Verified</span>
              </div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#111827', lineHeight: 1.45 }}>{p.title || 'Product'}</p>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#6B7280' }}>Vendor: {p.vendor || 'Vape de France / Amazon'}</p>
            </div>
          </div>

          {/* Grid of specs */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {row(Hash,       'SKU',      p.sku)}
            {row(Tag,        'ASIN',     p.asin,     '#6366F1')}
            {row(ShoppingBag,'Qty',      p.quantity,  '#F59E0B')}
            {row(PackageCheck,'Source',  'Vape de France', '#10B981')}
          </div>

          {/* Destination */}
          <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 16px' }}>
            <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 5 }}>
              <MapPin size={12} color="#10B981" /> Delivery Address
            </p>
            <p style={{ margin: '0 0 2px', fontWeight: 700, fontSize: 14, color: '#111827' }}>{label.recipientName}</p>
            {label.addressLines?.map((l, i) => <p key={i} style={{ margin: 0, fontSize: 12, color: '#374151' }}>{l}</p>)}
            {label.phone && (
              <p style={{ margin: '6px 0 0', fontSize: 12, fontWeight: 700, color: '#10B981', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Phone size={12} /> {label.phone}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={onClose}
              style={{ padding: '9px 24px', background: '#10B981', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', boxShadow: '0 4px 12px rgba(16,185,129,0.3)' }}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
