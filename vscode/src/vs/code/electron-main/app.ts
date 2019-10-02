/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { app, ipcMain as ipc, systemPreferences, shell, Event, contentTracing, protocol, powerMonitor, Event as IpcMainEvent, BrowserWindow } from 'electron';
import { IProcessEnvironment, isWindows, isMacintosh } from 'vs/base/common/platform';
import { WindowsManager } from 'vs/code/electron-main/windows';
import { OpenContext, IWindowOpenable } from 'vs/platform/windows/common/windows';
import { ActiveWindowManager } from 'vs/code/node/activeWindowTracker';
import { ILifecycleMainService, LifecycleMainPhase } from 'vs/platform/lifecycle/electron-main/lifecycleMainService';
import { getShellEnvironment } from 'vs/code/node/shellEnv';
import { IUpdateService } from 'vs/platform/update/common/update';
import { UpdateChannel } from 'vs/platform/update/electron-main/updateIpc';
import { Server as ElectronIPCServer } from 'vs/base/parts/ipc/electron-main/ipc.electron-main';
import { Client } from 'vs/base/parts/ipc/common/ipc.net';
import { Server, connect } from 'vs/base/parts/ipc/node/ipc.net';
import { SharedProcess } from 'vs/code/electron-main/sharedProcess';
import { LaunchMainService, ILaunchMainService } from 'vs/platform/launch/electron-main/launchMainService';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ILogService } from 'vs/platform/log/common/log';
import { IStateService } from 'vs/platform/state/node/state';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IURLService } from 'vs/platform/url/common/url';
import { URLHandlerChannelClient, URLHandlerRouter } from 'vs/platform/url/common/urlIpc';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService, combinedAppender, LogAppender } from 'vs/platform/telemetry/common/telemetryUtils';
import { TelemetryAppenderClient } from 'vs/platform/telemetry/node/telemetryIpc';
import { TelemetryService, ITelemetryServiceConfig } from 'vs/platform/telemetry/common/telemetryService';
import { resolveCommonProperties } from 'vs/platform/telemetry/node/commonProperties';
import { getDelayedChannel, StaticRouter } from 'vs/base/parts/ipc/common/ipc';
import { createChannelReceiver } from 'vs/base/parts/ipc/node/ipc';
import product from 'vs/platform/product/common/product';
import { ProxyAuthHandler } from 'vs/code/electron-main/auth';
import { Disposable } from 'vs/base/common/lifecycle';
import { IWindowsMainService, ICodeWindow } from 'vs/platform/windows/electron-main/windows';
import { URI } from 'vs/base/common/uri';
import { hasWorkspaceFileExtension, IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { WorkspacesService } from 'vs/platform/workspaces/electron-main/workspacesService';
import { getMachineId } from 'vs/base/node/id';
import { Win32UpdateService } from 'vs/platform/update/electron-main/updateService.win32';
import { LinuxUpdateService } from 'vs/platform/update/electron-main/updateService.linux';
import { DarwinUpdateService } from 'vs/platform/update/electron-main/updateService.darwin';
import { IIssueService } from 'vs/platform/issue/node/issue';
import { IssueMainService } from 'vs/platform/issue/electron-main/issueMainService';
import { LoggerChannel } from 'vs/platform/log/common/logIpc';
import { setUnexpectedErrorHandler, onUnexpectedError } from 'vs/base/common/errors';
import { ElectronURLListener } from 'vs/platform/url/electron-main/electronUrlListener';
import { serve as serveDriver } from 'vs/platform/driver/electron-main/driver';
import { IMenubarService } from 'vs/platform/menubar/node/menubar';
import { MenubarMainService } from 'vs/platform/menubar/electron-main/menubarMainService';
import { RunOnceScheduler } from 'vs/base/common/async';
import { registerContextMenuListener } from 'vs/base/parts/contextmenu/electron-main/contextmenu';
import { homedir } from 'os';
import { join, sep } from 'vs/base/common/path';
import { localize } from 'vs/nls';
import { Schemas } from 'vs/base/common/network';
import { SnapUpdateService } from 'vs/platform/update/electron-main/updateService.snap';
import { IStorageMainService, StorageMainService } from 'vs/platform/storage/node/storageMainService';
import { GlobalStorageDatabaseChannel } from 'vs/platform/storage/node/storageIpc';
import { startsWith } from 'vs/base/common/strings';
import { BackupMainService } from 'vs/platform/backup/electron-main/backupMainService';
import { IBackupMainService } from 'vs/platform/backup/electron-main/backup';
import { WorkspacesHistoryMainService, IWorkspacesHistoryMainService } from 'vs/platform/workspaces/electron-main/workspacesHistoryMainService';
import { URLService } from 'vs/platform/url/node/urlService';
import { WorkspacesMainService, IWorkspacesMainService } from 'vs/platform/workspaces/electron-main/workspacesMainService';
import { statSync } from 'fs';
import { DiagnosticsService } from 'vs/platform/diagnostics/node/diagnosticsIpc';
import { IDiagnosticsService } from 'vs/platform/diagnostics/node/diagnosticsService';
import { FileService } from 'vs/platform/files/common/fileService';
import { IFileService } from 'vs/platform/files/common/files';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';
import { ExtensionHostDebugBroadcastChannel } from 'vs/platform/debug/common/extensionHostDebugIpc';
import { IElectronService } from 'vs/platform/electron/node/electron';
import { ElectronMainService } from 'vs/platform/electron/electron-main/electronMainService';
import { ISharedProcessMainService, SharedProcessMainService } from 'vs/platform/ipc/electron-main/sharedProcessMainService';
import { assign } from 'vs/base/common/objects';
import { IDialogMainService, DialogMainService } from 'vs/platform/dialogs/electron-main/dialogs';
import { withNullAsUndefined } from 'vs/base/common/types';

export class CodeApplication extends Disposable {

	private static readonly MACHINE_ID_KEY = 'telemetry.machineId';
	private static readonly TRUE_MACHINE_ID_KEY = 'telemetry.trueMachineId';

	private windowsMainService: IWindowsMainService | undefined;
	private dialogMainService: IDialogMainService | undefined;

	constructor(
		private readonly mainIpcServer: Server,
		private readonly userEnv: IProcessEnvironment,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ILifecycleMainService private readonly lifecycleMainService: ILifecycleMainService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStateService private readonly stateService: IStateService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {

		// We handle uncaught exceptions here to prevent electron from opening a dialog to the user
		setUnexpectedErrorHandler(err => this.onUnexpectedError(err));
		process.on('uncaughtException', err => this.onUnexpectedError(err));
		process.on('unhandledRejection', (reason: unknown) => onUnexpectedError(reason));

		// Dispose on shutdown
		this.lifecycleMainService.onWillShutdown(() => this.dispose());

		// Contextmenu via IPC support
		registerContextMenuListener();

		app.on('accessibility-support-changed', (event: Event, accessibilitySupportEnabled: boolean) => {
			if (this.windowsMainService) {
				this.windowsMainService.sendToAll('vscode:accessibilitySupportChanged', accessibilitySupportEnabled);
			}
		});

		app.on('activate', (event: Event, hasVisibleWindows: boolean) => {
			this.logService.trace('App#activate');

			// Mac only event: open new window when we get activated
			if (!hasVisibleWindows && this.windowsMainService) {
				this.windowsMainService.openEmptyWindow(OpenContext.DOCK);
			}
		});

		// Security related measures (https://electronjs.org/docs/tutorial/security)
		//
		// !!! DO NOT CHANGE without consulting the documentation !!!
		//
		// app.on('remote-get-guest-web-contents', event => event.preventDefault()); // TODO@Ben TODO@Matt revisit this need for <webview>
		app.on('remote-require', (event, sender, module) => {
			this.logService.trace('App#on(remote-require): prevented');

			event.preventDefault();
		});
		app.on('remote-get-global', (event, sender, module) => {
			this.logService.trace(`App#on(remote-get-global): prevented on ${module}`);

			event.preventDefault();
		});
		app.on('remote-get-builtin', (event, sender, module) => {
			this.logService.trace(`App#on(remote-get-builtin): prevented on ${module}`);

			if (module !== 'clipboard') {
				event.preventDefault();
			}
		});
		app.on('remote-get-current-window', event => {
			this.logService.trace(`App#on(remote-get-current-window): prevented`);

			event.preventDefault();
		});
		app.on('remote-get-current-web-contents', event => {
			if (this.environmentService.args.driver) {
				return; // the driver needs access to web contents
			}

			this.logService.trace(`App#on(remote-get-current-web-contents): prevented`);

			event.preventDefault();
		});
		app.on('web-contents-created', (_event: Event, contents) => {
			contents.on('will-attach-webview', (event: Event, webPreferences, params) => {

				const isValidWebviewSource = (source: string): boolean => {
					if (!source) {
						return false;
					}

					if (source === 'data:text/html;charset=utf-8,%3C%21DOCTYPE%20html%3E%0D%0A%3Chtml%20lang%3D%22en%22%20style%3D%22width%3A%20100%25%3B%20height%3A%20100%25%22%3E%0D%0A%3Chead%3E%0D%0A%09%3Ctitle%3EVirtual%20Document%3C%2Ftitle%3E%0D%0A%3C%2Fhead%3E%0D%0A%3Cbody%20style%3D%22margin%3A%200%3B%20overflow%3A%20hidden%3B%20width%3A%20100%25%3B%20height%3A%20100%25%22%3E%0D%0A%3C%2Fbody%3E%0D%0A%3C%2Fhtml%3E') {
						return true;
					}

					const srcUri = URI.parse(source).fsPath.toLowerCase();
					const rootUri = URI.file(this.environmentService.appRoot).fsPath.toLowerCase();

					return startsWith(srcUri, rootUri + sep);
				};

				// Ensure defaults
				delete webPreferences.preload;
				webPreferences.nodeIntegration = false;

				// Verify URLs being loaded
				if (isValidWebviewSource(params.src) && isValidWebviewSource(webPreferences.preloadURL)) {
					return;
				}

				delete webPreferences.preloadUrl;

				// Otherwise prevent loading
				this.logService.error('webContents#web-contents-created: Prevented webview attach');

				event.preventDefault();
			});

			contents.on('will-navigate', event => {
				this.logService.error('webContents#will-navigate: Prevented webcontent navigation');

				event.preventDefault();
			});

			contents.on('new-window', (event: Event, url: string) => {
				event.preventDefault(); // prevent code that wants to open links

				shell.openExternal(url);
			});
		});

		let macOpenFileURIs: IWindowOpenable[] = [];
		let runningTimeout: NodeJS.Timeout | null = null;
		app.on('open-file', (event: Event, path: string) => {
			this.logService.trace('App#open-file: ', path);
			event.preventDefault();

			// Keep in array because more might come!
			macOpenFileURIs.push(this.getWindowOpenableFromPathSync(path));

			// Clear previous handler if any
			if (runningTimeout !== null) {
				clearTimeout(runningTimeout);
				runningTimeout = null;
			}

			// Handle paths delayed in case more are coming!
			runningTimeout = setTimeout(() => {
				if (this.windowsMainService) {
					this.windowsMainService.open({
						context: OpenContext.DOCK /* can also be opening from finder while app is running */,
						cli: this.environmentService.args,
						urisToOpen: macOpenFileURIs,
						gotoLineMode: false,
						preferNewWindow: true /* dropping on the dock or opening from finder prefers to open in a new window */
					});

					macOpenFileURIs = [];
					runningTimeout = null;
				}
			}, 100);
		});

		app.on('new-window-for-tab', () => {
			if (this.windowsMainService) {
				this.windowsMainService.openEmptyWindow(OpenContext.DESKTOP); //macOS native tab "+" button
			}
		});

		ipc.on('vscode:exit', (event: Event, code: number) => {
			this.logService.trace('IPC#vscode:exit', code);

			this.dispose();
			this.lifecycleMainService.kill(code);
		});

		ipc.on('vscode:fetchShellEnv', async (event: IpcMainEvent) => {
			const webContents = event.sender;

			try {
				const shellEnv = await getShellEnvironment(this.logService, this.environmentService);
				if (!webContents.isDestroyed()) {
					webContents.send('vscode:acceptShellEnv', shellEnv);
				}
			} catch (error) {
				if (!webContents.isDestroyed()) {
					webContents.send('vscode:acceptShellEnv', {});
				}

				this.logService.error('Error fetching shell env', error);
			}
		});

		ipc.on('vscode:toggleDevTools', (event: IpcMainEvent) => event.sender.toggleDevTools());
		ipc.on('vscode:openDevTools', (event: IpcMainEvent) => event.sender.openDevTools());

		ipc.on('vscode:reloadWindow', (event: IpcMainEvent) => event.sender.reload());

		// Some listeners after window opened
		(async () => {
			await this.lifecycleMainService.when(LifecycleMainPhase.AfterWindowOpen);

			// After waking up from sleep  (after window opened)
			powerMonitor.on('resume', () => {
				if (this.windowsMainService) {
					this.windowsMainService.sendToAll('vscode:osResume', undefined);
				}
			});

			// Keyboard layout changes (after window opened)
			const nativeKeymap = await import('native-keymap');
			nativeKeymap.onDidChangeKeyboardLayout(() => {
				if (this.windowsMainService) {
					this.windowsMainService.sendToAll('vscode:keyboardLayoutChanged', false);
				}
			});
		})();
	}

	private onUnexpectedError(err: Error): void {
		if (err) {

			// take only the message and stack property
			const friendlyError = {
				message: err.message,
				stack: err.stack
			};

			// handle on client side
			if (this.windowsMainService) {
				this.windowsMainService.sendToFocused('vscode:reportError', JSON.stringify(friendlyError));
			}
		}

		this.logService.error(`[uncaught exception in main]: ${err}`);
		if (err.stack) {
			this.logService.error(err.stack);
		}
	}

	async startup(): Promise<void> {
		this.logService.debug('Starting VS Code');
		this.logService.debug(`from: ${this.environmentService.appRoot}`);
		this.logService.debug('args:', this.environmentService.args);

		// Make sure we associate the program with the app user model id
		// This will help Windows to associate the running program with
		// any shortcut that is pinned to the taskbar and prevent showing
		// two icons in the taskbar for the same app.
		const win32AppUserModelId = product.win32AppUserModelId;
		if (isWindows && win32AppUserModelId) {
			app.setAppUserModelId(win32AppUserModelId);
		}

		// Fix native tabs on macOS 10.13
		// macOS enables a compatibility patch for any bundle ID beginning with
		// "com.microsoft.", which breaks native tabs for VS Code when using this
		// identifier (from the official build).
		// Explicitly opt out of the patch here before creating any windows.
		// See: https://github.com/Microsoft/vscode/issues/35361#issuecomment-399794085
		try {
			if (isMacintosh && this.configurationService.getValue<boolean>('window.nativeTabs') === true && !systemPreferences.getUserDefault('NSUseImprovedLayoutPass', 'boolean')) {
				systemPreferences.setUserDefault('NSUseImprovedLayoutPass', 'boolean', true as any);
			}
		} catch (error) {
			this.logService.error(error);
		}

		// Create Electron IPC Server
		const electronIpcServer = new ElectronIPCServer();

		// Resolve unique machine ID
		this.logService.trace('Resolving machine identifier...');
		const { machineId, trueMachineId } = await this.resolveMachineId();
		this.logService.trace(`Resolved machine identifier: ${machineId} (trueMachineId: ${trueMachineId})`);

		// Spawn shared process after the first window has opened and 3s have passed
		const sharedProcess = this.instantiationService.createInstance(SharedProcess, machineId, this.userEnv);
		const sharedProcessClient = sharedProcess.whenReady().then(() => connect(this.environmentService.sharedIPCHandle, 'main'));
		this.lifecycleMainService.when(LifecycleMainPhase.AfterWindowOpen).then(() => {
			this._register(new RunOnceScheduler(async () => {
				const userEnv = await getShellEnvironment(this.logService, this.environmentService);

				sharedProcess.spawn(userEnv);
			}, 3000)).schedule();
		});

		// Services
		const appInstantiationService = await this.createServices(machineId, trueMachineId, sharedProcess, sharedProcessClient);

		// Create driver
		if (this.environmentService.driverHandle) {
			const server = await serveDriver(electronIpcServer, this.environmentService.driverHandle!, this.environmentService, appInstantiationService);

			this.logService.info('Driver started at:', this.environmentService.driverHandle);
			this._register(server);
		}

		// Setup Auth Handler
		this._register(new ProxyAuthHandler());

		// Open Windows
		const windows = appInstantiationService.invokeFunction(accessor => this.openFirstWindow(accessor, electronIpcServer, sharedProcessClient));

		// Post Open Windows Tasks
		this.afterWindowOpen();

		// Tracing: Stop tracing after windows are ready if enabled
		if (this.environmentService.args.trace) {
			this.stopTracingEventually(windows);
		}
	}

	private async resolveMachineId(): Promise<{ machineId: string, trueMachineId?: string }> {

		// We cache the machineId for faster lookups on startup
		// and resolve it only once initially if not cached
		let machineId = this.stateService.getItem<string>(CodeApplication.MACHINE_ID_KEY);
		if (!machineId) {
			machineId = await getMachineId();

			this.stateService.setItem(CodeApplication.MACHINE_ID_KEY, machineId);
		}

		// Check if machineId is hashed iBridge Device
		let trueMachineId: string | undefined;
		if (isMacintosh && machineId === '6c9d2bc8f91b89624add29c0abeae7fb42bf539fa1cdb2e3e57cd668fa9bcead') {
			trueMachineId = this.stateService.getItem<string>(CodeApplication.TRUE_MACHINE_ID_KEY);
			if (!trueMachineId) {
				trueMachineId = await getMachineId();

				this.stateService.setItem(CodeApplication.TRUE_MACHINE_ID_KEY, trueMachineId);
			}
		}

		return { machineId, trueMachineId };
	}

	private async createServices(machineId: string, trueMachineId: string | undefined, sharedProcess: SharedProcess, sharedProcessClient: Promise<Client<string>>): Promise<IInstantiationService> {
		const services = new ServiceCollection();

		const fileService = this._register(new FileService(this.logService));
		services.set(IFileService, fileService);

		const diskFileSystemProvider = this._register(new DiskFileSystemProvider(this.logService));
		fileService.registerProvider(Schemas.file, diskFileSystemProvider);

		switch (process.platform) {
			case 'win32':
				services.set(IUpdateService, new SyncDescriptor(Win32UpdateService));
				break;

			case 'linux':
				if (process.env.SNAP && process.env.SNAP_REVISION) {
					services.set(IUpdateService, new SyncDescriptor(SnapUpdateService, [process.env.SNAP, process.env.SNAP_REVISION]));
				} else {
					services.set(IUpdateService, new SyncDescriptor(LinuxUpdateService));
				}
				break;

			case 'darwin':
				services.set(IUpdateService, new SyncDescriptor(DarwinUpdateService));
				break;
		}

		services.set(IWindowsMainService, new SyncDescriptor(WindowsManager, [machineId, this.userEnv]));
		services.set(IDialogMainService, new SyncDescriptor(DialogMainService));
		services.set(ISharedProcessMainService, new SyncDescriptor(SharedProcessMainService, [sharedProcess]));
		services.set(ILaunchMainService, new SyncDescriptor(LaunchMainService));

		const diagnosticsChannel = getDelayedChannel(sharedProcessClient.then(client => client.getChannel('diagnostics')));
		services.set(IDiagnosticsService, new SyncDescriptor(DiagnosticsService, [diagnosticsChannel]));

		services.set(IIssueService, new SyncDescriptor(IssueMainService, [machineId, this.userEnv]));
		services.set(IElectronService, new SyncDescriptor(ElectronMainService));
		services.set(IWorkspacesService, new SyncDescriptor(WorkspacesService));
		services.set(IMenubarService, new SyncDescriptor(MenubarMainService));

		const storageMainService = new StorageMainService(this.logService, this.environmentService);
		services.set(IStorageMainService, storageMainService);
		this.lifecycleMainService.onWillShutdown(e => e.join(storageMainService.close()));

		const backupMainService = new BackupMainService(this.environmentService, this.configurationService, this.logService);
		services.set(IBackupMainService, backupMainService);

		services.set(IWorkspacesHistoryMainService, new SyncDescriptor(WorkspacesHistoryMainService));
		services.set(IURLService, new SyncDescriptor(URLService));
		services.set(IWorkspacesMainService, new SyncDescriptor(WorkspacesMainService));

		// Telemetry
		if (!this.environmentService.isExtensionDevelopment && !this.environmentService.args['disable-telemetry'] && !!product.enableTelemetry) {
			const channel = getDelayedChannel(sharedProcessClient.then(client => client.getChannel('telemetryAppender')));
			const appender = combinedAppender(new TelemetryAppenderClient(channel), new LogAppender(this.logService));
			const commonProperties = resolveCommonProperties(product.commit, product.version, machineId, product.msftInternalDomains, this.environmentService.installSourcePath);
			const piiPaths = this.environmentService.extensionsPath ? [this.environmentService.appRoot, this.environmentService.extensionsPath] : [this.environmentService.appRoot];
			const config: ITelemetryServiceConfig = { appender, commonProperties, piiPaths, trueMachineId };

			services.set(ITelemetryService, new SyncDescriptor(TelemetryService, [config]));
		} else {
			services.set(ITelemetryService, NullTelemetryService);
		}

		// Init services that require it
		await backupMainService.initialize();

		return this.instantiationService.createChild(services);
	}

	private stopTracingEventually(windows: ICodeWindow[]): void {
		this.logService.info(`Tracing: waiting for windows to get ready...`);

		let recordingStopped = false;
		const stopRecording = (timeout: boolean) => {
			if (recordingStopped) {
				return;
			}

			recordingStopped = true; // only once

			contentTracing.stopRecording(join(homedir(), `${product.applicationName}-${Math.random().toString(16).slice(-4)}.trace.txt`), path => {
				if (!timeout) {
					if (this.dialogMainService) {
						this.dialogMainService.showMessageBox({
							type: 'info',
							message: localize('trace.message', "Successfully created trace."),
							detail: localize('trace.detail', "Please create an issue and manually attach the following file:\n{0}", path),
							buttons: [localize('trace.ok', "Ok")]
						}, withNullAsUndefined(BrowserWindow.getFocusedWindow()));
					}
				} else {
					this.logService.info(`Tracing: data recorded (after 30s timeout) to ${path}`);
				}
			});
		};

		// Wait up to 30s before creating the trace anyways
		const timeoutHandle = setTimeout(() => stopRecording(true), 30000);

		// Wait for all windows to get ready and stop tracing then
		Promise.all(windows.map(window => window.ready())).then(() => {
			clearTimeout(timeoutHandle);
			stopRecording(false);
		});
	}

	private openFirstWindow(accessor: ServicesAccessor, electronIpcServer: ElectronIPCServer, sharedProcessClient: Promise<Client<string>>): ICodeWindow[] {

		// Register more Main IPC services
		const launchMainService = accessor.get(ILaunchMainService);
		const launchChannel = createChannelReceiver(launchMainService, { disableMarshalling: true });
		this.mainIpcServer.registerChannel('launch', launchChannel);

		// Register more Electron IPC services
		const updateService = accessor.get(IUpdateService);
		const updateChannel = new UpdateChannel(updateService);
		electronIpcServer.registerChannel('update', updateChannel);

		const issueService = accessor.get(IIssueService);
		const issueChannel = createChannelReceiver(issueService);
		electronIpcServer.registerChannel('issue', issueChannel);

		const electronService = accessor.get(IElectronService);
		const electronChannel = createChannelReceiver(electronService);
		electronIpcServer.registerChannel('electron', electronChannel);
		sharedProcessClient.then(client => client.registerChannel('electron', electronChannel));

		const sharedProcessMainService = accessor.get(ISharedProcessMainService);
		const sharedProcessChannel = createChannelReceiver(sharedProcessMainService);
		electronIpcServer.registerChannel('sharedProcess', sharedProcessChannel);

		const workspacesService = accessor.get(IWorkspacesService);
		const workspacesChannel = createChannelReceiver(workspacesService);
		electronIpcServer.registerChannel('workspaces', workspacesChannel);

		const menubarService = accessor.get(IMenubarService);
		const menubarChannel = createChannelReceiver(menubarService);
		electronIpcServer.registerChannel('menubar', menubarChannel);

		const urlService = accessor.get(IURLService);
		const urlChannel = createChannelReceiver(urlService);
		electronIpcServer.registerChannel('url', urlChannel);

		const storageMainService = accessor.get(IStorageMainService);
		const storageChannel = this._register(new GlobalStorageDatabaseChannel(this.logService, storageMainService));
		electronIpcServer.registerChannel('storage', storageChannel);

		const loggerChannel = new LoggerChannel(accessor.get(ILogService));
		electronIpcServer.registerChannel('logger', loggerChannel);
		sharedProcessClient.then(client => client.registerChannel('logger', loggerChannel));

		// ExtensionHost Debug broadcast service
		electronIpcServer.registerChannel(ExtensionHostDebugBroadcastChannel.ChannelName, new ExtensionHostDebugBroadcastChannel());

		// Signal phase: ready (services set)
		this.lifecycleMainService.phase = LifecycleMainPhase.Ready;

		// Propagate to clients
		const windowsMainService = this.windowsMainService = accessor.get(IWindowsMainService);
		this.dialogMainService = accessor.get(IDialogMainService);

		// Create a URL handler to open file URIs in the active window
		const environmentService = accessor.get(IEnvironmentService);
		urlService.registerHandler({
			async handleURL(uri: URI): Promise<boolean> {

				// Catch file URLs
				if (uri.authority === Schemas.file && !!uri.path) {
					const cli = assign(Object.create(null), environmentService.args);
					const urisToOpen = [{ fileUri: uri }];

					windowsMainService.open({ context: OpenContext.API, cli, urisToOpen, gotoLineMode: true });

					return true;
				}

				return false;
			}
		});

		// Create a URL handler which forwards to the last active window
		const activeWindowManager = new ActiveWindowManager(electronService);
		const activeWindowRouter = new StaticRouter(ctx => activeWindowManager.getActiveClientId().then(id => ctx === id));
		const urlHandlerRouter = new URLHandlerRouter(activeWindowRouter);
		const urlHandlerChannel = electronIpcServer.getChannel('urlHandler', urlHandlerRouter);
		const multiplexURLHandler = new URLHandlerChannelClient(urlHandlerChannel);

		// On Mac, Code can be running without any open windows, so we must create a window to handle urls,
		// if there is none
		if (isMacintosh) {
			urlService.registerHandler({
				async handleURL(uri: URI): Promise<boolean> {
					if (windowsMainService.getWindowCount() === 0) {
						const cli = { ...environmentService.args };
						const [window] = windowsMainService.open({ context: OpenContext.API, cli, forceEmpty: true, gotoLineMode: true });

						await window.ready();

						return urlService.open(uri);
					}

					return false;
				}
			});
		}

		// Register the multiple URL handler
		urlService.registerHandler(multiplexURLHandler);

		// Watch Electron URLs and forward them to the UrlService
		const args = this.environmentService.args;
		const urls = args['open-url'] ? args._urls : [];
		const urlListener = new ElectronURLListener(urls || [], urlService, windowsMainService);
		this._register(urlListener);

		// Open our first window
		const macOpenFiles: string[] = (<any>global).macOpenFiles;
		const context = !!process.env['VSCODE_CLI'] ? OpenContext.CLI : OpenContext.DESKTOP;
		const hasCliArgs = args._.length;
		const hasFolderURIs = !!args['folder-uri'];
		const hasFileURIs = !!args['file-uri'];
		const noRecentEntry = args['skip-add-to-recently-opened'] === true;
		const waitMarkerFileURI = args.wait && args.waitMarkerFilePath ? URI.file(args.waitMarkerFilePath) : undefined;

		// new window if "-n" was used without paths
		if (args['new-window'] && !hasCliArgs && !hasFolderURIs && !hasFileURIs) {
			return windowsMainService.open({
				context,
				cli: args,
				forceNewWindow: true,
				forceEmpty: true,
				noRecentEntry,
				waitMarkerFileURI,
				initialStartup: true
			});
		}

		// mac: open-file event received on startup
		if (macOpenFiles && macOpenFiles.length && !hasCliArgs && !hasFolderURIs && !hasFileURIs) {
			return windowsMainService.open({
				context: OpenContext.DOCK,
				cli: args,
				urisToOpen: macOpenFiles.map(file => this.getWindowOpenableFromPathSync(file)),
				noRecentEntry,
				waitMarkerFileURI,
				gotoLineMode: false,
				initialStartup: true
			});
		}

		// default: read paths from cli
		return windowsMainService.open({
			context,
			cli: args,
			forceNewWindow: args['new-window'] || (!hasCliArgs && args['unity-launch']),
			diffMode: args.diff,
			noRecentEntry,
			waitMarkerFileURI,
			gotoLineMode: args.goto,
			initialStartup: true
		});
	}

	private getWindowOpenableFromPathSync(path: string): IWindowOpenable {
		try {
			const fileStat = statSync(path);
			if (fileStat.isDirectory()) {
				return { folderUri: URI.file(path) };
			}

			if (hasWorkspaceFileExtension(path)) {
				return { workspaceUri: URI.file(path) };
			}
		} catch (error) {
			// ignore errors
		}

		return { fileUri: URI.file(path) };
	}

	private afterWindowOpen(): void {

		// Signal phase: after window open
		this.lifecycleMainService.phase = LifecycleMainPhase.AfterWindowOpen;

		// Remote Authorities
		this.handleRemoteAuthorities();
	}

	private handleRemoteAuthorities(): void {
		protocol.registerHttpProtocol(Schemas.vscodeRemoteResource, (request, callback) => {
			callback({
				url: request.url.replace(/^vscode-remote-resource:/, 'http:'),
				method: request.method
			});
		});
	}
}
