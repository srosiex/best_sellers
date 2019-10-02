/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as env from 'vs/base/common/platform';
import * as dom from 'vs/base/browser/dom';
import { URI } from 'vs/base/common/uri';
import severity from 'vs/base/common/severity';
import { IAction, Action } from 'vs/base/common/actions';
import { Range } from 'vs/editor/common/core/range';
import { ICodeEditor, IEditorMouseEvent, MouseTargetType, IContentWidget, IActiveCodeEditor, IContentWidgetPosition, ContentWidgetPositionPreference } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { IModelDecorationOptions, IModelDeltaDecoration, TrackedRangeStickiness, ITextModel } from 'vs/editor/common/model';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { RemoveBreakpointAction } from 'vs/workbench/contrib/debug/browser/debugActions';
import { IDebugService, IBreakpoint, CONTEXT_BREAKPOINT_WIDGET_VISIBLE, BreakpointWidgetContext, BREAKPOINT_EDITOR_CONTRIBUTION_ID, IBreakpointEditorContribution, IBreakpointUpdateData } from 'vs/workbench/contrib/debug/common/debug';
import { IMarginData } from 'vs/editor/browser/controller/mouseTarget';
import { ContextSubMenu } from 'vs/base/browser/contextmenu';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { BreakpointWidget } from 'vs/workbench/contrib/debug/browser/breakpointWidget';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { getBreakpointMessageAndClassName } from 'vs/workbench/contrib/debug/browser/breakpointsView';
import { generateUuid } from 'vs/base/common/uuid';
import { memoize } from 'vs/base/common/decorators';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { distinct } from 'vs/base/common/arrays';
import { RunOnceScheduler } from 'vs/base/common/async';

const $ = dom.$;

interface IBreakpointDecoration {
	decorationId: string;
	breakpoint: IBreakpoint;
	range: Range;
	inlineWidget?: InlineBreakpointWidget;
}

const breakpointHelperDecoration: IModelDecorationOptions = {
	glyphMarginClassName: 'debug-breakpoint-hint',
	stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
};

function createBreakpointDecorations(model: ITextModel, breakpoints: ReadonlyArray<IBreakpoint>, debugService: IDebugService): { range: Range; options: IModelDecorationOptions; }[] {
	const result: { range: Range; options: IModelDecorationOptions; }[] = [];
	breakpoints.forEach((breakpoint) => {
		if (breakpoint.lineNumber <= model.getLineCount()) {
			const column = model.getLineFirstNonWhitespaceColumn(breakpoint.lineNumber);
			const range = model.validateRange(
				breakpoint.column ? new Range(breakpoint.lineNumber, breakpoint.column, breakpoint.lineNumber, breakpoint.column + 1)
					: new Range(breakpoint.lineNumber, column, breakpoint.lineNumber, column + 1) // Decoration has to have a width #20688
			);

			result.push({
				options: getBreakpointDecorationOptions(model, breakpoint, debugService),
				range
			});
		}
	});

	return result;
}

function getBreakpointDecorationOptions(model: ITextModel, breakpoint: IBreakpoint, debugService: IDebugService): IModelDecorationOptions {
	const { className, message } = getBreakpointMessageAndClassName(debugService, breakpoint);
	let glyphMarginHoverMessage: MarkdownString | undefined;

	if (message) {
		if (breakpoint.condition || breakpoint.hitCondition) {
			const modeId = model.getLanguageIdentifier().language;
			glyphMarginHoverMessage = new MarkdownString().appendCodeblock(modeId, message);
		} else {
			glyphMarginHoverMessage = new MarkdownString().appendText(message);
		}
	}

	return {
		glyphMarginClassName: className,
		glyphMarginHoverMessage,
		stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
		beforeContentClassName: breakpoint.column ? `debug-breakpoint-placeholder` : undefined
	};
}

async function createCandidateDecorations(model: ITextModel, breakpointDecorations: IBreakpointDecoration[], debugService: IDebugService): Promise<{ range: Range; options: IModelDecorationOptions; breakpoint: IBreakpoint | undefined }[]> {
	const lineNumbers = distinct(breakpointDecorations.map(bpd => bpd.range.startLineNumber));
	const result: { range: Range; options: IModelDecorationOptions; breakpoint: IBreakpoint | undefined }[] = [];
	const session = debugService.getViewModel().focusedSession;
	if (session && session.capabilities.supportsBreakpointLocationsRequest) {
		await Promise.all(lineNumbers.map(async lineNumber => {
			const positions = await session.breakpointsLocations(model.uri, lineNumber);
			if (positions.length > 1) {
				// Do not render candidates if there is only one, since it is already covered by the line breakpoint
				positions.forEach(p => {
					const range = new Range(p.lineNumber, p.column, p.lineNumber, p.column + 1);
					const breakpointAtPosition = breakpointDecorations.filter(bpd => bpd.range.equalsRange(range)).pop();
					if (breakpointAtPosition && breakpointAtPosition.inlineWidget) {
						// Space already occupied, do not render candidate.
						return;
					}
					result.push({
						range,
						options: {
							stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
							beforeContentClassName: `debug-breakpoint-placeholder`
						},
						breakpoint: breakpointAtPosition ? breakpointAtPosition.breakpoint : undefined
					});
				});
			}
		}));
	}

	return result;
}


class BreakpointEditorContribution implements IBreakpointEditorContribution {

	private breakpointHintDecoration: string[] = [];
	private breakpointWidget: BreakpointWidget | undefined;
	private breakpointWidgetVisible: IContextKey<boolean>;
	private toDispose: IDisposable[] = [];
	private ignoreDecorationsChangedEvent = false;
	private ignoreBreakpointsChangeEvent = false;
	private breakpointDecorations: IBreakpointDecoration[] = [];
	private candidateDecorations: { decorationId: string, inlineWidget: InlineBreakpointWidget }[] = [];
	private setDecorationsScheduler: RunOnceScheduler;

	constructor(
		private readonly editor: ICodeEditor,
		@IDebugService private readonly debugService: IDebugService,
		@IContextMenuService private readonly contextMenuService: IContextMenuService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IDialogService private readonly dialogService: IDialogService,
	) {
		this.breakpointWidgetVisible = CONTEXT_BREAKPOINT_WIDGET_VISIBLE.bindTo(contextKeyService);
		this.registerListeners();
		this.setDecorationsScheduler = new RunOnceScheduler(() => this.setDecorations(), 30);
	}

	getId(): string {
		return BREAKPOINT_EDITOR_CONTRIBUTION_ID;
	}

	private registerListeners(): void {
		this.toDispose.push(this.editor.onMouseDown(async (e: IEditorMouseEvent) => {
			const data = e.target.detail as IMarginData;
			const model = this.editor.getModel();
			if (!e.target.position || !model || e.target.type !== MouseTargetType.GUTTER_GLYPH_MARGIN || data.isAfterLines || !this.marginFreeFromNonDebugDecorations(e.target.position.lineNumber)) {
				return;
			}
			const canSetBreakpoints = this.debugService.getConfigurationManager().canSetBreakpointsIn(model);
			const lineNumber = e.target.position.lineNumber;
			const uri = model.uri;

			if (e.event.rightButton || (env.isMacintosh && e.event.leftButton && e.event.ctrlKey)) {
				if (!canSetBreakpoints) {
					return;
				}

				const anchor = { x: e.event.posx, y: e.event.posy };
				const breakpoints = this.debugService.getModel().getBreakpoints({ lineNumber, uri });
				const actions = this.getContextMenuActions(breakpoints, uri, lineNumber);

				this.contextMenuService.showContextMenu({
					getAnchor: () => anchor,
					getActions: () => actions,
					getActionsContext: () => breakpoints.length ? breakpoints[0] : undefined,
					onHide: () => dispose(actions)
				});
			} else {
				const breakpoints = this.debugService.getModel().getBreakpoints({ uri, lineNumber });

				if (breakpoints.length) {
					// Show the dialog if there is a potential condition to be accidently lost.
					// Do not show dialog on linux due to electron issue freezing the mouse #50026
					if (!env.isLinux && breakpoints.some(bp => !!bp.condition || !!bp.logMessage || !!bp.hitCondition)) {
						const logPoint = breakpoints.every(bp => !!bp.logMessage);
						const breakpointType = logPoint ? nls.localize('logPoint', "Logpoint") : nls.localize('breakpoint', "Breakpoint");
						const disable = breakpoints.some(bp => bp.enabled);

						const enabling = nls.localize('breakpointHasConditionDisabled',
							"This {0} has a {1} that will get lost on remove. Consider enabling the {0} instead.",
							breakpointType.toLowerCase(),
							logPoint ? nls.localize('message', "message") : nls.localize('condition', "condition")
						);
						const disabling = nls.localize('breakpointHasConditionEnabled',
							"This {0} has a {1} that will get lost on remove. Consider disabling the {0} instead.",
							breakpointType.toLowerCase(),
							logPoint ? nls.localize('message', "message") : nls.localize('condition', "condition")
						);

						const { choice } = await this.dialogService.show(severity.Info, disable ? disabling : enabling, [
							nls.localize('removeLogPoint', "Remove {0}", breakpointType),
							nls.localize('disableLogPoint', "{0} {1}", disable ? nls.localize('disable', "Disable") : nls.localize('enable', "Enable"), breakpointType),
							nls.localize('cancel', "Cancel")
						], { cancelId: 2 });

						if (choice === 0) {
							breakpoints.forEach(bp => this.debugService.removeBreakpoints(bp.getId()));
						}
						if (choice === 1) {
							breakpoints.forEach(bp => this.debugService.enableOrDisableBreakpoints(!disable, bp));
						}
					} else {
						breakpoints.forEach(bp => this.debugService.removeBreakpoints(bp.getId()));
					}
				} else if (canSetBreakpoints) {
					this.debugService.addBreakpoints(uri, [{ lineNumber }], `debugEditorGutter`);
				}
			}
		}));

		this.toDispose.push(this.editor.onMouseMove((e: IEditorMouseEvent) => {
			let showBreakpointHintAtLineNumber = -1;
			const model = this.editor.getModel();
			if (model && e.target.position && e.target.type === MouseTargetType.GUTTER_GLYPH_MARGIN && this.debugService.getConfigurationManager().canSetBreakpointsIn(model) &&
				this.marginFreeFromNonDebugDecorations(e.target.position.lineNumber)) {
				const data = e.target.detail as IMarginData;
				if (!data.isAfterLines) {
					showBreakpointHintAtLineNumber = e.target.position.lineNumber;
				}
			}
			this.ensureBreakpointHintDecoration(showBreakpointHintAtLineNumber);
		}));
		this.toDispose.push(this.editor.onMouseLeave((e: IEditorMouseEvent) => {
			this.ensureBreakpointHintDecoration(-1);
		}));

		this.toDispose.push(this.editor.onDidChangeModel(async () => {
			this.closeBreakpointWidget();
			await this.setDecorations();
		}));
		this.toDispose.push(this.debugService.getModel().onDidChangeBreakpoints(async () => {
			if (!this.ignoreBreakpointsChangeEvent && !this.setDecorationsScheduler.isScheduled()) {
				this.setDecorationsScheduler.schedule();
			}
		}));
		this.toDispose.push(this.editor.onDidChangeModelDecorations(() => this.onModelDecorationsChanged()));
	}

	private getContextMenuActions(breakpoints: ReadonlyArray<IBreakpoint>, uri: URI, lineNumber: number, column?: number): Array<IAction | ContextSubMenu> {
		const actions: Array<IAction | ContextSubMenu> = [];
		if (breakpoints.length === 1) {
			const breakpointType = breakpoints[0].logMessage ? nls.localize('logPoint', "Logpoint") : nls.localize('breakpoint', "Breakpoint");
			actions.push(new RemoveBreakpointAction(RemoveBreakpointAction.ID, nls.localize('removeBreakpoint', "Remove {0}", breakpointType), this.debugService));
			actions.push(new Action(
				'workbench.debug.action.editBreakpointAction',
				nls.localize('editBreakpoint', "Edit {0}...", breakpointType),
				undefined,
				true,
				() => Promise.resolve(this.showBreakpointWidget(breakpoints[0].lineNumber, breakpoints[0].column))
			));

			actions.push(new Action(
				`workbench.debug.viewlet.action.toggleBreakpoint`,
				breakpoints[0].enabled ? nls.localize('disableBreakpoint', "Disable {0}", breakpointType) : nls.localize('enableBreakpoint', "Enable {0}", breakpointType),
				undefined,
				true,
				() => this.debugService.enableOrDisableBreakpoints(!breakpoints[0].enabled, breakpoints[0])
			));
		} else if (breakpoints.length > 1) {
			const sorted = breakpoints.slice().sort((first, second) => (first.column && second.column) ? first.column - second.column : 1);
			actions.push(new ContextSubMenu(nls.localize('removeBreakpoints', "Remove Breakpoints"), sorted.map(bp => new Action(
				'removeInlineBreakpoint',
				bp.column ? nls.localize('removeInlineBreakpointOnColumn', "Remove Inline Breakpoint on Column {0}", bp.column) : nls.localize('removeLineBreakpoint', "Remove Line Breakpoint"),
				undefined,
				true,
				() => this.debugService.removeBreakpoints(bp.getId())
			))));

			actions.push(new ContextSubMenu(nls.localize('editBreakpoints', "Edit Breakpoints"), sorted.map(bp =>
				new Action('editBreakpoint',
					bp.column ? nls.localize('editInlineBreakpointOnColumn', "Edit Inline Breakpoint on Column {0}", bp.column) : nls.localize('editLineBrekapoint', "Edit Line Breakpoint"),
					undefined,
					true,
					() => Promise.resolve(this.showBreakpointWidget(bp.lineNumber, bp.column))
				)
			)));

			actions.push(new ContextSubMenu(nls.localize('enableDisableBreakpoints', "Enable/Disable Breakpoints"), sorted.map(bp => new Action(
				bp.enabled ? 'disableColumnBreakpoint' : 'enableColumnBreakpoint',
				bp.enabled ? (bp.column ? nls.localize('disableInlineColumnBreakpoint', "Disable Inline Breakpoint on Column {0}", bp.column) : nls.localize('disableBreakpointOnLine', "Disable Line Breakpoint"))
					: (bp.column ? nls.localize('enableBreakpoints', "Enable Inline Breakpoint on Column {0}", bp.column) : nls.localize('enableBreakpointOnLine', "Enable Line Breakpoint")),
				undefined,
				true,
				() => this.debugService.enableOrDisableBreakpoints(!bp.enabled, bp)
			))));
		} else {
			actions.push(new Action(
				'addBreakpoint',
				nls.localize('addBreakpoint', "Add Breakpoint"),
				undefined,
				true,
				() => this.debugService.addBreakpoints(uri, [{ lineNumber, column }], `debugEditorContextMenu`)
			));
			actions.push(new Action(
				'addConditionalBreakpoint',
				nls.localize('addConditionalBreakpoint', "Add Conditional Breakpoint..."),
				undefined,
				true,
				() => Promise.resolve(this.showBreakpointWidget(lineNumber, column))
			));
			actions.push(new Action(
				'addLogPoint',
				nls.localize('addLogPoint', "Add Logpoint..."),
				undefined,
				true,
				() => Promise.resolve(this.showBreakpointWidget(lineNumber, column, BreakpointWidgetContext.LOG_MESSAGE))
			));
		}

		return actions;
	}

	private marginFreeFromNonDebugDecorations(line: number): boolean {
		const decorations = this.editor.getLineDecorations(line);
		if (decorations) {
			for (const { options } of decorations) {
				if (options.glyphMarginClassName && options.glyphMarginClassName.indexOf('debug') === -1) {
					return false;
				}
			}
		}

		return true;
	}

	private ensureBreakpointHintDecoration(showBreakpointHintAtLineNumber: number): void {
		const newDecoration: IModelDeltaDecoration[] = [];
		if (showBreakpointHintAtLineNumber !== -1) {
			newDecoration.push({
				options: breakpointHelperDecoration,
				range: {
					startLineNumber: showBreakpointHintAtLineNumber,
					startColumn: 1,
					endLineNumber: showBreakpointHintAtLineNumber,
					endColumn: 1
				}
			});
		}

		this.breakpointHintDecoration = this.editor.deltaDecorations(this.breakpointHintDecoration, newDecoration);
	}

	private async setDecorations(): Promise<void> {
		if (!this.editor.hasModel()) {
			return;
		}

		const activeCodeEditor = this.editor;
		const model = activeCodeEditor.getModel();
		const breakpoints = this.debugService.getModel().getBreakpoints({ uri: model.uri });
		const desiredBreakpointDecorations = createBreakpointDecorations(model, breakpoints, this.debugService);

		try {
			this.ignoreDecorationsChangedEvent = true;

			// Set breakpoint decorations
			const decorationIds = activeCodeEditor.deltaDecorations(this.breakpointDecorations.map(bpd => bpd.decorationId), desiredBreakpointDecorations);
			this.breakpointDecorations.forEach(bpd => {
				if (bpd.inlineWidget) {
					bpd.inlineWidget.dispose();
				}
			});
			this.breakpointDecorations = decorationIds.map((decorationId, index) => {
				let inlineWidget: InlineBreakpointWidget | undefined = undefined;
				const breakpoint = breakpoints[index];
				if (breakpoint.column) {
					const contextMenuActions = () => this.getContextMenuActions([breakpoint], activeCodeEditor.getModel().uri, breakpoint.lineNumber, breakpoint.column);
					inlineWidget = new InlineBreakpointWidget(activeCodeEditor, decorationId, desiredBreakpointDecorations[index].options.glyphMarginClassName, breakpoint, this.debugService, this.contextMenuService, contextMenuActions);
				}

				return {
					decorationId,
					breakpoint,
					range: desiredBreakpointDecorations[index].range,
					inlineWidget
				};
			});

		} finally {
			this.ignoreDecorationsChangedEvent = false;
		}

		// Set breakpoint candidate decorations
		const desiredCandidateDecorations = await createCandidateDecorations(this.editor.getModel(), this.breakpointDecorations, this.debugService);
		const candidateDecorationIds = this.editor.deltaDecorations(this.candidateDecorations.map(c => c.decorationId), desiredCandidateDecorations);
		this.candidateDecorations.forEach(candidate => {
			candidate.inlineWidget.dispose();
		});
		this.candidateDecorations = candidateDecorationIds.map((decorationId, index) => {
			const candidate = desiredCandidateDecorations[index];
			// Candidate decoration has a breakpoint attached when a breakpoint is already at that location and we did not yet set a decoration there
			// In practice this happens for the first breakpoint that was set on a line
			// We could have also rendered this first decoration as part of desiredBreakpointDecorations however at that moment we have no location information
			const cssClass = candidate.breakpoint ? getBreakpointMessageAndClassName(this.debugService, candidate.breakpoint).className : 'debug-breakpoint-disabled';
			const contextMenuActions = () => this.getContextMenuActions(candidate.breakpoint ? [candidate.breakpoint] : [], activeCodeEditor.getModel().uri, candidate.range.startLineNumber, candidate.range.startColumn);
			const inlineWidget = new InlineBreakpointWidget(activeCodeEditor, decorationId, cssClass, candidate.breakpoint, this.debugService, this.contextMenuService, contextMenuActions);

			return {
				decorationId,
				inlineWidget
			};
		});
	}

	private async onModelDecorationsChanged(): Promise<void> {
		if (this.breakpointDecorations.length === 0 || this.ignoreDecorationsChangedEvent || !this.editor.hasModel()) {
			// I have no decorations
			return;
		}
		let somethingChanged = false;
		const model = this.editor.getModel();
		this.breakpointDecorations.forEach(breakpointDecoration => {
			if (somethingChanged) {
				return;
			}
			const newBreakpointRange = model.getDecorationRange(breakpointDecoration.decorationId);
			if (newBreakpointRange && (!breakpointDecoration.range.equalsRange(newBreakpointRange))) {
				somethingChanged = true;
			}
		});
		if (!somethingChanged) {
			// nothing to do, my decorations did not change.
			return;
		}

		const data = new Map<string, IBreakpointUpdateData>();
		for (let i = 0, len = this.breakpointDecorations.length; i < len; i++) {
			const breakpointDecoration = this.breakpointDecorations[i];
			const decorationRange = model.getDecorationRange(breakpointDecoration.decorationId);
			// check if the line got deleted.
			if (decorationRange) {
				// since we know it is collapsed, it cannot grow to multiple lines
				if (breakpointDecoration.breakpoint) {
					data.set(breakpointDecoration.breakpoint.getId(), {
						lineNumber: decorationRange.startLineNumber,
						column: breakpointDecoration.breakpoint.column ? decorationRange.startColumn : undefined,
					});
				}
			}
		}

		try {
			this.ignoreBreakpointsChangeEvent = true;
			await this.debugService.updateBreakpoints(model.uri, data, true);
		} finally {
			this.ignoreBreakpointsChangeEvent = false;
		}
	}

	// breakpoint widget
	showBreakpointWidget(lineNumber: number, column: number | undefined, context?: BreakpointWidgetContext): void {
		if (this.breakpointWidget) {
			this.breakpointWidget.dispose();
		}

		this.breakpointWidget = this.instantiationService.createInstance(BreakpointWidget, this.editor, lineNumber, column, context);
		this.breakpointWidget.show({ lineNumber, column: 1 });
		this.breakpointWidgetVisible.set(true);
	}

	closeBreakpointWidget(): void {
		if (this.breakpointWidget) {
			this.breakpointWidget.dispose();
			this.breakpointWidget = undefined;
			this.breakpointWidgetVisible.reset();
			this.editor.focus();
		}
	}

	dispose(): void {
		if (this.breakpointWidget) {
			this.breakpointWidget.dispose();
		}
		this.editor.deltaDecorations(this.breakpointDecorations.map(bpd => bpd.decorationId), []);
		dispose(this.toDispose);
	}
}

class InlineBreakpointWidget implements IContentWidget, IDisposable {

	// editor.IContentWidget.allowEditorOverflow
	allowEditorOverflow = false;
	suppressMouseDown = true;

	private domNode!: HTMLElement;
	private range: Range | null;
	private toDispose: IDisposable[] = [];

	constructor(
		private readonly editor: IActiveCodeEditor,
		private readonly decorationId: string,
		cssClass: string | null | undefined,
		private readonly breakpoint: IBreakpoint | undefined,
		private readonly debugService: IDebugService,
		private readonly contextMenuService: IContextMenuService,
		private readonly getContextMenuActions: () => ReadonlyArray<IAction | ContextSubMenu>
	) {
		this.range = this.editor.getModel().getDecorationRange(decorationId);
		this.toDispose.push(this.editor.onDidChangeModelDecorations(() => {
			const model = this.editor.getModel();
			const range = model.getDecorationRange(this.decorationId);
			if (this.range && !this.range.equalsRange(range)) {
				this.range = range;
				this.editor.layoutContentWidget(this);
			}
		}));
		this.create(cssClass);

		this.editor.addContentWidget(this);
		this.editor.layoutContentWidget(this);
	}

	private create(cssClass: string | null | undefined): void {
		this.domNode = $('.inline-breakpoint-widget');
		if (cssClass) {
			this.domNode.classList.add(cssClass);
		}
		this.toDispose.push(dom.addDisposableListener(this.domNode, dom.EventType.CLICK, async e => {
			if (this.breakpoint) {
				await this.debugService.removeBreakpoints(this.breakpoint.getId());
			} else {
				await this.debugService.addBreakpoints(this.editor.getModel().uri, [{ lineNumber: this.range!.startLineNumber, column: this.range!.startColumn }], 'debugEditorInlineWidget');
			}
		}));
		this.toDispose.push(dom.addDisposableListener(this.domNode, dom.EventType.CONTEXT_MENU, e => {
			const event = new StandardMouseEvent(e);
			const anchor = { x: event.posx, y: event.posy };
			const actions = this.getContextMenuActions();
			this.contextMenuService.showContextMenu({
				getAnchor: () => anchor,
				getActions: () => actions,
				getActionsContext: () => this.breakpoint,
				onHide: () => dispose(actions)
			});
		}));
	}

	@memoize
	getId(): string {
		return generateUuid();
	}

	getDomNode(): HTMLElement {
		return this.domNode;
	}

	getPosition(): IContentWidgetPosition | null {
		if (!this.range) {
			return null;
		}
		// Workaround: since the content widget can not be placed before the first column we need to force the left position
		dom.toggleClass(this.domNode, 'line-start', this.range.startColumn === 1);

		return {
			position: { lineNumber: this.range.startLineNumber, column: this.range.startColumn - 1 },
			preference: [ContentWidgetPositionPreference.EXACT]
		};
	}

	dispose(): void {
		this.editor.removeContentWidget(this);
		dispose(this.toDispose);
	}
}

registerEditorContribution(BreakpointEditorContribution);
