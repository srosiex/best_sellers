/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';

export const IOpenerService = createDecorator<IOpenerService>('openerService');

type OpenToSideOptions = { readonly openToSide?: boolean };
type OpenExternalOptions = { readonly openExternal?: boolean; readonly allowTunneling?: boolean };

export type OpenOptions = OpenToSideOptions & OpenExternalOptions;

export interface IOpener {
	open(resource: URI, options?: OpenToSideOptions): Promise<boolean>;
	open(resource: URI, options?: OpenExternalOptions): Promise<boolean>;
}

export interface IValidator {
	shouldOpen(resource: URI): Promise<boolean>;
}

export interface IExternalUriResolver {
	resolveExternalUri(resource: URI, options?: OpenOptions): Promise<{ resolved: URI, dispose(): void } | undefined>;
}

export interface IOpenerService {

	_serviceBrand: undefined;

	/**
	 * Register a participant that can handle the open() call.
	 */
	registerOpener(opener: IOpener): IDisposable;

	/**
	 * Register a participant that can validate if the URI resource be opened.
	 * Validators are run before openers.
	 */
	registerValidator(validator: IValidator): IDisposable;

	/**
	 * Register a participant that can resolve an external URI resource to be opened.
	 */
	registerExternalUriResolver(resolver: IExternalUriResolver): IDisposable;

	/**
	 * Opens a resource, like a webaddress, a document uri, or executes command.
	 *
	 * @param resource A resource
	 * @return A promise that resolves when the opening is done.
	 */
	open(resource: URI, options?: OpenToSideOptions): Promise<boolean>;
	open(resource: URI, options?: OpenExternalOptions): Promise<boolean>;

	resolveExternalUri(resource: URI, options?: { readonly allowTunneling?: boolean }): Promise<{ resolved: URI, dispose(): void }>;
}

export const NullOpenerService: IOpenerService = Object.freeze({
	_serviceBrand: undefined,
	registerOpener() { return Disposable.None; },
	registerValidator() { return Disposable.None; },
	registerExternalUriResolver() { return Disposable.None; },
	open() { return Promise.resolve(false); },
	async resolveExternalUri(uri: URI) { return { resolved: uri, dispose() { } }; },
});
