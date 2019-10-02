/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from 'vs/base/common/arrays';
import { TimeoutTimer } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { size } from 'vs/base/common/collections';
import { onUnexpectedError } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { isEqual, dirname } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IPosition } from 'vs/editor/common/core/position';
import { DocumentSymbolProviderRegistry } from 'vs/editor/common/modes';
import { OutlineElement, OutlineGroup, OutlineModel, TreeElement } from 'vs/editor/contrib/documentSymbols/outlineModel';
import { IWorkspaceContextService, IWorkspaceFolder, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { Schemas } from 'vs/base/common/network';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { BreadcrumbsConfig } from 'vs/workbench/browser/parts/editor/breadcrumbs';
import { FileKind } from 'vs/platform/files/common/files';
import { withNullAsUndefined } from 'vs/base/common/types';

export class FileElement {
	constructor(
		readonly uri: URI,
		readonly kind: FileKind
	) { }
}

export type BreadcrumbElement = FileElement | OutlineModel | OutlineGroup | OutlineElement;

type FileInfo = { path: FileElement[], folder?: IWorkspaceFolder };

export class EditorBreadcrumbsModel {

	private readonly _disposables = new DisposableStore();
	private readonly _fileInfo: FileInfo;

	private readonly _cfgFilePath: BreadcrumbsConfig<'on' | 'off' | 'last'>;
	private readonly _cfgSymbolPath: BreadcrumbsConfig<'on' | 'off' | 'last'>;

	private _outlineElements: Array<OutlineModel | OutlineGroup | OutlineElement> = [];
	private _outlineDisposables = new DisposableStore();

	private readonly _onDidUpdate = new Emitter<this>();
	readonly onDidUpdate: Event<this> = this._onDidUpdate.event;

	constructor(
		private readonly _uri: URI,
		private readonly _editor: ICodeEditor | undefined,
		@IWorkspaceContextService workspaceService: IWorkspaceContextService,
		@IConfigurationService configurationService: IConfigurationService,
	) {

		this._cfgFilePath = BreadcrumbsConfig.FilePath.bindTo(configurationService);
		this._cfgSymbolPath = BreadcrumbsConfig.SymbolPath.bindTo(configurationService);

		this._disposables.add(this._cfgFilePath.onDidChange(_ => this._onDidUpdate.fire(this)));
		this._disposables.add(this._cfgSymbolPath.onDidChange(_ => this._onDidUpdate.fire(this)));

		this._fileInfo = EditorBreadcrumbsModel._initFilePathInfo(this._uri, workspaceService);
		this._bindToEditor();
		this._onDidUpdate.fire(this);
	}

	dispose(): void {
		this._cfgFilePath.dispose();
		this._cfgSymbolPath.dispose();
		this._disposables.dispose();
	}

	isRelative(): boolean {
		return Boolean(this._fileInfo.folder);
	}

	getElements(): ReadonlyArray<BreadcrumbElement> {
		let result: BreadcrumbElement[] = [];

		// file path elements
		if (this._cfgFilePath.getValue() === 'on') {
			result = result.concat(this._fileInfo.path);
		} else if (this._cfgFilePath.getValue() === 'last' && this._fileInfo.path.length > 0) {
			result = result.concat(this._fileInfo.path.slice(-1));
		}

		// symbol path elements
		if (this._cfgSymbolPath.getValue() === 'on') {
			result = result.concat(this._outlineElements);
		} else if (this._cfgSymbolPath.getValue() === 'last' && this._outlineElements.length > 0) {
			result = result.concat(this._outlineElements.slice(-1));
		}

		return result;
	}

	private static _initFilePathInfo(uri: URI, workspaceService: IWorkspaceContextService): FileInfo {

		if (uri.scheme === Schemas.untitled) {
			return {
				folder: undefined,
				path: []
			};
		}

		let info: FileInfo = {
			folder: withNullAsUndefined(workspaceService.getWorkspaceFolder(uri)),
			path: []
		};

		let uriPrefix: URI | null = uri;
		while (uriPrefix && uriPrefix.path !== '/') {
			if (info.folder && isEqual(info.folder.uri, uriPrefix)) {
				break;
			}
			info.path.unshift(new FileElement(uriPrefix, info.path.length === 0 ? FileKind.FILE : FileKind.FOLDER));
			let prevPathLength = uriPrefix.path.length;
			uriPrefix = dirname(uriPrefix);
			if (uriPrefix.path.length === prevPathLength) {
				break;
			}
		}

		if (info.folder && workspaceService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
			info.path.unshift(new FileElement(info.folder.uri, FileKind.ROOT_FOLDER));
		}
		return info;
	}

	private _bindToEditor(): void {
		if (!this._editor) {
			return;
		}
		// update as language, model, providers changes
		this._disposables.add(DocumentSymbolProviderRegistry.onDidChange(_ => this._updateOutline()));
		this._disposables.add(this._editor.onDidChangeModel(_ => this._updateOutline()));
		this._disposables.add(this._editor.onDidChangeModelLanguage(_ => this._updateOutline()));

		// update soon'ish as model content change
		const updateSoon = new TimeoutTimer();
		this._disposables.add(updateSoon);
		this._disposables.add(this._editor.onDidChangeModelContent(_ => {
			const timeout = OutlineModel.getRequestDelay(this._editor!.getModel());
			updateSoon.cancelAndSet(() => this._updateOutline(true), timeout);
		}));
		this._updateOutline();

		// stop when editor dies
		this._disposables.add(this._editor.onDidDispose(() => this._outlineDisposables.clear()));
	}

	private _updateOutline(didChangeContent?: boolean): void {

		this._outlineDisposables.clear();
		if (!didChangeContent) {
			this._updateOutlineElements([]);
		}

		const editor = this._editor!;

		const buffer = editor.getModel();
		if (!buffer || !DocumentSymbolProviderRegistry.has(buffer) || !isEqual(buffer.uri, this._uri)) {
			return;
		}

		const source = new CancellationTokenSource();
		const versionIdThen = buffer.getVersionId();
		const timeout = new TimeoutTimer();

		this._outlineDisposables.add({
			dispose: () => {
				source.cancel();
				source.dispose();
				timeout.dispose();
			}
		});

		OutlineModel.create(buffer, source.token).then(model => {
			if (TreeElement.empty(model)) {
				// empty -> no outline elements
				this._updateOutlineElements([]);

			} else {
				// copy the model
				model = model.adopt();

				this._updateOutlineElements(this._getOutlineElements(model, editor.getPosition()));
				this._outlineDisposables.add(editor.onDidChangeCursorPosition(_ => {
					timeout.cancelAndSet(() => {
						if (!buffer.isDisposed() && versionIdThen === buffer.getVersionId() && editor.getModel()) {
							this._updateOutlineElements(this._getOutlineElements(model, editor.getPosition()));
						}
					}, 150);
				}));
			}
		}).catch(err => {
			this._updateOutlineElements([]);
			onUnexpectedError(err);
		});
	}

	private _getOutlineElements(model: OutlineModel, position: IPosition | null): Array<OutlineModel | OutlineGroup | OutlineElement> {
		if (!model || !position) {
			return [];
		}
		let item: OutlineGroup | OutlineElement | undefined = model.getItemEnclosingPosition(position);
		if (!item) {
			return [model];
		}
		let chain: Array<OutlineGroup | OutlineElement> = [];
		while (item) {
			chain.push(item);
			let parent: any = item.parent;
			if (parent instanceof OutlineModel) {
				break;
			}
			if (parent instanceof OutlineGroup && parent.parent && size(parent.parent.children) === 1) {
				break;
			}
			item = parent;
		}
		return chain.reverse();
	}

	private _updateOutlineElements(elements: Array<OutlineModel | OutlineGroup | OutlineElement>): void {
		if (!equals(elements, this._outlineElements, EditorBreadcrumbsModel._outlineElementEquals)) {
			this._outlineElements = elements;
			this._onDidUpdate.fire(this);
		}
	}

	private static _outlineElementEquals(a: OutlineModel | OutlineGroup | OutlineElement, b: OutlineModel | OutlineGroup | OutlineElement): boolean {
		if (a === b) {
			return true;
		} else if (!a || !b) {
			return false;
		} else {
			return a.id === b.id;
		}
	}
}
