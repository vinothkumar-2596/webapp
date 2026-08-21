import { describe, it, expect } from 'vitest';
import { parseSlip, extractOrderNumber, extractPhone, isValidOrderNumber } from './parseSlip';
import { matchCountry } from './countries';
import { runsToLines } from './lines';
import * as F from './__fixtures__/slips';

const parse = (fixture: string) => parseSlip(F.toPage(fixture));

describe('order number', () => {
  it('extracts an anchored order number with high confidence', () => {
    const label = parse(F.FR_STANDARD);
    expect(label.orderNumber.value).toBe('402-7719834-2210445');
    expect(label.orderNumber.confidence).toBe('high');
    expect(label.reviewReasons).not.toContain('missing-order-number');
  });

  it('NEVER fabricates an order number when none is present', () => {
    const label = parse(F.NO_ORDER_NUMBER);
    expect(label.orderNumber.value).toBeNull();
    expect(label.orderNumber.confidence).toBe('missing');
    expect(label.reviewReasons).toContain('missing-order-number');
    // Must not be auto-selected for printing.
    expect(label.selected).toBe(false);
  });

  it('flags a bare order number as unverified rather than trusting it', () => {
    const label = parse(F.BARE_ORDER_NUMBER);
    expect(label.orderNumber.value).toBe('402-8834712-9902117');
    expect(label.orderNumber.confidence).toBe('low');
    expect(label.reviewReasons).toContain('unverified-order-number');
  });

  it('handles English "Order ID" layouts', () => {
    expect(extractOrderNumber('Order ID: 403-5561092-3318907').confidence).toBe('high');
  });

  it('validates hand-typed order numbers', () => {
    expect(isValidOrderNumber('402-7719834-2210445')).toBe(true);
    expect(isValidOrderNumber('402-771-2210')).toBe(false);
    expect(isValidOrderNumber('')).toBe(false);
  });
});

describe('country', () => {
  it('resolves French, English, and endonym spellings', () => {
    expect(matchCountry('Deutschland')).toBe('Allemagne');
    expect(matchCountry('Germany')).toBe('Allemagne');
    expect(matchCountry('Allemagne')).toBe('Allemagne');
    expect(matchCountry('Nederland')).toBe('Pays-Bas');
    expect(matchCountry('Suede')).toBe('Suède'); // accent-insensitive
  });

  it('does NOT default an unlisted country to France', () => {
    const label = parse(F.UNKNOWN_COUNTRY);
    expect(label.address.country.value).toBeNull();
    expect(label.reviewReasons).toContain('unknown-country');
  });

  it('keeps a German destination German', () => {
    const label = parse(F.DE_GERMANY);
    expect(label.address.country.value).toBe('Allemagne');
    expect(label.reviewReasons).not.toContain('unknown-country');
  });

  it('does not mistake a street line for a country', () => {
    expect(matchCountry('14 Rue des Lilas')).toBeNull();
    expect(matchCountry('Bâtiment C')).toBeNull();
  });

  it('removes the country line from the address lines', () => {
    const label = parse(F.FR_STANDARD);
    expect(label.address.country.value).toBe('France');
    expect(label.address.lines).not.toContain('France');
  });
});

describe('address', () => {
  it('extracts recipient, street, postcode and city', () => {
    const label = parse(F.FR_STANDARD);
    expect(label.recipientName.value).toBe('Camille Moreau');
    expect(label.address.lines).toContain('14 Rue des Lilas');
    expect(label.address.postalCode).toBe('69003');
    expect(label.address.city).toBe('Lyon');
  });

  it('does not leave the postcode/city line in address.lines', () => {
    // Regression: the place is carried by postalCode + city, so keeping the
    // same line in `lines` made the label print "69003 Lyon" twice.
    const label = parse(F.FR_STANDARD);
    expect(label.address.postalCode).toBe('69003');
    expect(label.address.city).toBe('Lyon');
    expect(label.address.lines).not.toContain('69003 Lyon');
    expect(label.address.lines.filter((l) => l.includes('Lyon'))).toHaveLength(0);
  });

  it('keeps long addresses intact instead of truncating to a fixed window', () => {
    const label = parse(F.FR_LONG_ADDRESS);
    expect(label.recipientName.value).toBe('Léa Dubois');
    expect(label.address.lines).toContain('Société Dubois SARL');
    expect(label.address.lines).toContain('Bâtiment C — Appartement 42');
    expect(label.address.lines).toContain('8 Avenue Jean Médecin');
  });

  it('picks the shipping address, not the billing address', () => {
    const label = parse(F.BILLING_THEN_SHIPPING);
    expect(label.recipientName.value).toBe('Julien Fontaine');
    expect(label.address.city).toBe('Lille');
    expect(label.address.lines.join(' ')).not.toContain('Facture');
  });

  it('falls back to postal-code detection when no anchor exists', () => {
    const label = parse(F.NO_ANCHOR);
    expect(label.address.city).toBe('Toulouse');
    expect(label.recipientName.confidence).toBe('low');
  });

  it('parses Dutch 4-digit + 2-letter postcodes', () => {
    const label = parse(F.NL_NETHERLANDS);
    expect(label.address.postalCode).toBe('1015 CW');
    expect(label.address.city).toBe('Amsterdam');
    expect(label.address.country.value).toBe('Pays-Bas');
  });

  it('flags a page with no readable address', () => {
    const label = parse(F.EMPTY_PAGE);
    expect(label.reviewReasons).toContain('missing-recipient');
    expect(label.reviewReasons).toContain('missing-address');
    expect(label.selected).toBe(false);
  });
});

describe('phone', () => {
  it('extracts French mobile formats', () => {
    expect(parse(F.FR_STANDARD).phone.value).toBe('06 12 34 56 78');
  });

  it('extracts international formats', () => {
    expect(parse(F.FR_LONG_ADDRESS).phone.value).toContain('+33');
  });

  it('returns missing rather than a junk value', () => {
    expect(parse(F.NO_ANCHOR).phone.value).toBeNull();
    expect(extractPhone('Tél : 12').value).toBeNull(); // too short
  });
});

describe('product', () => {
  it('extracts SKU, ASIN and a real quantity', () => {
    const label = parse(F.FR_STANDARD);
    expect(label.product.sku).toBe('VDF-KIT-050');
    expect(label.product.asin).toBe('B08NXK2LMQ');
    expect(label.product.quantity).toBe(2);
  });

  it('does NOT assume a quantity of 1 when none is present', () => {
    const label = parse(F.BARE_ORDER_NUMBER);
    expect(label.product.quantity).toBeNull();
  });

  it('reads a quantity greater than 1', () => {
    expect(parse(F.NO_ANCHOR).product.quantity).toBe(6);
  });
});

describe('provenance', () => {
  it('stamps the parser version on every label', () => {
    expect(parse(F.FR_STANDARD).parserVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('gives every label a unique id', () => {
    const ids = new Set([
      parse(F.FR_STANDARD).id,
      parse(F.FR_STANDARD).id,
      parse(F.DE_GERMANY).id,
    ]);
    expect(ids.size).toBe(3);
  });

  it('auto-selects only clean labels', () => {
    expect(parse(F.FR_STANDARD).selected).toBe(true);
    expect(parse(F.NO_ORDER_NUMBER).selected).toBe(false);
  });
});

describe('line reconstruction', () => {
  const run = (x: number, y: number, text: string, width = text.length * 5) => ({
    x,
    y,
    text,
    width,
  });

  it('groups runs on the same visual line, ordered left to right', () => {
    expect(runsToLines([run(100, 500, 'World'), run(10, 500, 'Hello')])).toEqual(['Hello World']);
  });

  it('separates lines that are far apart vertically', () => {
    expect(runsToLines([run(10, 500, 'Top'), run(10, 460, 'Bottom')])).toEqual(['Top', 'Bottom']);
  });

  it('tolerates sub-point drift within one line', () => {
    // v1 snapped Y to a 4pt grid, so 501.9 and 499.1 could split apart.
    expect(runsToLines([run(10, 501.9, 'Same'), run(60, 499.1, 'line')])).toEqual(['Same line']);
  });

  it('does not inject a space mid-word for kerned runs', () => {
    // Adjacent runs with no visual gap: "Pa" + "ris" must not become "Pa ris".
    expect(runsToLines([run(10, 500, 'Pa', 10), run(20, 500, 'ris', 15)])).toEqual(['Paris']);
  });

  it('ignores empty runs', () => {
    expect(runsToLines([run(10, 500, '   '), run(20, 500, 'x')])).toEqual(['x']);
  });

  it('returns an empty array for no runs', () => {
    expect(runsToLines([])).toEqual([]);
  });
});
