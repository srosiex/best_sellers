/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import * as objects from 'vs/base/common/objects';
import * as arrays from 'vs/base/common/arrays';
import { IEditorOptions, editorOptionsRegistry, ValidatedEditorOptions, IEnvironmentalOptions, IComputedEditorOptions, ConfigurationChangedEvent, EDITOR_MODEL_DEFAULTS, EditorOption, FindComputedEditorOptionValueById } from 'vs/editor/common/config/editorOptions';
import { EditorZoom } from 'vs/editor/common/config/editorZoom';
import { BareFontInfo, FontInfo } from 'vs/editor/common/config/fontInfo';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ConfigurationScope, Extensions, IConfigurationNode, IConfigurationRegistry, IConfigurationPropertySchema } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/registry/common/platform';
import { AccessibilitySupport } from 'vs/platform/accessibility/common/accessibility';

/**
 * Control what pressing Tab does.
 * If it is false, pressing Tab or Shift-Tab will be handled by the editor.
 * If it is true, pressing Tab or Shift-Tab will move the browser focus.
 * Defaults to false.
 */
export interface ITabFocus {
	onDidChangeTabFocus: Event<boolean>;
	getTabFocusMode(): boolean;
	setTabFocusMode(tabFocusMode: boolean): void;
}

export const TabFocus: ITabFocus = new class implements ITabFocus {
	private _tabFocus: boolean = false;

	private readonly _onDidChangeTabFocus = new Emitter<boolean>();
	public readonly onDidChangeTabFocus: Event<boolean> = this._onDidChangeTabFocus.event;

	public getTabFocusMode(): boolean {
		return this._tabFocus;
	}

	public setTabFocusMode(tabFocusMode: boolean): void {
		if (this._tabFocus === tabFocusMode) {
			return;
		}

		this._tabFocus = tabFocusMode;
		this._onDidChangeTabFocus.fire(this._tabFocus);
	}
};

export interface IEnvConfiguration {
	extraEditorClassName: string;
	outerWidth: number;
	outerHeight: number;
	emptySelectionClipboard: boolean;
	pixelRatio: number;
	zoomLevel: number;
	accessibilitySupport: AccessibilitySupport;
}

const hasOwnProperty = Object.hasOwnProperty;

export class ComputedEditorOptions implements IComputedEditorOptions {
	private readonly _values: any[] = [];
	public _read<T>(id: EditorOption): T {
		return this._values[id];
	}
	public get<T extends EditorOption>(id: T): FindComputedEditorOptionValueById<T> {
		return this._values[id];
	}
	public _write<T>(id: EditorOption, value: T): void {
		this._values[id] = value;
	}
}

class RawEditorOptions {
	private readonly _values: any[] = [];
	public _read<T>(id: EditorOption): T | undefined {
		return this._values[id];
	}
	public _write<T>(id: EditorOption, value: T | undefined): void {
		this._values[id] = value;
	}
}

class EditorConfiguration2 {
	public static readOptions(_options: IEditorOptions): RawEditorOptions {
		const options: { [key: string]: any; } = _options;
		const result = new RawEditorOptions();
		for (const editorOption of editorOptionsRegistry) {
			const value = (editorOption.name === '_never_' ? undefined : options[editorOption.name]);
			result._write(editorOption.id, value);
		}
		return result;
	}

	public static validateOptions(options: RawEditorOptions): ValidatedEditorOptions {
		const result = new ValidatedEditorOptions();
		for (const editorOption of editorOptionsRegistry) {
			result._write(editorOption.id, editorOption.validate(options._read(editorOption.id)));
		}
		return result;
	}

	public static computeOptions(options: ValidatedEditorOptions, env: IEnvironmentalOptions): ComputedEditorOptions {
		const result = new ComputedEditorOptions();
		for (const editorOption of editorOptionsRegistry) {
			result._write(editorOption.id, editorOption.compute(env, result, options._read(editorOption.id)));
		}
		return result;
	}

	private static _deepEquals<T>(a: T, b: T): boolean {
		if (typeof a !== 'object' || typeof b !== 'object') {
			return (a === b);
		}
		if (Array.isArray(a) || Array.isArray(b)) {
			return (Array.isArray(a) && Array.isArray(b) ? arrays.equals(a, b) : false);
		}
		for (let key in a) {
			if (!EditorConfiguration2._deepEquals(a[key], b[key])) {
				return false;
			}
		}
		return true;
	}

	public static checkEquals(a: ComputedEditorOptions, b: ComputedEditorOptions): ConfigurationChangedEvent | null {
		const result: boolean[] = [];
		let somethingChanged = false;
		for (const editorOption of editorOptionsRegistry) {
			const changed = !EditorConfiguration2._deepEquals(a._read(editorOption.id), b._read(editorOption.id));
			result[editorOption.id] = changed;
			if (changed) {
				somethingChanged = true;
			}
		}
		return (somethingChanged ? new ConfigurationChangedEvent(result) : null);
	}
}

/**
 * Compatibility with old options
 */
function migrateOptions(options: IEditorOptions): void {
	const wordWrap = options.wordWrap;
	if (<any>wordWrap === true) {
		options.wordWrap = 'on';
	} else if (<any>wordWrap === false) {
		options.wordWrap = 'off';
	}

	const lineNumbers = options.lineNumbers;
	if (<any>lineNumbers === true) {
		options.lineNumbers = 'on';
	} else if (<any>lineNumbers === false) {
		options.lineNumbers = 'off';
	}

	const autoClosingBrackets = options.autoClosingBrackets;
	if (<any>autoClosingBrackets === false) {
		options.autoClosingBrackets = 'never';
		options.autoClosingQuotes = 'never';
		options.autoSurround = 'never';
	}

	const cursorBlinking = options.cursorBlinking;
	if (<any>cursorBlinking === 'visible') {
		options.cursorBlinking = 'solid';
	}

	const renderWhitespace = options.renderWhitespace;
	if (<any>renderWhitespace === true) {
		options.renderWhitespace = 'boundary';
	} else if (<any>renderWhitespace === false) {
		options.renderWhitespace = 'none';
	}

	const renderLineHighlight = options.renderLineHighlight;
	if (<any>renderLineHighlight === true) {
		options.renderLineHighlight = 'line';
	} else if (<any>renderLineHighlight === false) {
		options.renderLineHighlight = 'none';
	}

	const acceptSuggestionOnEnter = options.acceptSuggestionOnEnter;
	if (<any>acceptSuggestionOnEnter === true) {
		options.acceptSuggestionOnEnter = 'on';
	} else if (<any>acceptSuggestionOnEnter === false) {
		options.acceptSuggestionOnEnter = 'off';
	}

	const tabCompletion = options.tabCompletion;
	if (<any>tabCompletion === false) {
		options.tabCompletion = 'off';
	} else if (<any>tabCompletion === true) {
		options.tabCompletion = 'onlySnippets';
	}

	const hover = options.hover;
	if (<any>hover === true) {
		options.hover = {
			enabled: true
		};
	} else if (<any>hover === false) {
		options.hover = {
			enabled: false
		};
	}
}

function deepCloneAndMigrateOptions(_options: IEditorOptions): IEditorOptions {
	const options = objects.deepClone(_options);
	migrateOptions(options);
	return options;
}

export abstract class CommonEditorConfiguration extends Disposable implements editorCommon.IConfiguration {

	private _onDidChange = this._register(new Emitter<ConfigurationChangedEvent>());
	public readonly onDidChange: Event<ConfigurationChangedEvent> = this._onDidChange.event;

	public readonly isSimpleWidget: boolean;
	public options!: ComputedEditorOptions;

	private _isDominatedByLongLines: boolean;
	private _lineNumbersDigitCount: number;

	private _rawOptions: IEditorOptions;
	private _readOptions: RawEditorOptions;
	protected _validatedOptions: ValidatedEditorOptions;

	constructor(isSimpleWidget: boolean, _options: IEditorOptions) {
		super();
		this.isSimpleWidget = isSimpleWidget;

		this._isDominatedByLongLines = false;
		this._lineNumbersDigitCount = 1;

		this._rawOptions = deepCloneAndMigrateOptions(_options);
		this._readOptions = EditorConfiguration2.readOptions(this._rawOptions);
		this._validatedOptions = EditorConfiguration2.validateOptions(this._readOptions);

		this._register(EditorZoom.onDidChangeZoomLevel(_ => this._recomputeOptions()));
		this._register(TabFocus.onDidChangeTabFocus(_ => this._recomputeOptions()));
	}

	public observeReferenceElement(dimension?: editorCommon.IDimension): void {
	}

	public dispose(): void {
		super.dispose();
	}

	protected _recomputeOptions(): void {
		const oldOptions = this.options;
		const newOptions = this._computeInternalOptions();

		if (!oldOptions) {
			this.options = newOptions;
		} else {
			const changeEvent = EditorConfiguration2.checkEquals(oldOptions, newOptions);

			if (changeEvent === null) {
				// nothing changed!
				return;
			}

			this.options = newOptions;
			this._onDidChange.fire(changeEvent);
		}
	}

	public getRawOptions(): IEditorOptions {
		return this._rawOptions;
	}

	private _computeInternalOptions(): ComputedEditorOptions {
		const partialEnv = this._getEnvConfiguration();
		const bareFontInfo = BareFontInfo.createFromValidatedSettings(this._validatedOptions, partialEnv.zoomLevel, this.isSimpleWidget);
		const env: IEnvironmentalOptions = {
			outerWidth: partialEnv.outerWidth,
			outerHeight: partialEnv.outerHeight,
			fontInfo: this.readConfiguration(bareFontInfo),
			extraEditorClassName: partialEnv.extraEditorClassName,
			isDominatedByLongLines: this._isDominatedByLongLines,
			lineNumbersDigitCount: this._lineNumbersDigitCount,
			emptySelectionClipboard: partialEnv.emptySelectionClipboard,
			pixelRatio: partialEnv.pixelRatio,
			tabFocusMode: TabFocus.getTabFocusMode(),
			accessibilitySupport: partialEnv.accessibilitySupport
		};
		return EditorConfiguration2.computeOptions(this._validatedOptions, env);
	}

	private static _primitiveArrayEquals(a: any[], b: any[]): boolean {
		if (a.length !== b.length) {
			return false;
		}
		for (let i = 0; i < a.length; i++) {
			if (a[i] !== b[i]) {
				return false;
			}
		}
		return true;
	}

	private static _subsetEquals(base: { [key: string]: any }, subset: { [key: string]: any }): boolean {
		for (const key in subset) {
			if (hasOwnProperty.call(subset, key)) {
				const subsetValue = subset[key];
				const baseValue = base[key];

				if (baseValue === subsetValue) {
					continue;
				}
				if (Array.isArray(baseValue) && Array.isArray(subsetValue)) {
					if (!this._primitiveArrayEquals(baseValue, subsetValue)) {
						return false;
					}
					continue;
				}
				if (typeof baseValue === 'object' && typeof subsetValue === 'object') {
					if (!this._subsetEquals(baseValue, subsetValue)) {
						return false;
					}
					continue;
				}

				return false;
			}
		}
		return true;
	}

	public updateOptions(_newOptions: IEditorOptions): void {
		if (typeof _newOptions === 'undefined') {
			return;
		}
		const newOptions = deepCloneAndMigrateOptions(_newOptions);
		if (CommonEditorConfiguration._subsetEquals(this._rawOptions, newOptions)) {
			return;
		}
		this._rawOptions = objects.mixin(this._rawOptions, newOptions || {});
		this._readOptions = EditorConfiguration2.readOptions(this._rawOptions);
		this._validatedOptions = EditorConfiguration2.validateOptions(this._readOptions);

		this._recomputeOptions();
	}

	public setIsDominatedByLongLines(isDominatedByLongLines: boolean): void {
		this._isDominatedByLongLines = isDominatedByLongLines;
		this._recomputeOptions();
	}

	public setMaxLineNumber(maxLineNumber: number): void {
		let digitCount = CommonEditorConfiguration._digitCount(maxLineNumber);
		if (this._lineNumbersDigitCount === digitCount) {
			return;
		}
		this._lineNumbersDigitCount = digitCount;
		this._recomputeOptions();
	}

	private static _digitCount(n: number): number {
		let r = 0;
		while (n) {
			n = Math.floor(n / 10);
			r++;
		}
		return r ? r : 1;
	}
	protected abstract _getEnvConfiguration(): IEnvConfiguration;

	protected abstract readConfiguration(styling: BareFontInfo): FontInfo;

}

const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
const editorConfiguration: IConfigurationNode = {
	id: 'editor',
	order: 5,
	type: 'object',
	title: nls.localize('editorConfigurationTitle', "Editor"),
	overridable: true,
	scope: ConfigurationScope.RESOURCE,
	properties: {
		'editor.tabSize': {
			type: 'number',
			default: EDITOR_MODEL_DEFAULTS.tabSize,
			minimum: 1,
			markdownDescription: nls.localize('tabSize', "The number of spaces a tab is equal to. This setting is overridden based on the file contents when `#editor.detectIndentation#` is on.")
		},
		// 'editor.indentSize': {
		// 	'anyOf': [
		// 		{
		// 			type: 'string',
		// 			enum: ['tabSize']
		// 		},
		// 		{
		// 			type: 'number',
		// 			minimum: 1
		// 		}
		// 	],
		// 	default: 'tabSize',
		// 	markdownDescription: nls.localize('indentSize', "The number of spaces used for indentation or 'tabSize' to use the value from `#editor.tabSize#`. This setting is overridden based on the file contents when `#editor.detectIndentation#` is on.")
		// },
		'editor.insertSpaces': {
			type: 'boolean',
			default: EDITOR_MODEL_DEFAULTS.insertSpaces,
			markdownDescription: nls.localize('insertSpaces', "Insert spaces when pressing `Tab`. This setting is overridden based on the file contents when `#editor.detectIndentation#` is on.")
		},
		'editor.detectIndentation': {
			type: 'boolean',
			default: EDITOR_MODEL_DEFAULTS.detectIndentation,
			markdownDescription: nls.localize('detectIndentation', "Controls whether `#editor.tabSize#` and `#editor.insertSpaces#` will be automatically detected when a file is opened based on the file contents.")
		},
		'editor.trimAutoWhitespace': {
			type: 'boolean',
			default: EDITOR_MODEL_DEFAULTS.trimAutoWhitespace,
			description: nls.localize('trimAutoWhitespace', "Remove trailing auto inserted whitespace.")
		},
		'editor.largeFileOptimizations': {
			type: 'boolean',
			default: EDITOR_MODEL_DEFAULTS.largeFileOptimizations,
			description: nls.localize('largeFileOptimizations', "Special handling for large files to disable certain memory intensive features.")
		},
		'editor.wordBasedSuggestions': {
			type: 'boolean',
			default: true,
			description: nls.localize('wordBasedSuggestions', "Controls whether completions should be computed based on words in the document.")
		},
		'editor.stablePeek': {
			type: 'boolean',
			default: false,
			markdownDescription: nls.localize('stablePeek', "Keep peek editors open even when double clicking their content or when hitting `Escape`.")
		},
		'editor.maxTokenizationLineLength': {
			type: 'integer',
			default: 20_000,
			description: nls.localize('maxTokenizationLineLength', "Lines above this length will not be tokenized for performance reasons")
		},
		'editor.codeActionsOnSave': {
			type: 'object',
			properties: {
				'source.organizeImports': {
					type: 'boolean',
					description: nls.localize('codeActionsOnSave.organizeImports', "Controls whether organize imports action should be run on file save.")
				},
				'source.fixAll': {
					type: 'boolean',
					description: nls.localize('codeActionsOnSave.fixAll', "Controls whether auto fix action should be run on file save.")
				}
			},
			'additionalProperties': {
				type: 'boolean'
			},
			default: {},
			description: nls.localize('codeActionsOnSave', "Code action kinds to be run on save.")
		},
		'editor.codeActionsOnSaveTimeout': {
			type: 'number',
			default: 750,
			description: nls.localize('codeActionsOnSaveTimeout', "Timeout in milliseconds after which the code actions that are run on save are cancelled.")
		},
		'diffEditor.renderSideBySide': {
			type: 'boolean',
			default: true,
			description: nls.localize('sideBySide', "Controls whether the diff editor shows the diff side by side or inline.")
		},
		'diffEditor.ignoreTrimWhitespace': {
			type: 'boolean',
			default: true,
			description: nls.localize('ignoreTrimWhitespace', "Controls whether the diff editor shows changes in leading or trailing whitespace as diffs.")
		},
		'diffEditor.renderIndicators': {
			type: 'boolean',
			default: true,
			description: nls.localize('renderIndicators', "Controls whether the diff editor shows +/- indicators for added/removed changes.")
		}
	}
};

function isConfigurationPropertySchema(x: IConfigurationPropertySchema | { [path: string]: IConfigurationPropertySchema; }): x is IConfigurationPropertySchema {
	return (typeof x.type !== 'undefined' || typeof x.anyOf !== 'undefined');
}

// Add properties from the Editor Option Registry
for (const editorOption of editorOptionsRegistry) {
	const schema = editorOption.schema;
	if (typeof schema !== 'undefined') {
		if (isConfigurationPropertySchema(schema)) {
			// This is a single schema contribution
			editorConfiguration.properties![`editor.${editorOption.name}`] = schema;
		} else {
			for (let key in schema) {
				if (hasOwnProperty.call(schema, key)) {
					editorConfiguration.properties![key] = schema[key];
				}
			}
		}
	}
}

let cachedEditorConfigurationKeys: { [key: string]: boolean; } | null = null;
function getEditorConfigurationKeys(): { [key: string]: boolean; } {
	if (cachedEditorConfigurationKeys === null) {
		cachedEditorConfigurationKeys = <{ [key: string]: boolean; }>Object.create(null);
		Object.keys(editorConfiguration.properties!).forEach((prop) => {
			cachedEditorConfigurationKeys![prop] = true;
		});
	}
	return cachedEditorConfigurationKeys;
}

export function isEditorConfigurationKey(key: string): boolean {
	const editorConfigurationKeys = getEditorConfigurationKeys();
	return (editorConfigurationKeys[`editor.${key}`] || false);
}
export function isDiffEditorConfigurationKey(key: string): boolean {
	const editorConfigurationKeys = getEditorConfigurationKeys();
	return (editorConfigurationKeys[`diffEditor.${key}`] || false);
}

configurationRegistry.registerConfiguration(editorConfiguration);
