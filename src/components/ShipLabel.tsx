import { QRCodeSVG } from 'qrcode.react';
import type { Label, TemplateSettings } from '../lib/types';
import { isBlocked } from '../lib/types';

/**
 * The physical shipping label.
 *
 * Used for both the on-screen preview and the printed sheet, so what the
 * operator sees is exactly what comes out of the printer.
 *
 * QR codes are SVG so they scale to printer DPI without pixelation.
 */
export function ShipLabel({
  label,
  settings,
  batchRef,
  size = 'normal',
}: {
  label: Label;
  settings: TemplateSettings;
  batchRef: string;
  size?: 'normal' | 'preview';
}) {
  const qrPx = size === 'preview' ? 78 : 62;
  const blocked = isBlocked(label);

  const name = label.recipientName.value;
  const country = label.address.country.value;
  const order = label.orderNumber.value;

  const place = [label.address.postalCode, label.address.city].filter(Boolean).join(' ');

  // Batches imported before the parser stopped duplicating it still hold the
  // place inside `lines`. Drop it here too so old and new data print alike.
  const normalise = (value: string) => value.split(' ').filter(Boolean).join(' ').toLowerCase();
  const streetLines = place
    ? label.address.lines.filter((line) => normalise(line) !== normalise(place))
    : label.address.lines;

  return (
    <div className="ship-label" style={{ minHeight: size === 'preview' ? undefined : 150 }}>
      <div className="ship-label__body">
        <div className="ship-label__eyebrow">Ship to</div>

        <div className="ship-label__name">
          {name ?? <MissingInline>No recipient name</MissingInline>}
        </div>

        <div className="ship-label__addr">
          {streetLines.length > 0 ? (
            streetLines.map((line, i) => <div key={i}>{line}</div>)
          ) : (
            <MissingInline>No address</MissingInline>
          )}
          {place ? <div>{place}</div> : null}
          <div style={{ fontWeight: 700 }}>
            {country ? country.toUpperCase() : <MissingInline>Country unknown</MissingInline>}
          </div>
        </div>

        {label.phone.value ? (
          <div className="ship-label__addr" style={{ fontWeight: 700 }}>
            {label.phone.value}
          </div>
        ) : null}

        <div className="ship-label__rule" />

        <div className="ship-label__meta">
          {order ?? <MissingInline>No order number</MissingInline>}
          {label.product.quantity !== null ? ` · ${label.product.quantity} items` : ''}
          {settings.includeBatchRef ? ` · ${batchRef}` : ''}
        </div>
      </div>

      <div className="ship-label__qr" style={{ flexBasis: qrPx }}>
        {order ? (
          <QRCodeSVG
            value={order}
            size={qrPx}
            level="M"
            marginSize={1}
            fgColor="#000000"
            bgColor="#FFFFFF"
            style={{ display: 'block', width: qrPx, height: qrPx }}
          />
        ) : (
          // No order number means no QR. v1 encoded a fabricated number here,
          // producing a scannable code that pointed at a non-existent order.
          <div
            style={{
              width: qrPx,
              height: qrPx,
              border: '1px dashed #b42318',
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#b42318',
              fontSize: 8,
              textAlign: 'center',
              lineHeight: 1.25,
              padding: 4,
            }}
          >
            No order number
          </div>
        )}
      </div>

      {blocked ? (
        <span
          className="review-flag no-print"
          style={{
            position: 'absolute',
            inset: 0,
            border: '2px solid #b42318',
            borderRadius: 4,
            pointerEvents: 'none',
          }}
        />
      ) : null}
    </div>
  );
}

function MissingInline({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ color: '#b42318', fontStyle: 'italic', fontWeight: 400 }}>{children}</span>
  );
}
