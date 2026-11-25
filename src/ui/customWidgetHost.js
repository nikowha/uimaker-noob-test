// Exécution des custom widgets en mode test : iframes isolées, sans réseau, dans un calque au-dessus de l'écran (PROTOTYPE).
// Le calque ne se redessine pas avec l'écran : sinon chaque changement relancerait les widgets, même en plein geste.
import { createElement } from '../utils/dom.js';
import { coerceParamValue, fillParams } from '../model/customWidgets.js';
import { interpolateWidget } from '../model/variables.js';
import { resolveColor } from '../render/styleResolver.js';

const WIDGET_POLICY = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; form-action 'none'; base-uri 'none'; webrtc 'block'";
const MESSAGE_MARK = 'uimaker-noob-widget';
const TAP_MOVE_TOLERANCE_PIXELS = 10;

/** Code fourni à chaque widget (objet « uimaker »). Écrit comme une vraie fonction, envoyée en texte. */
function installWidgetRuntime(MESSAGE_MARK, TAP_MOVE_TOLERANCE_PIXELS) {
  for (const networkName of ['RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCDataChannel']) {
    try { Object.defineProperty(window, networkName, { value: undefined }); } catch (error) { /* absent ou déjà protégé */ }
  }
  const updateListeners = [];
  const send = (type, data) => parent.postMessage({ mark: MESSAGE_MARK, type, ...data }, '*');
  const isNativeControl = (target) => target instanceof Element && target.closest('input, textarea, select, button, a, label, [data-native]') !== null;
  const runtime = {
    params: {}, theme: {}, size: { width: 0, height: 0 }, isEnabled: true,
    onUpdate(listener) { updateListeners.push(listener); if (runtime.isStarted) listener(runtime); },
    setParam(key, value) { runtime.params[key] = value; send('change', { key, value }); },
    emit(name, data) { send('event', { name, data: data === undefined ? null : JSON.parse(JSON.stringify(data)) }); },
    /** Suit un glisser (souris, doigt, Pencil), même hors du widget. */
    trackDrag(element, handlers) {
      let activeId = null;
      let lastEvent = null;
      const callHandler = (name, event, start) => { if (handlers[name]) handlers[name]({ x: event.clientX, y: event.clientY, deltaX: lastEvent ? event.clientX - lastEvent.clientX : 0, deltaY: lastEvent ? event.clientY - lastEvent.clientY : 0, pressure: event.pressure, pointerType: event.pointerType, isStart: start, event }); };
      element.style.touchAction = 'none';
      element.addEventListener('pointerdown', (event) => { if (activeId !== null || !runtime.isEnabled) return; activeId = event.pointerId; lastEvent = null; callHandler('onStart', event, true); lastEvent = event; });
      addEventListener('pointermove', (event) => { if (event.pointerId !== activeId) return; callHandler('onMove', event, false); lastEvent = event; });
      for (const endName of ['pointerup', 'pointercancel']) addEventListener(endName, (event) => { if (event.pointerId !== activeId) return; activeId = null; callHandler('onEnd', event, false); });
      addEventListener('blur', () => { activeId = null; });
    },
  };
  Object.defineProperty(window, 'uimaker', { value: runtime });
  addEventListener('message', (event) => {
    if (event.source !== parent || event.data?.mark !== MESSAGE_MARK) return;
    const { params, theme, size, isEnabled } = event.data;
    Object.assign(runtime, { params, theme, size, isEnabled, isStarted: true });
    for (const [name, color] of Object.entries(theme)) document.documentElement.style.setProperty('--' + name, color);
    for (const listener of updateListeners) listener(runtime);
  });
  // Sur iPad, sans cela, un second toucher rapproché bloque le geste (essai du 2026-11-25).
  for (const touchName of ['touchstart', 'touchmove', 'touchend']) document.addEventListener(touchName, (event) => { if (!isNativeControl(event.target)) event.preventDefault(); }, { passive: false });
  let pressStart = null;
  addEventListener('pointerdown', (event) => { pressStart = event; send('press', {}); }, true);
  addEventListener('pointerup', (event) => {
    if (pressStart && pressStart.pointerId === event.pointerId && Math.hypot(event.clientX - pressStart.clientX, event.clientY - pressStart.clientY) <= TAP_MOVE_TOLERANCE_PIXELS) send('tap', { pointerType: event.pointerType, x: event.clientX, y: event.clientY });
    pressStart = null;
  }, true);
  addEventListener('contextmenu', (event) => event.preventDefault());
  addEventListener('keydown', (event) => { if (event.key === 'Escape') send('escape', {}); });
  addEventListener('error', (event) => send('error', { message: String(event.message) }));
  addEventListener('unhandledrejection', (event) => send('error', { message: String(event.reason) }));
  addEventListener('load', () => send('ready', {}));
}

/**
 * Fabrique la page d'un widget.
 * @param {object} definition définition
 * @returns {string} HTML
 */
function createWidgetPage(definition) {
  const escapeScript = (code) => code.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${WIDGET_POLICY}">
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent;font:13px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}</style>
<style>${definition.css}</style><script>(${escapeScript(installWidgetRuntime.toString())})(${JSON.stringify(MESSAGE_MARK)}, ${TAP_MOVE_TOLERANCE_PIXELS});</script></head><body>${definition.html}<script>${escapeScript(definition.js)}
</script></body></html>`;
}

/**
 * Couleurs du thème, par nom de variable.
 * @param {object} uiDocument document
 * @param {string} themeId thème
 * @returns {Record<string, string>} couleurs
 */
function readThemeColors(uiDocument, themeId) {
  const colors = {};
  for (const [variableId, variable] of Object.entries(uiDocument.colorVariables ?? {})) {
    if (/^[A-Za-z][\w-]*$/.test(variable.name)) colors[variable.name] = resolveColor(uiDocument, `$${variableId}`, themeId) ?? '';
  }
  return colors;
}

/**
 * Donne à chaque custom widget une clé stable : sa position dans l'écran (les ID changent quand la copie est refaite).
 * @param {object} testDocument copie testée
 * @returns {Map<string, {key: string, node: object}>} ID → clé et widget
 */
function indexCustomWidgets(testDocument) {
  const widgetsById = new Map();
  const visitNode = (node, position) => {
    if (node.type === 'customWidget') widgetsById.set(node.id, { key: position, node });
    [...(node.children ?? []), ...(node.widgets ?? []), ...(node.root ? [node.root] : [])].forEach((childNode, childIndex) => visitNode(childNode, `${position}/${childIndex}:${childNode.name}`));
  };
  for (const screen of testDocument.screens) visitNode(screen, screen.id);
  return widgetsById;
}

/**
 * Partie visible d'un élément, coupée par ses parents qui défilent.
 * @param {HTMLElement} element élément
 * @param {HTMLElement} viewportElement zone de test
 * @returns {{left: number, top: number, right: number, bottom: number}} rectangle à l'écran
 */
function computeVisibleRectangle(element, viewportElement) {
  const { left, top, right, bottom } = element.getBoundingClientRect();
  const visible = { left, top, right, bottom };
  for (let parentElement = element.parentElement; parentElement; parentElement = parentElement.parentElement) {
    if (parentElement === viewportElement || getComputedStyle(parentElement).overflow !== 'visible') {
      const parentRectangle = parentElement.getBoundingClientRect();
      visible.left = Math.max(visible.left, parentRectangle.left);
      visible.top = Math.max(visible.top, parentRectangle.top);
      visible.right = Math.min(visible.right, parentRectangle.right);
      visible.bottom = Math.min(visible.bottom, parentRectangle.bottom);
    }
    if (parentElement === viewportElement) break;
  }
  return visible;
}

/**
 * Crée le calque des custom widgets d'un test.
 * @param {HTMLElement} viewportElement zone de test
 * @param {{onEvent: Function, onTap: Function, onPress: Function, onEscape: Function, onError: Function}} handlers réactions de l'app
 * @returns {{element: HTMLElement, sync: Function, destroy: Function}} calque
 */
export function createCustomWidgetHost(viewportElement, handlers) {
  const layerElement = createElement('div', { className: 'custom-widget-layer' });
  /** Widgets lancés : clé → { frame, definition, node, element, isReady, sentText, hasError }. */
  const runningWidgets = new Map();
  let currentContext = null;

  /**
   * Envoie les valeurs à un widget si elles ont changé.
   * @param {object} running widget lancé
   */
  const sendState = (running) => {
    if (!running.isReady) return;
    const { testDocument, themeId } = currentContext;
    const params = fillParams(running.definition, interpolateWidget(testDocument, running.node).content);
    for (const param of running.definition.params) if (param.type === 'color') params[param.key] = resolveColor(testDocument, params[param.key], themeId) ?? '#888888';
    const state = { params, theme: readThemeColors(testDocument, themeId), size: running.size, isEnabled: running.node.state?.enabled !== false };
    const stateText = JSON.stringify(state);
    if (stateText === running.sentText) return;
    running.sentText = stateText;
    running.frame.contentWindow?.postMessage({ mark: MESSAGE_MARK, ...state }, '*');
  };

  /**
   * Traite un message d'un widget (seulement ceux de nos iframes).
   * @param {MessageEvent} messageEvent message
   */
  const handleMessage = (messageEvent) => {
    const message = messageEvent.data;
    if (message?.mark !== MESSAGE_MARK) return;
    const running = [...runningWidgets.values()].find((candidate) => candidate.frame.contentWindow === messageEvent.source);
    if (!running) return;
    if (message.type === 'ready') { running.isReady = true; running.sentText = ''; sync(); return; }
    if (message.type === 'press') { handlers.onPress(); return; }
    if (message.type === 'escape') { handlers.onEscape(); return; }
    if (message.type === 'error') {
      if (!running.hasError) { running.hasError = true; handlers.onError(running.definition.name, String(message.message).slice(0, 200)); }
      return;
    }
    if (running.node.state?.enabled === false) return;
    if (message.type === 'tap') {
      const rectangle = running.frame.getBoundingClientRect();
      const scale = running.size.width ? rectangle.width / running.size.width : 1;
      handlers.onTap(running.element, message.pointerType === 'mouse' ? 'click' : message.pointerType === 'pen' ? 'pencilTap' : 'tap', rectangle.left + (Number(message.x) || 0) * scale, rectangle.top + (Number(message.y) || 0) * scale);
      return;
    }
    if (message.type === 'change') {
      const param = running.definition.params.find((candidate) => candidate.key === message.key);
      if (!param) return;
      const value = coerceParamValue(param, message.value);
      running.node.content = { ...running.node.content, [param.key]: value };
      // Le widget connaît déjà cette valeur : pas la peine de la lui renvoyer, sauf si on l'a corrigée.
      const sentState = running.sentText ? JSON.parse(running.sentText) : null;
      if (sentState) { sentState.params[param.key] = message.value; running.sentText = JSON.stringify(sentState); }
      sendState(running);
      handlers.onEvent(running.node, 'change');
      return;
    }
    if (message.type === 'event' && running.definition.events.some((event) => event.name === message.name)) handlers.onEvent(running.node, message.name);
  };

  /**
   * Place un widget sur son emplacement.
   * @param {object} running widget lancé
   * @param {boolean} isOnTop faux s'il est sous un dialogue
   */
  const placeWidget = (running, isOnTop) => {
    const { element, frame } = running;
    const rectangle = element.getBoundingClientRect();
    const visible = computeVisibleRectangle(element, viewportElement);
    const isShown = isOnTop && rectangle.width > 0 && visible.right > visible.left && visible.bottom > visible.top && getComputedStyle(element).visibility !== 'hidden';
    frame.style.display = isShown ? 'block' : 'none';
    const previewElement = element.querySelector('.uiw-custom-preview');
    if (previewElement) previewElement.style.visibility = isShown && running.isReady ? 'hidden' : '';
    if (!isShown) return;
    const layerRectangle = layerElement.getBoundingClientRect();
    const scale = Number(element.closest('.test-frame')?.dataset.scale) || 1;
    running.size = { width: Math.round(rectangle.width / scale), height: Math.round(rectangle.height / scale) };
    Object.assign(frame.style, {
      left: `${rectangle.left - layerRectangle.left}px`, top: `${rectangle.top - layerRectangle.top}px`, width: `${running.size.width}px`, height: `${running.size.height}px`, transform: `scale(${scale})`,
      clipPath: `inset(${(visible.top - rectangle.top) / scale}px ${(rectangle.right - visible.right) / scale}px ${(rectangle.bottom - visible.bottom) / scale}px ${(visible.left - rectangle.left) / scale}px)`,
      opacity: running.node.state?.enabled === false ? '0.45' : '1', pointerEvents: running.node.state?.enabled === false ? 'none' : 'auto',
    });
  };

  /**
   * Accorde le calque avec l'écran dessiné : lance, place et retire les widgets.
   * @param {{testDocument: object, themeId: string}} [context] copie testée et thème (inchangés pendant un défilement)
   */
  const sync = (context = currentContext) => {
    if (!context) return;
    currentContext = context;
    const widgetsById = indexCustomWidgets(context.testDocument);
    const topFrame = [...viewportElement.querySelectorAll('.test-frame')].pop();
    const seenKeys = new Set();
    for (const element of viewportElement.querySelectorAll('.uiw-customWidget[data-node-id]')) {
      const indexed = widgetsById.get(element.dataset.nodeId);
      const definition = context.testDocument.customWidgets?.[indexed?.node.customWidgetId];
      if (!definition) continue;
      seenKeys.add(indexed.key);
      let running = runningWidgets.get(indexed.key);
      if (running && running.definition.libraryId !== definition.libraryId) { running.frame.remove(); runningWidgets.delete(indexed.key); running = undefined; }
      if (!running) {
        const frame = createElement('iframe', { attributes: { sandbox: 'allow-scripts', title: definition.name } });
        frame.srcdoc = createWidgetPage(definition);
        running = { frame, definition, isReady: false, sentText: '', hasError: false, size: { width: 0, height: 0 } };
        runningWidgets.set(indexed.key, running);
        layerElement.append(frame);
      }
      Object.assign(running, { node: indexed.node, element });
      placeWidget(running, element.closest('.test-frame') === topFrame);
      sendState(running);
    }
    for (const [key, running] of runningWidgets) if (!seenKeys.has(key)) { running.frame.remove(); runningWidgets.delete(key); }
  };

  const handleScroll = () => sync();
  window.addEventListener('message', handleMessage);
  viewportElement.addEventListener('scroll', handleScroll, true);
  return {
    element: layerElement, sync,
    destroy: () => {
      window.removeEventListener('message', handleMessage);
      viewportElement.removeEventListener('scroll', handleScroll, true);
      layerElement.remove();
      runningWidgets.clear();
    },
  };
}
