/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI as uri } from 'vs/base/common/uri';
import * as nls from 'vs/nls';
import * as path from 'vs/base/common/path';
import * as Types from 'vs/base/common/types';
import { Schemas } from 'vs/base/common/network';
import { toResource } from 'vs/workbench/common/editor';
import { IStringDictionary, forEach, fromMap } from 'vs/base/common/collections';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IWorkspaceFolder, IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { AbstractVariableResolverService } from 'vs/workbench/services/configurationResolver/common/variableResolver';
import { isCodeEditor } from 'vs/editor/browser/editorBrowser';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { IQuickInputService, IInputOptions, IQuickPickItem, IPickOptions } from 'vs/platform/quickinput/common/quickInput';
import { ConfiguredInput, IConfigurationResolverService } from 'vs/workbench/services/configurationResolver/common/configurationResolver';
import { IProcessEnvironment } from 'vs/base/common/platform';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export abstract class BaseConfigurationResolverService extends AbstractVariableResolverService {

	static INPUT_OR_COMMAND_VARIABLES_PATTERN = /\${((input|command):(.*?))}/g;

	constructor(
		envVariables: IProcessEnvironment,
		editorService: IEditorService,
		environmentService: IWorkbenchEnvironmentService,
		private readonly configurationService: IConfigurationService,
		private readonly commandService: ICommandService,
		private readonly workspaceContextService: IWorkspaceContextService,
		private readonly quickInputService: IQuickInputService
	) {
		super({
			getFolderUri: (folderName: string): uri | undefined => {
				const folder = workspaceContextService.getWorkspace().folders.filter(f => f.name === folderName).pop();
				return folder ? folder.uri : undefined;
			},
			getWorkspaceFolderCount: (): number => {
				return workspaceContextService.getWorkspace().folders.length;
			},
			getConfigurationValue: (folderUri: uri, suffix: string): string | undefined => {
				return configurationService.getValue<string>(suffix, folderUri ? { resource: folderUri } : {});
			},
			getExecPath: (): string | undefined => {
				return environmentService['execPath'];
			},
			getFilePath: (): string | undefined => {
				let activeEditor = editorService.activeEditor;
				if (activeEditor instanceof DiffEditorInput) {
					activeEditor = activeEditor.modifiedInput;
				}
				const fileResource = toResource(activeEditor, { filterByScheme: [Schemas.file, Schemas.userData] });
				if (!fileResource) {
					return undefined;
				}
				return path.normalize(fileResource.fsPath);
			},
			getSelectedText: (): string | undefined => {
				const activeTextEditorWidget = editorService.activeTextEditorWidget;
				if (isCodeEditor(activeTextEditorWidget)) {
					const editorModel = activeTextEditorWidget.getModel();
					const editorSelection = activeTextEditorWidget.getSelection();
					if (editorModel && editorSelection) {
						return editorModel.getValueInRange(editorSelection);
					}
				}
				return undefined;
			},
			getLineNumber: (): string | undefined => {
				const activeTextEditorWidget = editorService.activeTextEditorWidget;
				if (isCodeEditor(activeTextEditorWidget)) {
					const selection = activeTextEditorWidget.getSelection();
					if (selection) {
						const lineNumber = selection.positionLineNumber;
						return String(lineNumber);
					}
				}
				return undefined;
			}
		}, envVariables);
	}

	public async resolveWithInteractionReplace(folder: IWorkspaceFolder | undefined, config: any, section?: string, variables?: IStringDictionary<string>): Promise<any> {
		// resolve any non-interactive variables and any contributed variables
		config = await this.resolveAny(folder, config);

		// resolve input variables in the order in which they are encountered
		return this.resolveWithInteraction(folder, config, section, variables, true).then(mapping => {
			// finally substitute evaluated command variables (if there are any)
			if (!mapping) {
				return null;
			} else if (mapping.size > 0) {
				return this.resolveAny(folder, config, fromMap(mapping));
			} else {
				return config;
			}
		});
	}

	public async resolveWithInteraction(folder: IWorkspaceFolder | undefined, config: any, section?: string, variables?: IStringDictionary<string>, skipContributed: boolean = false): Promise<Map<string, string> | undefined> {
		// resolve any non-interactive variables and any contributed variables
		const resolved = await this.resolveAnyMap(folder, config);
		config = resolved.newConfig;
		const allVariableMapping: Map<string, string> = resolved.resolvedVariables;

		// resolve input and command variables in the order in which they are encountered
		return this.resolveWithInputAndCommands(folder, config, variables, section).then(inputOrCommandMapping => {
			if (this.updateMapping(inputOrCommandMapping, allVariableMapping)) {
				return allVariableMapping;
			}
			return undefined;
		});
	}

	/**
	 * Add all items from newMapping to fullMapping. Returns false if newMapping is undefined.
	 */
	private updateMapping(newMapping: IStringDictionary<string> | undefined, fullMapping: Map<string, string>): boolean {
		if (!newMapping) {
			return false;
		}
		forEach(newMapping, (entry) => {
			fullMapping.set(entry.key, entry.value);
		});
		return true;
	}

	/**
	 * Finds and executes all input and command variables in the given configuration and returns their values as a dictionary.
	 * Please note: this method does not substitute the input or command variables (so the configuration is not modified).
	 * The returned dictionary can be passed to "resolvePlatform" for the actual substitution.
	 * See #6569.
	 *
	 * @param variableToCommandMap Aliases for commands
	 */
	private async resolveWithInputAndCommands(folder: IWorkspaceFolder | undefined, configuration: any, variableToCommandMap?: IStringDictionary<string>, section?: string): Promise<IStringDictionary<string> | undefined> {

		if (!configuration) {
			return Promise.resolve(undefined);
		}

		// get all "inputs"
		let inputs: ConfiguredInput[] = [];
		if (folder && this.workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY && section) {
			let result = this.configurationService.getValue<any>(section, { resource: folder.uri });
			if (result) {
				inputs = result.inputs;
			}
		}

		// extract and dedupe all "input" and "command" variables and preserve their order in an array
		const variables: string[] = [];
		this.findVariables(configuration, variables);

		const variableValues: IStringDictionary<string> = Object.create(null);

		for (const variable of variables) {

			const [type, name] = variable.split(':', 2);

			let result: string | undefined;

			switch (type) {

				case 'input':
					result = await this.showUserInput(name, inputs);
					break;

				case 'command':
					// use the name as a command ID #12735
					const commandId = (variableToCommandMap ? variableToCommandMap[name] : undefined) || name;
					result = await this.commandService.executeCommand(commandId, configuration);
					if (typeof result !== 'string' && !Types.isUndefinedOrNull(result)) {
						throw new Error(nls.localize('commandVariable.noStringType', "Cannot substitute command variable '{0}' because command did not return a result of type string.", commandId));
					}
					break;
			}

			if (typeof result === 'string') {
				variableValues[variable] = result;
			} else {
				return undefined;
			}
		}

		return variableValues;
	}

	/**
	 * Recursively finds all command or input variables in object and pushes them into variables.
	 * @param object object is searched for variables.
	 * @param variables All found variables are returned in variables.
	 */
	private findVariables(object: any, variables: string[]) {
		if (typeof object === 'string') {
			let matches;
			while ((matches = BaseConfigurationResolverService.INPUT_OR_COMMAND_VARIABLES_PATTERN.exec(object)) !== null) {
				if (matches.length === 4) {
					const command = matches[1];
					if (variables.indexOf(command) < 0) {
						variables.push(command);
					}
				}
			}
		} else if (Types.isArray(object)) {
			object.forEach(value => {
				this.findVariables(value, variables);
			});
		} else if (object) {
			Object.keys(object).forEach(key => {
				const value = object[key];
				this.findVariables(value, variables);
			});
		}
	}

	/**
	 * Takes the provided input info and shows the quick pick so the user can provide the value for the input
	 * @param variable Name of the input variable.
	 * @param inputInfos Information about each possible input variable.
	 */
	private showUserInput(variable: string, inputInfos: ConfiguredInput[]): Promise<string | undefined> {

		if (!inputInfos) {
			return Promise.reject(new Error(nls.localize('inputVariable.noInputSection', "Variable '{0}' must be defined in an '{1}' section of the debug or task configuration.", variable, 'input')));
		}

		// find info for the given input variable
		const info = inputInfos.filter(item => item.id === variable).pop();
		if (info) {

			const missingAttribute = (attrName: string) => {
				throw new Error(nls.localize('inputVariable.missingAttribute', "Input variable '{0}' is of type '{1}' and must include '{2}'.", variable, info.type, attrName));
			};

			switch (info.type) {

				case 'promptString': {
					if (!Types.isString(info.description)) {
						missingAttribute('description');
					}
					const inputOptions: IInputOptions = { prompt: info.description };
					if (info.default) {
						inputOptions.value = info.default;
					}
					return this.quickInputService.input(inputOptions).then(resolvedInput => {
						return resolvedInput;
					});
				}

				case 'pickString': {
					if (!Types.isString(info.description)) {
						missingAttribute('description');
					}
					if (!Types.isStringArray(info.options)) {
						missingAttribute('options');
					}
					const picks = new Array<IQuickPickItem>();
					info.options.forEach(pickOption => {
						const item: IQuickPickItem = { label: pickOption };
						if (pickOption === info.default) {
							item.description = nls.localize('inputVariable.defaultInputValue', "Default");
							picks.unshift(item);
						} else {
							picks.push(item);
						}
					});
					const pickOptions: IPickOptions<IQuickPickItem> = { placeHolder: info.description };
					return this.quickInputService.pick(picks, pickOptions, undefined).then(resolvedInput => {
						return resolvedInput ? resolvedInput.label : undefined;
					});
				}

				case 'command': {
					if (!Types.isString(info.command)) {
						missingAttribute('command');
					}
					return this.commandService.executeCommand<string>(info.command, info.args).then(result => {
						if (typeof result === 'string' || Types.isUndefinedOrNull(result)) {
							return result;
						}
						throw new Error(nls.localize('inputVariable.command.noStringType', "Cannot substitute input variable '{0}' because command '{1}' did not return a result of type string.", variable, info.command));
					});
				}

				default:
					throw new Error(nls.localize('inputVariable.unknownType', "Input variable '{0}' can only be of type 'promptString', 'pickString', or 'command'.", variable));
			}
		}
		return Promise.reject(new Error(nls.localize('inputVariable.undefinedVariable', "Undefined input variable '{0}' encountered. Remove or define '{0}' to continue.", variable)));
	}
}

export class ConfigurationResolverService extends BaseConfigurationResolverService {

	constructor(
		@IEditorService editorService: IEditorService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IConfigurationService configurationService: IConfigurationService,
		@ICommandService commandService: ICommandService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@IQuickInputService quickInputService: IQuickInputService
	) {
		super(environmentService.configuration.userEnv, editorService, environmentService, configurationService, commandService, workspaceContextService, quickInputService);
	}
}

registerSingleton(IConfigurationResolverService, ConfigurationResolverService, true);
