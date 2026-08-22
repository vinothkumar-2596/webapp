import * as Dialog from '@radix-ui/react-dialog';
import { useState, type ReactNode } from 'react';
import { X, Check, Plus, AlertTriangle } from 'lucide-react';
import { Button, Field, Input, Select, cn } from './ui';
import { allCountryNames } from '../lib/pdf/countries';
import { isValidOrderNumber } from '../lib/pdf/parseSlip';
import type { Label, ReviewReason } from '../lib/types';
import { REVIEW_REASON_TEXT } from '../lib/types';

interface Form {
  recipientName: string;
  /** Each street/building line as its own input, not one combined field. */
  addressLines: string[];
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
    // Always keep at least one input so there is a field to type into.
    addressLines: label.address.lines.length > 0 ? [...label.address.lines] : [''],
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

/** A valid, empty form so `form` is never null before a label is opened. */
const EMPTY_FORM: Form = {
  recipientName: '',
  addressLines: [''],
  postalCode: '',
  city: '',
  country: '',
  phone: '',
  orderNumber: '',
  sku: '',
  asin: '',
  title: '',
  quantity: '',
};

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
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [touched, setTouched] = useState(false);
  const [openedId, setOpenedId] = useState<string | null>(null);

  // Seed the form from the label during render, the moment a (different) label
  // is opened — so the very first paint already has its data. A lazy useState
  // initialiser can't do this: the dialog is mounted (with label = null) long
  // before any label is chosen, and reading form.* on that first open would
  // otherwise throw on an empty form.
  if (label && label.id !== openedId) {
    setOpenedId(label.id);
    setForm(toForm(label));
    setTouched(false);
  } else if (!label && openedId !== null) {
    // Closed — let the next open (even of the same label) re-seed fresh data,
    // discarding any edits that were cancelled rather than saved.
    setOpenedId(null);
  }

  if (!label) return null;

  const set = (key: keyof Form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Each address line is edited independently.
  const setLine = (index: number, value: string) =>
    setForm((f) => {
      const addressLines = f.addressLines.slice();
      addressLines[index] = value;
      return { ...f, addressLines };
    });

  const addLine = () =>
    setForm((f) => ({ ...f, addressLines: [...f.addressLines, ''] }));

  const removeLine = (index: number) =>
    setForm((f) => {
      const addressLines = f.addressLines.filter((_, i) => i !== index);
      return { ...f, addressLines: addressLines.length > 0 ? addressLines : [''] };
    });

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

    const lines = form.addressLines.map((l) => l.trim()).filter(Boolean);

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
            'max-h-[90dvh] overflow-y-auto rounded-lg border border-line bg-surface shadow-2xl',
          )}
        >
          <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-surface-muted px-5 py-3">
            <div className="min-w-0">
              <Dialog.Title className="m-0 text-[14px] font-semibold text-ink">
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
                className="-mr-1 shrink-0 cursor-pointer rounded-md border-0 bg-transparent p-1 text-ink-5 hover:text-ink"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          {outstanding.length > 0 ? (
            <div className="flex gap-2.5 border-b border-warn-line bg-warn-bg px-5 py-2.5">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn-icon" />
              <div className="min-w-0">
                <p className="m-0 text-[12px] font-semibold text-warn-fg">
                  This label needs attention
                </p>
                <ul className="m-0 mt-1.5 list-none space-y-1 p-0">
                  {outstanding.map((r) => (
                    <li
                      key={r}
                      className="flex gap-1.5 text-[11.5px] leading-snug text-warn-fg"
                    >
                      <span aria-hidden className="text-warn-icon">
                        ·
                      </span>
                      <span>{REVIEW_REASON_TEXT[r]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-2.5 px-5 py-3">
            <SectionLabel>Recipient &amp; address</SectionLabel>

            <Field label="Recipient name" error={nameError}>
              <Input
                value={form.recipientName}
                aria-invalid={nameError !== null}
                onChange={(e) => set('recipientName')(e.target.value)}
                placeholder="Full name as it should appear on the parcel"
              />
            </Field>

            {/* Address lines — each on its own input, not a single textarea. */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-4">
                Address lines
              </span>
              <div className="flex flex-col gap-1.5">
                {form.addressLines.map((value, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={value}
                      onChange={(e) => setLine(i, e.target.value)}
                      placeholder={i === 0 ? 'Street address' : `Address line ${i + 1}`}
                    />
                    {form.addressLines.length > 1 ? (
                      <button
                        type="button"
                        aria-label={`Remove address line ${i + 1}`}
                        title="Remove line"
                        onClick={() => removeLine(i)}
                        className="shrink-0 cursor-pointer rounded-md border border-line bg-surface p-2 text-ink-5 hover:text-bad-fg"
                      >
                        <X size={14} />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addLine}
                className="mt-0.5 inline-flex w-fit cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[12px] font-semibold text-brand hover:text-brand-hover"
              >
                <Plus size={13} />
                Add line
              </button>
              <span className="text-[11.5px] text-ink-5">
                Street and building only — postal code, city and country are separate below.
              </span>
            </div>

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
                className="h-8 w-full"
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

            <SectionLabel>Order &amp; contact</SectionLabel>

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

            <SectionLabel note="optional">Product details</SectionLabel>

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

          <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-line bg-surface-muted px-5 py-3">
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

/** A section divider: a small heading with an optional chip and a hairline. */
function SectionLabel({ children, note }: { children: ReactNode; note?: string }) {
  return (
    <div className="mt-1 flex items-center gap-2.5 first:mt-0">
      <span className="shrink-0 text-[12px] font-semibold text-ink">{children}</span>
      {note ? (
        <span className="shrink-0 rounded bg-canvas px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-5">
          {note}
        </span>
      ) : null}
      <span className="h-px flex-1 bg-line-soft" />
    </div>
  );
}
