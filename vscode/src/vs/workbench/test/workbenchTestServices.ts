/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/workbench/contrib/files/browser/files.contribution'; // load our contribution into the test
import { FileEditorInput } from 'vs/workbench/contrib/files/common/editors/fileEditorInput';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { join } from 'vs/base/common/path';
import * as resources from 'vs/base/common/resources';
import { URI, UriComponents } from 'vs/base/common/uri';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { ConfirmResult, IEditorInputWithOptions, CloseDirection, IEditorIdentifier, IUntitledResourceInput, IResourceDiffInput, IResourceSideBySideInput, IEditorInput, IEditor, IEditorCloseEvent, IEditorPartOptions } from 'vs/workbench/common/editor';
import { IEditorOpeningEvent, EditorServiceImpl, IEditorGroupView } from 'vs/workbench/browser/parts/editor/editor';
import { Event, Emitter } from 'vs/base/common/event';
import Severity from 'vs/base/common/severity';
import { IBackupFileService, IResolvedBackup } from 'vs/workbench/services/backup/common/backup';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkbenchLayoutService, Parts, Position as PartPosition } from 'vs/workbench/services/layout/browser/layoutService';
import { TextModelResolverService } from 'vs/workbench/services/textmodelResolver/common/textModelResolverService';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { IEditorOptions, IResourceInput } from 'vs/platform/editor/common/editor';
import { IUntitledEditorService, UntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IWorkspaceContextService, IWorkspace as IWorkbenchWorkspace, WorkbenchState, IWorkspaceFolder, IWorkspaceFoldersChangeEvent, Workspace } from 'vs/platform/workspace/common/workspace';
import { ILifecycleService, BeforeShutdownEvent, ShutdownReason, StartupKind, LifecyclePhase, WillShutdownEvent } from 'vs/platform/lifecycle/common/lifecycle';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { FileOperationEvent, IFileService, FileOperationError, IFileStat, IResolveFileResult, FileChangesEvent, IResolveFileOptions, ICreateFileOptions, IFileSystemProvider, FileSystemProviderCapabilities, IFileChange, IWatchOptions, IStat, FileType, FileDeleteOptions, FileOverwriteOptions, FileWriteOptions, FileOpenOptions, IFileStatWithMetadata, IResolveMetadataFileOptions, IWriteFileOptions, IReadFileOptions, IFileContent, IFileStreamContent } from 'vs/platform/files/common/files';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ModeServiceImpl } from 'vs/editor/common/services/modeServiceImpl';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { ITextFileStreamContent, ITextFileService, IResourceEncoding, IReadTextFileOptions } from 'vs/workbench/services/textfile/common/textfiles';
import { parseArgs, OPTIONS } from 'vs/platform/environment/node/argv';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { MenuBarVisibility, IWindowConfiguration, IWindowOpenable, IOpenWindowOptions, IOpenEmptyWindowOptions, IOpenedWindow } from 'vs/platform/windows/common/windows';
import { TestWorkspace } from 'vs/platform/workspace/test/common/testWorkspace';
import { createTextBufferFactoryFromStream } from 'vs/editor/common/model/textModel';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { ITextResourceConfigurationService, ITextResourcePropertiesService } from 'vs/editor/common/services/resourceConfiguration';
import { IPosition, Position as EditorPosition } from 'vs/editor/common/core/position';
import { IMenuService, MenuId, IMenu } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { MockContextKeyService, MockKeybindingService } from 'vs/platform/keybinding/test/common/mockKeybindingService';
import { ITextBufferFactory, DefaultEndOfLine, EndOfLinePreference, IModelDecorationOptions, ITextModel, ITextSnapshot } from 'vs/editor/common/model';
import { Range } from 'vs/editor/common/core/range';
import { IConfirmation, IConfirmationResult, IDialogService, IDialogOptions, IPickAndOpenOptions, ISaveDialogOptions, IOpenDialogOptions, IFileDialogService, IShowResult } from 'vs/platform/dialogs/common/dialogs';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { TestNotificationService } from 'vs/platform/notification/test/common/testNotificationService';
import { IExtensionService, NullExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IDecorationsService, IResourceDecorationChangeEvent, IDecoration, IDecorationData, IDecorationsProvider } from 'vs/workbench/services/decorations/browser/decorations';
import { IDisposable, toDisposable, Disposable } from 'vs/base/common/lifecycle';
import { IEditorGroupsService, IEditorGroup, GroupsOrder, GroupsArrangement, GroupDirection, IAddGroupOptions, IMergeGroupOptions, IMoveEditorOptions, ICopyEditorOptions, IEditorReplacement, IGroupChangeEvent, EditorsOrder, IFindGroupScope, EditorGroupLayout, ICloseEditorOptions } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService, IOpenEditorOverrideHandler, IVisibleEditor } from 'vs/workbench/services/editor/common/editorService';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { ICodeEditor, IDiffEditor } from 'vs/editor/browser/editorBrowser';
import { IDecorationRenderOptions } from 'vs/editor/common/editorCommon';
import { EditorGroup } from 'vs/workbench/common/editor/editorGroup';
import { Dimension } from 'vs/base/browser/dom';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { ILabelService } from 'vs/platform/label/common/label';
import { timeout } from 'vs/base/common/async';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { ViewletDescriptor, Viewlet } from 'vs/workbench/browser/viewlet';
import { IViewlet } from 'vs/workbench/common/viewlet';
import { IStorageService, InMemoryStorageService } from 'vs/platform/storage/common/storage';
import { isLinux, isMacintosh, IProcessEnvironment } from 'vs/base/common/platform';
import { LabelService } from 'vs/workbench/services/label/common/labelService';
import { IDimension } from 'vs/platform/layout/browser/layoutService';
import { Part } from 'vs/workbench/browser/part';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { IPanel } from 'vs/workbench/common/panel';
import { IBadge } from 'vs/workbench/services/activity/common/activity';
import { ISharedProcessService } from 'vs/platform/ipc/electron-browser/sharedProcessService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { WorkbenchEnvironmentService } from 'vs/workbench/services/environment/node/environmentService';
import { VSBuffer, VSBufferReadable } from 'vs/base/common/buffer';
import { NativeTextFileService } from 'vs/workbench/services/textfile/electron-browser/nativeTextFileService';
import { Schemas } from 'vs/base/common/network';
import { IProductService } from 'vs/platform/product/common/productService';
import product from 'vs/platform/product/common/product';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IElectronService } from 'vs/platform/electron/node/electron';
import { INativeOpenDialogOptions, MessageBoxReturnValue, SaveDialogReturnValue, OpenDialogReturnValue } from 'vs/platform/dialogs/node/dialogs';
import { IBackupMainService, IWorkspaceBackupInfo } from 'vs/platform/backup/electron-main/backup';
import { IEmptyWindowBackupInfo } from 'vs/platform/backup/node/backup';
import { IDialogMainService } from 'vs/platform/dialogs/electron-main/dialogs';

export function createFileInput(instantiationService: IInstantiationService, resource: URI): FileEditorInput {
	return instantiationService.createInstance(FileEditorInput, resource, undefined, undefined);
}

export const TestEnvironmentService = new WorkbenchEnvironmentService(parseArgs(process.argv, OPTIONS) as IWindowConfiguration, process.execPath, 0);

export class TestContextService implements IWorkspaceContextService {
	public _serviceBrand: undefined;

	private workspace: Workspace;
	private options: any;

	private readonly _onDidChangeWorkspaceName: Emitter<void>;
	private readonly _onDidChangeWorkspaceFolders: Emitter<IWorkspaceFoldersChangeEvent>;
	private readonly _onDidChangeWorkbenchState: Emitter<WorkbenchState>;

	constructor(workspace: any = TestWorkspace, options: any = null) {
		this.workspace = workspace;
		this.options = options || Object.create(null);
		this._onDidChangeWorkspaceName = new Emitter<void>();
		this._onDidChangeWorkspaceFolders = new Emitter<IWorkspaceFoldersChangeEvent>();
		this._onDidChangeWorkbenchState = new Emitter<WorkbenchState>();
	}

	public get onDidChangeWorkspaceName(): Event<void> {
		return this._onDidChangeWorkspaceName.event;
	}

	public get onDidChangeWorkspaceFolders(): Event<IWorkspaceFoldersChangeEvent> {
		return this._onDidChangeWorkspaceFolders.event;
	}

	public get onDidChangeWorkbenchState(): Event<WorkbenchState> {
		return this._onDidChangeWorkbenchState.event;
	}

	public getFolders(): IWorkspaceFolder[] {
		return this.workspace ? this.workspace.folders : [];
	}

	public getWorkbenchState(): WorkbenchState {
		if (this.workspace.configuration) {
			return WorkbenchState.WORKSPACE;
		}

		if (this.workspace.folders.length) {
			return WorkbenchState.FOLDER;
		}

		return WorkbenchState.EMPTY;
	}

	getCompleteWorkspace(): Promise<IWorkbenchWorkspace> {
		return Promise.resolve(this.getWorkspace());
	}

	public getWorkspace(): IWorkbenchWorkspace {
		return this.workspace;
	}

	public getWorkspaceFolder(resource: URI): IWorkspaceFolder | null {
		return this.workspace.getFolder(resource);
	}

	public setWorkspace(workspace: any): void {
		this.workspace = workspace;
	}

	public getOptions() {
		return this.options;
	}

	public updateOptions() {

	}

	public isInsideWorkspace(resource: URI): boolean {
		if (resource && this.workspace) {
			return resources.isEqualOrParent(resource, this.workspace.folders[0].uri);
		}

		return false;
	}

	public toResource(workspaceRelativePath: string): URI {
		return URI.file(join('C:\\', workspaceRelativePath));
	}

	public isCurrentWorkspace(workspaceIdentifier: ISingleFolderWorkspaceIdentifier | IWorkspaceIdentifier): boolean {
		return isSingleFolderWorkspaceIdentifier(workspaceIdentifier) && resources.isEqual(this.workspace.folders[0].uri, workspaceIdentifier);
	}
}

export class TestTextFileService extends NativeTextFileService {
	public cleanupBackupsBeforeShutdownCalled: boolean;

	private promptPath: URI;
	private confirmResult: ConfirmResult;
	private resolveTextContentError: FileOperationError | null;

	constructor(
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IFileService protected fileService: IFileService,
		@IUntitledEditorService untitledEditorService: IUntitledEditorService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IModeService modeService: IModeService,
		@IModelService modelService: IModelService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@INotificationService notificationService: INotificationService,
		@IBackupFileService backupFileService: IBackupFileService,
		@IHistoryService historyService: IHistoryService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IDialogService dialogService: IDialogService,
		@IFileDialogService fileDialogService: IFileDialogService,
		@IEditorService editorService: IEditorService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@IElectronService electronService: IElectronService
	) {
		super(
			contextService,
			fileService,
			untitledEditorService,
			lifecycleService,
			instantiationService,
			configurationService,
			modeService,
			modelService,
			environmentService,
			notificationService,
			backupFileService,
			historyService,
			contextKeyService,
			dialogService,
			fileDialogService,
			editorService,
			textResourceConfigurationService,
			electronService
		);
	}

	public setPromptPath(path: URI): void {
		this.promptPath = path;
	}

	public setConfirmResult(result: ConfirmResult): void {
		this.confirmResult = result;
	}

	public setResolveTextContentErrorOnce(error: FileOperationError): void {
		this.resolveTextContentError = error;
	}

	public readStream(resource: URI, options?: IReadTextFileOptions): Promise<ITextFileStreamContent> {
		if (this.resolveTextContentError) {
			const error = this.resolveTextContentError;
			this.resolveTextContentError = null;

			return Promise.reject(error);
		}

		return this.fileService.readFileStream(resource, options).then(async (content): Promise<ITextFileStreamContent> => {
			return {
				resource: content.resource,
				name: content.name,
				mtime: content.mtime,
				etag: content.etag,
				encoding: 'utf8',
				value: await createTextBufferFactoryFromStream(content.value),
				size: 10
			};
		});
	}

	public promptForPath(_resource: URI, _defaultPath: URI): Promise<URI> {
		return Promise.resolve(this.promptPath);
	}

	public confirmSave(_resources?: URI[]): Promise<ConfirmResult> {
		return Promise.resolve(this.confirmResult);
	}

	public confirmOverwrite(_resource: URI): Promise<boolean> {
		return Promise.resolve(true);
	}

	public onFilesConfigurationChange(configuration: any): void {
		super.onFilesConfigurationChange(configuration);
	}

	protected cleanupBackupsBeforeShutdown(): Promise<void> {
		this.cleanupBackupsBeforeShutdownCalled = true;
		return Promise.resolve();
	}
}

export function workbenchInstantiationService(): IInstantiationService {
	let instantiationService = new TestInstantiationService(new ServiceCollection([ILifecycleService, new TestLifecycleService()]));
	instantiationService.stub(IEnvironmentService, TestEnvironmentService);
	instantiationService.stub(IContextKeyService, <IContextKeyService>instantiationService.createInstance(MockContextKeyService));
	const workspaceContextService = new TestContextService(TestWorkspace);
	instantiationService.stub(IWorkspaceContextService, workspaceContextService);
	const configService = new TestConfigurationService();
	instantiationService.stub(IConfigurationService, configService);
	instantiationService.stub(ITextResourceConfigurationService, new TestTextResourceConfigurationService(configService));
	instantiationService.stub(IUntitledEditorService, instantiationService.createInstance(UntitledEditorService));
	instantiationService.stub(IStorageService, new TestStorageService());
	instantiationService.stub(IWorkbenchLayoutService, new TestLayoutService());
	instantiationService.stub(IElectronService, new TestElectronService());
	instantiationService.stub(IModeService, instantiationService.createInstance(ModeServiceImpl));
	instantiationService.stub(IHistoryService, new TestHistoryService());
	instantiationService.stub(ITextResourcePropertiesService, new TestTextResourcePropertiesService(configService));
	instantiationService.stub(IModelService, instantiationService.createInstance(ModelServiceImpl));
	instantiationService.stub(IFileService, new TestFileService());
	instantiationService.stub(IBackupFileService, new TestBackupFileService());
	instantiationService.stub(ITelemetryService, NullTelemetryService);
	instantiationService.stub(INotificationService, new TestNotificationService());
	instantiationService.stub(IUntitledEditorService, instantiationService.createInstance(UntitledEditorService));
	instantiationService.stub(IMenuService, new TestMenuService());
	instantiationService.stub(IKeybindingService, new MockKeybindingService());
	instantiationService.stub(IDecorationsService, new TestDecorationsService());
	instantiationService.stub(IExtensionService, new TestExtensionService());
	instantiationService.stub(IHostService, <IHostService>instantiationService.createInstance(TestHostService));
	instantiationService.stub(ITextFileService, <ITextFileService>instantiationService.createInstance(TestTextFileService));
	instantiationService.stub(ITextModelService, <ITextModelService>instantiationService.createInstance(TextModelResolverService));
	instantiationService.stub(IThemeService, new TestThemeService());
	instantiationService.stub(ILogService, new NullLogService());
	instantiationService.stub(IEditorGroupsService, new TestEditorGroupsService([new TestEditorGroup(0)]));
	instantiationService.stub(ILabelService, <ILabelService>instantiationService.createInstance(LabelService));
	const editorService = new TestEditorService();
	instantiationService.stub(IEditorService, editorService);
	instantiationService.stub(ICodeEditorService, new TestCodeEditorService());
	instantiationService.stub(IViewletService, new TestViewletService());

	return instantiationService;
}

export class TestDecorationsService implements IDecorationsService {
	_serviceBrand: undefined;
	onDidChangeDecorations: Event<IResourceDecorationChangeEvent> = Event.None;
	registerDecorationsProvider(_provider: IDecorationsProvider): IDisposable { return Disposable.None; }
	getDecoration(_uri: URI, _includeChildren: boolean, _overwrite?: IDecorationData): IDecoration | undefined { return undefined; }
}

export class TestExtensionService extends NullExtensionService { }

export class TestMenuService implements IMenuService {

	public _serviceBrand: undefined;

	createMenu(_id: MenuId, _scopedKeybindingService: IContextKeyService): IMenu {
		return {
			onDidChange: Event.None,
			dispose: () => undefined,
			getActions: () => []
		};
	}
}

export class TestHistoryService implements IHistoryService {

	public _serviceBrand: undefined;

	constructor(private root?: URI) {
	}

	public reopenLastClosedEditor(): void {
	}

	public forward(_acrossEditors?: boolean): void {
	}

	public back(_acrossEditors?: boolean): void {
	}

	public last(): void {
	}

	public remove(_input: IEditorInput | IResourceInput): void {
	}

	public clear(): void {
	}

	public clearRecentlyOpened(): void {
	}

	public getHistory(): Array<IEditorInput | IResourceInput> {
		return [];
	}

	public getLastActiveWorkspaceRoot(_schemeFilter: string): URI | undefined {
		return this.root;
	}

	public getLastActiveFile(_schemeFilter: string): URI | undefined {
		return undefined;
	}

	public openLastEditLocation(): void {
	}
}

export class TestDialogService implements IDialogService {

	public _serviceBrand: undefined;

	public confirm(_confirmation: IConfirmation): Promise<IConfirmationResult> {
		return Promise.resolve({ confirmed: false });
	}

	public show(_severity: Severity, _message: string, _buttons: string[], _options?: IDialogOptions): Promise<IShowResult> {
		return Promise.resolve({ choice: 0 });
	}

	public about(): Promise<void> {
		return Promise.resolve();
	}
}

export class TestFileDialogService implements IFileDialogService {

	public _serviceBrand: undefined;

	public defaultFilePath(_schemeFilter?: string): URI | undefined {
		return undefined;
	}
	public defaultFolderPath(_schemeFilter?: string): URI | undefined {
		return undefined;
	}
	public defaultWorkspacePath(_schemeFilter?: string): URI | undefined {
		return undefined;
	}
	public pickFileFolderAndOpen(_options: IPickAndOpenOptions): Promise<any> {
		return Promise.resolve(0);
	}
	public pickFileAndOpen(_options: IPickAndOpenOptions): Promise<any> {
		return Promise.resolve(0);
	}
	public pickFolderAndOpen(_options: IPickAndOpenOptions): Promise<any> {
		return Promise.resolve(0);
	}
	public pickWorkspaceAndOpen(_options: IPickAndOpenOptions): Promise<any> {
		return Promise.resolve(0);
	}
	public pickFileToSave(_options: ISaveDialogOptions): Promise<URI | undefined> {
		return Promise.resolve(undefined);
	}
	public showSaveDialog(_options: ISaveDialogOptions): Promise<URI | undefined> {
		return Promise.resolve(undefined);
	}
	public showOpenDialog(_options: IOpenDialogOptions): Promise<URI[] | undefined> {
		return Promise.resolve(undefined);
	}
}

export class TestLayoutService implements IWorkbenchLayoutService {

	public _serviceBrand: undefined;

	dimension: IDimension = { width: 800, height: 600 };

	container: HTMLElement = window.document.body;

	onZenModeChange: Event<boolean> = Event.None;
	onCenteredLayoutChange: Event<boolean> = Event.None;
	onFullscreenChange: Event<boolean> = Event.None;
	onPanelPositionChange: Event<string> = Event.None;
	onLayout = Event.None;

	private readonly _onTitleBarVisibilityChange = new Emitter<void>();
	private readonly _onMenubarVisibilityChange = new Emitter<Dimension>();

	public get onTitleBarVisibilityChange(): Event<void> {
		return this._onTitleBarVisibilityChange.event;
	}

	public get onMenubarVisibilityChange(): Event<Dimension> {
		return this._onMenubarVisibilityChange.event;
	}

	public isRestored(): boolean {
		return true;
	}

	public hasFocus(_part: Parts): boolean {
		return false;
	}

	public isVisible(_part: Parts): boolean {
		return true;
	}

	getDimension(_part: Parts): Dimension {
		return new Dimension(0, 0);
	}

	public getContainer(_part: Parts): HTMLElement {
		return null!;
	}

	public isTitleBarHidden(): boolean {
		return false;
	}

	public getTitleBarOffset(): number {
		return 0;
	}

	public isStatusBarHidden(): boolean {
		return false;
	}

	public isActivityBarHidden(): boolean {
		return false;
	}

	public setActivityBarHidden(_hidden: boolean): void { }

	public isSideBarHidden(): boolean {
		return false;
	}

	public setEditorHidden(_hidden: boolean): Promise<void> { return Promise.resolve(); }

	public setSideBarHidden(_hidden: boolean): Promise<void> { return Promise.resolve(); }

	public isPanelHidden(): boolean {
		return false;
	}

	public setPanelHidden(_hidden: boolean): Promise<void> { return Promise.resolve(); }

	public toggleMaximizedPanel(): void { }

	public isPanelMaximized(): boolean {
		return false;
	}

	public getMenubarVisibility(): MenuBarVisibility {
		throw new Error('not implemented');
	}

	public getSideBarPosition() {
		return 0;
	}

	public getPanelPosition() {
		return 0;
	}

	public setPanelPosition(_position: PartPosition): Promise<void> {
		return Promise.resolve();
	}

	public addClass(_clazz: string): void { }
	public removeClass(_clazz: string): void { }

	public getMaximumEditorDimensions(): Dimension { throw new Error('not implemented'); }

	public getWorkbenchContainer(): HTMLElement { throw new Error('not implemented'); }
	public getWorkbenchElement(): HTMLElement { throw new Error('not implemented'); }

	public toggleZenMode(): void { }

	public isEditorLayoutCentered(): boolean { return false; }
	public centerEditorLayout(_active: boolean): void { }


	public resizePart(_part: Parts, _sizeChange: number): void { }

	public registerPart(part: Part): void { }
}

let activeViewlet: Viewlet = {} as any;

export class TestViewletService implements IViewletService {
	public _serviceBrand: undefined;

	onDidViewletRegisterEmitter = new Emitter<ViewletDescriptor>();
	onDidViewletDeregisterEmitter = new Emitter<ViewletDescriptor>();
	onDidViewletOpenEmitter = new Emitter<IViewlet>();
	onDidViewletCloseEmitter = new Emitter<IViewlet>();

	onDidViewletRegister = this.onDidViewletRegisterEmitter.event;
	onDidViewletDeregister = this.onDidViewletDeregisterEmitter.event;
	onDidViewletOpen = this.onDidViewletOpenEmitter.event;
	onDidViewletClose = this.onDidViewletCloseEmitter.event;

	public openViewlet(id: string, focus?: boolean): Promise<IViewlet> {
		return Promise.resolve(null!);
	}

	public getViewlets(): ViewletDescriptor[] {
		return [];
	}

	public getAllViewlets(): ViewletDescriptor[] {
		return [];
	}

	public getActiveViewlet(): IViewlet {
		return activeViewlet;
	}

	public dispose() {
	}

	public getDefaultViewletId(): string {
		return 'workbench.view.explorer';
	}

	public getViewlet(id: string): ViewletDescriptor | undefined {
		return undefined;
	}

	public getProgressIndicator(id: string) {
		return null!;
	}

	public hideActiveViewlet(): void { }

	public getLastActiveViewletId(): string {
		return undefined!;
	}
}

export class TestPanelService implements IPanelService {
	public _serviceBrand: undefined;

	onDidPanelOpen = new Emitter<{ panel: IPanel, focus: boolean }>().event;
	onDidPanelClose = new Emitter<IPanel>().event;

	public openPanel(id: string, focus?: boolean): IPanel {
		return null!;
	}

	public getPanel(id: string): any {
		return activeViewlet;
	}

	public getPanels(): any[] {
		return [];
	}

	public getPinnedPanels(): any[] {
		return [];
	}

	public getActivePanel(): IViewlet {
		return activeViewlet;
	}

	public setPanelEnablement(id: string, enabled: boolean): void { }

	public dispose() {
	}

	public showActivity(panelId: string, badge: IBadge, clazz?: string): IDisposable {
		throw new Error('Method not implemented.');
	}

	public getProgressIndicator(id: string) {
		return null!;
	}

	public hideActivePanel(): void { }

	public getLastActivePanelId(): string {
		return undefined!;
	}
}

export class TestStorageService extends InMemoryStorageService { }

export class TestEditorGroupsService implements IEditorGroupsService {

	_serviceBrand: undefined;

	constructor(public groups: TestEditorGroup[] = []) { }

	onDidActiveGroupChange: Event<IEditorGroup> = Event.None;
	onDidActivateGroup: Event<IEditorGroup> = Event.None;
	onDidAddGroup: Event<IEditorGroup> = Event.None;
	onDidRemoveGroup: Event<IEditorGroup> = Event.None;
	onDidMoveGroup: Event<IEditorGroup> = Event.None;
	onDidGroupIndexChange: Event<IEditorGroup> = Event.None;
	onDidLayout: Event<IDimension> = Event.None;

	orientation: any;
	whenRestored: Promise<void> = Promise.resolve(undefined);
	willRestoreEditors = false;

	contentDimension = { width: 800, height: 600 };

	get activeGroup(): IEditorGroup {
		return this.groups[0];
	}

	get count(): number {
		return this.groups.length;
	}

	getGroups(_order?: GroupsOrder): ReadonlyArray<IEditorGroup> {
		return this.groups;
	}

	getGroup(identifier: number): IEditorGroup {
		for (const group of this.groups) {
			if (group.id === identifier) {
				return group;
			}
		}

		return undefined!;
	}

	getLabel(_identifier: number): string {
		return 'Group 1';
	}

	findGroup(_scope: IFindGroupScope, _source?: number | IEditorGroup, _wrap?: boolean): IEditorGroup {
		throw new Error('not implemented');
	}

	activateGroup(_group: number | IEditorGroup): IEditorGroup {
		throw new Error('not implemented');
	}

	restoreGroup(_group: number | IEditorGroup): IEditorGroup {
		throw new Error('not implemented');
	}

	getSize(_group: number | IEditorGroup): { width: number, height: number } {
		return { width: 100, height: 100 };
	}

	setSize(_group: number | IEditorGroup, _size: { width: number, height: number }): void { }

	arrangeGroups(_arrangement: GroupsArrangement): void { }

	applyLayout(_layout: EditorGroupLayout): void { }

	setGroupOrientation(_orientation: any): void { }

	addGroup(_location: number | IEditorGroup, _direction: GroupDirection, _options?: IAddGroupOptions): IEditorGroup {
		throw new Error('not implemented');
	}

	removeGroup(_group: number | IEditorGroup): void { }

	moveGroup(_group: number | IEditorGroup, _location: number | IEditorGroup, _direction: GroupDirection): IEditorGroup {
		throw new Error('not implemented');
	}

	mergeGroup(_group: number | IEditorGroup, _target: number | IEditorGroup, _options?: IMergeGroupOptions): IEditorGroup {
		throw new Error('not implemented');
	}

	copyGroup(_group: number | IEditorGroup, _location: number | IEditorGroup, _direction: GroupDirection): IEditorGroup {
		throw new Error('not implemented');
	}

	centerLayout(active: boolean): void { }

	isLayoutCentered(): boolean {
		return false;
	}

	partOptions: IEditorPartOptions;
	enforcePartOptions(options: IEditorPartOptions): IDisposable {
		return Disposable.None;
	}
}

export class TestEditorGroup implements IEditorGroupView {

	constructor(public id: number) { }

	get group(): EditorGroup { throw new Error('not implemented'); }
	activeControl: IVisibleEditor;
	activeEditor: IEditorInput;
	previewEditor: IEditorInput;
	count: number;
	disposed: boolean;
	editors: ReadonlyArray<IEditorInput> = [];
	label: string;
	index: number;
	whenRestored: Promise<void> = Promise.resolve(undefined);
	element: HTMLElement;
	minimumWidth: number;
	maximumWidth: number;
	minimumHeight: number;
	maximumHeight: number;

	isEmpty = true;
	isMinimized = false;

	onWillDispose: Event<void> = Event.None;
	onDidGroupChange: Event<IGroupChangeEvent> = Event.None;
	onWillCloseEditor: Event<IEditorCloseEvent> = Event.None;
	onDidCloseEditor: Event<IEditorCloseEvent> = Event.None;
	onWillOpenEditor: Event<IEditorOpeningEvent> = Event.None;
	onDidOpenEditorFail: Event<IEditorInput> = Event.None;
	onDidFocus: Event<void> = Event.None;
	onDidChange: Event<{ width: number; height: number; }> = Event.None;

	getEditors(_order?: EditorsOrder): ReadonlyArray<IEditorInput> {
		return [];
	}

	getEditor(_index: number): IEditorInput {
		throw new Error('not implemented');
	}

	getIndexOfEditor(_editor: IEditorInput): number {
		return -1;
	}

	openEditor(_editor: IEditorInput, _options?: IEditorOptions): Promise<IEditor> {
		throw new Error('not implemented');
	}

	openEditors(_editors: IEditorInputWithOptions[]): Promise<IEditor> {
		throw new Error('not implemented');
	}

	isOpened(_editor: IEditorInput): boolean {
		return false;
	}

	isPinned(_editor: IEditorInput): boolean {
		return false;
	}

	isActive(_editor: IEditorInput): boolean {
		return false;
	}

	moveEditor(_editor: IEditorInput, _target: IEditorGroup, _options?: IMoveEditorOptions): void { }

	copyEditor(_editor: IEditorInput, _target: IEditorGroup, _options?: ICopyEditorOptions): void { }

	closeEditor(_editor?: IEditorInput, options?: ICloseEditorOptions): Promise<void> {
		return Promise.resolve();
	}

	closeEditors(_editors: IEditorInput[] | { except?: IEditorInput; direction?: CloseDirection; savedOnly?: boolean; }, options?: ICloseEditorOptions): Promise<void> {
		return Promise.resolve();
	}

	closeAllEditors(): Promise<void> {
		return Promise.resolve();
	}

	replaceEditors(_editors: IEditorReplacement[]): Promise<void> {
		return Promise.resolve();
	}

	pinEditor(_editor?: IEditorInput): void { }

	focus(): void { }

	invokeWithinContext<T>(fn: (accessor: ServicesAccessor) => T): T {
		throw new Error('not implemented');
	}

	setActive(_isActive: boolean): void { }
	notifyIndexChanged(_index: number): void { }
	dispose(): void { }
	toJSON(): object { return Object.create(null); }
	layout(_width: number, _height: number): void { }
	relayout() { }
}

export class TestEditorService implements EditorServiceImpl {

	_serviceBrand: undefined;

	onDidActiveEditorChange: Event<void> = Event.None;
	onDidVisibleEditorsChange: Event<void> = Event.None;
	onDidCloseEditor: Event<IEditorCloseEvent> = Event.None;
	onDidOpenEditorFail: Event<IEditorIdentifier> = Event.None;

	activeControl: IVisibleEditor;
	activeTextEditorWidget: any;
	activeEditor: IEditorInput;
	editors: ReadonlyArray<IEditorInput> = [];
	visibleControls: ReadonlyArray<IVisibleEditor> = [];
	visibleTextEditorWidgets = [];
	visibleEditors: ReadonlyArray<IEditorInput> = [];

	overrideOpenEditor(_handler: IOpenEditorOverrideHandler): IDisposable {
		return toDisposable(() => undefined);
	}

	openEditor(_editor: any, _options?: any, _group?: any): Promise<any> {
		throw new Error('not implemented');
	}

	openEditors(_editors: any, _group?: any): Promise<IEditor[]> {
		throw new Error('not implemented');
	}

	isOpen(_editor: IEditorInput | IResourceInput | IUntitledResourceInput): boolean {
		return false;
	}

	getOpened(_editor: IEditorInput | IResourceInput | IUntitledResourceInput): IEditorInput {
		throw new Error('not implemented');
	}

	replaceEditors(_editors: any, _group: any) {
		return Promise.resolve(undefined);
	}

	invokeWithinEditorContext<T>(fn: (accessor: ServicesAccessor) => T): T {
		throw new Error('not implemented');
	}

	createInput(_input: IResourceInput | IUntitledResourceInput | IResourceDiffInput | IResourceSideBySideInput): IEditorInput {
		throw new Error('not implemented');
	}
}

export class TestFileService implements IFileService {

	public _serviceBrand: undefined;

	private readonly _onFileChanges: Emitter<FileChangesEvent>;
	private readonly _onAfterOperation: Emitter<FileOperationEvent>;

	readonly onWillActivateFileSystemProvider = Event.None;
	readonly onError: Event<Error> = Event.None;

	private content = 'Hello Html';
	private lastReadFileUri: URI;

	constructor() {
		this._onFileChanges = new Emitter<FileChangesEvent>();
		this._onAfterOperation = new Emitter<FileOperationEvent>();
	}

	public setContent(content: string): void {
		this.content = content;
	}

	public getContent(): string {
		return this.content;
	}

	public getLastReadFileUri(): URI {
		return this.lastReadFileUri;
	}

	public get onFileChanges(): Event<FileChangesEvent> {
		return this._onFileChanges.event;
	}

	public fireFileChanges(event: FileChangesEvent): void {
		this._onFileChanges.fire(event);
	}

	public get onAfterOperation(): Event<FileOperationEvent> {
		return this._onAfterOperation.event;
	}

	public fireAfterOperation(event: FileOperationEvent): void {
		this._onAfterOperation.fire(event);
	}

	resolve(resource: URI, _options?: IResolveFileOptions): Promise<IFileStat>;
	resolve(resource: URI, _options: IResolveMetadataFileOptions): Promise<IFileStatWithMetadata>;
	resolve(resource: URI, _options?: IResolveFileOptions): Promise<IFileStat> {
		return Promise.resolve({
			resource,
			etag: Date.now().toString(),
			encoding: 'utf8',
			mtime: Date.now(),
			size: 42,
			isDirectory: false,
			name: resources.basename(resource)
		});
	}

	resolveAll(toResolve: { resource: URI, options?: IResolveFileOptions }[]): Promise<IResolveFileResult[]> {
		return Promise.all(toResolve.map(resourceAndOption => this.resolve(resourceAndOption.resource, resourceAndOption.options))).then(stats => stats.map(stat => ({ stat, success: true })));
	}

	exists(_resource: URI): Promise<boolean> {
		return Promise.resolve(true);
	}

	readFile(resource: URI, options?: IReadFileOptions | undefined): Promise<IFileContent> {
		this.lastReadFileUri = resource;

		return Promise.resolve({
			resource: resource,
			value: VSBuffer.fromString(this.content),
			etag: 'index.txt',
			encoding: 'utf8',
			mtime: Date.now(),
			name: resources.basename(resource),
			size: 1
		});
	}

	readFileStream(resource: URI, options?: IReadFileOptions | undefined): Promise<IFileStreamContent> {
		this.lastReadFileUri = resource;

		return Promise.resolve({
			resource: resource,
			value: {
				on: (event: string, callback: Function): void => {
					if (event === 'data') {
						callback(this.content);
					}
					if (event === 'end') {
						callback();
					}
				},
				resume: () => { },
				pause: () => { },
				destroy: () => { }
			},
			etag: 'index.txt',
			encoding: 'utf8',
			mtime: Date.now(),
			size: 1,
			name: resources.basename(resource)
		});
	}

	writeFile(resource: URI, bufferOrReadable: VSBuffer | VSBufferReadable, options?: IWriteFileOptions): Promise<IFileStatWithMetadata> {
		return timeout(0).then(() => ({
			resource,
			etag: 'index.txt',
			encoding: 'utf8',
			mtime: Date.now(),
			size: 42,
			isDirectory: false,
			name: resources.basename(resource)
		}));
	}

	move(_source: URI, _target: URI, _overwrite?: boolean): Promise<IFileStatWithMetadata> {
		return Promise.resolve(null!);
	}

	copy(_source: URI, _target: URI, _overwrite?: boolean): Promise<IFileStatWithMetadata> {
		throw new Error('not implemented');
	}

	createFile(_resource: URI, _content?: VSBuffer | VSBufferReadable, _options?: ICreateFileOptions): Promise<IFileStatWithMetadata> {
		throw new Error('not implemented');
	}

	createFolder(_resource: URI): Promise<IFileStatWithMetadata> {
		throw new Error('not implemented');
	}

	onDidChangeFileSystemProviderRegistrations = Event.None;

	private providers = new Map<string, IFileSystemProvider>();

	registerProvider(scheme: string, provider: IFileSystemProvider) {
		this.providers.set(scheme, provider);

		return toDisposable(() => this.providers.delete(scheme));
	}

	activateProvider(_scheme: string): Promise<void> {
		throw new Error('not implemented');
	}

	canHandleResource(resource: URI): boolean {
		return resource.scheme === 'file' || this.providers.has(resource.scheme);
	}

	hasCapability(resource: URI, capability: FileSystemProviderCapabilities): boolean { return false; }

	del(_resource: URI, _options?: { useTrash?: boolean, recursive?: boolean }): Promise<void> {
		return Promise.resolve();
	}

	watch(_resource: URI): IDisposable {
		return Disposable.None;
	}

	getWriteEncoding(_resource: URI): IResourceEncoding {
		return { encoding: 'utf8', hasBOM: false };
	}

	dispose(): void {
	}
}

export class TestBackupFileService implements IBackupFileService {
	public _serviceBrand: undefined;

	public hasBackups(): Promise<boolean> {
		return Promise.resolve(false);
	}

	public hasBackup(_resource: URI): Promise<boolean> {
		return Promise.resolve(false);
	}

	public hasBackupSync(resource: URI, versionId?: number): boolean {
		return false;
	}

	public loadBackupResource(resource: URI): Promise<URI | undefined> {
		return this.hasBackup(resource).then(hasBackup => {
			if (hasBackup) {
				return this.toBackupResource(resource);
			}

			return undefined;
		});
	}

	public registerResourceForBackup(_resource: URI): Promise<void> {
		return Promise.resolve();
	}

	public deregisterResourceForBackup(_resource: URI): Promise<void> {
		return Promise.resolve();
	}

	public toBackupResource(_resource: URI): URI {
		throw new Error('not implemented');
	}

	public backupResource<T extends object>(_resource: URI, _content: ITextSnapshot, versionId?: number, meta?: T): Promise<void> {
		return Promise.resolve();
	}

	public getWorkspaceFileBackups(): Promise<URI[]> {
		return Promise.resolve([]);
	}

	public parseBackupContent(textBufferFactory: ITextBufferFactory): string {
		const textBuffer = textBufferFactory.create(DefaultEndOfLine.LF);
		const lineCount = textBuffer.getLineCount();
		const range = new Range(1, 1, lineCount, textBuffer.getLineLength(lineCount) + 1);
		return textBuffer.getValueInRange(range, EndOfLinePreference.TextDefined);
	}

	public resolveBackupContent<T extends object>(_backup: URI): Promise<IResolvedBackup<T>> {
		throw new Error('not implemented');
	}

	public discardResourceBackup(_resource: URI): Promise<void> {
		return Promise.resolve();
	}

	public discardAllWorkspaceBackups(): Promise<void> {
		return Promise.resolve();
	}
}

export class TestCodeEditorService implements ICodeEditorService {
	_serviceBrand: undefined;

	onCodeEditorAdd: Event<ICodeEditor> = Event.None;
	onCodeEditorRemove: Event<ICodeEditor> = Event.None;
	onDiffEditorAdd: Event<IDiffEditor> = Event.None;
	onDiffEditorRemove: Event<IDiffEditor> = Event.None;
	onDidChangeTransientModelProperty: Event<ITextModel> = Event.None;

	addCodeEditor(_editor: ICodeEditor): void { }
	removeCodeEditor(_editor: ICodeEditor): void { }
	listCodeEditors(): ICodeEditor[] { return []; }
	addDiffEditor(_editor: IDiffEditor): void { }
	removeDiffEditor(_editor: IDiffEditor): void { }
	listDiffEditors(): IDiffEditor[] { return []; }
	getFocusedCodeEditor(): ICodeEditor | undefined { return undefined; }
	registerDecorationType(_key: string, _options: IDecorationRenderOptions, _parentTypeKey?: string): void { }
	removeDecorationType(_key: string): void { }
	resolveDecorationOptions(_typeKey: string, _writable: boolean): IModelDecorationOptions { return Object.create(null); }
	setTransientModelProperty(_model: ITextModel, _key: string, _value: any): void { }
	getTransientModelProperty(_model: ITextModel, _key: string) { }
	getActiveCodeEditor(): ICodeEditor | undefined { return undefined; }
	openCodeEditor(_input: IResourceInput, _source: ICodeEditor, _sideBySide?: boolean): Promise<ICodeEditor | undefined> { return Promise.resolve(undefined); }
}

export class TestLifecycleService implements ILifecycleService {

	public _serviceBrand: undefined;

	public phase: LifecyclePhase;
	public startupKind: StartupKind;

	private readonly _onBeforeShutdown = new Emitter<BeforeShutdownEvent>();
	private readonly _onWillShutdown = new Emitter<WillShutdownEvent>();
	private readonly _onShutdown = new Emitter<void>();

	when(): Promise<void> {
		return Promise.resolve();
	}

	public fireShutdown(reason = ShutdownReason.QUIT): void {
		this._onWillShutdown.fire({
			join: () => { },
			reason
		});
	}

	public fireWillShutdown(event: BeforeShutdownEvent): void {
		this._onBeforeShutdown.fire(event);
	}

	public get onBeforeShutdown(): Event<BeforeShutdownEvent> {
		return this._onBeforeShutdown.event;
	}

	public get onWillShutdown(): Event<WillShutdownEvent> {
		return this._onWillShutdown.event;
	}

	public get onShutdown(): Event<void> {
		return this._onShutdown.event;
	}
}

export class TestTextResourceConfigurationService implements ITextResourceConfigurationService {

	_serviceBrand: undefined;

	constructor(private configurationService = new TestConfigurationService()) {
	}

	public onDidChangeConfiguration() {
		return { dispose() { } };
	}

	getValue<T>(resource: URI, arg2?: any, arg3?: any): T {
		const position: IPosition | null = EditorPosition.isIPosition(arg2) ? arg2 : null;
		const section: string | undefined = position ? (typeof arg3 === 'string' ? arg3 : undefined) : (typeof arg2 === 'string' ? arg2 : undefined);
		return this.configurationService.getValue(section, { resource });
	}
}

export class TestTextResourcePropertiesService implements ITextResourcePropertiesService {

	_serviceBrand: undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
	}

	getEOL(resource: URI): string {
		const filesConfiguration = this.configurationService.getValue<{ eol: string }>('files');
		if (filesConfiguration && filesConfiguration.eol) {
			if (filesConfiguration.eol !== 'auto') {
				return filesConfiguration.eol;
			}
		}
		return (isLinux || isMacintosh) ? '\n' : '\r\n';
	}
}


export class TestSharedProcessService implements ISharedProcessService {

	_serviceBrand: undefined;

	getChannel(channelName: string): any {
		return undefined;
	}

	registerChannel(channelName: string, channel: any): void { }

	async toggleSharedProcessWindow(): Promise<void> { }
	async whenSharedProcessReady(): Promise<void> { }
}

export class RemoteFileSystemProvider implements IFileSystemProvider {

	constructor(private readonly diskFileSystemProvider: IFileSystemProvider, private readonly remoteAuthority: string) { }

	readonly capabilities: FileSystemProviderCapabilities = this.diskFileSystemProvider.capabilities;
	readonly onDidChangeCapabilities: Event<void> = this.diskFileSystemProvider.onDidChangeCapabilities;

	readonly onDidChangeFile: Event<readonly IFileChange[]> = Event.map(this.diskFileSystemProvider.onDidChangeFile, changes => changes.map((c): IFileChange => {
		return {
			type: c.type,
			resource: c.resource.with({ scheme: Schemas.vscodeRemote, authority: this.remoteAuthority }),
		};
	}));
	watch(resource: URI, opts: IWatchOptions): IDisposable { return this.diskFileSystemProvider.watch(this.toFileResource(resource), opts); }

	stat(resource: URI): Promise<IStat> { return this.diskFileSystemProvider.stat(this.toFileResource(resource)); }
	mkdir(resource: URI): Promise<void> { return this.diskFileSystemProvider.mkdir(this.toFileResource(resource)); }
	readdir(resource: URI): Promise<[string, FileType][]> { return this.diskFileSystemProvider.readdir(this.toFileResource(resource)); }
	delete(resource: URI, opts: FileDeleteOptions): Promise<void> { return this.diskFileSystemProvider.delete(this.toFileResource(resource), opts); }

	rename(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> { return this.diskFileSystemProvider.rename(this.toFileResource(from), this.toFileResource(to), opts); }
	copy(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> { return this.diskFileSystemProvider.copy!(this.toFileResource(from), this.toFileResource(to), opts); }

	readFile(resource: URI): Promise<Uint8Array> { return this.diskFileSystemProvider.readFile!(this.toFileResource(resource)); }
	writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> { return this.diskFileSystemProvider.writeFile!(this.toFileResource(resource), content, opts); }

	open(resource: URI, opts: FileOpenOptions): Promise<number> { return this.diskFileSystemProvider.open!(this.toFileResource(resource), opts); }
	close(fd: number): Promise<void> { return this.diskFileSystemProvider.close!(fd); }
	read(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> { return this.diskFileSystemProvider.read!(fd, pos, data, offset, length); }
	write(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> { return this.diskFileSystemProvider.write!(fd, pos, data, offset, length); }

	private toFileResource(resource: URI): URI { return resource.with({ scheme: Schemas.file, authority: '' }); }
}

export const productService: IProductService = { _serviceBrand: undefined, ...product };

export class TestHostService implements IHostService {

	_serviceBrand: undefined;

	readonly hasFocus: boolean = true;
	readonly onDidChangeFocus: Event<boolean> = Event.None;

	async restart(): Promise<void> { }
	async reload(): Promise<void> { }
	async closeWorkspace(): Promise<void> { }

	async focus(): Promise<void> { }

	async openWindow(arg1?: IOpenEmptyWindowOptions | IWindowOpenable[], arg2?: IOpenWindowOptions): Promise<void> { }

	async toggleFullScreen(): Promise<void> { }
}

export class TestElectronService implements IElectronService {
	_serviceBrand: undefined;

	onWindowOpen: Event<number> = Event.None;
	onWindowMaximize: Event<number> = Event.None;
	onWindowUnmaximize: Event<number> = Event.None;
	onWindowFocus: Event<number> = Event.None;
	onWindowBlur: Event<number> = Event.None;

	windowCount = Promise.resolve(1);
	getWindowCount(): Promise<number> { return this.windowCount; }

	async getWindows(): Promise<IOpenedWindow[]> { return []; }
	async getActiveWindowId(): Promise<number | undefined> { return undefined; }

	openWindow(options?: IOpenEmptyWindowOptions): Promise<void>;
	openWindow(toOpen: IWindowOpenable[], options?: IOpenWindowOptions): Promise<void>;
	openWindow(arg1?: IOpenEmptyWindowOptions | IWindowOpenable[], arg2?: IOpenWindowOptions): Promise<void> {
		throw new Error('Method not implemented.');
	}

	async toggleFullScreen(): Promise<void> { }
	async handleTitleDoubleClick(): Promise<void> { }
	async isMaximized(): Promise<boolean> { return true; }
	async maximizeWindow(): Promise<void> { }
	async unmaximizeWindow(): Promise<void> { }
	async minimizeWindow(): Promise<void> { }
	async isWindowFocused(): Promise<boolean> { return true; }
	async focusWindow(options?: { windowId?: number | undefined; } | undefined): Promise<void> { }
	async showMessageBox(options: Electron.MessageBoxOptions): Promise<MessageBoxReturnValue> { throw new Error('Method not implemented.'); }
	async showSaveDialog(options: Electron.SaveDialogOptions): Promise<SaveDialogReturnValue> { throw new Error('Method not implemented.'); }
	async showOpenDialog(options: Electron.OpenDialogOptions): Promise<OpenDialogReturnValue> { throw new Error('Method not implemented.'); }
	async pickFileFolderAndOpen(options: INativeOpenDialogOptions): Promise<void> { }
	async pickFileAndOpen(options: INativeOpenDialogOptions): Promise<void> { }
	async pickFolderAndOpen(options: INativeOpenDialogOptions): Promise<void> { }
	async pickWorkspaceAndOpen(options: INativeOpenDialogOptions): Promise<void> { }
	async showItemInFolder(path: string): Promise<void> { }
	async setRepresentedFilename(path: string): Promise<void> { }
	async setDocumentEdited(edited: boolean): Promise<void> { }
	async openExternal(url: string): Promise<boolean> { return false; }
	async updateTouchBar(items: { id: string; title: string | { value: string; original: string; }; category?: string | { value: string; original: string; } | undefined; iconLocation?: { dark: UriComponents; light?: { readonly scheme: string; readonly authority: string; readonly path: string; readonly query: string; readonly fragment: string; readonly fsPath: string; with: {}; toString: {}; toJSON: {}; } | undefined; } | undefined; precondition?: { getType: {}; equals: {}; evaluate: {}; serialize: {}; keys: {}; map: {}; negate: {}; } | undefined; toggled?: { getType: {}; equals: {}; evaluate: {}; serialize: {}; keys: {}; map: {}; negate: {}; } | undefined; }[][]): Promise<void> { }
	async newWindowTab(): Promise<void> { }
	async showPreviousWindowTab(): Promise<void> { }
	async showNextWindowTab(): Promise<void> { }
	async moveWindowTabToNewWindow(): Promise<void> { }
	async mergeAllWindowTabs(): Promise<void> { }
	async toggleWindowTabsBar(): Promise<void> { }
	async relaunch(options?: { addArgs?: string[] | undefined; removeArgs?: string[] | undefined; } | undefined): Promise<void> { }
	async reload(): Promise<void> { }
	async closeWorkspace(): Promise<void> { }
	async closeWindow(): Promise<void> { }
	async quit(): Promise<void> { }
	async openDevTools(options?: Electron.OpenDevToolsOptions | undefined): Promise<void> { }
	async toggleDevTools(): Promise<void> { }
	async startCrashReporter(options: Electron.CrashReporterStartOptions): Promise<void> { }
	async resolveProxy(url: string): Promise<string | undefined> { return undefined; }
	async openExtensionDevelopmentHostWindow(args: minimist.ParsedArgs, env: IProcessEnvironment): Promise<void> { }
}

export class TestBackupMainService implements IBackupMainService {
	_serviceBrand: undefined;

	isHotExitEnabled(): boolean {
		throw new Error('Method not implemented.');
	}

	getWorkspaceBackups(): IWorkspaceBackupInfo[] {
		throw new Error('Method not implemented.');
	}

	getFolderBackupPaths(): URI[] {
		throw new Error('Method not implemented.');
	}

	getEmptyWindowBackupPaths(): IEmptyWindowBackupInfo[] {
		throw new Error('Method not implemented.');
	}

	registerWorkspaceBackupSync(workspace: IWorkspaceBackupInfo, migrateFrom?: string | undefined): string {
		throw new Error('Method not implemented.');
	}

	registerFolderBackupSync(folderUri: URI): string {
		throw new Error('Method not implemented.');
	}

	registerEmptyWindowBackupSync(backupFolder?: string | undefined, remoteAuthority?: string | undefined): string {
		throw new Error('Method not implemented.');
	}

	unregisterWorkspaceBackupSync(workspace: IWorkspaceIdentifier): void {
		throw new Error('Method not implemented.');
	}

	unregisterFolderBackupSync(folderUri: URI): void {
		throw new Error('Method not implemented.');
	}

	unregisterEmptyWindowBackupSync(backupFolder: string): void {
		throw new Error('Method not implemented.');
	}
}

export class TestDialogMainService implements IDialogMainService {
	_serviceBrand: undefined;

	pickFileFolder(options: INativeOpenDialogOptions, window?: Electron.BrowserWindow | undefined): Promise<string[] | undefined> {
		throw new Error('Method not implemented.');
	}

	pickFolder(options: INativeOpenDialogOptions, window?: Electron.BrowserWindow | undefined): Promise<string[] | undefined> {
		throw new Error('Method not implemented.');
	}

	pickFile(options: INativeOpenDialogOptions, window?: Electron.BrowserWindow | undefined): Promise<string[] | undefined> {
		throw new Error('Method not implemented.');
	}

	pickWorkspace(options: INativeOpenDialogOptions, window?: Electron.BrowserWindow | undefined): Promise<string[] | undefined> {
		throw new Error('Method not implemented.');
	}

	showMessageBox(options: Electron.MessageBoxOptions, window?: Electron.BrowserWindow | undefined): Promise<MessageBoxReturnValue> {
		throw new Error('Method not implemented.');
	}

	showSaveDialog(options: Electron.SaveDialogOptions, window?: Electron.BrowserWindow | undefined): Promise<SaveDialogReturnValue> {
		throw new Error('Method not implemented.');
	}

	showOpenDialog(options: Electron.OpenDialogOptions, window?: Electron.BrowserWindow | undefined): Promise<OpenDialogReturnValue> {
		throw new Error('Method not implemented.');
	}
}
