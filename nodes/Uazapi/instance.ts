import type { INodeProperties } from 'n8n-workflow';
import type { ApiCall } from '../shared/transport';
import type { ParamGetter } from './message';

export const instanceProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['instance'] } },
		options: [
			{ name: 'Connect', value: 'connect', action: 'Connect the instance', description: 'Start the connection and return the QR code or pairing code' },
			{ name: 'Disconnect', value: 'disconnect', action: 'Disconnect the instance', description: 'Log the WhatsApp number out of the instance' },
			{ name: 'Get Status', value: 'getStatus', action: 'Get the instance status', description: 'Return the connection status of the instance' },
		],
		default: 'getStatus',
	},
	{
		displayName: 'Phone',
		name: 'phone',
		type: 'string',
		default: '',
		placeholder: 'e.g. 5511999999999',
		description: 'If set, uazapi returns a pairing code for this number instead of a QR code',
		displayOptions: { show: { resource: ['instance'], operation: ['connect'] } },
	},
];

export function buildInstanceCall(operation: string, get: ParamGetter): ApiCall {
	if (operation === 'getStatus') return { method: 'GET', path: '/instance/status' };
	if (operation === 'disconnect') return { method: 'POST', path: '/instance/disconnect' };
	if (operation === 'connect') {
		const phone = String(get('phone', '')).trim();
		return { method: 'POST', path: '/instance/connect', body: phone ? { phone } : undefined };
	}
	throw new Error(`Unsupported instance operation: ${operation}`);
}
