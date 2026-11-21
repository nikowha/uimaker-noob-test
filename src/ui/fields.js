// Champs de formulaire des panneaux (PROTOTYPE). Chaque champ valide sa valeur sur « change ».
import { createElement } from '../utils/dom.js';
import { resolveColor } from '../render/styleResolver.js';
import { appSettings, appState, notifyChange, setHistoryGroup } from '../model/store.js';

const SCRUB_START_THRESHOLD_PIXELS = 3;
let scrubGestureCounter = 0;
/** Sections ouvertes / fermées par l'utilisateur, gardées quand les panneaux se redessinent (clé = titre). */
const sectionOpenStateByTitle = new Map();

/**
 * Permet de changer une valeur numérique en glissant verticalement sur son libellé (Pencil, souris, doigt) :
 * vers le haut = augmente. Progression linéaire : un pas tous les « scrubPixelsPerStep » px (réglages de l'app),
 * sans accélération. Tout le geste compte pour une seule annulation.
 * @param {HTMLElement} labelElement libellé (poignée)
 * @param {HTMLInputElement} inputElement champ numérique
 * @param {{step?: number, min?: number, max?: number}} scrubOptions pas et bornes
 * @param {(newValue: number) => void} onValue appelé à chaque nouvelle valeur
 */
function attachValueScrub(labelElement, inputElement, scrubOptions, onValue) {
  const step = scrubOptions.step ?? 1;
  const decimalCount = (String(step).split('.')[1] ?? '').length;
  labelElement.classList.add('is-scrubbable');
  labelElement.title = 'Glisser vers le haut / le bas pour changer la valeur';
  labelElement.addEventListener('pointerdown', (downEvent) => {
    downEvent.preventDefault();
    const startY = downEvent.clientY;
    const startValue = Number(inputElement.value) || 0;
    let isScrubbing = false;
    let lastValue = startValue;
    labelElement.setPointerCapture(downEvent.pointerId);
    const handleMove = (moveEvent) => {
      const travelled = startY - moveEvent.clientY;
      if (!isScrubbing && Math.abs(travelled) < SCRUB_START_THRESHOLD_PIXELS) return;
      if (!isScrubbing) {
        isScrubbing = true;
        appState.isScrubbing = true;
        scrubGestureCounter += 1;
        setHistoryGroup(`scrub-${scrubGestureCounter}`);
        labelElement.classList.add('is-scrubbing');
      }
      const stepCount = Math.trunc(travelled / Math.max(1, appSettings.scrubPixelsPerStep));
      let newValue = Number((startValue + stepCount * step).toFixed(decimalCount));
      if (typeof scrubOptions.min === 'number') newValue = Math.max(scrubOptions.min, newValue);
      if (typeof scrubOptions.max === 'number') newValue = Math.min(scrubOptions.max, newValue);
      if (newValue === lastValue) return;
      lastValue = newValue;
      inputElement.value = String(newValue);
      onValue(newValue);
    };
    const handleEnd = () => {
      labelElement.removeEventListener('pointermove', handleMove);
      labelElement.removeEventListener('pointerup', handleEnd);
      labelElement.removeEventListener('pointercancel', handleEnd);
      labelElement.classList.remove('is-scrubbing');
      if (!isScrubbing) { inputElement.focus(); return; }
      setHistoryGroup(null);
      appState.isScrubbing = false;
      notifyChange();
    };
    labelElement.addEventListener('pointermove', handleMove);
    labelElement.addEventListener('pointerup', handleEnd);
    labelElement.addEventListener('pointercancel', handleEnd);
  });
}

/**
 * Crée une ligne « libellé + contrôle ».
 * @param {string} label libellé
 * @param {HTMLElement} controlElement contrôle
 * @returns {HTMLElement} ligne
 */
function createFieldRow(label, controlElement) {
  return createElement('div', { className: 'field-row' }, [createElement('span', { className: 'field-label', text: label }), controlElement]);
}

/**
 * Champ texte (une ligne ou plusieurs).
 * @param {string} label libellé
 * @param {string} value valeur
 * @param {(newValue: string) => void} onCommit appelé à la validation
 * @param {{isMultiline?: boolean, placeholder?: string}} [fieldOptions] options
 * @returns {HTMLElement} ligne
 */
export function createTextField(label, value, onCommit, fieldOptions = {}) {
  const inputElement = createElement(fieldOptions.isMultiline ? 'textarea' : 'input', {
    attributes: { type: fieldOptions.isMultiline ? undefined : 'text', placeholder: fieldOptions.placeholder ?? '', rows: fieldOptions.isMultiline ? 3 : undefined },
    on: { change: () => onCommit(inputElement.value) },
  });
  inputElement.value = value ?? '';
  return createFieldRow(label, inputElement);
}

/**
 * Champ numérique. Vide = valeur absente (undefined).
 * @param {string} label libellé
 * @param {number|undefined} value valeur
 * @param {(newValue: number|undefined) => void} onCommit appelé à la validation
 * @param {{step?: number, min?: number, max?: number}} [scrubOptions] pas et bornes pour le réglage en glissant
 * @returns {HTMLElement} ligne
 */
export function createNumberField(label, value, onCommit, scrubOptions = {}) {
  const inputElement = createElement('input', {
    attributes: { type: 'number', inputmode: 'decimal', step: 'any' },
    on: { change: () => onCommit(inputElement.value === '' ? undefined : Number(inputElement.value)) },
  });
  inputElement.value = value ?? '';
  const fieldRow = createFieldRow(label, inputElement);
  attachValueScrub(fieldRow.querySelector('.field-label'), inputElement, scrubOptions, onCommit);
  return fieldRow;
}

/**
 * Liste de choix.
 * @param {string} label libellé
 * @param {string} value valeur choisie
 * @param {Array<string|{value: string, label: string}>} choices choix
 * @param {(newValue: string) => void} onCommit appelé au changement
 * @returns {HTMLElement} ligne
 */
export function createSelectField(label, value, choices, onCommit) {
  const selectElement = createSelectElement(value, choices, onCommit);
  return createFieldRow(label, selectElement);
}

/**
 * Crée un élément <select> seul.
 * @param {string} value valeur choisie
 * @param {Array<string|{value: string, label: string}>} choices choix
 * @param {(newValue: string) => void} onCommit appelé au changement
 * @returns {HTMLSelectElement} liste
 */
export function createSelectElement(value, choices, onCommit) {
  const selectElement = createElement('select', { on: { change: () => onCommit(selectElement.value) } },
    choices.map((choice) => {
      const choiceValue = typeof choice === 'string' ? choice : choice.value;
      const choiceLabel = typeof choice === 'string' ? (choice || '—') : choice.label;
      return createElement('option', { text: choiceLabel, attributes: { value: choiceValue } });
    }));
  selectElement.value = value ?? '';
  return selectElement;
}

/**
 * Case à cocher.
 * @param {string} label libellé
 * @param {boolean} isChecked état
 * @param {(newValue: boolean) => void} onCommit appelé au changement
 * @returns {HTMLElement} ligne
 */
export function createCheckboxField(label, isChecked, onCommit) {
  const inputElement = createElement('input', { attributes: { type: 'checkbox' }, on: { change: () => onCommit(inputElement.checked) } });
  inputElement.checked = Boolean(isChecked);
  return createElement('label', { className: 'field-row is-checkbox' }, [inputElement, createElement('span', { text: label })]);
}

/**
 * Champ couleur : hérité / variable de couleur ($V…) / couleur perso.
 * @param {string} label libellé
 * @param {string|undefined} value couleur ou référence de variable
 * @param {object} uiDocument document
 * @param {string} themeId thème affiché
 * @param {(newValue: string|undefined) => void} onCommit appelé au changement (undefined = hérité)
 * @returns {HTMLElement} ligne
 */
export function createColorField(label, value, uiDocument, themeId, onCommit) {
  const isVariable = typeof value === 'string' && value.startsWith('$');
  const choices = [{ value: '', label: '— hérité —' },
    ...Object.entries(uiDocument.colorVariables).map(([variableId, colorVariable]) => ({ value: `$${variableId}`, label: `${colorVariable.name} (${variableId})` })),
    { value: 'custom', label: 'Couleur perso…' }];
  const selectElement = createSelectElement(value ? (isVariable ? value : 'custom') : '', choices, (choiceValue) => {
    if (choiceValue === 'custom') onCommit(colorInput.value);
    else onCommit(choiceValue || undefined);
  });
  const colorInput = createElement('input', { attributes: { type: 'color' }, on: { change: () => onCommit(colorInput.value) } });
  colorInput.value = /^#[0-9a-fA-F]{6}/.test(value ?? '') ? value.slice(0, 7) : '#888888';
  const swatchColor = value ? resolveColor(uiDocument, value, themeId) : 'transparent';
  const swatchElement = createElement('span', { className: 'color-swatch', style: { background: swatchColor } });
  const controlGroup = createElement('span', { className: 'field-group' }, [swatchElement, selectElement, (!isVariable && value) ? colorInput : null]);
  return createFieldRow(label, controlGroup);
}

/**
 * Champ de taille d'un widget : « ajuster » (hug), « remplir » (fill) ou nombre de px.
 * @param {string} label libellé
 * @param {number|string|undefined} value valeur
 * @param {(newValue: number|string) => void} onCommit appelé au changement
 * @returns {HTMLElement} ligne
 */
export function createSizeField(label, value, onCommit) {
  const sizeMode = typeof value === 'number' ? 'fixed' : (value ?? 'hug');
  const numberInput = createElement('input', { attributes: { type: 'number', inputmode: 'decimal' },
    on: { change: () => onCommit(Number(numberInput.value) || 0) } });
  numberInput.value = typeof value === 'number' ? value : '';
  const selectElement = createSelectElement(sizeMode, [
    { value: 'hug', label: 'Ajuster' }, { value: 'fill', label: 'Remplir' }, { value: 'fixed', label: 'Fixe' },
  ], (modeValue) => onCommit(modeValue === 'fixed' ? (typeof value === 'number' ? value : 100) : modeValue));
  const fieldRow = createFieldRow(label, createElement('span', { className: 'field-group' }, [selectElement, sizeMode === 'fixed' ? numberInput : null]));
  if (sizeMode === 'fixed') attachValueScrub(fieldRow.querySelector('.field-label'), numberInput, { step: 1, min: 0 }, onCommit);
  return fieldRow;
}

/**
 * Section repliable d'un panneau.
 * @param {string} title titre
 * @param {Array<HTMLElement|null>} children contenu
 * @param {boolean} [isOpen] ouverte par défaut
 * @returns {HTMLElement} section
 */
export function createPanelSection(title, children, isOpen = true) {
  const isRememberedOpen = sectionOpenStateByTitle.get(title) ?? isOpen;
  const sectionElement = createElement('details', { className: 'panel-section', attributes: { open: isRememberedOpen } },
    [createElement('summary', { text: title }), ...children]);
  sectionElement.addEventListener('toggle', () => sectionOpenStateByTitle.set(title, sectionElement.open));
  return sectionElement;
}

/**
 * Rangée de boutons.
 * @param {Array<{label: string, onClick: () => void, title?: string, isDanger?: boolean}>} buttonDefinitions boutons
 * @returns {HTMLElement} rangée
 */
export function createButtonRow(buttonDefinitions) {
  return createElement('div', { className: 'button-row' }, buttonDefinitions.map((buttonDefinition) => createElement('button', {
    className: buttonDefinition.isDanger ? 'is-danger' : '', text: buttonDefinition.label,
    attributes: { type: 'button', title: buttonDefinition.title ?? buttonDefinition.label },
    on: { click: buttonDefinition.onClick },
  })));
}

/**
 * Ligne d'information en lecture seule.
 * @param {string} label libellé
 * @param {string} value texte
 * @returns {HTMLElement} ligne
 */
export function createInfoRow(label, value) {
  return createElement('div', { className: 'field-row is-info' }, [createElement('span', { className: 'field-label', text: label }),
    createElement('code', { text: value })]);
}
