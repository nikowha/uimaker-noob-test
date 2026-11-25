// Custom widgets : widgets codés par une session, importés par un fichier .uimwidget (PROTOTYPE).
// À ne pas confondre avec un module (agencement de widgets, sans code).
import { buildNodeIndex, cloneJson, createId } from './document.js';
import { limitNumber } from '../utils/numbers.js';

export const CUSTOM_WIDGET_FORMAT = 'uimaker-noob-custom-widget';
export const CUSTOM_WIDGET_FORMAT_VERSION = '1';
/** Préfixe des déclencheurs émis par un custom widget (« widget:change », « widget:<événement> »). */
export const WIDGET_TRIGGER_PREFIX = 'widget:';
export const PARAM_TYPES = ['number', 'text', 'boolean', 'choice', 'color'];

const MAXIMUM_CODE_LENGTH = 500000;
const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;
const RESERVED_NAMES = new Set(['constructor', 'prototype']);
const DEFAULT_SIZE = { width: 120, height: 120 };
const FIELD_KINDS = { number: 'number', text: 'text', boolean: 'checkbox', choice: 'select', color: 'color' };

/**
 * Vérifie un nom de paramètre ou d'événement.
 * @param {any} name nom
 * @param {string} label de quoi il s'agit
 * @returns {string} nom
 */
function checkName(name, label) {
  if (typeof name !== 'string' || !NAME_PATTERN.test(name) || RESERVED_NAMES.has(name)) throw new Error(`${label} : nom « ${name} » invalide (lettres et chiffres, commence par une lettre)`);
  return name;
}

/**
 * Vérifie un paramètre.
 * @param {any} param paramètre du fichier
 * @returns {object} paramètre complet
 */
function checkParam(param) {
  const key = checkName(param?.key, 'Paramètre');
  if (!PARAM_TYPES.includes(param.type)) throw new Error(`Paramètre ${key} : type « ${param.type} » inconnu (${PARAM_TYPES.join(', ')})`);
  const checkedParam = { key, label: String(param.label ?? key), type: param.type };
  if (param.type === 'number') {
    for (const limitKey of ['min', 'max', 'step']) if (typeof param[limitKey] === 'number' && Number.isFinite(param[limitKey])) checkedParam[limitKey] = param[limitKey];
    if (checkedParam.min > checkedParam.max) throw new Error(`Paramètre ${key} : min plus grand que max`);
  }
  if (param.type === 'choice') {
    checkedParam.choices = (Array.isArray(param.choices) ? param.choices : []).map(String);
    if (checkedParam.choices.length === 0) throw new Error(`Paramètre ${key} : liste « choices » vide`);
  }
  checkedParam.default = coerceParamValue(checkedParam, param.default);
  return checkedParam;
}

/**
 * Ramène une valeur dans ce que le paramètre accepte.
 * @param {object} param paramètre
 * @param {any} rawValue valeur
 * @returns {number|string|boolean} valeur valide (celle par défaut si besoin)
 */
export function coerceParamValue(param, rawValue) {
  switch (param.type) {
    case 'number': {
      const numberValue = typeof rawValue === 'number' || (typeof rawValue === 'string' && rawValue.trim() !== '') ? Number(rawValue) : NaN;
      return limitNumber(Number.isFinite(numberValue) ? numberValue : param.default ?? param.min ?? 0, param);
    }
    case 'boolean': return typeof rawValue === 'boolean' ? rawValue : Boolean(param.default);
    case 'choice': return param.choices.includes(rawValue) ? rawValue : param.choices.includes(param.default) ? param.default : param.choices[0];
    case 'color': return typeof rawValue === 'string' && /^(#[0-9A-Fa-f]{3,8}|\$V\d+)$/.test(rawValue) ? rawValue : param.default ?? '#888888';
    default: return typeof rawValue === 'string' ? rawValue : rawValue === undefined || rawValue === null ? param.default ?? '' : String(rawValue);
  }
}

/**
 * Vérifie la définition d'un custom widget et garde seulement les champs connus.
 * @param {any} definition contenu du fichier
 * @returns {object} définition complète
 * @throws {Error} si elle est inutilisable
 */
export function checkCustomWidget(definition) {
  if (!definition || typeof definition !== 'object') throw new Error('Définition de custom widget absente');
  const readText = (key) => (definition[key] === undefined || definition[key] === null ? '' : String(definition[key]));
  const name = readText('name').trim();
  if (!name) throw new Error('Le custom widget n\'a pas de nom');
  for (const codeKey of ['html', 'css', 'js', 'previewSvg']) if (readText(codeKey).length > MAXIMUM_CODE_LENGTH) throw new Error(`« ${codeKey} » est trop long`);
  if (/<\/style/i.test(readText('css'))) throw new Error('Le CSS ne doit pas contenir « </style »');
  if (!readText('js').trim() && !readText('html').trim()) throw new Error('Le custom widget n\'a pas de code (html ou js)');
  const params = (Array.isArray(definition.params) ? definition.params : []).map(checkParam);
  const events = (Array.isArray(definition.events) ? definition.events : []).map((event) => ({ name: checkName(event?.name, 'Événement'), description: String(event.description ?? '') }));
  for (const [label, names] of [['Paramètre', params.map((param) => param.key)], ['Événement', events.map((event) => event.name)]]) {
    const duplicateName = names.find((candidate, index) => names.indexOf(candidate) !== index);
    if (duplicateName) throw new Error(`${label} « ${duplicateName} » en double`);
  }
  const readSize = (dimension) => (Number(definition.size?.[dimension]) > 0 ? Number(definition.size[dimension]) : DEFAULT_SIZE[dimension]);
  return {
    libraryId: readText('libraryId') || crypto.randomUUID(), version: Math.max(1, Math.round(Number(definition.version)) || 1), updatedAt: readText('updatedAt') || new Date().toISOString(),
    name, description: readText('description'), tags: (Array.isArray(definition.tags) ? definition.tags : []).map(String), basedOn: readText('basedOn'),
    size: { width: readSize('width'), height: readSize('height') }, params, events,
    html: readText('html'), css: readText('css'), js: readText('js'), previewSvg: readText('previewSvg'), nativeNotes: readText('nativeNotes'),
  };
}

/**
 * Lit un fichier .uimwidget.
 * @param {string} fileText contenu
 * @returns {object} définition
 * @throws {Error} si le fichier est invalide
 */
export function parseCustomWidgetFile(fileText) {
  let fileValue;
  try { fileValue = JSON.parse(fileText); } catch (error) { throw new Error(`JSON illisible : ${error.message}`); }
  if (fileValue?.format !== CUSTOM_WIDGET_FORMAT) throw new Error('Ce n\'est pas un fichier de custom widget (.uimwidget)');
  return checkCustomWidget(fileValue.widget);
}

/**
 * Texte d'un fichier .uimwidget.
 * @param {object} definition définition
 * @returns {string} JSON
 */
export function createCustomWidgetFileText(definition) {
  return JSON.stringify({ format: CUSTOM_WIDGET_FORMAT, formatVersion: CUSTOM_WIDGET_FORMAT_VERSION, widget: definition }, null, 2);
}

/**
 * Garde les définitions valides d'un document importé.
 * @param {object} uiDocument document, modifié sur place
 */
export function checkDocumentCustomWidgets(uiDocument) {
  const checkedWidgets = {};
  for (const [customWidgetId, definition] of Object.entries(uiDocument.customWidgets ?? {})) {
    try { checkedWidgets[customWidgetId] = checkCustomWidget(definition); } catch (error) { console.warn(`Custom widget ${customWidgetId} ignoré`, error); }
  }
  uiDocument.customWidgets = checkedWidgets;
}

/**
 * Met une définition dans le projet ; celle déjà présente est réutilisée, ou remplacée si on le demande.
 * @param {object} uiDocument document
 * @param {object} definition définition
 * @param {boolean} [shouldUpdate] vrai pour remplacer
 * @returns {string} ID dans le projet (X…)
 */
export function installCustomWidget(uiDocument, definition, shouldUpdate = false) {
  uiDocument.customWidgets ??= {};
  const existingEntry = Object.entries(uiDocument.customWidgets).find(([, candidate]) => candidate.libraryId === definition.libraryId);
  if (existingEntry && !shouldUpdate) return existingEntry[0];
  const customWidgetId = existingEntry?.[0] ?? createId(uiDocument, 'X');
  uiDocument.customWidgets[customWidgetId] = cloneJson(definition);
  if (existingEntry) {
    for (const { node } of buildNodeIndex(uiDocument).values()) {
      if (node.customWidgetId === customWidgetId) node.content = fillParams(definition, node.content);
    }
  }
  return customWidgetId;
}

/**
 * Complète et corrige les valeurs d'un widget d'après sa définition.
 * @param {object} definition définition
 * @param {object} [content] valeurs
 * @returns {object} valeurs valides
 */
export function fillParams(definition, content = {}) {
  return Object.fromEntries(definition.params.map((param) => [param.key, coerceParamValue(param, content[param.key])]));
}

/**
 * Crée un widget d'après une définition du projet.
 * @param {object} uiDocument document
 * @param {string} customWidgetId définition (X…)
 * @returns {object} widget
 */
export function createCustomWidgetNode(uiDocument, customWidgetId) {
  const definition = uiDocument.customWidgets[customWidgetId];
  const widgetName = definition.name.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').map((word) => word[0].toUpperCase() + word.slice(1)).join('') || 'CustomWidget';
  return { id: createId(uiDocument, 'W'), type: 'customWidget', customWidgetId, name: /^[0-9]/.test(widgetName) ? `Widget${widgetName}` : widgetName, content: fillParams(definition), size: { ...definition.size }, notes: '' };
}

/**
 * Champs de réglage d'un custom widget (même forme que le catalogue).
 * @param {object|undefined} definition définition
 * @returns {object[]} champs
 */
export function getCustomWidgetFields(definition) {
  return (definition?.params ?? []).map((param) => ({ target: 'content', key: param.key, label: param.label, kind: FIELD_KINDS[param.type], min: param.min, max: param.max, step: param.step, options: param.choices }));
}

/**
 * Déclencheurs propres à un custom widget.
 * @param {object|undefined} definition définition
 * @returns {Array<{value: string, label: string}>} choix
 */
export function getCustomWidgetTriggers(definition) {
  if (!definition) return [];
  return [{ value: `${WIDGET_TRIGGER_PREFIX}change`, label: 'Widget : un réglage change' },
    ...definition.events.filter((event) => event.name !== 'change').map((event) => ({ value: `${WIDGET_TRIGGER_PREFIX}${event.name}`, label: `Widget : ${event.description || event.name}` }))];
}

/**
 * Compte les utilisations d'une définition (écrans et modules).
 * @param {object} uiDocument document
 * @param {string} customWidgetId définition
 * @returns {number} nombre
 */
export function countCustomWidgetUsers(uiDocument, customWidgetId) {
  return [...buildNodeIndex(uiDocument).values()].filter((record) => record.node.customWidgetId === customWidgetId).length;
}

/**
 * Indique si la bibliothèque a une autre version, plus récente ou publiée autrement.
 * @param {object} definition définition du projet
 * @param {object|undefined} entry définition de la bibliothèque
 * @returns {boolean} vrai si une mise à jour peut être proposée
 */
export function isCustomWidgetUpdateAvailable(definition, entry) {
  if (!entry) return false;
  return entry.version !== definition.version ? entry.version > definition.version : entry.updatedAt !== definition.updatedAt;
}
