/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IURLService, IURLHandler } from 'vs/platform/url/common/url';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IMainProcessService } from 'vs/platform/ipc/electron-browser/mainProcessService';
import { URLHandlerChannel } from 'vs/platform/url/common/urlIpc';
import { URLService } from 'vs/platform/url/node/urlService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import product from 'vs/platform/product/common/product';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IElectronEnvironmentService } from 'vs/workbench/services/electron/electron-browser/electronEnvironmentService';
import { createChannelSender } from 'vs/base/parts/ipc/node/ipc';
import { IElectronService } from 'vs/platform/electron/node/electron';

export class RelayURLService extends URLService implements IURLHandler {

	private urlService: IURLService;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@IOpenerService openerService: IOpenerService,
		@IElectronEnvironmentService private electronEnvironmentService: IElectronEnvironmentService,
		@IElectronService private electronService: IElectronService
	) {
		super();

		this.urlService = createChannelSender(mainProcessService.getChannel('url'));

		mainProcessService.registerChannel('urlHandler', new URLHandlerChannel(this));
		openerService.registerOpener(this);
	}

	create(options?: Partial<UriComponents>): URI {
		const uri = super.create(options);

		let query = uri.query;
		if (!query) {
			query = `windowId=${encodeURIComponent(this.electronEnvironmentService.windowId)}`;
		} else {
			query += `&windowId=${encodeURIComponent(this.electronEnvironmentService.windowId)}`;
		}

		return uri.with({ query });
	}

	async open(resource: URI, options?: { openToSide?: boolean, openExternal?: boolean }): Promise<boolean> {
		if (resource.scheme !== product.urlProtocol) {
			return false;
		}

		return await this.urlService.open(resource);
	}

	async handleURL(uri: URI): Promise<boolean> {
		const result = await super.open(uri);

		if (result) {
			await this.electronService.focusWindow();
		}

		return result;
	}
}

registerSingleton(IURLService, RelayURLService);
