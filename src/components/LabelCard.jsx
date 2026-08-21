import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Edit2, Trash2 } from 'lucide-react';

export default function LabelCard({ label, onSelectProduct, onEditLabel, onDeleteLabel }) {
  // QR contains ONLY the order number — clean and minimal
  const qrPayload = label.orderNumber || 'N/A';

  return (
    <div className="label-card group">

      {/* ── Address block — left ── */}
      <div className="label-card__address">

        {/* "- avila francis" */}
        <p style={{ fontWeight: 700, fontSize: 'clamp(12px, 3.5vw, 15px)', margin: '0 0 3px 0', lineHeight: 1.4 }}>
          - {label.recipientName?.toLowerCase()}
        </p>

        {/* Address lines */}
        {label.addressLines?.map((line, idx) => {
          if (
            label.country &&
            line.trim().toLowerCase() === label.country.trim().toLowerCase()
          ) return null;
          return (
            <p key={idx} style={{ fontWeight: 500, fontSize: 'clamp(11px, 3vw, 14px)', margin: '0 0 1px 0', lineHeight: 1.45 }}>
              {line}
            </p>
          );
        })}

        {/* Country UPPERCASE — shown once only */}
        {label.country && (
          <p style={{ fontWeight: 900, fontSize: 'clamp(11px, 3vw, 14px)', margin: '1px 0 0 0', lineHeight: 1.45, letterSpacing: '0.4px' }}>
            {label.country.toUpperCase()}
          </p>
        )}

        {/* Phone */}
        {label.phone && (
          <p style={{ fontWeight: 700, fontSize: 'clamp(11px, 3vw, 14px)', margin: '4px 0 0 0', lineHeight: 1.45 }}>
            N° portable : {label.phone}
          </p>
        )}
      </div>

      {/* ── QR Code — right, top-aligned ── */}
      <div
        className="label-card__qr cursor-pointer"
        onClick={() => onSelectProduct(label)}
        title={`Numéro de la commande : ${label.orderNumber}`}
        style={{ flexShrink: 0 }}
      >
        {/* Responsive QR size via CSS clamp */}
        <QRCodeSVG
          value={qrPayload}
          size={70}
          level="M"
          fgColor="#000000"
          bgColor="#FFFFFF"
          includeMargin={true}
          style={{
            display: 'block',
            width: 'clamp(56px, 16vw, 76px)',
            height: 'clamp(56px, 16vw, 76px)',
          }}
        />
      </div>

      {/* ── Edit / Delete hover overlay (desktop only) ── */}
      <div
        className="no-print"
        style={{
          position: 'absolute', bottom: 8, right: 8,
          display: 'flex', gap: 4, opacity: 0, transition: 'opacity 0.15s',
        }}
        ref={el => {
          if (!el) return;
          const card = el.closest('.group');
          if (!card) return;
          const show = () => (el.style.opacity = '1');
          const hide = () => (el.style.opacity = '0');
          card.addEventListener('mouseenter', show);
          card.addEventListener('mouseleave', hide);
        }}
      >
        <button
          onClick={() => onEditLabel(label)}
          style={{ padding: '4px 6px', background: '#fff', border: '1px solid #D5D5D3', borderRadius: 6, cursor: 'pointer', color: '#555' }}
          title="Edit"
        >
          <Edit2 size={13} />
        </button>
        <button
          onClick={() => onDeleteLabel(label.id)}
          style={{ padding: '4px 6px', background: '#fff', border: '1px solid #D5D5D3', borderRadius: 6, cursor: 'pointer', color: '#EF4444' }}
          title="Delete"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}
