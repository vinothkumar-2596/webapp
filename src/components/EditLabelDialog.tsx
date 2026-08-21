import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';
import { X, Check } from 'lucide-react';
import { Button, Field, Input, Textarea, Select, cn } from './ui';
import { allCountryNames } from '../lib/pdf/countries';
import { isValidOrderNumber } from '../lib/pdf/parseSlip';
import type { Label, ReviewReason } from '../lib/types';
import { REVIEW_REASON_TEXT } from '../lib/types';

interface Form {
  recipientName: string;
  addressLines: string;
  postalCode: string;
  city: string;
  country: string;
  phone: string;
  orderNumber: string;
  sku: string;
  asin: string;
  title: string;
  quantity: string;
}

function toForm(label: Label): Form {
  return {
    recipientName: label.recipientName.value ?? '',
    addressLines: label.address.lines.join('\n'),
    postalCode: label.address.postalCode ?? '',
    city: label.address.city ?? '',
    country: label.address.country.value ?? '',
    phone: label.phone.value ?? '',
    orderNumber: label.orderNumber.value ?? '',
    sku: label.product.sku ?? '',
    asin: label.product.asin ?? '',
    title: label.product.title ?? '',
    quantity: label.product.quantity !== null ? String(label.product.quantity) : '',
  };
}

/**
 * Edit dialog.
 *
 * Built on Radix Dialog, which supplies Escape-to-close, a focus trap,
 * focus restoration, and correct ARIA roles — all of which v1's hand-rolled
 * modals lacked.
 *
 * Saving here is how an operator clears a flagged label: fields that were
 * unreadable get filled in, the label is marked reviewed, and it becomes
 * printable.
 */
export function EditLabelDialog({
  label,
  open,
  onOpenChange,
  onSave,
}: {
  label: Label | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (patch: Partial<Label>) => void;
}) {
  const [form, setForm] = useState<Form>(() =>
    label ? toForm(label) : (Object.create(null) as Form),
  );
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (label) {
      setForm(toForm(label));
      setTouched(false);
    }
  }, [label]);

  if (!label) return null;

  const set = (key: keyof Form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const orderError =
    touched && form.orderNumber.trim() !== '' && !isValidOrderNumber(form.orderNumber)
      ? 'Must look like 402-1234567-1234567'
      : null;

  const nameError = touched && form.recipientName.trim() === '' ? 'Required' : null;

  const canSave =
    form.recipientName.trim() !== '' &&
    (form.orderNumber.trim() === '' || isValidOrderNumber(form.orderNumber));

  const handleSave = () => {
    setTouched(true);
    if (!canSave) return;

    const lines = form.addressLines
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const order = form.orderNumber.trim();
    const country = form.country.trim();
    const qty = Number.parseInt(form.quantity, 10);

    // Recompute review reasons from the corrected data rather than blindly
    // clearing them — an operator who fixes only the name should still see
    // the label flagged for a missing order number.
    const reasons: ReviewReason[] = [];
    if (!order) reasons.push('missing-order-number');
    if (!form.recipientName.trim()) reasons.push('missing-recipient');
    if (lines.length === 0) reasons.push('missing-address');
    if (!country) reasons.push('unknown-country');

    onSave({
      recipientName: { value: form.recipientName.trim(), confidence: 'high' },
      address: {
        lines,
        postalCode: form.postalCode.trim() || null,
        city: form.city.trim() || null,
        country: country
          ? { value: country, confidence: 'high' }
          : { value: null, confidence: 'missing' },
      },
      phone: form.phone.trim()
        ? { value: form.phone.trim(), confidence: 'high' }
        : { value: null, confidence: 'missing' },
      orderNumber: order
        ? { value: order, confidence: 'high' }
        : { value: null, confidence: 'missing' },
      product: {
        title: form.title.trim() || null,
        sku: form.sku.trim() || null,
        asin: form.asin.trim() || null,
        quantity: Number.isFinite(qty) && qty > 0 ? qty : null,
      },
      reviewReasons: reasons,
      // Reviewed only if nothing is outstanding.
      reviewed: reasons.length === 0,
      selected: reasons.length === 0 ? true : label.selected,
      source: label.source === 'parsed' ? 'parsed' : 'manual',
    });

    onOpenChange(false);
  };

  const outstanding = label.reviewReasons;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[min(560px,calc(100vw-32px))]',
            '-translate-x-1/2 -translate-y-1/2',
            'max-h-[90dvh] overflow-y-auto rounded-xl border border-line bg-surface shadow-2xl',
          )}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface-muted px-5 py-3.5">
            <div>
              <Dialog.Title className="m-0 text-[14px] font-semibold">
                Edit label · page {label.pageNumber}
              </Dialog.Title>
              <Dialog.Description className="m-0 mt-0.5 text-[11.5px] text-ink-4">
                Corrections are saved to this device only.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="cursor-pointer rounded-md border-0 bg-transparent p-1 text-ink-5 hover:text-ink"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          {outstanding.length > 0 ? (
            <div className="border-b border-warn-line bg-warn-bg px-5 py-3">
              <p className="m-0 text-[12px] font-semibold text-warn-fg">
                This label needs attention
              </p>
              <ul className="m-0 mt-1.5 list-none space-y-1 p-0">
                {outstanding.map((r) => (
                  <li key={r} className="text-[11.5px] leading-snug text-warn-fg">
                    · {REVIEW_REASON_TEXT[r]}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-col gap-3.5 px-5 py-4">
            <Field label="Recipient name" error={nameError}>
              <Input
                value={form.recipientName}
                aria-invalid={nameError !== null}
                onChange={(e) => set('recipientName')(e.target.value)}
                placeholder="Full name as it should appear on the parcel"
              />
            </Field>

            <Field label="Address lines" hint="One line per row, street and building only">
              <Textarea
                rows={3}
                value={form.addressLines}
                onChange={(e) => set('addressLines')(e.target.value)}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Postal code">
                <Input
                  value={form.postalCode}
                  onChange={(e) => set('postalCode')(e.target.value)}
                />
              </Field>
              <Field label="City">
                <Input value={form.city} onChange={(e) => set('city')(e.target.value)} />
              </Field>
            </div>

            <Field label="Country" hint="Required — never assumed from the address">
              <Select
                className="h-9 w-full"
                value={form.country}
                onChange={(e) => set('country')(e.target.value)}
              >
                <option value="">— Select a country —</option>
                {allCountryNames().map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Order number" error={orderError} hint="Encoded in the QR code">
                <Input
                  value={form.orderNumber}
                  aria-invalid={orderError !== null}
                  onChange={(e) => set('orderNumber')(e.target.value)}
                  placeholder="402-1234567-1234567"
                  className="font-mono"
                />
              </Field>
              <Field label="Phone">
                <Input value={form.phone} onChange={(e) => set('phone')(e.target.value)} />
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label="SKU">
                <Input value={form.sku} onChange={(e) => set('sku')(e.target.value)} />
              </Field>
              <Field label="ASIN">
                <Input value={form.asin} onChange={(e) => set('asin')(e.target.value)} />
              </Field>
              <Field label="Quantity">
                <Input
                  inputMode="numeric"
                  value={form.quantity}
                  onChange={(e) => set('quantity')(e.target.value)}
                />
              </Field>
            </div>

            <Field label="Product title">
              <Input value={form.title} onChange={(e) => set('title')(e.target.value)} />
            </Field>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-muted px-5 py-3">
            <Dialog.Close asChild>
              <Button variant="secondary">Cancel</Button>
            </Dialog.Close>
            <Button variant="primary" onClick={handleSave} icon={<Check size={14} />}>
              Save and verify
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
