/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { IWindowOpenable } from 'vs/platform/windows/common/windows';
import { IPickAndOpenOptions, ISaveDialogOptions, IOpenDialogOptions, FileFilter } from 'vs/platform/dialogs/common/dialogs';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { URI } from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import * as resources from 'vs/base/common/resources';
import { IInstantiationService, } from 'vs/platform/instantiation/common/instantiation';
import { SimpleFileDialog } from 'vs/workbench/services/dialogs/browser/simpleFileDialog';
import { WORKSPACE_EXTENSION } from 'vs/platform/workspaces/common/workspaces';
import { REMOTE_HOST_SCHEME } from 'vs/platform/remote/common/remoteHosts';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IFileService } from 'vs/platform/files/common/files';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IHostService } from 'vs/workbench/services/host/browser/host';

export abstract class AbstractFileDialogService {

	_serviceBrand: undefined;

	constructor(
		@IHostService protected readonly hostService: IHostService,
		@IWorkspaceContextService protected readonly contextService: IWorkspaceContextService,
		@IHistoryService protected readonly historyService: IHistoryService,
		@IWorkbenchEnvironmentService protected readonly environmentService: IWorkbenchEnvironmentService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
		@IConfigurationService protected readonly configurationService: IConfigurationService,
		@IFileService protected readonly fileService: IFileService,
		@IOpenerService protected readonly openerService: IOpenerService,
	) { }

	defaultFilePath(schemeFilter = this.getSchemeFilterForWindow()): URI | undefined {

		// Check for last active file first...
		let candidate = this.historyService.getLastActiveFile(schemeFilter);

		// ...then for last active file root
		if (!candidate) {
			candidate = this.historyService.getLastActiveWorkspaceRoot(schemeFilter);
		} else {
			candidate = candidate && resources.dirname(candidate);
		}

		return candidate || undefined;
	}

	defaultFolderPath(schemeFilter = this.getSchemeFilterForWindow()): URI | undefined {

		// Check for last active file root first...
		let candidate = this.historyService.getLastActiveWorkspaceRoot(schemeFilter);

		// ...then for last active file
		if (!candidate) {
			candidate = this.historyService.getLastActiveFile(schemeFilter);
		}

		return candidate && resources.dirname(candidate) || undefined;
	}

	defaultWorkspacePath(schemeFilter = this.getSchemeFilterForWindow()): URI | undefined {

		// Check for current workspace config file first...
		if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
			const configuration = this.contextService.getWorkspace().configuration;
			if (configuration && !isUntitledWorkspace(configuration, this.environmentService)) {
				return resources.dirname(configuration) || undefined;
			}
		}

		// ...then fallback to default file path
		return this.defaultFilePath(schemeFilter);
	}

	protected abstract addFileSchemaIfNeeded(schema: string): string[];

	protected async pickFileFolderAndOpenSimplified(schema: string, options: IPickAndOpenOptions, preferNewWindow: boolean): Promise<any> {
		const title = nls.localize('openFileOrFolder.title', 'Open File Or Folder');
		const availableFileSystems = this.addFileSchemaIfNeeded(schema);

		const uri = await this.pickResource({ canSelectFiles: true, canSelectFolders: true, canSelectMany: false, defaultUri: options.defaultUri, title, availableFileSystems });

		if (uri) {
			const stat = await this.fileService.resolve(uri);

			const toOpen: IWindowOpenable = stat.isDirectory ? { folderUri: uri } : { fileUri: uri };
			if (stat.isDirectory || options.forceNewWindow || preferNewWindow) {
				return this.hostService.openWindow([toOpen], { forceNewWindow: options.forceNewWindow });
			} else {
				return this.openerService.open(uri);
			}
		}
	}

	protected async pickFileAndOpenSimplified(schema: string, options: IPickAndOpenOptions, preferNewWindow: boolean): Promise<any> {
		const title = nls.localize('openFile.title', 'Open File');
		const availableFileSystems = this.addFileSchemaIfNeeded(schema);

		const uri = await this.pickResource({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false, defaultUri: options.defaultUri, title, availableFileSystems });
		if (uri) {
			if (options.forceNewWindow || preferNewWindow) {
				return this.hostService.openWindow([{ fileUri: uri }], { forceNewWindow: options.forceNewWindow });
			} else {
				return this.openerService.open(uri);
			}
		}
	}

	protected async pickFolderAndOpenSimplified(schema: string, options: IPickAndOpenOptions): Promise<any> {
		const title = nls.localize('openFolder.title', 'Open Folder');
		const availableFileSystems = this.addFileSchemaIfNeeded(schema);

		const uri = await this.pickResource({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, defaultUri: options.defaultUri, title, availableFileSystems });
		if (uri) {
			return this.hostService.openWindow([{ folderUri: uri }], { forceNewWindow: options.forceNewWindow });
		}
	}

	protected async pickWorkspaceAndOpenSimplified(schema: string, options: IPickAndOpenOptions): Promise<any> {
		const title = nls.localize('openWorkspace.title', 'Open Workspace');
		const filters: FileFilter[] = [{ name: nls.localize('filterName.workspace', 'Workspace'), extensions: [WORKSPACE_EXTENSION] }];
		const availableFileSystems = this.addFileSchemaIfNeeded(schema);

		const uri = await this.pickResource({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false, defaultUri: options.defaultUri, title, filters, availableFileSystems });
		if (uri) {
			return this.hostService.openWindow([{ workspaceUri: uri }], { forceNewWindow: options.forceNewWindow });
		}
	}

	protected async pickFileToSaveSimplified(schema: string, options: ISaveDialogOptions): Promise<URI | undefined> {
		if (!options.availableFileSystems) {
			options.availableFileSystems = this.addFileSchemaIfNeeded(schema);
		}

		options.title = nls.localize('saveFileAs.title', 'Save As');
		return this.saveRemoteResource(options);
	}

	protected async showSaveDialogSimplified(schema: string, options: ISaveDialogOptions): Promise<URI | undefined> {
		if (!options.availableFileSystems) {
			options.availableFileSystems = this.addFileSchemaIfNeeded(schema);
		}

		return this.saveRemoteResource(options);
	}

	protected async showOpenDialogSimplified(schema: string, options: IOpenDialogOptions): Promise<URI[] | undefined> {
		if (!options.availableFileSystems) {
			options.availableFileSystems = this.addFileSchemaIfNeeded(schema);
		}

		const uri = await this.pickResource(options);

		return uri ? [uri] : undefined;
	}

	private pickResource(options: IOpenDialogOptions): Promise<URI | undefined> {
		const simpleFileDialog = this.instantiationService.createInstance(SimpleFileDialog);

		return simpleFileDialog.showOpenDialog(options);
	}

	private saveRemoteResource(options: ISaveDialogOptions): Promise<URI | undefined> {
		const remoteFileDialog = this.instantiationService.createInstance(SimpleFileDialog);

		return remoteFileDialog.showSaveDialog(options);
	}

	protected getSchemeFilterForWindow(): string {
		return !this.environmentService.configuration.remoteAuthority ? Schemas.file : REMOTE_HOST_SCHEME;
	}

	protected getFileSystemSchema(options: { availableFileSystems?: readonly string[], defaultUri?: URI }): string {
		return options.availableFileSystems && options.availableFileSystems[0] || this.getSchemeFilterForWindow();
	}
}

function isUntitledWorkspace(path: URI, environmentService: IWorkbenchEnvironmentService): boolean {
	return resources.isEqualOrParent(path, environmentService.untitledWorkspacesHome);
}
