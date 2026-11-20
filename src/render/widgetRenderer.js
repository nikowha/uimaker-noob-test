// Dessin du contenu de chaque type de widget, apparence neutre (PROTOTYPE).
import { createElement } from '../utils/dom.js';
import { getIconSvg } from './iconLibrary.js';

const TEXT_ROLE_SIZES = { title: 20, subtitle: 15, body: 13, caption: 11 };
const TEXT_ROLE_WEIGHTS = { title: 650, subtitle: 600, body: 400, caption: 400 };

/**
 * Crée l'élément d'une icône.
 * @param {string} iconReference référence (ex. "lucide:house")
 * @param {number} iconSize taille en px
 * @returns {HTMLElement} élément
 */
function createIconElement(iconReference, iconSize) {
  const iconSvg = getIconSvg(iconReference);
  return createElement('span', {
    className: 'uiw-icon-glyph', html: iconSvg || '',
    style: { width: `${iconSize}px`, height: `${iconSize}px` },
  });
}

/**
 * Crée une rangée d'éléments (liste, onglets, menus) à partir de { label, icon }.
 * @param {Array<{label: string, icon?: string}>} items éléments
 * @param {number} selectedIndex index sélectionné (-1 = aucun)
 * @param {string} itemClassName classe CSS d'un élément
 * @returns {HTMLElement[]} éléments
 */
function createItemElements(items, selectedIndex, itemClassName) {
  return (items ?? []).map((item, itemIndex) => createElement('div', {
    className: `${itemClassName}${itemIndex === selectedIndex ? ' is-active' : ''}`,
  }, [item.icon ? createIconElement(item.icon, 14) : null, createElement('span', { text: item.label ?? '' })]));
}

/** Fonctions de dessin par type : (widget) → enfants du widget. */
const WIDGET_CONTENT_BUILDERS = {
  button: (widget) => {
    const { label, icon, iconPosition } = widget.content ?? {};
    const iconElement = icon ? createIconElement(icon, 16) : null;
    if (iconPosition === 'only') return [iconElement ?? createElement('span', { text: label })];
    const labelElement = label ? createElement('span', { text: label }) : null;
    return iconPosition === 'end' ? [labelElement, iconElement] : [iconElement, labelElement];
  },
  text: (widget) => {
    const { text, textRole, align } = widget.content ?? {};
    return [createElement('span', {
      className: 'uiw-text-content', text: text ?? '',
      style: { fontSize: `${TEXT_ROLE_SIZES[textRole] ?? 13}px`, fontWeight: TEXT_ROLE_WEIGHTS[textRole] ?? 400,
        textAlign: align === 'end' ? 'right' : align === 'center' ? 'center' : 'left' },
    })];
  },
  textField: (widget) => {
    const { placeholder, value, inputKind } = widget.content ?? {};
    const shownText = value ? (inputKind === 'password' ? '•'.repeat(value.length) : value) : placeholder;
    return [inputKind === 'search' ? createIconElement('lucide:search', 14) : null,
      createElement('span', { className: value ? '' : 'uiw-muted', text: shownText ?? '' })];
  },
  checkbox: (widget) => [createElement('span', { className: `uiw-check-box${widget.state?.checked ? ' is-on' : ''}`,
    html: widget.state?.checked ? getIconSvg('lucide:check') : '' }), createElement('span', { text: widget.content?.label ?? '' })],
  toggle: (widget) => [createElement('span', { className: `uiw-toggle-track${widget.state?.on ? ' is-on' : ''}` },
    [createElement('span', { className: 'uiw-toggle-thumb' })]), createElement('span', { text: widget.content?.label ?? '' })],
  slider: (widget) => {
    const { min = 0, max = 100, value = 0, orientation } = widget.content ?? {};
    const ratio = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;
    const isVertical = orientation === 'vertical';
    return [createElement('div', { className: `uiw-slider-track${isVertical ? ' is-vertical' : ''}` }, [
      createElement('div', { className: 'uiw-slider-fill', style: isVertical ? { height: `${ratio * 100}%` } : { width: `${ratio * 100}%` } }),
      createElement('div', { className: 'uiw-slider-thumb', style: isVertical ? { bottom: `${ratio * 100}%` } : { left: `${ratio * 100}%` } }),
    ])];
  },
  dropdown: (widget) => {
    const { options = [], selectedIndex = 0 } = widget.content ?? {};
    return [createElement('span', { text: options[selectedIndex] ?? '' }), createIconElement('lucide:chevron-down', 14)];
  },
  list: (widget) => createItemElements(widget.content?.items, widget.content?.selectedIndex ?? -1, 'uiw-list-item'),
  icon: (widget) => [createIconElement(widget.content?.icon, widget.content?.size ?? 20)],
  table: (widget) => {
    const { columns = [], rows = [], headerVisible = true, selectedRow = -1, striped = false } = widget.content ?? {};
    const gridTemplate = columns.map((column) => (typeof column.width === 'number' ? `${column.width}px` : 'minmax(0, 1fr)')).join(' ');
    const createRowElement = (cellTexts, rowClassName) => createElement('div', { className: rowClassName, style: { gridTemplateColumns: gridTemplate } },
      columns.map((column, columnIndex) => createElement('span', { className: 'uiw-table-cell', text: cellTexts[columnIndex] ?? '' })));
    return [
      headerVisible ? createRowElement(columns.map((column) => column.label), 'uiw-table-row is-header') : null,
      ...rows.map((rowCells, rowIndex) => createRowElement(rowCells,
        `uiw-table-row${rowIndex === selectedRow ? ' is-active' : ''}${striped && rowIndex % 2 === 1 ? ' is-striped' : ''}`)),
    ];
  },
  tabs: (widget) => createItemElements(widget.content?.tabs, widget.content?.selectedIndex ?? 0, 'uiw-tab'),
  menuBar: (widget) => createItemElements(widget.content?.menus, -1, 'uiw-menu'),
  separator: () => [],
  placeholder: (widget) => [
    createElement('div', { className: 'uiw-placeholder-name', text: `${widget.name} · ${widget.id}` }),
    createElement('div', { className: 'uiw-placeholder-description', text: widget.content?.description ?? '' }),
  ],
  image: () => [createIconElement('lucide:image', 24)],
};

/**
 * Remplit l'élément d'un widget avec son contenu visuel (hors conteneurs, gérés par le rendu d'écran).
 * @param {HTMLElement} widgetElement élément du widget
 * @param {object} widget widget
 */
export function fillWidgetContent(widgetElement, widget) {
  widgetElement.classList.add(`uiw-${widget.type}`);
  if (widget.type === 'separator' && widget.content?.orientation === 'vertical') widgetElement.classList.add('is-vertical');
  if (widget.type === 'placeholder') {
    widgetElement.style.setProperty('--placeholder-color', widget.displayColor ?? '#5B6B8C');
  }
  const contentBuilder = WIDGET_CONTENT_BUILDERS[widget.type];
  if (!contentBuilder) return;
  for (const childElement of contentBuilder(widget)) {
    if (childElement) widgetElement.append(childElement);
  }
}
