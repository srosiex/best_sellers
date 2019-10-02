/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'vs/base/common/path';

import { URI, UriComponents } from 'vs/base/common/uri';
import { win32 } from 'vs/base/node/processes';
import * as types from 'vs/workbench/api/common/extHostTypes';
import { IExtHostWorkspace } from 'vs/workbench/api/common/extHostWorkspace';
import * as vscode from 'vscode';
import * as tasks from '../common/shared/tasks';
import { ExtHostVariableResolverService } from 'vs/workbench/api/node/extHostDebugService';
import { IExtHostDocumentsAndEditors } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import { IExtHostConfiguration } from 'vs/workbench/api/common/extHostConfiguration';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { IExtHostTerminalService } from 'vs/workbench/api/common/extHostTerminalService';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { IExtHostInitDataService } from 'vs/workbench/api/common/extHostInitDataService';
import { ExtHostTaskBase, TaskHandleDTO, TaskDTO, CustomExecution2DTO, HandlerData } from 'vs/workbench/api/common/extHostTask';
import { Schemas } from 'vs/base/common/network';

export class ExtHostTask extends ExtHostTaskBase {

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService,
		@IExtHostInitDataService initData: IExtHostInitDataService,
		@IExtHostWorkspace workspaceService: IExtHostWorkspace,
		@IExtHostDocumentsAndEditors editorService: IExtHostDocumentsAndEditors,
		@IExtHostConfiguration configurationService: IExtHostConfiguration,
		@IExtHostTerminalService extHostTerminalService: IExtHostTerminalService
	) {
		super(extHostRpc, initData, workspaceService, editorService, configurationService, extHostTerminalService);
		if (initData.remote.isRemote && initData.remote.authority) {
			this.registerTaskSystem(Schemas.vscodeRemote, {
				scheme: Schemas.vscodeRemote,
				authority: initData.remote.authority,
				platform: process.platform
			});
		}
	}

	public async executeTask(extension: IExtensionDescription, task: vscode.Task): Promise<vscode.TaskExecution> {
		const tTask = (task as types.Task);
		// We have a preserved ID. So the task didn't change.
		if (tTask._id !== undefined) {
			return this._proxy.$executeTask(TaskHandleDTO.from(tTask)).then(value => this.getTaskExecution(value, task));
		} else {
			const dto = TaskDTO.from(task, extension);
			if (dto === undefined) {
				return Promise.reject(new Error('Task is not valid'));
			}

			// If this task is a custom execution, then we need to save it away
			// in the provided custom execution map that is cleaned up after the
			// task is executed.
			if (CustomExecution2DTO.is(dto.execution)) {
				await this.addCustomExecution2(dto, <vscode.Task2>task, false);
			}

			return this._proxy.$executeTask(dto).then(value => this.getTaskExecution(value, task));
		}
	}

	protected provideTasksInternal(validTypes: { [key: string]: boolean; }, taskIdPromises: Promise<void>[], handler: HandlerData, value: vscode.Task[] | null | undefined): { tasks: tasks.TaskDTO[], extension: IExtensionDescription } {
		const taskDTOs: tasks.TaskDTO[] = [];
		if (value) {
			for (let task of value) {
				if (!task.definition || !validTypes[task.definition.type]) {
					console.warn(`The task [${task.source}, ${task.name}] uses an undefined task type. The task will be ignored in the future.`);
				}

				const taskDTO: tasks.TaskDTO | undefined = TaskDTO.from(task, handler.extension);
				if (taskDTO) {
					taskDTOs.push(taskDTO);

					if (CustomExecution2DTO.is(taskDTO.execution)) {
						// The ID is calculated on the main thread task side, so, let's call into it here.
						// We need the task id's pre-computed for custom task executions because when OnDidStartTask
						// is invoked, we have to be able to map it back to our data.
						taskIdPromises.push(this.addCustomExecution2(taskDTO, <vscode.Task2>task, true));
					}
				}
			}
		}
		return {
			tasks: taskDTOs,
			extension: handler.extension
		};
	}

	protected async resolveTaskInternal(resolvedTaskDTO: tasks.TaskDTO): Promise<tasks.TaskDTO | undefined> {
		return resolvedTaskDTO;
	}

	public async $resolveVariables(uriComponents: UriComponents, toResolve: { process?: { name: string; cwd?: string; path?: string }, variables: string[] }): Promise<{ process?: string, variables: { [key: string]: string; } }> {
		const configProvider = await this._configurationService.getConfigProvider();
		const uri: URI = URI.revive(uriComponents);
		const result = {
			process: <unknown>undefined as string,
			variables: Object.create(null)
		};
		const workspaceFolder = await this._workspaceProvider.resolveWorkspaceFolder(uri);
		const workspaceFolders = await this._workspaceProvider.getWorkspaceFolders2();
		if (!workspaceFolders || !workspaceFolder) {
			throw new Error('Unexpected: Tasks can only be run in a workspace folder');
		}
		const resolver = new ExtHostVariableResolverService(workspaceFolders, this._editorService, configProvider);
		const ws: IWorkspaceFolder = {
			uri: workspaceFolder.uri,
			name: workspaceFolder.name,
			index: workspaceFolder.index,
			toResource: () => {
				throw new Error('Not implemented');
			}
		};
		for (let variable of toResolve.variables) {
			result.variables[variable] = resolver.resolve(ws, variable);
		}
		if (toResolve.process !== undefined) {
			let paths: string[] | undefined = undefined;
			if (toResolve.process.path !== undefined) {
				paths = toResolve.process.path.split(path.delimiter);
				for (let i = 0; i < paths.length; i++) {
					paths[i] = resolver.resolve(ws, paths[i]);
				}
			}
			result.process = await win32.findExecutable(
				resolver.resolve(ws, toResolve.process.name),
				toResolve.process.cwd !== undefined ? resolver.resolve(ws, toResolve.process.cwd) : undefined,
				paths
			);
		}
		return result;
	}

	public $getDefaultShellAndArgs(): Promise<{ shell: string, args: string[] | string | undefined }> {
		return this._terminalService.$requestDefaultShellAndArgs(true);
	}

	public async $jsonTasksSupported(): Promise<boolean> {
		return true;
	}
}
