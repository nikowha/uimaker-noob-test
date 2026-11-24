// Rendu d'un écran : areas découpées, placement des widgets, apparence, thème (PROTOTYPE).
import { createElement } from '../utils/dom.js';
import { resolveInstanceRoot } from '../model/modules.js';
import { applyAppearanceToElement, applyThemeVariables, resolveAppearance, resolveColor } from './styleResolver.js';
import { fillWidgetContent } from './widgetRenderer.js';

const ALIGN_TO_CSS = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch', spaceBetween: 'space-between' };
const ANCHOR_PARTS = {
  topLeft: ['left', 'top'], top: ['center', 'top'], topRight: ['right', 'top'],
  left: ['left', 'center'], center: ['center', 'center'], right: ['right', 'center'],
  bottomLeft: ['left', 'bottom'], bottom: ['center', 'bottom'], bottomRight: ['right', 'bottom'],
  stretch: ['stretch', 'stretch'],
};

/**
 * Convertit une liste de marges [haut, droite, bas, gauche] en texte CSS.
 * @param {number[]|undefined} padding marges
 * @returns {string} valeur CSS
 */
function convertPaddingToCss(padding) {
  return Array.isArray(padding) ? padding.map((paddingValue) => `${paddingValue}px`).join(' ') : '0';
}

/**
 * Convertit une piste de grille (120, "1fr", "auto") en texte CSS.
 * @param {Array<number|string>|undefined} trackSizes pistes
 * @returns {string} valeur CSS
 */
function convertGridTracksToCss(trackSizes) {
  if (!Array.isArray(trackSizes) || trackSizes.length === 0) return 'repeat(2, 1fr)';
  return trackSizes.map((trackSize) => (typeof trackSize === 'number' ? `${trackSize}px` : trackSize)).join(' ');
}

/**
 * Applique le mode de placement des widgets (pile, grille, libre) à un conteneur.
 * @param {HTMLElement} element area feuille ou widget conteneur
 * @param {object} widgetLayout réglages de placement
 */
function applyWidgetLayout(element, widgetLayout = { mode: 'stack' }) {
  const elementStyle = element.style;
  elementStyle.padding = convertPaddingToCss(widgetLayout.padding);
  elementStyle.gap = `${widgetLayout.gap ?? 0}px`;
  if (widgetLayout.mode === 'grid') {
    elementStyle.display = 'grid';
    elementStyle.gridTemplateColumns = convertGridTracksToCss(widgetLayout.columns);
    if (widgetLayout.rows) elementStyle.gridTemplateRows = convertGridTracksToCss(widgetLayout.rows);
    elementStyle.alignContent = 'start';
  } else if (widgetLayout.mode === 'free') {
    elementStyle.display = 'block';
    elementStyle.padding = '0';
  } else {
    elementStyle.display = 'flex';
    elementStyle.flexDirection = widgetLayout.direction === 'horizontal' ? 'row' : 'column';
    elementStyle.justifyContent = ALIGN_TO_CSS[widgetLayout.alignMain] ?? 'flex-start';
    elementStyle.alignItems = ALIGN_TO_CSS[widgetLayout.alignCross] ?? 'stretch';
    if (widgetLayout.scroll === 'auto') elementStyle.overflow = 'auto';
  }
  element.dataset.layoutMode = widgetLayout.mode ?? 'stack';
  element.dataset.layoutDirection = widgetLayout.direction ?? 'vertical';
}

/**
 * Applique la taille d'une area dans le sens du découpage de son parent.
 * @param {HTMLElement} element area
 * @param {object} sizing { mode, size, ratio, min, max }
 * @param {string|null} parentSplit sens du découpage du parent
 */
function applyAreaSizing(element, sizing, parentSplit) {
  const elementStyle = element.style;
  if (!parentSplit) { elementStyle.flex = '1 1 0'; return; }
  const mainDimension = parentSplit === 'horizontal' ? 'Width' : 'Height';
  if (sizing.mode === 'fixed') elementStyle.flex = `0 0 ${sizing.size ?? 200}px`;
  else if (sizing.mode === 'proportional') elementStyle.flex = `0 0 ${(sizing.ratio ?? 0.5) * 100}%`;
  else elementStyle.flex = '1 1 0';
  if (sizing.min !== undefined && sizing.min !== '') elementStyle[`min${mainDimension}`] = `${sizing.min}px`;
  if (sizing.max !== undefined && sizing.max !== '') elementStyle[`max${mainDimension}`] = `${sizing.max}px`;
}

/**
 * Applique la taille d'un widget selon le mode de placement de son parent.
 * @param {HTMLElement} element widget
 * @param {object} widget widget
 * @param {object} parentLayout placement du parent
 */
function applyWidgetSizing(element, widget, parentLayout) {
  const elementStyle = element.style;
  const size = widget.size ?? {};
  const layoutMode = parentLayout?.mode ?? 'stack';
  const mainDimension = parentLayout?.direction === 'horizontal' ? 'width' : 'height';
  for (const dimension of ['width', 'height']) {
    const sizeValue = size[dimension];
    const capitalized = dimension === 'width' ? 'Width' : 'Height';
    if (typeof sizeValue === 'number') {
      elementStyle[dimension] = `${sizeValue}px`;
      if (layoutMode === 'stack' && dimension === mainDimension) elementStyle.flexShrink = '0';
    } else if (sizeValue === 'fill') {
      if (layoutMode === 'stack' && dimension === mainDimension) { elementStyle.flex = '1 1 0'; elementStyle[`min${capitalized}`] = '0'; }
      else if (layoutMode === 'stack') elementStyle.alignSelf = 'stretch';
      else if (layoutMode === 'grid') elementStyle[dimension === 'width' ? 'justifySelf' : 'alignSelf'] = 'stretch';
    } else if (layoutMode === 'stack' && dimension !== mainDimension && parentLayout?.alignCross === 'stretch') {
      elementStyle.alignSelf = parentLayout.direction === 'horizontal' ? 'center' : 'flex-start';
    }
    for (const [limitKey, cssKey] of [[`min${capitalized}`, `min${capitalized}`], [`max${capitalized}`, `max${capitalized}`]]) {
      if (typeof size[limitKey] === 'number') elementStyle[cssKey] = `${size[limitKey]}px`;
    }
  }
}

/**
 * Place un widget en mode libre selon son ancrage et ses décalages.
 * @param {HTMLElement} element widget
 * @param {object} widget widget
 */
function applyFreePlacement(element, widget) {
  const placement = widget.placement ?? { anchor: 'topLeft', x: 0, y: 0 };
  const [anchorHorizontal, anchorVertical] = ANCHOR_PARTS[placement.anchor] ?? ANCHOR_PARTS.topLeft;
  const horizontalMode = widget.size?.width === 'fill' ? 'stretch' : anchorHorizontal;
  const verticalMode = widget.size?.height === 'fill' ? 'stretch' : anchorVertical;
  const offsetX = placement.x ?? 0;
  const offsetY = placement.y ?? 0;
  const elementStyle = element.style;
  elementStyle.position = 'absolute';
  const transforms = [];
  if (horizontalMode === 'left') elementStyle.left = `${offsetX}px`;
  else if (horizontalMode === 'right') elementStyle.right = `${offsetX}px`;
  else if (horizontalMode === 'center') { elementStyle.left = `calc(50% + ${offsetX}px)`; transforms.push('translateX(-50%)'); }
  else { elementStyle.left = `${offsetX}px`; elementStyle.right = `${offsetX}px`; elementStyle.width = 'auto'; }
  if (verticalMode === 'top') elementStyle.top = `${offsetY}px`;
  else if (verticalMode === 'bottom') elementStyle.bottom = `${offsetY}px`;
  else if (verticalMode === 'center') { elementStyle.top = `calc(50% + ${offsetY}px)`; transforms.push('translateY(-50%)'); }
  else { elementStyle.top = `${offsetY}px`; elementStyle.bottom = `${offsetY}px`; elementStyle.height = 'auto'; }
  if (transforms.length) elementStyle.transform = transforms.join(' ');
}

/**
 * Crée un rendu d'écran.
 * @param {object} uiDocument document
 * @param {object} screen écran
 * @param {object} renderOptions { themeId, isEditor, areIdsVisible, selectedId }
 * @returns {HTMLElement} élément de l'écran
 */
export function renderScreen(uiDocument, screen, renderOptions) {
  const { themeId, isEditor, areIdsVisible, selectedId } = renderOptions;

  /**
   * Ajoute le badge d'ID et l'état sélectionné à un élément de l'éditeur.
   * @param {HTMLElement} element élément
   * @param {object} node nœud
   * @param {boolean} isInsideInstance vrai dans une instance de module (pas d'ID propre)
   */
  const decorateEditorElement = (element, node, isInsideInstance) => {
    if (isInsideInstance) return;
    element.dataset.nodeId = node.id;
    if (!isEditor) return;
    if (node.id === selectedId) element.classList.add('is-selected');
    const isArea = !node.type;
    if (areIdsVisible && isArea) element.append(createElement('span', { className: 'editor-id-badge', text: node.id }));
  };

  /**
   * Applique la couleur « cochée » d'une case : sur la case, ou sur tout le widget s'il s'affiche comme un bouton.
   * @param {HTMLElement} widgetElement élément
   * @param {object} widget case à cocher
   */
  const applyCheckedColor = (widgetElement, widget) => {
    const isButton = widget.content?.appearance === 'button';
    if (isButton) widgetElement.classList.add('is-button');
    if (!widget.state?.checked) return;
    const checkedColor = widget.content?.checkedColor ? resolveColor(uiDocument, widget.content.checkedColor, themeId) : null;
    if (isButton) widgetElement.style.background = checkedColor ?? 'var(--ui-accent, #4c8dff)';
    else if (checkedColor) widgetElement.querySelector('.uiw-check-box').style.background = checkedColor;
  };

  /**
   * Rend un widget (et ses enfants s'il est conteneur).
   * @param {object} widget widget
   * @param {object} parentLayout placement du parent
   * @param {boolean} isInsideInstance vrai dans une instance
   * @returns {HTMLElement} élément
   */
  const renderWidget = (widget, parentLayout, isInsideInstance, parentModuleIds = []) => {
    const widgetElement = createElement('div', { className: 'ui-widget' });
    let renderedWidget = widget;
    if (widget.type === 'moduleInstance') {
      const module = uiDocument.modules[widget.moduleId];
      if (!module || parentModuleIds.includes(widget.moduleId)) {
        renderedWidget = { ...widget, type: 'placeholder', content: { description: `Module ${widget.moduleId} ${module ? 'qui se contient lui-même' : 'introuvable'}` } };
      } else {
        const instanceRoot = resolveInstanceRoot(module, widget);
        const instanceElement = renderWidget(instanceRoot, parentLayout, true, [...parentModuleIds, widget.moduleId]);
        instanceElement.classList.add('ui-component-instance');
        decorateEditorElement(instanceElement, widget, isInsideInstance);
        return instanceElement;
      }
    }
    applyAppearanceToElement(widgetElement, resolveAppearance(uiDocument, renderedWidget), uiDocument, themeId, true);
    if (renderedWidget.children) {
      widgetElement.classList.add('ui-widget-container', `uiw-${renderedWidget.type}`);
      applyWidgetLayout(widgetElement, renderedWidget.widgetLayout);
      if (renderedWidget.content?.title) widgetElement.append(createElement('div', { className: 'uiw-container-title', text: renderedWidget.content.title }));
      const isPageStack = renderedWidget.type === 'pageStack';
      const activePageIndex = Math.max(0, Math.min(renderedWidget.content?.activeIndex ?? 0, renderedWidget.children.length - 1));
      renderedWidget.children.forEach((childWidget, childIndex) => {
        const childElement = renderWidget(childWidget, renderedWidget.widgetLayout, isInsideInstance, parentModuleIds);
        if (isPageStack && childIndex !== activePageIndex) childElement.style.display = 'none';
        widgetElement.append(childElement);
      });
    } else {
      fillWidgetContent(widgetElement, renderedWidget);
      if (renderedWidget.type === 'checkbox') applyCheckedColor(widgetElement, renderedWidget);
    }
    applyWidgetSizing(widgetElement, renderedWidget, parentLayout);
    if (parentLayout?.mode === 'free') applyFreePlacement(widgetElement, renderedWidget);
    if (parentLayout?.mode === 'grid' && renderedWidget.placement?.column !== undefined) {
      widgetElement.style.gridColumn = `${renderedWidget.placement.column + 1} / span ${renderedWidget.placement.columnSpan ?? 1}`;
      widgetElement.style.gridRow = `${(renderedWidget.placement.row ?? 0) + 1} / span ${renderedWidget.placement.rowSpan ?? 1}`;
    }
    if (renderedWidget.state?.enabled === false) widgetElement.classList.add('is-disabled');
    if (renderedWidget.state?.visible === false) widgetElement.style.visibility = 'hidden';
    decorateEditorElement(widgetElement, widget, isInsideInstance);
    return widgetElement;
  };

  /**
   * Rend une area (découpée ou feuille).
   * @param {object} area area
   * @param {string|null} parentSplit sens du découpage du parent
   * @returns {HTMLElement} élément
   */
  const renderArea = (area, parentSplit, isInsideInstance = false, parentModuleIds = []) => {
    if (area.moduleId) {
      const module = uiDocument.modules[area.moduleId];
      const isUsable = module && !parentModuleIds.includes(area.moduleId);
      const instanceRoot = isUsable ? resolveInstanceRoot(module, area) : { widgetLayout: { mode: 'free' },
        widgets: [{ id: '', name: area.name, type: 'placeholder', placement: { anchor: 'stretch', x: 0, y: 0 },
          content: { description: `Module ${area.moduleId} ${module ? 'qui se contient lui-même' : 'introuvable'}` } }] };
      const instanceElement = renderArea({ ...instanceRoot, sizing: area.sizing, resizableSplitter: area.resizableSplitter }, parentSplit, true, [...parentModuleIds, area.moduleId]);
      instanceElement.classList.add('ui-component-instance');
      decorateEditorElement(instanceElement, area, isInsideInstance);
      return instanceElement;
    }
    const areaElement = createElement('div', { className: 'ui-area' });
    applyAreaSizing(areaElement, area.sizing ?? uiDocument.project.defaults?.areaSizing ?? { mode: 'fill' }, parentSplit);
    applyAppearanceToElement(areaElement, resolveAppearance(uiDocument, area), uiDocument, themeId, false);
    if (area.split) {
      areaElement.classList.add('is-split');
      areaElement.style.display = 'flex';
      areaElement.style.flexDirection = area.split === 'horizontal' ? 'row' : 'column';
      area.children.forEach((childArea, childIndex) => {
        if (childIndex > 0 && !(isEditor && isInsideInstance)) {
          const previousArea = area.children[childIndex - 1];
          const isResizable = previousArea.resizableSplitter ?? uiDocument.project.defaults?.resizableSplitter ?? false;
          areaElement.append(createElement('div', {
            className: `ui-splitter is-${area.split}${isResizable ? ' is-resizable' : ''}`,
            dataset: { splitParentId: area.id, previousIndex: String(childIndex - 1) },
          }));
        }
        areaElement.append(renderArea(childArea, area.split, isInsideInstance, parentModuleIds));
      });
    } else {
      areaElement.classList.add('is-leaf');
      applyWidgetLayout(areaElement, area.widgetLayout);
      for (const widget of area.widgets ?? []) areaElement.append(renderWidget(widget, area.widgetLayout, isInsideInstance, parentModuleIds));
    }
    decorateEditorElement(areaElement, area, isInsideInstance);
    return areaElement;
  };

  const screenElement = createElement('div', { className: 'ui-screen', dataset: { screenId: screen.id },
    style: { width: `${screen.size.width}px`, height: `${screen.size.height}px` } });
  applyThemeVariables(screenElement, uiDocument, themeId);
  screenElement.append(renderArea(screen.root, null));
  if (isEditor && screen.safeArea) {
    const { top = 0, bottom = 0, left = 0, right = 0 } = screen.safeArea;
    for (const [sideName, sideSize] of [['top', top], ['bottom', bottom], ['left', left], ['right', right]]) {
      if (sideSize > 0) screenElement.append(createElement('div', { className: `editor-safe-area is-${sideName}`, style: { [sideName === 'top' || sideName === 'bottom' ? 'height' : 'width']: `${sideSize}px` } }));
    }
  }
  return screenElement;
}

/**
 * Mesure la position et la taille de chaque area / widget d'un écran (pour le champ "frame" de l'export).
 * @param {object} uiDocument document
 * @param {object} screen écran
 * @param {string} themeId thème
 * @returns {Map<string, {x: number, y: number, width: number, height: number}>} frames par ID
 */
export function measureScreenFrames(uiDocument, screen, themeId) {
  const measuringHost = createElement('div', { style: { position: 'fixed', left: '-100000px', top: '0', visibility: 'hidden' } });
  const screenElement = renderScreen(uiDocument, screen, { themeId, isEditor: false, areIdsVisible: false, selectedId: null });
  measuringHost.append(screenElement);
  document.body.append(measuringHost);
  const screenRectangle = screenElement.getBoundingClientRect();
  const framesById = new Map();
  for (const nodeElement of screenElement.querySelectorAll('[data-node-id]')) {
    const nodeRectangle = nodeElement.getBoundingClientRect();
    framesById.set(nodeElement.dataset.nodeId, {
      x: Math.round(nodeRectangle.left - screenRectangle.left), y: Math.round(nodeRectangle.top - screenRectangle.top),
      width: Math.round(nodeRectangle.width), height: Math.round(nodeRectangle.height),
    });
  }
  measuringHost.remove();
  return framesById;
}
