/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IProcessEnvironment, isMacintosh, isLinux, isWeb } from 'vs/base/common/platform';
import { ParsedArgs, IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { ExportData } from 'vs/base/common/performance';
import { LogLevel } from 'vs/platform/log/common/log';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

export interface IOpenedWindow {
	id: number;
	workspace?: IWorkspaceIdentifier;
	folderUri?: ISingleFolderWorkspaceIdentifier;
	title: string;
	filename?: string;
}

export interface IBaseOpenWindowsOptions {
	forceReuseWindow?: boolean;
}

export interface IOpenWindowOptions extends IBaseOpenWindowsOptions {
	forceNewWindow?: boolean;

	noRecentEntry?: boolean;
}

export interface IOpenEmptyWindowOptions extends IBaseOpenWindowsOptions {
	remoteAuthority?: string;
}

export type IWindowOpenable = IWorkspaceToOpen | IFolderToOpen | IFileToOpen;

export interface IBaseWindowOpenable {
	label?: string;
}

export interface IWorkspaceToOpen extends IBaseWindowOpenable {
	workspaceUri: URI;
}

export interface IFolderToOpen extends IBaseWindowOpenable {
	folderUri: URI;
}

export interface IFileToOpen extends IBaseWindowOpenable {
	fileUri: URI;
}

export function isWorkspaceToOpen(uriToOpen: IWindowOpenable): uriToOpen is IWorkspaceToOpen {
	return !!(uriToOpen as IWorkspaceToOpen).workspaceUri;
}

export function isFolderToOpen(uriToOpen: IWindowOpenable): uriToOpen is IFolderToOpen {
	return !!(uriToOpen as IFolderToOpen).folderUri;
}

export function isFileToOpen(uriToOpen: IWindowOpenable): uriToOpen is IFileToOpen {
	return !!(uriToOpen as IFileToOpen).fileUri;
}

export type MenuBarVisibility = 'default' | 'visible' | 'toggle' | 'hidden' | 'compact';

export interface IWindowsConfiguration {
	window: IWindowSettings;
}

export interface IWindowSettings {
	openFilesInNewWindow: 'on' | 'off' | 'default';
	openFoldersInNewWindow: 'on' | 'off' | 'default';
	openWithoutArgumentsInNewWindow: 'on' | 'off';
	restoreWindows: 'all' | 'folders' | 'one' | 'none';
	restoreFullscreen: boolean;
	zoomLevel: number;
	titleBarStyle: 'native' | 'custom';
	autoDetectHighContrast: boolean;
	menuBarVisibility: MenuBarVisibility;
	newWindowDimensions: 'default' | 'inherit' | 'maximized' | 'fullscreen';
	nativeTabs: boolean;
	nativeFullScreen: boolean;
	enableMenuBarMnemonics: boolean;
	closeWhenEmpty: boolean;
	clickThroughInactive: boolean;
}

export function getTitleBarStyle(configurationService: IConfigurationService, environment: IEnvironmentService, isExtensionDevelopment = environment.isExtensionDevelopment): 'native' | 'custom' {
	if (isWeb) {
		return 'custom';
	}

	const configuration = configurationService.getValue<IWindowSettings>('window');

	const isDev = !environment.isBuilt || isExtensionDevelopment;
	if (isMacintosh && isDev) {
		return 'native'; // not enabled when developing due to https://github.com/electron/electron/issues/3647
	}

	if (configuration) {
		const useNativeTabs = isMacintosh && configuration.nativeTabs === true;
		if (useNativeTabs) {
			return 'native'; // native tabs on sierra do not work with custom title style
		}

		const useSimpleFullScreen = isMacintosh && configuration.nativeFullScreen === false;
		if (useSimpleFullScreen) {
			return 'native'; // simple fullscreen does not work well with custom title style (https://github.com/Microsoft/vscode/issues/63291)
		}

		const style = configuration.titleBarStyle;
		if (style === 'native' || style === 'custom') {
			return style;
		}
	}

	return isLinux ? 'native' : 'custom'; // default to custom on all macOS and Windows
}

export const enum OpenContext {

	// opening when running from the command line
	CLI,

	// macOS only: opening from the dock (also when opening files to a running instance from desktop)
	DOCK,

	// opening from the main application window
	MENU,

	// opening from a file or folder dialog
	DIALOG,

	// opening from the OS's UI
	DESKTOP,

	// opening through the API
	API
}

export const enum ReadyState {

	/**
	 * This window has not loaded any HTML yet
	 */
	NONE,

	/**
	 * This window is loading HTML
	 */
	LOADING,

	/**
	 * This window is navigating to another HTML
	 */
	NAVIGATING,

	/**
	 * This window is done loading HTML
	 */
	READY
}

export interface IPath extends IPathData {

	// the file path to open within the instance
	fileUri?: URI;
}

export interface IPathsToWaitFor extends IPathsToWaitForData {
	paths: IPath[];
	waitMarkerFileUri: URI;
}

export interface IPathsToWaitForData {
	paths: IPathData[];
	waitMarkerFileUri: UriComponents;
}

export interface IPathData {

	// the file path to open within the instance
	fileUri?: UriComponents;

	// the line number in the file path to open
	lineNumber?: number;

	// the column number in the file path to open
	columnNumber?: number;

	// a hint that the file exists. if true, the
	// file exists, if false it does not. with
	// undefined the state is unknown.
	exists?: boolean;
}

export interface IOpenFileRequest {
	filesToOpenOrCreate?: IPathData[];
	filesToDiff?: IPathData[];
	filesToWait?: IPathsToWaitForData;
	termProgram?: string;
}

export interface IAddFoldersRequest {
	foldersToAdd: UriComponents[];
}

export interface IWindowConfiguration extends ParsedArgs {
	machineId: string;
	windowId: number;
	logLevel: LogLevel;

	mainPid: number;

	appRoot: string;
	execPath: string;
	isInitialStartup?: boolean;

	userEnv: IProcessEnvironment;
	nodeCachedDataDir?: string;

	backupPath?: string;
	backupWorkspaceResource?: URI;

	workspace?: IWorkspaceIdentifier;
	folderUri?: ISingleFolderWorkspaceIdentifier;

	remoteAuthority?: string;
	connectionToken?: string;

	zoomLevel?: number;
	fullscreen?: boolean;
	maximized?: boolean;
	highContrast?: boolean;
	frameless?: boolean;
	accessibilitySupport?: boolean;
	partsSplashPath?: string;

	perfStartTime?: number;
	perfAppReady?: number;
	perfWindowLoadTime?: number;
	perfEntries: ExportData;

	filesToOpenOrCreate?: IPath[];
	filesToDiff?: IPath[];
	filesToWait?: IPathsToWaitFor;
	termProgram?: string;
}

export interface IRunActionInWindowRequest {
	id: string;
	from: 'menu' | 'touchbar' | 'mouse';
	args?: any[];
}

export interface IRunKeybindingInWindowRequest {
	userSettingsLabel: string;
}
