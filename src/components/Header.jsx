import React from 'react';
import { ShoppingBag, QrCode } from 'lucide-react';

export default function Header({ labelCount }) {
  return (
    <header style={{
      background: '#fff',
      borderBottom: '1px solid #E0E0DE',
      position: 'sticky',
      top: 0,
      zIndex: 30,
      boxShadow: '0 1px 6px rgba(0,0,0,0.05)',
    }}>
      <div style={{
        maxWidth: 1280,
        margin: '0 auto',
        padding: '0 16px',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        overflow: 'hidden',
      }}>

        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={{
            width: 34, height: 34, flexShrink: 0,
            borderRadius: 9, background: '#10B981',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 10px rgba(16,185,129,0.28)',
          }}>
            <ShoppingBag size={17} color="#fff" />
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{
                fontFamily: 'Outfit, sans-serif', fontWeight: 900,
                fontSize: 'clamp(14px, 4vw, 18px)',
                color: '#111827', letterSpacing: '-0.3px', whiteSpace: 'nowrap',
              }}>
                VAPE <span style={{ color: '#10B981' }}>DE FRANCE</span>
              </span>
              {/* Hide badge on very small screens */}
              <span style={{
                fontSize: 10, fontWeight: 600, color: '#6B7280',
                background: '#F3F4F6', border: '1px solid #E5E7EB',
                borderRadius: 20, padding: '2px 8px',
                display: 'flex', alignItems: 'center', gap: 3,
                whiteSpace: 'nowrap',
              }}
                className="hidden-xs"
              >
                <QrCode size={10} color="#10B981" />
                QR Labels
              </span>
            </div>
            <p style={{
              fontSize: 10, color: '#9CA3AF', margin: 0, fontWeight: 500,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              Amazon PDF → QR Shipping Labels
            </p>
          </div>
        </div>

        {/* Label count */}
        {labelCount > 0 && (
          <div style={{
            fontSize: 12, fontWeight: 700, color: '#374151',
            background: '#F9FAFB', border: '1px solid #E5E7EB',
            borderRadius: 8, padding: '5px 12px',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {labelCount} label{labelCount !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </header>
  );
}
