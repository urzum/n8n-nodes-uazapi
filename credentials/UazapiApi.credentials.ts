import type {
	IAuthenticate,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	IDataObject,
	INodeProperties,
} from 'n8n-workflow';

export class UazapiApi implements ICredentialType {
	name = 'uazapiApi';

	displayName = 'Uazapi API';

	icon: Icon = {
		light: 'file:../nodes/Uazapi/uazapi.svg',
		dark: 'file:../nodes/Uazapi/uazapi.dark.svg',
	};

	documentationUrl = 'https://docs.uazapi.com/';

	properties: INodeProperties[] = [
		{
			displayName: 'Server URL',
			name: 'serverUrl',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'e.g. https://mycompany.uazapi.com',
			description: 'Address of your uazapi server, without a trailing slash',
		},
		{
			displayName: 'Admin Token',
			name: 'adminToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description:
				'Optional. Lets the nodes list your instances. Without it, choose the instance "By Token".',
		},
	];

	// The instance token is per call (it varies with the chosen instance), so it is sent by the
	// node itself. The admin token is only added when the call has no instance token.
	authenticate: IAuthenticate = async (credentials, requestOptions) => {
		const headers: IDataObject = { ...(requestOptions.headers ?? {}) };
		if (!headers.token && credentials.adminToken) {
			headers.admintoken = credentials.adminToken as string;
		}
		return { ...requestOptions, headers };
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.serverUrl.replace(/\\/+$/, "")}}',
			url: '={{$credentials.adminToken ? "/instance/all" : "/status"}}',
			method: 'GET',
		},
	};
}
