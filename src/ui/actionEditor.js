// Éditeur d'action réutilisable (événements, éléments de menu, action du clic) et section « Événements » (PROTOTYPE).
import { createElement } from '../utils/dom.js';
import { appState } from '../model/store.js';
import { buildNodeIndex } from '../model/document.js';
import { ACTION_TYPES, EVENT_TRIGGERS } from '../model/interactions.js';
import { VARIABLE_OPERATIONS } from '../model/variables.js';
import { createButtonRow, createPanelSection, createSelectElement } from './fields.js';

/**
 * Choix possibles pour la cible d'une action.
 * @param {string} targetKind screen, menu, pageStack, widget
 * @returns {Array<{value: string, label: string}>} choix
 */
function listTargetChoices(targetKind) {
  const { uiDocument } = appState;
  if (targetKind === 'screen') return uiDocument.screens.map((screen) => ({ value: screen.id, label: `${screen.id} · ${screen.name}` }));
  if (targetKind === 'menu') return Object.entries(uiDocument.menus ?? {}).map(([menuId, menu]) => ({ value: menuId, label: `${menuId} · ${menu.name}` }));
  if (targetKind === 'variable') return Object.entries(uiDocument.variables ?? {}).map(([variableId, variable]) => ({ value: variableId, label: `${variable.name} (${variableId})` }));
  const { editedModuleId } = appState;
  const isInScope = (record) => (editedModuleId ? record.screen.id === editedModuleId : !uiDocument.modules[record.screen.id]);
  const widgetRecords = [...buildNodeIndex(uiDocument).values()].filter((record) => record.kind === 'widget' && isInScope(record)
    && (targetKind !== 'pageStack' || record.node.type === 'pageStack'));
  return widgetRecords.map((record) => ({ value: record.node.id, label: `${record.node.id} · ${record.node.name}` }));
}

/**
 * Crée les contrôles d'édition d'une action : type + cible (+ page ou description).
 * @param {object|undefined} action action actuelle
 * @param {(newAction: object) => void} onChange appelé avec la nouvelle action
 * @returns {HTMLElement} groupe de contrôles
 */
export function createActionEditor(action, onChange) {
  const currentAction = action ?? { type: 'none' };
  const actionDefinition = ACTION_TYPES.find((candidate) => candidate.value === currentAction.type) ?? ACTION_TYPES[0];
  const commitAction = (changes) => onChange({ ...currentAction, ...changes });
  const controls = [createSelectElement(currentAction.type, ACTION_TYPES, (actionType) => onChange({ type: actionType }))];
  if (actionDefinition.targetKind) {
    const targetKey = { menu: 'menuId', variable: 'variableId' }[actionDefinition.targetKind] ?? 'target';
    const targetChoices = listTargetChoices(actionDefinition.targetKind);
    const currentTarget = currentAction[targetKey] ?? '';
    if (currentTarget && !targetChoices.some((choice) => choice.value === currentTarget)) targetChoices.push({ value: currentTarget, label: currentTarget });
    controls.push(createSelectElement(currentTarget, [{ value: '', label: '— cible —' }, ...targetChoices],
      (targetId) => commitAction({ [targetKey]: targetId })));
  }
  if (currentAction.type === 'showPage') {
    const pageInput = createElement('input', { attributes: { type: 'number', min: '0', title: 'Index de la page (0 = première)', placeholder: 'page' },
      on: { change: () => commitAction({ page: Number(pageInput.value) || 0 }) } });
    pageInput.value = currentAction.page ?? 0;
    controls.push(pageInput);
  }
  if (currentAction.type === 'changeVariable') {
    const operation = currentAction.operation ?? 'set';
    controls.push(createSelectElement(operation, VARIABLE_OPERATIONS, (newOperation) => commitAction({ operation: newOperation })));
    if (operation !== 'toggle') {
      const amountInput = createElement('input', { attributes: { type: 'text', placeholder: 'valeur' }, on: { change: () => commitAction({ operation, amount: amountInput.value }) } });
      amountInput.value = currentAction.amount ?? '';
      controls.push(amountInput);
    }
  }
  if (currentAction.type === 'custom') {
    const descriptionInput = createElement('input', { attributes: { type: 'text', placeholder: 'Ce que fait l\'action' },
      on: { change: () => commitAction({ description: descriptionInput.value }) } });
    descriptionInput.value = currentAction.description ?? '';
    controls.push(descriptionInput);
  }
  return createElement('div', { className: 'action-editor' }, controls);
}

/**
 * Section « Événements » d'un widget, d'une area ou d'un écran : liste « déclencheur → action ».
 * @param {object} node nœud
 * @param {boolean} isScreen vrai pour un écran (tous les déclencheurs, y compris Pencil et clavier)
 * @param {(mutateNode: (targetNode: object) => void) => void} updateThisNode applique une modification au nœud
 * @returns {HTMLElement} section
 */
export function createEventsSection(node, isScreen, updateThisNode) {
  const triggerChoices = EVENT_TRIGGERS.filter((trigger) => isScreen || !trigger.isScreenLevel);
  const eventRows = (node.events ?? []).map((nodeEvent, eventIndex) => {
    const updateEvent = (changes) => updateThisNode((targetNode) => { targetNode.events[eventIndex] = { ...targetNode.events[eventIndex], ...changes }; });
    const keyInput = nodeEvent.trigger === 'keyShortcut'
      ? createElement('input', { attributes: { type: 'text', placeholder: 'ex. Ctrl+S' }, on: { change: (changeEvent) => updateEvent({ key: changeEvent.target.value.trim() }) } })
      : null;
    if (keyInput) keyInput.value = nodeEvent.key ?? '';
    return createElement('div', { className: 'event-row' }, [
      createElement('div', { className: 'event-row-header' }, [
        createSelectElement(nodeEvent.trigger, triggerChoices, (trigger) => updateEvent({ trigger })),
        keyInput,
        createElement('button', { className: 'is-danger', text: '✕', attributes: { type: 'button', title: 'Supprimer cet événement' },
          on: { click: () => updateThisNode((targetNode) => { targetNode.events.splice(eventIndex, 1); }) } }),
      ]),
      createActionEditor(nodeEvent.action, (newAction) => updateEvent({ action: newAction })),
    ]);
  });
  return createPanelSection('Événements', [
    createElement('div', { className: 'panel-hint', text: isScreen
      ? 'Événements de tout l\'écran (dont double tap / squeeze du Pencil et raccourcis clavier). Testables avec ▶ Tester.'
      : 'Ce qui se passe quand on clique, touche, survole… Le premier événement qui correspond gagne (sinon celui de l\'area, puis de l\'écran).' }),
    ...eventRows,
    createButtonRow([{ label: '+ Événement', onClick: () => updateThisNode((targetNode) => {
      (targetNode.events ??= []).push({ trigger: isScreen ? 'pencilDoubleTap' : 'rightClick', action: { type: 'none' } });
    }) }]),
  ], false);
}

