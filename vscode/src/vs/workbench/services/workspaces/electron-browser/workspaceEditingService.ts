/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkspaceEditingService } from 'vs/workbench/services/workspaces/common/workspaceEditing';
import { URI } from 'vs/base/common/uri';
import * as nls from 'vs/nls';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IJSONEditingService } from 'vs/workbench/services/configuration/common/jsonEditing';
import { IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { WorkspaceService } from 'vs/workbench/services/configuration/browser/configurationService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { isEqual, basename, isEqualOrParent } from 'vs/base/common/resources';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IFileService } from 'vs/platform/files/common/files';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { ILifecycleService, ShutdownReason } from 'vs/platform/lifecycle/common/lifecycle';
import { IFileDialogService, IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ILabelService } from 'vs/platform/label/common/label';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { AbstractWorkspaceEditingService } from 'vs/workbench/services/workspaces/browser/abstractWorkspaceEditingService';
import { IElectronService } from 'vs/platform/electron/node/electron';
import { isMacintosh, isWindows, isLinux } from 'vs/base/common/platform';
import { mnemonicButtonLabel } from 'vs/base/common/labels';

export class NativeWorkspaceEditingService extends AbstractWorkspaceEditingService {

	_serviceBrand: undefined;

	constructor(
		@IJSONEditingService jsonEditingService: IJSONEditingService,
		@IWorkspaceContextService contextService: WorkspaceService,
		@IElectronService private electronService: IElectronService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@IExtensionService extensionService: IExtensionService,
		@IBackupFileService backupFileService: IBackupFileService,
		@INotificationService notificationService: INotificationService,
		@ICommandService commandService: ICommandService,
		@IFileService fileService: IFileService,
		@ITextFileService textFileService: ITextFileService,
		@IWorkspacesService workspacesService: IWorkspacesService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IFileDialogService fileDialogService: IFileDialogService,
		@IDialogService protected dialogService: IDialogService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@ILabelService private readonly labelService: ILabelService,
		@IHostService hostService: IHostService,
	) {
		super(jsonEditingService, contextService, configurationService, storageService, extensionService, backupFileService, notificationService, commandService, fileService, textFileService, workspacesService, environmentService, fileDialogService, dialogService, hostService);

		this.registerListeners();
	}

	private registerListeners(): void {
		this.lifecycleService.onBeforeShutdown(e => {
			const saveOperation = this.saveUntitedBeforeShutdown(e.reason);
			if (saveOperation) {
				e.veto(saveOperation);
			}
		});
	}

	private async saveUntitedBeforeShutdown(reason: ShutdownReason): Promise<boolean> {
		if (reason !== ShutdownReason.LOAD && reason !== ShutdownReason.CLOSE) {
			return false; // only interested when window is closing or loading
		}

		const workspaceIdentifier = this.getCurrentWorkspaceIdentifier();
		if (!workspaceIdentifier || !isEqualOrParent(workspaceIdentifier.configPath, this.environmentService.untitledWorkspacesHome)) {
			return false; // only care about untitled workspaces to ask for saving
		}

		const windowCount = await this.electronService.getWindowCount();
		if (reason === ShutdownReason.CLOSE && !isMacintosh && windowCount === 1) {
			return false; // Windows/Linux: quits when last window is closed, so do not ask then
		}

		enum ConfirmResult {
			SAVE,
			DONT_SAVE,
			CANCEL
		}

		const save = { label: mnemonicButtonLabel(nls.localize('save', "Save")), result: ConfirmResult.SAVE };
		const dontSave = { label: mnemonicButtonLabel(nls.localize('doNotSave', "Don't Save")), result: ConfirmResult.DONT_SAVE };
		const cancel = { label: nls.localize('cancel', "Cancel"), result: ConfirmResult.CANCEL };

		const buttons: { label: string; result: ConfirmResult; }[] = [];
		if (isWindows) {
			buttons.push(save, dontSave, cancel);
		} else if (isLinux) {
			buttons.push(dontSave, cancel, save);
		} else {
			buttons.push(save, cancel, dontSave);
		}

		const message = nls.localize('saveWorkspaceMessage', "Do you want to save your workspace configuration as a file?");
		const detail = nls.localize('saveWorkspaceDetail', "Save your workspace if you plan to open it again.");
		const cancelId = buttons.indexOf(cancel);

		const { choice } = await this.dialogService.show(Severity.Warning, message, buttons.map(button => button.label), { detail, cancelId });

		switch (buttons[choice].result) {

			// Cancel: veto unload
			case ConfirmResult.CANCEL:
				return true;

			// Don't Save: delete workspace
			case ConfirmResult.DONT_SAVE:
				this.workspacesService.deleteUntitledWorkspace(workspaceIdentifier);
				return false;

			// Save: save workspace, but do not veto unload if path provided
			case ConfirmResult.SAVE: {
				const newWorkspacePath = await this.pickNewWorkspacePath();
				if (!newWorkspacePath) {
					return true; // keep veto if no target was provided
				}

				try {
					await this.saveWorkspaceAs(workspaceIdentifier, newWorkspacePath);

					const newWorkspaceIdentifier = await this.workspacesService.getWorkspaceIdentifier(newWorkspacePath);

					const label = this.labelService.getWorkspaceLabel(newWorkspaceIdentifier, { verbose: true });
					this.workspacesService.addRecentlyOpened([{ label, workspace: newWorkspaceIdentifier }]);

					this.workspacesService.deleteUntitledWorkspace(workspaceIdentifier);
				} catch (error) {
					// ignore
				}

				return false;
			}
		}
	}

	async isValidTargetWorkspacePath(path: URI): Promise<boolean> {
		const windows = await this.electronService.getWindows();

		// Prevent overwriting a workspace that is currently opened in another window
		if (windows.some(window => !!window.workspace && isEqual(window.workspace.configPath, path))) {
			await this.dialogService.show(
				Severity.Info,
				nls.localize('workspaceOpenedMessage', "Unable to save workspace '{0}'", basename(path)),
				[nls.localize('ok', "OK")],
				{
					detail: nls.localize('workspaceOpenedDetail', "The workspace is already opened in another window. Please close that window first and then try again.")
				}
			);

			return false;
		}

		return true; // OK
	}
}

registerSingleton(IWorkspaceEditingService, NativeWorkspaceEditingService, true);
