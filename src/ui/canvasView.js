// Fenêtre centrale : affichage de l'écran courant, zoom / déplacement, sélection, glisser-déposer (PROTOTYPE).
// Pencil / souris = outil (sélection, déplacement) ; doigt = navigation (1 doigt glisse, 2 doigts zooment) ;
// un tap du doigt sélectionne aussi.
import { createElement } from '../utils/dom.js';
import { appSettings, appState, commitChange, notifyChange, selectNode } from '../model/store.js';
import { buildNodeIndex, isWidgetHolder } from '../model/document.js';
import { renderScreen } from '../render/screenRenderer.js';
import { moveWidget, placeLibraryItem } from './editorActions.js';

const DRAG_THRESHOLD_PIXELS = 6;
const MINIMUM_SCALE = 0.05;
const MAXIMUM_SCALE = 8;
const FIT_MARGIN_PIXELS = 48;
const MINIMUM_AREA_SIZE = 24;
const MINIMUM_WIDGET_SIZE = 4;
const RESIZE_DIRECTIONS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const ANCHOR_HORIZONTAL_PART = { topLeft: 'left', left: 'left', bottomLeft: 'left', top: 'center', center: 'center', bottom: 'center', topRight: 'right', right: 'right', bottomRight: 'right', stretch: 'stretch' };
const ANCHOR_VERTICAL_PART = { topLeft: 'top', top: 'top', topRight: 'top', left: 'center', center: 'center', right: 'center', bottomLeft: 'bottom', bottom: 'bottom', bottomRight: 'bottom', stretch: 'stretch' };

const viewTransform = { offsetX: 0, offsetY: 0, scale: 1 };
const activePointers = new Map();
let currentGesture = null;
let viewportElement = null;
let stageElement = null;
let lastFittedScreenKey = null;
let overlayElement = null;

/** Applique le zoom / déplacement courant à la scène. */
function applyViewTransform() {
  stageElement.style.transform = `translate(${viewTransform.offsetX}px, ${viewTransform.offsetY}px) scale(${viewTransform.scale})`;
  stageElement.style.setProperty('--inverse-scale', String(1 / viewTransform.scale));
}

/** @returns {object|undefined} écran courant */
function getCurrentScreen() {
  return appState.uiDocument.screens.find((screen) => screen.id === appState.currentScreenId);
}

/** Cadre l'écran courant dans la fenêtre centrale. */
export function fitScreenInView() {
  const screen = getCurrentScreen();
  if (!screen || !viewportElement) return;
  const viewportRectangle = viewportElement.getBoundingClientRect();
  const availableWidth = Math.max(100, viewportRectangle.width - FIT_MARGIN_PIXELS * 2);
  const availableHeight = Math.max(100, viewportRectangle.height - FIT_MARGIN_PIXELS * 2);
  viewTransform.scale = Math.min(availableWidth / screen.size.width, availableHeight / screen.size.height, 2);
  viewTransform.offsetX = (viewportRectangle.width - screen.size.width * viewTransform.scale) / 2;
  viewTransform.offsetY = (viewportRectangle.height - screen.size.height * viewTransform.scale) / 2 + 8;
  applyViewTransform();
}

/**
 * Zoome autour d'un point de la fenêtre centrale.
 * @param {number} newScale nouvelle échelle
 * @param {number} pivotX point (px dans la fenêtre)
 * @param {number} pivotY point (px dans la fenêtre)
 */
function zoomAroundPoint(newScale, pivotX, pivotY) {
  const clampedScale = Math.max(MINIMUM_SCALE, Math.min(MAXIMUM_SCALE, newScale));
  viewTransform.offsetX = pivotX - (pivotX - viewTransform.offsetX) * (clampedScale / viewTransform.scale);
  viewTransform.offsetY = pivotY - (pivotY - viewTransform.offsetY) * (clampedScale / viewTransform.scale);
  viewTransform.scale = clampedScale;
  applyViewTransform();
}

/**
 * Convertit le rectangle d'un élément en coordonnées de la scène (indépendantes du zoom).
 * @param {Element} element élément
 * @returns {{x: number, y: number, width: number, height: number}} rectangle
 */
function measureInStage(element) {
  const stageRectangle = stageElement.getBoundingClientRect();
  const elementRectangle = element.getBoundingClientRect();
  return {
    x: (elementRectangle.left - stageRectangle.left) / viewTransform.scale, y: (elementRectangle.top - stageRectangle.top) / viewTransform.scale,
    width: elementRectangle.width / viewTransform.scale, height: elementRectangle.height / viewTransform.scale,
  };
}

/**
 * Crée les poignées : une poignée (avec l'ID) au-dessus de chaque widget pour le sélectionner / déplacer,
 * et 8 poignées de redimensionnement autour du widget sélectionné. Taille constante à l'écran (réglages de l'app).
 * @param {HTMLElement} screenElement rendu de l'écran
 */
function buildWidgetHandles(screenElement) {
  for (const widgetElement of screenElement.querySelectorAll('.ui-widget[data-node-id]')) {
    const widgetId = widgetElement.dataset.nodeId;
    const widgetBox = measureInStage(widgetElement);
    const isSelected = widgetId === appState.selectedId;
    overlayElement.append(createElement('div', {
      className: `editor-widget-handle${isSelected ? ' is-selected' : ''}`, text: widgetId,
      dataset: { handleWidgetId: widgetId }, style: { left: `${widgetBox.x}px`, top: `${widgetBox.y}px` },
    }));
    if (!isSelected) continue;
    for (const resizeDirection of RESIZE_DIRECTIONS) {
      const handleX = widgetBox.x + (resizeDirection.includes('w') ? 0 : resizeDirection.includes('e') ? widgetBox.width : widgetBox.width / 2);
      const handleY = widgetBox.y + (resizeDirection.includes('n') ? 0 : resizeDirection.includes('s') ? widgetBox.height : widgetBox.height / 2);
      overlayElement.append(createElement('div', {
        className: `editor-resize-handle is-${resizeDirection}`,
        dataset: { resizeWidgetId: widgetId, resizeDirection }, style: { left: `${handleX}px`, top: `${handleY}px` },
      }));
    }
  }
}

/**
 * Prépare le redimensionnement d'un widget par une poignée.
 * @param {HTMLElement} handleElement poignée de redimensionnement
 * @param {PointerEvent} pointerEvent pointerdown
 * @returns {object} geste
 */
function createResizeGesture(handleElement, pointerEvent) {
  const widgetId = handleElement.dataset.resizeWidgetId;
  const widgetElement = stageElement.querySelector(`.ui-screen [data-node-id="${widgetId}"]`);
  const widgetBox = measureInStage(widgetElement);
  return {
    kind: 'resize', pointerId: pointerEvent.pointerId, widgetId, widgetElement, direction: handleElement.dataset.resizeDirection,
    isFreeLayout: widgetElement.parentElement?.dataset.layoutMode === 'free',
    startX: pointerEvent.clientX, startY: pointerEvent.clientY, startWidth: widgetBox.width, startHeight: widgetBox.height,
    newWidth: null, newHeight: null,
  };
}

/**
 * Met à jour l'aperçu pendant un redimensionnement.
 * @param {object} resizeGesture geste
 * @param {PointerEvent} pointerEvent pointermove
 */
function updateResizeGesture(resizeGesture, pointerEvent) {
  const deltaX = (pointerEvent.clientX - resizeGesture.startX) / viewTransform.scale;
  const deltaY = (pointerEvent.clientY - resizeGesture.startY) / viewTransform.scale;
  const { direction, widgetElement } = resizeGesture;
  if (direction.includes('e') || direction.includes('w')) {
    resizeGesture.newWidth = Math.max(MINIMUM_WIDGET_SIZE, resizeGesture.startWidth + (direction.includes('e') ? deltaX : -deltaX));
    widgetElement.style.width = `${resizeGesture.newWidth}px`;
    widgetElement.style.flex = 'none';
  }
  if (direction.includes('n') || direction.includes('s')) {
    resizeGesture.newHeight = Math.max(MINIMUM_WIDGET_SIZE, resizeGesture.startHeight + (direction.includes('s') ? deltaY : -deltaY));
    widgetElement.style.height = `${resizeGesture.newHeight}px`;
    widgetElement.style.flex = 'none';
  }
  if (resizeGesture.isFreeLayout) {
    const shiftX = direction.includes('w') ? resizeGesture.startWidth - (resizeGesture.newWidth ?? resizeGesture.startWidth) : 0;
    const shiftY = direction.includes('n') ? resizeGesture.startHeight - (resizeGesture.newHeight ?? resizeGesture.startHeight) : 0;
    widgetElement.style.translate = `${shiftX}px ${shiftY}px`;
  }
}

/**
 * Calcule le nouveau décalage libre sur un axe après redimensionnement, selon l'ancrage.
 * @param {number} offset décalage actuel (x ou y)
 * @param {string} anchorPart partie de l'ancrage sur cet axe (left/top, center, right/bottom, stretch)
 * @param {boolean} isStartSide vrai si on a tiré le côté gauche / haut
 * @param {number} sizeDelta variation de taille
 * @returns {number} nouveau décalage
 */
function computeOffsetAfterResize(offset, anchorPart, isStartSide, sizeDelta) {
  if (anchorPart === 'left' || anchorPart === 'top') return isStartSide ? offset - sizeDelta : offset;
  if (anchorPart === 'right' || anchorPart === 'bottom') return isStartSide ? offset : offset - sizeDelta;
  if (anchorPart === 'center') return offset + (isStartSide ? -sizeDelta / 2 : sizeDelta / 2);
  return offset;
}

/**
 * Enregistre la nouvelle taille (en px fixes) et, en mode libre, le décalage qui garde le côté opposé en place.
 * @param {object} resizeGesture geste terminé
 */
function commitResizeGesture(resizeGesture) {
  if (resizeGesture.newWidth === null && resizeGesture.newHeight === null) { notifyChange(); return; }
  commitChange((uiDocument) => {
    const widget = buildNodeIndex(uiDocument).get(resizeGesture.widgetId)?.node;
    if (!widget) return;
    widget.size ??= {};
    const { direction } = resizeGesture;
    const placement = widget.placement ?? { anchor: 'topLeft', x: 0, y: 0 };
    const anchorName = placement.anchor ?? 'topLeft';
    if (resizeGesture.newWidth !== null) {
      widget.size.width = Math.round(resizeGesture.newWidth);
      if (resizeGesture.isFreeLayout) placement.x = Math.round(computeOffsetAfterResize(placement.x ?? 0, ANCHOR_HORIZONTAL_PART[anchorName], direction.includes('w'), resizeGesture.newWidth - resizeGesture.startWidth));
    }
    if (resizeGesture.newHeight !== null) {
      widget.size.height = Math.round(resizeGesture.newHeight);
      if (resizeGesture.isFreeLayout) placement.y = Math.round(computeOffsetAfterResize(placement.y ?? 0, ANCHOR_VERTICAL_PART[anchorName], direction.includes('n'), resizeGesture.newHeight - resizeGesture.startHeight));
    }
    if (resizeGesture.isFreeLayout) widget.placement = placement;
  });
}

/**
 * Liste les positions (px écran, axe du séparateur) des autres séparateurs de même sens, pour l'aimantation.
 * @param {HTMLElement} draggedSplitter séparateur déplacé
 * @param {boolean} isHorizontal vrai pour un séparateur vertical (areas côte à côte)
 * @returns {number[]} positions
 */
function collectSnapTargets(draggedSplitter, isHorizontal) {
  const orientationClass = isHorizontal ? '.ui-splitter.is-horizontal' : '.ui-splitter.is-vertical';
  return [...stageElement.querySelectorAll(orientationClass)]
    .filter((splitterElement) => splitterElement !== draggedSplitter)
    .map((splitterElement) => {
      const splitterRectangle = splitterElement.getBoundingClientRect();
      return isHorizontal ? splitterRectangle.left : splitterRectangle.top;
    });
}

/**
 * Affiche ou cache le repère d'aimantation.
 * @param {number|null} clientPosition position du repère (px écran) ou null pour le cacher
 * @param {boolean} isHorizontal sens du séparateur
 */
function showSnapGuide(clientPosition, isHorizontal) {
  overlayElement.querySelector('.editor-snap-guide')?.remove();
  if (clientPosition === null) return;
  const stageRectangle = stageElement.getBoundingClientRect();
  const screenElement = stageElement.querySelector('.ui-screen');
  const stagePosition = (clientPosition - (isHorizontal ? stageRectangle.left : stageRectangle.top)) / viewTransform.scale;
  overlayElement.append(createElement('div', {
    className: `editor-snap-guide ${isHorizontal ? 'is-vertical-line' : 'is-horizontal-line'}`,
    style: isHorizontal ? { left: `${stagePosition}px`, height: `${screenElement.offsetHeight}px` } : { top: `${stagePosition}px`, width: `${screenElement.offsetWidth}px` },
  }));
}

/**
 * Cache les poignées pendant un déplacement / redimensionnement (elles ne suivent pas l'aperçu).
 * @param {boolean} isActive vrai pendant le geste
 */
function setGestureActive(isActive) {
  viewportElement.classList.toggle('is-gesture-active', isActive);
}

/** Redessine l'écran courant (après chaque changement). */
export function renderCanvasView() {
  const screen = getCurrentScreen();
  stageElement.replaceChildren();
  if (!screen) return;
  const screenTitle = createElement('div', {
    className: `canvas-screen-title${appState.selectedId === screen.id ? ' is-selected' : ''}`,
    text: `${screen.id} · ${screen.name} — ${screen.size.width}×${screen.size.height} · ${screen.platform}`,
    dataset: { selectScreenId: screen.id },
  });
  const screenElement = renderScreen(appState.uiDocument, screen, {
    themeId: appState.currentThemeId, isEditor: true, areIdsVisible: appState.areIdsVisible, selectedId: appState.selectedId,
  });
  overlayElement = createElement('div', { className: 'editor-overlay' });
  stageElement.append(screenTitle, screenElement, overlayElement);
  stageElement.style.setProperty('--handle-size', String(appSettings.handleSize));
  stageElement.style.setProperty('--resize-handle-size', String(appSettings.resizeHandleSize));
  buildWidgetHandles(screenElement);
  viewportElement.classList.toggle('is-placing', Boolean(appState.armedLibraryItem));
  const screenKey = `${screen.id}:${screen.size.width}x${screen.size.height}`;
  if (screenKey !== lastFittedScreenKey) {
    lastFittedScreenKey = screenKey;
    requestAnimationFrame(fitScreenInView);
  }
}

/**
 * Trouve l'area ou le conteneur qui peut recevoir un widget sous un point de l'écran.
 * @param {number} clientX position
 * @param {number} clientY position
 * @param {string|null} excludedWidgetId widget déplacé (ne peut pas se recevoir lui-même)
 * @returns {{holderId: string, holderElement: HTMLElement}|null} cible
 */
function findDropHolder(clientX, clientY, excludedWidgetId) {
  const nodeIndex = buildNodeIndex(appState.uiDocument);
  for (const hitElement of document.elementsFromPoint(clientX, clientY)) {
    if (!stageElement.contains(hitElement) || overlayElement?.contains(hitElement)) continue;
    let candidateElement = hitElement.closest('[data-node-id]');
    while (candidateElement && stageElement.contains(candidateElement)) {
      const candidateId = candidateElement.dataset.nodeId;
      const isInsideDraggedWidget = excludedWidgetId && candidateElement.closest(`[data-node-id="${excludedWidgetId}"]`);
      const record = nodeIndex.get(candidateId);
      if (!isInsideDraggedWidget && record && record.kind !== 'screen' && isWidgetHolder(record.node)) {
        return { holderId: candidateId, holderElement: candidateElement };
      }
      candidateElement = candidateElement.parentElement?.closest('[data-node-id]');
    }
    return null;
  }
  return null;
}

/**
 * Calcule la position d'insertion dans une pile ou une grille (sans compter le widget déplacé).
 * @param {HTMLElement} holderElement élément cible
 * @param {number} clientX position
 * @param {number} clientY position
 * @param {string|null} excludedWidgetId widget déplacé
 * @returns {number} index d'insertion
 */
function computeInsertIndex(holderElement, clientX, clientY, excludedWidgetId) {
  const childElements = [...holderElement.children].filter((childElement) => childElement.dataset.nodeId && childElement.dataset.nodeId !== excludedWidgetId);
  const layoutMode = holderElement.dataset.layoutMode;
  const isHorizontal = holderElement.dataset.layoutDirection === 'horizontal';
  for (let childIndex = 0; childIndex < childElements.length; childIndex += 1) {
    const childRectangle = childElements[childIndex].getBoundingClientRect();
    const isBefore = layoutMode === 'grid'
      ? clientY < childRectangle.top + childRectangle.height / 2 || (clientY <= childRectangle.bottom && clientX < childRectangle.left + childRectangle.width / 2)
      : isHorizontal ? clientX < childRectangle.left + childRectangle.width / 2 : clientY < childRectangle.top + childRectangle.height / 2;
    if (isBefore) return childIndex;
  }
  return childElements.length;
}

/**
 * Calcule un placement libre (ancrage haut-gauche) à partir d'un point.
 * @param {HTMLElement} holderElement élément cible
 * @param {number} clientX position
 * @param {number} clientY position
 * @param {number} grabOffsetX décalage de prise dans le widget (px écran)
 * @param {number} grabOffsetY décalage de prise dans le widget (px écran)
 * @returns {{anchor: string, x: number, y: number}} placement
 */
function computeFreePlacement(holderElement, clientX, clientY, grabOffsetX, grabOffsetY) {
  const holderRectangle = holderElement.getBoundingClientRect();
  return {
    anchor: 'topLeft',
    x: Math.round((clientX - holderRectangle.left - grabOffsetX) / viewTransform.scale),
    y: Math.round((clientY - holderRectangle.top - grabOffsetY) / viewTransform.scale),
  };
}

/**
 * Met en évidence la cible de dépôt.
 * @param {HTMLElement|null} holderElement cible (null = aucune)
 */
function highlightDropHolder(holderElement) {
  for (const highlightedElement of stageElement.querySelectorAll('.is-drop-target')) highlightedElement.classList.remove('is-drop-target');
  holderElement?.classList.add('is-drop-target');
}

/**
 * Dépose un élément de bibliothèque à un point de l'écran.
 * @param {{kind: string, value: string}} libraryItem élément
 * @param {number} clientX position
 * @param {number} clientY position
 * @returns {boolean} vrai si déposé
 */
function dropLibraryItemAt(libraryItem, clientX, clientY) {
  const dropHolder = findDropHolder(clientX, clientY, null);
  if (!dropHolder) return false;
  const isFreeLayout = dropHolder.holderElement.dataset.layoutMode === 'free';
  placeLibraryItem(libraryItem, dropHolder.holderId,
    isFreeLayout ? undefined : computeInsertIndex(dropHolder.holderElement, clientX, clientY, null),
    isFreeLayout ? computeFreePlacement(dropHolder.holderElement, clientX, clientY, 0, 0) : undefined);
  return true;
}

/**
 * Commence le glisser d'un élément de bibliothèque (depuis la fenêtre de droite).
 * @param {{kind: string, value: string, label: string}} libraryItem élément
 * @param {PointerEvent} startEvent pointerdown d'origine
 */
export function startLibraryDrag(libraryItem, startEvent) {
  const startX = startEvent.clientX;
  const startY = startEvent.clientY;
  let ghostElement = null;
  const handlePointerMove = (moveEvent) => {
    if (moveEvent.pointerId !== startEvent.pointerId) return;
    if (!ghostElement && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > DRAG_THRESHOLD_PIXELS) {
      ghostElement = createElement('div', { className: 'library-drag-ghost', text: libraryItem.label });
      document.body.append(ghostElement);
    }
    if (!ghostElement) return;
    ghostElement.style.left = `${moveEvent.clientX}px`;
    ghostElement.style.top = `${moveEvent.clientY}px`;
    highlightDropHolder(findDropHolder(moveEvent.clientX, moveEvent.clientY, null)?.holderElement ?? null);
  };
  const handlePointerEnd = (endEvent) => {
    if (endEvent.pointerId !== startEvent.pointerId) return;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerEnd);
    window.removeEventListener('pointercancel', handlePointerEnd);
    highlightDropHolder(null);
    if (!ghostElement) {
      appState.armedLibraryItem = appState.armedLibraryItem?.value === libraryItem.value && appState.armedLibraryItem?.kind === libraryItem.kind ? null : libraryItem;
      notifyChange();
      return;
    }
    ghostElement.remove();
    if (endEvent.type === 'pointerup') dropLibraryItemAt(libraryItem, endEvent.clientX, endEvent.clientY);
  };
  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', handlePointerEnd);
  window.addEventListener('pointercancel', handlePointerEnd);
}

/**
 * Renvoie l'ID du nœud touché (widget, area) ou de l'écran (titre).
 * @param {EventTarget} eventTarget cible du pointeur
 * @returns {string|null} ID
 */
function findHitNodeId(eventTarget) {
  if (!(eventTarget instanceof Element)) return null;
  const screenTitle = eventTarget.closest('[data-select-screen-id]');
  if (screenTitle) return screenTitle.dataset.selectScreenId;
  return eventTarget.closest('[data-node-id]')?.dataset.nodeId ?? null;
}

/**
 * Prépare le déplacement d'un séparateur d'areas.
 * @param {HTMLElement} splitterElement séparateur
 * @param {PointerEvent} pointerEvent pointerdown
 * @returns {object} geste
 */
function createSplitterGesture(splitterElement, pointerEvent) {
  const isHorizontal = splitterElement.classList.contains('is-horizontal');
  const previousElement = splitterElement.previousElementSibling;
  const nextElement = splitterElement.nextElementSibling;
  const previousRectangle = previousElement.getBoundingClientRect();
  const nextRectangle = nextElement.getBoundingClientRect();
  const parentRectangle = splitterElement.parentElement.getBoundingClientRect();
  return {
    kind: 'splitter', pointerId: pointerEvent.pointerId, isHorizontal, previousElement,
    splitParentId: splitterElement.dataset.splitParentId, previousIndex: Number(splitterElement.dataset.previousIndex),
    startCoordinate: isHorizontal ? pointerEvent.clientX : pointerEvent.clientY,
    previousStartSize: (isHorizontal ? previousRectangle.width : previousRectangle.height) / viewTransform.scale,
    nextStartSize: (isHorizontal ? nextRectangle.width : nextRectangle.height) / viewTransform.scale,
    parentSize: (isHorizontal ? parentRectangle.width : parentRectangle.height) / viewTransform.scale,
    newPreviousSize: null,
    previousStartClient: isHorizontal ? previousRectangle.left : previousRectangle.top,
    snapTargets: collectSnapTargets(splitterElement, isHorizontal),
  };
}

/**
 * Enregistre la nouvelle taille après un déplacement de séparateur, selon le mode de taille des areas.
 * @param {object} splitterGesture geste terminé
 */
function commitSplitterGesture(splitterGesture) {
  if (splitterGesture.newPreviousSize === null) return;
  commitChange((uiDocument) => {
    const parentArea = buildNodeIndex(uiDocument).get(splitterGesture.splitParentId)?.node;
    const previousArea = parentArea?.children[splitterGesture.previousIndex];
    const nextArea = parentArea?.children[splitterGesture.previousIndex + 1];
    if (!previousArea || !nextArea) return;
    previousArea.sizing ??= { mode: 'fill' };
    nextArea.sizing ??= { mode: 'fill' };
    const { min: minimumSize, max: maximumSize } = previousArea.sizing;
    if (typeof minimumSize === 'number') splitterGesture.newPreviousSize = Math.max(minimumSize, splitterGesture.newPreviousSize);
    if (typeof maximumSize === 'number') splitterGesture.newPreviousSize = Math.min(maximumSize, splitterGesture.newPreviousSize);
    const sizeDelta = splitterGesture.newPreviousSize - splitterGesture.previousStartSize;
    if (previousArea.sizing.mode === 'proportional') {
      previousArea.sizing.ratio = Math.round((splitterGesture.newPreviousSize / splitterGesture.parentSize) * 1000) / 1000;
    } else if (previousArea.sizing.mode === 'fixed') {
      previousArea.sizing.size = Math.round(splitterGesture.newPreviousSize);
    } else if (nextArea.sizing.mode === 'fixed') {
      nextArea.sizing.size = Math.max(MINIMUM_AREA_SIZE, Math.round(splitterGesture.nextStartSize - sizeDelta));
    } else if (nextArea.sizing.mode === 'proportional') {
      nextArea.sizing.ratio = Math.round(((splitterGesture.nextStartSize - sizeDelta) / splitterGesture.parentSize) * 1000) / 1000;
    } else {
      previousArea.sizing = { ...previousArea.sizing, mode: 'fixed', size: Math.round(splitterGesture.newPreviousSize) };
    }
  });
}

/**
 * Prépare le déplacement d'un widget du canevas.
 * @param {string} widgetId widget
 * @param {PointerEvent} pointerEvent pointerdown
 * @returns {object} geste (« en attente » tant que le seuil n'est pas franchi)
 */
function createWidgetGesture(widgetId, pointerEvent) {
  const widgetElement = stageElement.querySelector(`[data-node-id="${widgetId}"]`);
  const widgetRectangle = widgetElement.getBoundingClientRect();
  return {
    kind: 'pendingWidget', pointerId: pointerEvent.pointerId, widgetId, widgetElement,
    startX: pointerEvent.clientX, startY: pointerEvent.clientY,
    grabOffsetX: pointerEvent.clientX - widgetRectangle.left, grabOffsetY: pointerEvent.clientY - widgetRectangle.top,
  };
}

/**
 * Termine le déplacement d'un widget : même area libre → décalage ; sinon nouvelle place.
 * @param {object} widgetGesture geste
 * @param {number} clientX position finale
 * @param {number} clientY position finale
 */
function finishWidgetDrag(widgetGesture, clientX, clientY) {
  const nodeIndex = buildNodeIndex(appState.uiDocument);
  const widgetRecord = nodeIndex.get(widgetGesture.widgetId);
  const dropHolder = findDropHolder(clientX, clientY, widgetGesture.widgetId);
  if (!widgetRecord || !dropHolder) { notifyChange(); return; }
  const isFreeLayout = dropHolder.holderElement.dataset.layoutMode === 'free';
  if (isFreeLayout && dropHolder.holderId === widgetRecord.parent.id) {
    const deltaX = (clientX - widgetGesture.startX) / viewTransform.scale;
    const deltaY = (clientY - widgetGesture.startY) / viewTransform.scale;
    commitChange((uiDocument) => {
      const widget = buildNodeIndex(uiDocument).get(widgetGesture.widgetId).node;
      const placement = widget.placement ??= { anchor: 'topLeft', x: 0, y: 0 };
      const anchorName = placement.anchor ?? 'topLeft';
      const horizontalSign = /Right$|^right$/.test(anchorName) ? -1 : 1;
      const verticalSign = /^bottom/.test(anchorName) ? -1 : 1;
      if (anchorName !== 'stretch') {
        placement.x = Math.round((placement.x ?? 0) + deltaX * horizontalSign);
        placement.y = Math.round((placement.y ?? 0) + deltaY * verticalSign);
      }
    });
    return;
  }
  const insertIndex = isFreeLayout ? undefined : computeInsertIndex(dropHolder.holderElement, clientX, clientY, widgetGesture.widgetId);
  const placement = isFreeLayout
    ? computeFreePlacement(dropHolder.holderElement, clientX, clientY, widgetGesture.grabOffsetX, widgetGesture.grabOffsetY)
    : null;
  moveWidget(widgetGesture.widgetId, dropHolder.holderId, insertIndex, placement);
}

/**
 * Place l'élément de bibliothèque « armé » (tap dans la bibliothèque puis tap sur le canevas).
 * @param {number} clientX position
 * @param {number} clientY position
 */
function placeArmedItemAt(clientX, clientY) {
  const armedLibraryItem = appState.armedLibraryItem;
  appState.armedLibraryItem = null;
  if (!dropLibraryItemAt(armedLibraryItem, clientX, clientY)) notifyChange();
}

/**
 * Gère pointerdown dans la fenêtre centrale.
 * @param {PointerEvent} pointerEvent événement
 */
function handlePointerDown(pointerEvent) {
  activePointers.set(pointerEvent.pointerId, { x: pointerEvent.clientX, y: pointerEvent.clientY, type: pointerEvent.pointerType });
  viewportElement.setPointerCapture(pointerEvent.pointerId);
  const touchPointers = [...activePointers.values()].filter((pointer) => pointer.type === 'touch');
  if (pointerEvent.pointerType === 'touch' && touchPointers.length === 2) {
    const [firstTouch, secondTouch] = touchPointers;
    currentGesture = { kind: 'pinch', startDistance: Math.hypot(firstTouch.x - secondTouch.x, firstTouch.y - secondTouch.y),
      startScale: viewTransform.scale, lastCenterX: (firstTouch.x + secondTouch.x) / 2, lastCenterY: (firstTouch.y + secondTouch.y) / 2 };
    return;
  }
  if (currentGesture) return;
  const startPoint = { pointerId: pointerEvent.pointerId, startX: pointerEvent.clientX, startY: pointerEvent.clientY, lastX: pointerEvent.clientX, lastY: pointerEvent.clientY };
  const handleElement = pointerEvent.target instanceof Element ? pointerEvent.target.closest('.editor-widget-handle, .editor-resize-handle') : null;
  if (handleElement?.dataset.resizeWidgetId) { currentGesture = createResizeGesture(handleElement, pointerEvent); setGestureActive(true); return; }
  if (handleElement?.dataset.handleWidgetId) { currentGesture = createWidgetGesture(handleElement.dataset.handleWidgetId, pointerEvent); return; }
  if (pointerEvent.pointerType === 'touch') { currentGesture = { kind: 'pendingTouch', target: pointerEvent.target, ...startPoint }; return; }
  if (pointerEvent.button === 1 || pointerEvent.button === 2) { currentGesture = { kind: 'pan', ...startPoint }; return; }
  if (appState.armedLibraryItem) { currentGesture = { kind: 'pendingPlace', ...startPoint }; return; }
  const splitterElement = pointerEvent.target instanceof Element ? pointerEvent.target.closest('.ui-splitter') : null;
  if (splitterElement) { currentGesture = createSplitterGesture(splitterElement, pointerEvent); setGestureActive(true); return; }
  const hitNodeId = findHitNodeId(pointerEvent.target);
  const hitRecord = hitNodeId ? buildNodeIndex(appState.uiDocument).get(hitNodeId) : null;
  if (hitRecord?.kind === 'widget') { currentGesture = createWidgetGesture(hitNodeId, pointerEvent); return; }
  currentGesture = { kind: hitNodeId ? 'pendingSelect' : 'pendingBackground', hitNodeId, ...startPoint };
}

/**
 * Gère pointermove dans la fenêtre centrale.
 * @param {PointerEvent} pointerEvent événement
 */
function handlePointerMove(pointerEvent) {
  const trackedPointer = activePointers.get(pointerEvent.pointerId);
  if (!trackedPointer || !currentGesture) return;
  trackedPointer.x = pointerEvent.clientX;
  trackedPointer.y = pointerEvent.clientY;
  if (currentGesture.kind === 'pinch') {
    const touchPointers = [...activePointers.values()].filter((pointer) => pointer.type === 'touch');
    if (touchPointers.length < 2) return;
    const [firstTouch, secondTouch] = touchPointers;
    const centerX = (firstTouch.x + secondTouch.x) / 2;
    const centerY = (firstTouch.y + secondTouch.y) / 2;
    const viewportRectangle = viewportElement.getBoundingClientRect();
    viewTransform.offsetX += centerX - currentGesture.lastCenterX;
    viewTransform.offsetY += centerY - currentGesture.lastCenterY;
    currentGesture.lastCenterX = centerX;
    currentGesture.lastCenterY = centerY;
    const distance = Math.hypot(firstTouch.x - secondTouch.x, firstTouch.y - secondTouch.y);
    zoomAroundPoint(currentGesture.startScale * (distance / currentGesture.startDistance), centerX - viewportRectangle.left, centerY - viewportRectangle.top);
    return;
  }
  if (pointerEvent.pointerId !== currentGesture.pointerId) return;
  const movedDistance = Math.hypot(pointerEvent.clientX - currentGesture.startX, pointerEvent.clientY - currentGesture.startY);
  if ((currentGesture.kind === 'pendingTouch' || currentGesture.kind === 'pendingBackground' || currentGesture.kind === 'pendingSelect') && movedDistance > DRAG_THRESHOLD_PIXELS) {
    currentGesture.kind = 'pan';
  }
  if (currentGesture.kind === 'pan') {
    viewTransform.offsetX += pointerEvent.clientX - currentGesture.lastX;
    viewTransform.offsetY += pointerEvent.clientY - currentGesture.lastY;
    currentGesture.lastX = pointerEvent.clientX;
    currentGesture.lastY = pointerEvent.clientY;
    applyViewTransform();
  } else if (currentGesture.kind === 'pendingWidget' && movedDistance > DRAG_THRESHOLD_PIXELS) {
    currentGesture.kind = 'dragWidget';
    currentGesture.widgetElement.classList.add('is-dragging');
    setGestureActive(true);
  }
  if (currentGesture.kind === 'dragWidget') {
    const baseTransform = currentGesture.baseTransform ??= currentGesture.widgetElement.style.transform || '';
    const deltaX = (pointerEvent.clientX - currentGesture.startX) / viewTransform.scale;
    const deltaY = (pointerEvent.clientY - currentGesture.startY) / viewTransform.scale;
    currentGesture.widgetElement.style.transform = `translate(${deltaX}px, ${deltaY}px) ${baseTransform}`;
    highlightDropHolder(findDropHolder(pointerEvent.clientX, pointerEvent.clientY, currentGesture.widgetId)?.holderElement ?? null);
  } else if (currentGesture.kind === 'splitter') {
    const coordinate = currentGesture.isHorizontal ? pointerEvent.clientX : pointerEvent.clientY;
    const newSize = Math.max(MINIMUM_AREA_SIZE, currentGesture.previousStartSize + (coordinate - currentGesture.startCoordinate) / viewTransform.scale);
    currentGesture.newPreviousSize = Math.min(newSize, currentGesture.previousStartSize + currentGesture.nextStartSize - MINIMUM_AREA_SIZE);
    const splitterClientPosition = currentGesture.previousStartClient + currentGesture.newPreviousSize * viewTransform.scale;
    const snapTarget = currentGesture.snapTargets.find((targetPosition) => Math.abs(targetPosition - splitterClientPosition) <= appSettings.snapDistance);
    if (snapTarget !== undefined) currentGesture.newPreviousSize = (snapTarget - currentGesture.previousStartClient) / viewTransform.scale;
    showSnapGuide(snapTarget ?? null, currentGesture.isHorizontal);
    currentGesture.previousElement.style.flex = `0 0 ${currentGesture.newPreviousSize}px`;
  } else if (currentGesture.kind === 'resize') {
    updateResizeGesture(currentGesture, pointerEvent);
  }
}

/**
 * Gère pointerup / pointercancel dans la fenêtre centrale.
 * @param {PointerEvent} pointerEvent événement
 */
function handlePointerEnd(pointerEvent) {
  activePointers.delete(pointerEvent.pointerId);
  if (!currentGesture) return;
  if (currentGesture.kind === 'pinch') {
    if (activePointers.size === 0) currentGesture = null;
    return;
  }
  if (pointerEvent.pointerId !== currentGesture.pointerId) return;
  const finishedGesture = currentGesture;
  currentGesture = null;
  const isCancelled = pointerEvent.type === 'pointercancel';
  setGestureActive(false);
  highlightDropHolder(null);
  if (isCancelled) { notifyChange(); return; }
  if (finishedGesture.kind === 'pendingTouch') {
    if (appState.armedLibraryItem) placeArmedItemAt(pointerEvent.clientX, pointerEvent.clientY);
    else selectNode(findHitNodeId(finishedGesture.target));
  } else if (finishedGesture.kind === 'pendingPlace') {
    placeArmedItemAt(pointerEvent.clientX, pointerEvent.clientY);
  } else if (finishedGesture.kind === 'pendingSelect' || finishedGesture.kind === 'pendingWidget') {
    selectNode(finishedGesture.hitNodeId ?? finishedGesture.widgetId);
  } else if (finishedGesture.kind === 'pendingBackground') {
    selectNode(null);
  } else if (finishedGesture.kind === 'dragWidget') {
    finishWidgetDrag(finishedGesture, pointerEvent.clientX, pointerEvent.clientY);
  } else if (finishedGesture.kind === 'splitter') {
    commitSplitterGesture(finishedGesture);
  } else if (finishedGesture.kind === 'resize') {
    commitResizeGesture(finishedGesture);
    if (finishedGesture.newPreviousSize === null) selectNode(finishedGesture.splitParentId);
  }
}

/**
 * Gère la molette : Ctrl / pincement du pavé tactile = zoom, sinon déplacement.
 * @param {WheelEvent} wheelEvent événement
 */
function handleWheel(wheelEvent) {
  wheelEvent.preventDefault();
  const viewportRectangle = viewportElement.getBoundingClientRect();
  if (wheelEvent.ctrlKey || wheelEvent.metaKey) {
    zoomAroundPoint(viewTransform.scale * Math.exp(-wheelEvent.deltaY * 0.01), wheelEvent.clientX - viewportRectangle.left, wheelEvent.clientY - viewportRectangle.top);
  } else {
    viewTransform.offsetX -= wheelEvent.deltaX;
    viewTransform.offsetY -= wheelEvent.deltaY;
    applyViewTransform();
  }
}

/**
 * Zoome depuis un bouton (centre de la fenêtre).
 * @param {number} zoomFactor facteur (ex. 1.25)
 */
export function zoomFromButton(zoomFactor) {
  const viewportRectangle = viewportElement.getBoundingClientRect();
  zoomAroundPoint(viewTransform.scale * zoomFactor, viewportRectangle.width / 2, viewportRectangle.height / 2);
}

/**
 * Crée la fenêtre centrale.
 * @returns {HTMLElement} élément
 */
export function createCanvasView() {
  stageElement = createElement('div', { className: 'canvas-stage' });
  viewportElement = createElement('div', { className: 'canvas-viewport', on: {
    pointerdown: handlePointerDown, pointermove: handlePointerMove, pointerup: handlePointerEnd, pointercancel: handlePointerEnd,
    wheel: handleWheel, contextmenu: (contextEvent) => contextEvent.preventDefault(),
  } }, [stageElement]);
  new ResizeObserver(() => { if (!currentGesture) fitScreenInView(); }).observe(viewportElement);
  viewportElement.addEventListener('scroll', () => { viewportElement.scrollLeft = 0; viewportElement.scrollTop = 0; });
  return viewportElement;
}
