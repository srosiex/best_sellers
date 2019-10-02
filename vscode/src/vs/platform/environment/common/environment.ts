/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';

export interface ParsedArgs {
	_: string[];
	'folder-uri'?: string[]; // undefined or array of 1 or more
	'file-uri'?: string[]; // undefined or array of 1 or more
	_urls?: string[];
	help?: boolean;
	version?: boolean;
	telemetry?: boolean;
	status?: boolean;
	wait?: boolean;
	waitMarkerFilePath?: string;
	diff?: boolean;
	add?: boolean;
	goto?: boolean;
	'new-window'?: boolean;
	'unity-launch'?: boolean; // Always open a new window, except if opening the first window or opening a file or folder as part of the launch.
	'reuse-window'?: boolean;
	locale?: string;
	'user-data-dir'?: string;
	'prof-startup'?: boolean;
	'prof-startup-prefix'?: string;
	'prof-append-timers'?: string;
	verbose?: boolean;
	trace?: boolean;
	'trace-category-filter'?: string;
	'trace-options'?: string;
	log?: string;
	logExtensionHostCommunication?: boolean;
	'extensions-dir'?: string;
	'builtin-extensions-dir'?: string;
	extensionDevelopmentPath?: string[]; // // undefined or array of 1 or more local paths or URIs
	extensionTestsPath?: string; // either a local path or a URI
	'extension-development-confirm-save'?: boolean;
	'inspect-extensions'?: string;
	'inspect-brk-extensions'?: string;
	debugId?: string;
	'inspect-search'?: string;
	'inspect-brk-search'?: string;
	'disable-extensions'?: boolean;
	'disable-extension'?: string[]; // undefined or array of 1 or more
	'list-extensions'?: boolean;
	'show-versions'?: boolean;
	'category'?: string;
	'install-extension'?: string[]; // undefined or array of 1 or more
	'uninstall-extension'?: string[]; // undefined or array of 1 or more
	'locate-extension'?: string[]; // undefined or array of 1 or more
	'enable-proposed-api'?: string[]; // undefined or array of 1 or more
	'open-url'?: boolean;
	'skip-getting-started'?: boolean;
	'skip-release-notes'?: boolean;
	'sticky-quickopen'?: boolean;
	'disable-restore-windows'?: boolean;
	'disable-telemetry'?: boolean;
	'export-default-configuration'?: string;
	'install-source'?: string;
	'disable-updates'?: boolean;
	'disable-crash-reporter'?: boolean;
	'skip-add-to-recently-opened'?: boolean;
	'max-memory'?: string;
	'file-write'?: boolean;
	'file-chmod'?: boolean;
	'driver'?: string;
	'driver-verbose'?: boolean;
	remote?: string;
	'disable-user-env-probe'?: boolean;
	'disable-inspect'?: boolean;
	'force'?: boolean;
	'force-user-env'?: boolean;

	// node flags
	'js-flags'?: string;
	'disable-gpu'?: boolean;
	'nolazy'?: boolean;
}

export const IEnvironmentService = createDecorator<IEnvironmentService>('environmentService');

export interface IDebugParams {
	port: number | null;
	break: boolean;
}

export interface IExtensionHostDebugParams extends IDebugParams {
	debugId?: string;
}

export const BACKUPS = 'Backups';

export interface IEnvironmentService {

	_serviceBrand: undefined;

	args: ParsedArgs;

	execPath: string;
	cliPath: string;
	appRoot: string;

	userHome: string;
	userDataPath: string;

	appNameLong: string;
	appQuality?: string;
	appSettingsHome: URI;

	// user roaming data
	userRoamingDataHome: URI;
	settingsResource: URI;
	keybindingsResource: URI;
	keyboardLayoutResource: URI;
	localeResource: URI;

	// sync resources
	userDataSyncLogResource: URI;
	settingsSyncPreviewResource: URI;

	machineSettingsHome: URI;
	machineSettingsResource: URI;

	globalStorageHome: string;
	workspaceStorageHome: string;

	backupHome: URI;
	backupWorkspacesPath: string;

	untitledWorkspacesHome: URI;

	isExtensionDevelopment: boolean;
	disableExtensions: boolean | string[];
	builtinExtensionsPath: string;
	extensionsPath?: string;
	extensionDevelopmentLocationURI?: URI[];
	extensionTestsLocationURI?: URI;

	debugExtensionHost: IExtensionHostDebugParams;

	isBuilt: boolean;
	wait: boolean;
	status: boolean;

	log?: string;
	logsPath: string;
	verbose: boolean;

	mainIPCHandle: string;
	sharedIPCHandle: string;

	nodeCachedDataDir?: string;

	installSourcePath: string;
	disableUpdates: boolean;
	disableCrashReporter: boolean;

	driverHandle?: string;
	driverVerbose: boolean;

	galleryMachineIdResource?: URI;
}
