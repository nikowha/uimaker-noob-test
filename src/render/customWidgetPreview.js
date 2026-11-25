// Aperçu fixe d'un custom widget dans l'éditeur : SVG nettoyé, aucun code n'est lancé (PROTOTYPE).
import { createElement } from '../utils/dom.js';
import { getIconSvg } from './iconLibrary.js';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const ALLOWED_TAGS = new Set(['svg', 'g', 'defs', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'title', 'desc']);
const ALLOWED_ATTRIBUTES = new Set(['viewBox', 'preserveAspectRatio', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'dx', 'dy', 'd', 'points', 'width', 'height', 'transform', 'id',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'clip-path', 'clip-rule',
  'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'clipPathUnits', 'font-size', 'font-weight', 'font-family', 'text-anchor', 'dominant-baseline', 'letter-spacing']);
const sanitizedByText = new Map();

/**
 * Copie un élément SVG en ne gardant que ce qui est permis (ni script, ni lien, ni fichier extérieur).
 * @param {Element} sourceElement élément lu
 * @returns {Element|null} copie
 */
function copyAllowed(sourceElement) {
  if (sourceElement.namespaceURI !== SVG_NAMESPACE || !ALLOWED_TAGS.has(sourceElement.localName)) return null;
  const copy = document.createElementNS(SVG_NAMESPACE, sourceElement.localName);
  for (const attribute of sourceElement.attributes) {
    const isSafeValue = !/url\s*\(/i.test(attribute.value) || /^url\(#[\w-]+\)$/.test(attribute.value.trim());
    if (ALLOWED_ATTRIBUTES.has(attribute.name) && isSafeValue) copy.setAttribute(attribute.name, attribute.value);
  }
  for (const childNode of sourceElement.childNodes) {
    if (childNode.nodeType === Node.TEXT_NODE) copy.append(childNode.textContent);
    else if (childNode.nodeType === Node.ELEMENT_NODE) { const childCopy = copyAllowed(childNode); if (childCopy) copy.append(childCopy); }
  }
  return copy;
}

/**
 * Nettoie un SVG.
 * @param {string} svgText texte
 * @returns {Element|null} SVG sûr, ou null s'il est illisible
 */
function sanitizeSvg(svgText) {
  if (!svgText) return null;
  if (!sanitizedByText.has(svgText)) {
    const parsedDocument = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    sanitizedByText.set(svgText, parsedDocument.querySelector('parsererror') ? null : copyAllowed(parsedDocument.documentElement));
  }
  return sanitizedByText.get(svgText)?.cloneNode(true) ?? null;
}

/**
 * Crée l'aperçu d'un custom widget.
 * @param {object|undefined} definition définition
 * @returns {HTMLElement} aperçu qui remplit son parent
 */
export function createCustomWidgetPreview(definition) {
  const svgElement = sanitizeSvg(definition?.previewSvg);
  if (svgElement) {
    svgElement.setAttribute('width', '100%');
    svgElement.setAttribute('height', '100%');
    return createElement('div', { className: 'uiw-custom-preview' }, [svgElement]);
  }
  return createElement('div', { className: 'uiw-custom-preview is-empty' }, [createElement('span', { className: 'uiw-icon-glyph', html: getIconSvg('lucide:puzzle'), style: { width: '20px', height: '20px' } }),
    createElement('span', { text: definition?.name ?? 'Custom widget introuvable' })]);
}
