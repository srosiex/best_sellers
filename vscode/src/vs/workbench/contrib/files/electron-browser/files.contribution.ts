/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorInput } from 'vs/workbench/common/editor';
import { FileEditorInput } from 'vs/workbench/contrib/files/common/editors/fileEditorInput';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IEditorRegistry, EditorDescriptor, Extensions as EditorExtensions } from 'vs/workbench/browser/editor';
import { NativeTextFileEditor } from 'vs/workbench/contrib/files/electron-browser/textFileEditor';
import { NativeDirtyFilesTracker } from 'vs/workbench/contrib/files/electron-browser/dirtyFilesTracker';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';

// Register file editor
Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditor(
	new EditorDescriptor(
		NativeTextFileEditor,
		NativeTextFileEditor.ID,
		nls.localize('textFileEditor', "Text File Editor")
	),
	[
		new SyncDescriptor<EditorInput>(FileEditorInput)
	]
);

// Register Dirty Files Tracker
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(NativeDirtyFilesTracker, LifecyclePhase.Starting);
