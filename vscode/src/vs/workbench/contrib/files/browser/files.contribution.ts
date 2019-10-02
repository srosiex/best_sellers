/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI, UriComponents } from 'vs/base/common/uri';
import { ViewletRegistry, Extensions as ViewletExtensions, ViewletDescriptor, ShowViewletAction } from 'vs/workbench/browser/viewlet';
import * as nls from 'vs/nls';
import { sep } from 'vs/base/common/path';
import { SyncActionDescriptor, MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions, IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IEditorInputFactory, EditorInput, IFileEditorInput, IEditorInputFactoryRegistry, Extensions as EditorInputExtensions } from 'vs/workbench/common/editor';
import { AutoSaveConfiguration, HotExitConfiguration } from 'vs/platform/files/common/files';
import { VIEWLET_ID, SortOrderConfiguration, FILE_EDITOR_INPUT_ID, IExplorerService } from 'vs/workbench/contrib/files/common/files';
import { FileEditorTracker } from 'vs/workbench/contrib/files/browser/editors/fileEditorTracker';
import { SaveErrorHandler } from 'vs/workbench/contrib/files/browser/saveErrorHandler';
import { FileEditorInput } from 'vs/workbench/contrib/files/common/editors/fileEditorInput';
import { BinaryFileEditor } from 'vs/workbench/contrib/files/browser/editors/binaryFileEditor';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IKeybindings } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import * as platform from 'vs/base/common/platform';
import { ExplorerViewlet, ExplorerViewletViewsContribution } from 'vs/workbench/contrib/files/browser/explorerViewlet';
import { IEditorRegistry, EditorDescriptor, Extensions as EditorExtensions } from 'vs/workbench/browser/editor';
import { DataUriEditorInput } from 'vs/workbench/common/editor/dataUriEditorInput';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { ILabelService } from 'vs/platform/label/common/label';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ExplorerService } from 'vs/workbench/contrib/files/common/explorerService';
import { SUPPORTED_ENCODINGS } from 'vs/workbench/services/textfile/common/textfiles';
import { Schemas } from 'vs/base/common/network';
import { WorkspaceWatcher } from 'vs/workbench/contrib/files/common/workspaceWatcher';

// Viewlet Action
export class OpenExplorerViewletAction extends ShowViewletAction {
	static readonly ID = VIEWLET_ID;
	static readonly LABEL = nls.localize('showExplorerViewlet', "Show Explorer");

	constructor(
		id: string,
		label: string,
		@IViewletService viewletService: IViewletService,
		@IEditorGroupsService editorGroupService: IEditorGroupsService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService
	) {
		super(id, label, VIEWLET_ID, viewletService, editorGroupService, layoutService);
	}
}

class FileUriLabelContribution implements IWorkbenchContribution {

	constructor(@ILabelService labelService: ILabelService) {
		labelService.registerFormatter({
			scheme: Schemas.file,
			formatting: {
				label: '${authority}${path}',
				separator: sep,
				tildify: !platform.isWindows,
				normalizeDriveLetter: platform.isWindows,
				authorityPrefix: sep + sep,
				workspaceSuffix: ''
			}
		});
	}
}

// Register Viewlet
Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets).registerViewlet(new ViewletDescriptor(
	ExplorerViewlet,
	VIEWLET_ID,
	nls.localize('explore', "Explorer"),
	'explore',
	0
));

registerSingleton(IExplorerService, ExplorerService, true);

Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets).setDefaultViewletId(VIEWLET_ID);

const openViewletKb: IKeybindings = {
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_E
};

// Register Action to Open Viewlet
const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(
	new SyncActionDescriptor(OpenExplorerViewletAction, OpenExplorerViewletAction.ID, OpenExplorerViewletAction.LABEL, openViewletKb),
	'View: Show Explorer',
	nls.localize('view', "View")
);

// Register file editors
Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditor(
	new EditorDescriptor(
		BinaryFileEditor,
		BinaryFileEditor.ID,
		nls.localize('binaryFileEditor', "Binary File Editor")
	),
	[
		new SyncDescriptor<EditorInput>(FileEditorInput),
		new SyncDescriptor<EditorInput>(DataUriEditorInput)
	]
);

// Register default file input factory
Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories).registerFileInputFactory({
	createFileInput: (resource, encoding, mode, instantiationService): IFileEditorInput => {
		return instantiationService.createInstance(FileEditorInput, resource, encoding, mode);
	},

	isFileInput: (obj): obj is IFileEditorInput => {
		return obj instanceof FileEditorInput;
	}
});

interface ISerializedFileInput {
	resource: string;
	resourceJSON: object;
	encoding?: string;
	modeId?: string;
}

// Register Editor Input Factory
class FileEditorInputFactory implements IEditorInputFactory {

	serialize(editorInput: EditorInput): string {
		const fileEditorInput = <FileEditorInput>editorInput;
		const resource = fileEditorInput.getResource();
		const fileInput: ISerializedFileInput = {
			resource: resource.toString(), // Keep for backwards compatibility
			resourceJSON: resource.toJSON(),
			encoding: fileEditorInput.getEncoding(),
			modeId: fileEditorInput.getPreferredMode() // only using the preferred user associated mode here if available to not store redundant data
		};

		return JSON.stringify(fileInput);
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): FileEditorInput {
		return instantiationService.invokeFunction<FileEditorInput>(accessor => {
			const fileInput: ISerializedFileInput = JSON.parse(serializedEditorInput);
			const resource = !!fileInput.resourceJSON ? URI.revive(<UriComponents>fileInput.resourceJSON) : URI.parse(fileInput.resource);
			const encoding = fileInput.encoding;
			const mode = fileInput.modeId;

			return accessor.get(IEditorService).createInput({ resource, encoding, mode, forceFile: true }) as FileEditorInput;
		});
	}
}

Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories).registerEditorInputFactory(FILE_EDITOR_INPUT_ID, FileEditorInputFactory);

// Register Explorer views
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(ExplorerViewletViewsContribution, LifecyclePhase.Starting);

// Register File Editor Tracker
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(FileEditorTracker, LifecyclePhase.Starting);

// Register Save Error Handler
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(SaveErrorHandler, LifecyclePhase.Starting);

// Register uri display for file uris
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(FileUriLabelContribution, LifecyclePhase.Starting);

// Workspace Watcher
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(WorkspaceWatcher, LifecyclePhase.Restored);

// Configuration
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

const hotExitConfiguration = platform.isNative ?
	{
		'type': 'string',
		'scope': ConfigurationScope.APPLICATION,
		'enum': [HotExitConfiguration.OFF, HotExitConfiguration.ON_EXIT, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE],
		'default': HotExitConfiguration.ON_EXIT,
		'markdownEnumDescriptions': [
			nls.localize('hotExit.off', 'Disable hot exit.'),
			nls.localize('hotExit.onExit', 'Hot exit will be triggered when the last window is closed on Windows/Linux or when the `workbench.action.quit` command is triggered (command palette, keybinding, menu). All windows with backups will be restored upon next launch.'),
			nls.localize('hotExit.onExitAndWindowClose', 'Hot exit will be triggered when the last window is closed on Windows/Linux or when the `workbench.action.quit` command is triggered (command palette, keybinding, menu), and also for any window with a folder opened regardless of whether it\'s the last window. All windows without folders opened will be restored upon next launch. To restore folder windows as they were before shutdown set `#window.restoreWindows#` to `all`.')
		],
		'description': nls.localize('hotExit', "Controls whether unsaved files are remembered between sessions, allowing the save prompt when exiting the editor to be skipped.", HotExitConfiguration.ON_EXIT, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE)
	} : {
		'type': 'string',
		'scope': ConfigurationScope.APPLICATION,
		'enum': [HotExitConfiguration.OFF, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE],
		'default': HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE,
		'markdownEnumDescriptions': [
			nls.localize('hotExit.off', 'Disable hot exit.'),
			nls.localize('hotExit.onExitAndWindowCloseBrowser', 'Hot exit will be triggered when the browser quits or the window or tab is closed.')
		],
		'description': nls.localize('hotExit', "Controls whether unsaved files are remembered between sessions, allowing the save prompt when exiting the editor to be skipped.", HotExitConfiguration.ON_EXIT, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE)
	};

configurationRegistry.registerConfiguration({
	'id': 'files',
	'order': 9,
	'title': nls.localize('filesConfigurationTitle', "Files"),
	'type': 'object',
	'properties': {
		'files.exclude': {
			'type': 'object',
			'markdownDescription': nls.localize('exclude', "Configure glob patterns for excluding files and folders. For example, the files explorer decides which files and folders to show or hide based on this setting. Read more about glob patterns [here](https://code.visualstudio.com/docs/editor/codebasics#_advanced-search-options)."),
			'default': { '**/.git': true, '**/.svn': true, '**/.hg': true, '**/CVS': true, '**/.DS_Store': true },
			'scope': ConfigurationScope.RESOURCE,
			'additionalProperties': {
				'anyOf': [
					{
						'type': 'boolean',
						'description': nls.localize('files.exclude.boolean', "The glob pattern to match file paths against. Set to true or false to enable or disable the pattern."),
					},
					{
						'type': 'object',
						'properties': {
							'when': {
								'type': 'string', // expression ({ "**/*.js": { "when": "$(basename).js" } })
								'pattern': '\\w*\\$\\(basename\\)\\w*',
								'default': '$(basename).ext',
								'description': nls.localize('files.exclude.when', "Additional check on the siblings of a matching file. Use $(basename) as variable for the matching file name.")
							}
						}
					}
				]
			}
		},
		'files.associations': {
			'type': 'object',
			'markdownDescription': nls.localize('associations', "Configure file associations to languages (e.g. `\"*.extension\": \"html\"`). These have precedence over the default associations of the languages installed."),
		},
		'files.encoding': {
			'type': 'string',
			'overridable': true,
			'enum': Object.keys(SUPPORTED_ENCODINGS),
			'default': 'utf8',
			'description': nls.localize('encoding', "The default character set encoding to use when reading and writing files. This setting can also be configured per language."),
			'scope': ConfigurationScope.RESOURCE,
			'enumDescriptions': Object.keys(SUPPORTED_ENCODINGS).map(key => SUPPORTED_ENCODINGS[key].labelLong)
		},
		'files.autoGuessEncoding': {
			'type': 'boolean',
			'overridable': true,
			'default': false,
			'description': nls.localize('autoGuessEncoding', "When enabled, the editor will attempt to guess the character set encoding when opening files. This setting can also be configured per language."),
			'scope': ConfigurationScope.RESOURCE
		},
		'files.eol': {
			'type': 'string',
			'enum': [
				'\n',
				'\r\n',
				'auto'
			],
			'enumDescriptions': [
				nls.localize('eol.LF', "LF"),
				nls.localize('eol.CRLF', "CRLF"),
				nls.localize('eol.auto', "Uses operating system specific end of line character.")
			],
			'default': 'auto',
			'description': nls.localize('eol', "The default end of line character."),
			'scope': ConfigurationScope.RESOURCE
		},
		'files.enableTrash': {
			'type': 'boolean',
			'default': true,
			'description': nls.localize('useTrash', "Moves files/folders to the OS trash (recycle bin on Windows) when deleting. Disabling this will delete files/folders permanently.")
		},
		'files.trimTrailingWhitespace': {
			'type': 'boolean',
			'default': false,
			'description': nls.localize('trimTrailingWhitespace', "When enabled, will trim trailing whitespace when saving a file."),
			'overridable': true,
			'scope': ConfigurationScope.RESOURCE
		},
		'files.insertFinalNewline': {
			'type': 'boolean',
			'default': false,
			'description': nls.localize('insertFinalNewline', "When enabled, insert a final new line at the end of the file when saving it."),
			'overridable': true,
			'scope': ConfigurationScope.RESOURCE
		},
		'files.trimFinalNewlines': {
			'type': 'boolean',
			'default': false,
			'description': nls.localize('trimFinalNewlines', "When enabled, will trim all new lines after the final new line at the end of the file when saving it."),
			'overridable': true,
			'scope': ConfigurationScope.RESOURCE
		},
		'files.autoSave': {
			'type': 'string',
			'enum': [AutoSaveConfiguration.OFF, AutoSaveConfiguration.AFTER_DELAY, AutoSaveConfiguration.ON_FOCUS_CHANGE, AutoSaveConfiguration.ON_WINDOW_CHANGE],
			'markdownEnumDescriptions': [
				nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'files.autoSave.off' }, "A dirty file is never automatically saved."),
				nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'files.autoSave.afterDelay' }, "A dirty file is automatically saved after the configured `#files.autoSaveDelay#`."),
				nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'files.autoSave.onFocusChange' }, "A dirty file is automatically saved when the editor loses focus."),
				nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'files.autoSave.onWindowChange' }, "A dirty file is automatically saved when the window loses focus.")
			],
			'default': platform.isWeb ? AutoSaveConfiguration.AFTER_DELAY : AutoSaveConfiguration.OFF,
			'markdownDescription': nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'autoSave' }, "Controls auto save of dirty files. Read more about autosave [here](https://code.visualstudio.com/docs/editor/codebasics#_save-auto-save).", AutoSaveConfiguration.OFF, AutoSaveConfiguration.AFTER_DELAY, AutoSaveConfiguration.ON_FOCUS_CHANGE, AutoSaveConfiguration.ON_WINDOW_CHANGE, AutoSaveConfiguration.AFTER_DELAY)
		},
		'files.autoSaveDelay': {
			'type': 'number',
			'default': 1000,
			'markdownDescription': nls.localize({ comment: ['This is the description for a setting. Values surrounded by single quotes are not to be translated.'], key: 'autoSaveDelay' }, "Controls the delay in ms after which a dirty file is saved automatically. Only applies when `#files.autoSave#` is set to `{0}`.", AutoSaveConfiguration.AFTER_DELAY)
		},
		'files.watcherExclude': {
			'type': 'object',
			'default': platform.isWindows /* https://github.com/Microsoft/vscode/issues/23954 */ ? { '**/.git/objects/**': true, '**/.git/subtree-cache/**': true, '**/node_modules/*/**': true } : { '**/.git/objects/**': true, '**/.git/subtree-cache/**': true, '**/node_modules/**': true },
			'description': nls.localize('watcherExclude', "Configure glob patterns of file paths to exclude from file watching. Patterns must match on absolute paths (i.e. prefix with ** or the full path to match properly). Changing this setting requires a restart. When you experience Code consuming lots of cpu time on startup, you can exclude large folders to reduce the initial load."),
			'scope': ConfigurationScope.RESOURCE
		},
		'files.hotExit': hotExitConfiguration,
		'files.defaultLanguage': {
			'type': 'string',
			'description': nls.localize('defaultLanguage', "The default language mode that is assigned to new files.")
		},
		'files.maxMemoryForLargeFilesMB': {
			'type': 'number',
			'default': 4096,
			'markdownDescription': nls.localize('maxMemoryForLargeFilesMB', "Controls the memory available to VS Code after restart when trying to open large files. Same effect as specifying `--max-memory=NEWSIZE` on the command line."),
			included: platform.isNative
		},
		'files.simpleDialog.enable': {
			'type': 'boolean',
			'description': nls.localize('files.simpleDialog.enable', "Enables the simple file dialog. The simple file dialog replaces the system file dialog when enabled."),
			'default': false,
		}
	}
});

configurationRegistry.registerConfiguration({
	id: 'editor',
	order: 5,
	title: nls.localize('editorConfigurationTitle', "Editor"),
	type: 'object',
	properties: {
		'editor.formatOnSave': {
			'type': 'boolean',
			'default': false,
			'description': nls.localize('formatOnSave', "Format a file on save. A formatter must be available, the file must not be saved after delay, and the editor must not be shutting down."),
			'overridable': true,
			'scope': ConfigurationScope.RESOURCE
		},
		'editor.formatOnSaveTimeout': {
			'type': 'number',
			'default': 750,
			'description': nls.localize('formatOnSaveTimeout', "Timeout in milliseconds after which the formatting that is run on file save is cancelled."),
			'overridable': true,
			'scope': ConfigurationScope.RESOURCE
		}
	}
});

configurationRegistry.registerConfiguration({
	'id': 'explorer',
	'order': 10,
	'title': nls.localize('explorerConfigurationTitle', "File Explorer"),
	'type': 'object',
	'properties': {
		'explorer.openEditors.visible': {
			'type': 'number',
			'description': nls.localize({ key: 'openEditorsVisible', comment: ['Open is an adjective'] }, "Number of editors shown in the Open Editors pane."),
			'default': 9
		},
		'explorer.autoReveal': {
			'type': 'boolean',
			'description': nls.localize('autoReveal', "Controls whether the explorer should automatically reveal and select files when opening them."),
			'default': true
		},
		'explorer.enableDragAndDrop': {
			'type': 'boolean',
			'description': nls.localize('enableDragAndDrop', "Controls whether the explorer should allow to move files and folders via drag and drop."),
			'default': true
		},
		'explorer.confirmDragAndDrop': {
			'type': 'boolean',
			'description': nls.localize('confirmDragAndDrop', "Controls whether the explorer should ask for confirmation to move files and folders via drag and drop."),
			'default': true
		},
		'explorer.confirmDelete': {
			'type': 'boolean',
			'description': nls.localize('confirmDelete', "Controls whether the explorer should ask for confirmation when deleting a file via the trash."),
			'default': true
		},
		'explorer.sortOrder': {
			'type': 'string',
			'enum': [SortOrderConfiguration.DEFAULT, SortOrderConfiguration.MIXED, SortOrderConfiguration.FILES_FIRST, SortOrderConfiguration.TYPE, SortOrderConfiguration.MODIFIED],
			'default': SortOrderConfiguration.DEFAULT,
			'enumDescriptions': [
				nls.localize('sortOrder.default', 'Files and folders are sorted by their names, in alphabetical order. Folders are displayed before files.'),
				nls.localize('sortOrder.mixed', 'Files and folders are sorted by their names, in alphabetical order. Files are interwoven with folders.'),
				nls.localize('sortOrder.filesFirst', 'Files and folders are sorted by their names, in alphabetical order. Files are displayed before folders.'),
				nls.localize('sortOrder.type', 'Files and folders are sorted by their extensions, in alphabetical order. Folders are displayed before files.'),
				nls.localize('sortOrder.modified', 'Files and folders are sorted by last modified date, in descending order. Folders are displayed before files.')
			],
			'description': nls.localize('sortOrder', "Controls sorting order of files and folders in the explorer.")
		},
		'explorer.decorations.colors': {
			type: 'boolean',
			description: nls.localize('explorer.decorations.colors', "Controls whether file decorations should use colors."),
			default: true
		},
		'explorer.decorations.badges': {
			type: 'boolean',
			description: nls.localize('explorer.decorations.badges', "Controls whether file decorations should use badges."),
			default: true
		},
		'explorer.incrementalNaming': {
			enum: ['simple', 'smart'],
			enumDescriptions: [
				nls.localize('simple', "Appends the word \"copy\" at the end of the duplicated name potentially followed by a number"),
				nls.localize('smart', "Adds a number at the end of the duplicated name. If some number is already part of the name, tries to increase that number")
			],
			description: nls.localize('explorer.incrementalNaming', "Controls what naming strategy to use when a giving a new name to a duplicated explorer item on paste."),
			default: 'simple'
		}
	}
});

// View menu
MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
	group: '3_views',
	command: {
		id: VIEWLET_ID,
		title: nls.localize({ key: 'miViewExplorer', comment: ['&& denotes a mnemonic'] }, "&&Explorer")
	},
	order: 1
});
