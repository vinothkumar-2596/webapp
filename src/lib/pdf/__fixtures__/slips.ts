/**
 * Golden fixtures — anonymised text dumps of real packing-slip layouts.
 *
 * These are the output of `extractPdfText()` for each layout, with all real
 * names, addresses, and phone numbers replaced by fake data. Text, not PDFs:
 * small, diffable, and free of customer PII.
 *
 * When Amazon changes their layout, a test here fails in CI — instead of a
 * customer receiving a parcel with the wrong address on it.
 */

export const FR_STANDARD = `
Bon de préparation
Merci pour votre achat !
Numéro de la commande : 402-7719834-2210445
Date de commande : 21 août 2026
Adresse de livraison :
Camille Moreau
14 Rue des Lilas
69003 Lyon
France
N° portable : 06 12 34 56 78
Détails de l'article
Kit de démarrage — Vape de France 50ml
Quantité : 2
SKU : VDF-KIT-050
ASIN : B08NXK2LMQ
`.trim();

/** Long address with a company line and an apartment line. */
export const FR_LONG_ADDRESS = `
Bon de préparation
Numéro de la commande : 404-2298301-7745120
Adresse de livraison :
Léa Dubois
Société Dubois SARL
Bâtiment C — Appartement 42
8 Avenue Jean Médecin
06000 Nice
France
Téléphone : +33 6 98 76 54 32
Quantité : 1
SKU : VDF-LIQ-A12
`.trim();

/** German destination — v1 silently relabelled this "France". */
export const DE_GERMANY = `
Packing slip
Order ID: 403-5561092-3318907
Shipping address:
Thomas Bernard
Hauptstraße 27
10115 Berlin
Deutschland
Phone: +49 30 12345678
Quantity: 4
SKU: VDF-KIT-100
`.trim();

/** Dutch destination with a 4-digit + 2-letter postcode. */
export const NL_NETHERLANDS = `
Packing slip
Order ID: 405-1120384-4471002
Shipping address:
Sanne de Vries
Keizersgracht 118
1015 CW Amsterdam
Nederland
Quantity: 1
`.trim();

/** No order number anywhere — must be flagged, never invented. */
export const NO_ORDER_NUMBER = `
Bon de préparation
Merci pour votre achat !
Adresse de livraison :
Élise Rousseau
3 Place Bellecour
69002 Lyon
France
Quantité : 1
`.trim();

/** Order number present but without a label anchor — low confidence. */
export const BARE_ORDER_NUMBER = `
Expédition
402-8834712-9902117
Adresse de livraison :
Antoine Lefèvre
91 Boulevard Voltaire
75011 Paris
France
`.trim();

/** Unrecognised country — must be flagged, not defaulted to France. */
export const UNKNOWN_COUNTRY = `
Packing slip
Order ID: 402-9945120-6613558
Shipping address:
Marion Girard
12 Rua do Porto
4000-322 Porto
Atlantis
`.trim();

/** Billing address appears before the shipping address — must pick shipping. */
export const BILLING_THEN_SHIPPING = `
Facture
Numéro de la commande : 404-7781203-1187443
Adresse de facturation :
Service Comptabilité
1 Rue de la Facture
75001 Paris
France
Adresse de livraison :
Julien Fontaine
46 Rue de la Paix
59000 Lille
France
Quantité : 1
`.trim();

/** No ship-to anchor at all — falls back to postal-code detection. */
export const NO_ANCHOR = `
Bon de préparation
Numéro de la commande : 403-3390218-8820661
Noémie Chevalier
5 Impasse des Roses
31000 Toulouse
France
Quantité : 6
`.trim();

/** Page with no usable content. */
export const EMPTY_PAGE = '';

/** Helper: turn a fixture string into the PageText shape the parser expects. */
export function toPage(fixture: string, pageNumber = 1) {
  const lines = fixture
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return { pageNumber, lines, raw: lines.join('\n') };
}
