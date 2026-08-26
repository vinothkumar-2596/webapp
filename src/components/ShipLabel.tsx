import { QRCodeSVG } from 'qrcode.react';
import type { Label } from '../lib/types';
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
  size = 'normal',
  bare = false,
}: {
  label: Label;
  size?: 'normal' | 'preview';
  /** Drop the label's own border/radius and fill its container — used inside
   *  the fixed A4 grid cells, where the cell provides the border. */
  bare?: boolean;
}) {
  // Non-bare uses render at a fixed pixel size. Bare labels (the fixed A4
  // cells) scale their QR to the cell width via CSS container units instead,
  // so the on-screen preview and the printed sheet stay proportional.
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
    <div
      className={bare ? 'ship-label ship-label--bare' : 'ship-label'}
      style={{ minHeight: size === 'preview' || bare ? undefined : 150 }}
    >
      <div className="ship-label__qr" style={bare ? undefined : { flexBasis: qrPx }}>
        {order ? (
          <QRCodeSVG
            value={order}
            size={bare ? 160 : qrPx}
            level="M"
            marginSize={1}
            fgColor="#000000"
            bgColor="#FFFFFF"
            style={
              bare
                ? { display: 'block', width: '100%', height: 'auto' }
                : { display: 'block', width: qrPx, height: qrPx }
            }
          />
        ) : (
          // No order number means no QR. v1 encoded a fabricated number here,
          // producing a scannable code that pointed at a non-existent order.
          <div
            style={{
              width: bare ? '100%' : qrPx,
              aspectRatio: bare ? '1 / 1' : undefined,
              height: bare ? undefined : qrPx,
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

      <div className="ship-label__body">
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
          <div className="ship-label__country" style={{ fontWeight: 700 }}>
            {/* As it reads on the slip ("France"), matching the Word export. */}
            {country ?? <MissingInline>Country unknown</MissingInline>}
          </div>
        </div>

        {label.phone.value ? (
          <div className="ship-label__addr" style={{ fontWeight: 700 }}>
            {`N° portable : ${label.phone.value}`}
          </div>
        ) : null}
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
    <span style={{ color: '#b42318', fontStyle: 'italic', fontWeight: 700 }}>{children}</span>
  );
}
