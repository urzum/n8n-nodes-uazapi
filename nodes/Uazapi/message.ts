import type { IDataObject, INodeProperties } from 'n8n-workflow';
import type { ApiCall } from '../shared/transport';

export type ParamGetter = (name: string, fallback?: unknown) => unknown;

export interface BinaryFile {
	base64: string;
	mimeType: string;
	fileName: string;
}

export type BinaryReader = (propertyName: string) => Promise<BinaryFile>;

const SEND_OPERATIONS = ['sendText'];

export const messageProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['message'] } },
		options: [{ name: 'Send Text', value: 'sendText', action: 'Send a text message', description: 'Send a text message to a number or chat' }],
		default: 'sendText',
	},
	{
		displayName: 'Number',
		name: 'number',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 5511999999999',
		description: 'Phone number with country code, or a chat ID (for groups)',
		displayOptions: { show: { resource: ['message'], operation: SEND_OPERATIONS } },
	},
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		required: true,
		displayOptions: { show: { resource: ['message'], operation: ['sendText'] } },
	},
	{
		displayName: 'Track Source',
		name: 'trackSource',
		type: 'string',
		default: 'automa_uazapi',
		description:
			'Label saved with the message and returned by the webhook. The Uazapi Trigger ignores "automa_uazapi" by default, which prevents reply loops.',
		displayOptions: { show: { resource: ['message'], operation: SEND_OPERATIONS } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource: ['message'], operation: SEND_OPERATIONS } },
		options: [
			{ displayName: 'Async', name: 'async', type: 'boolean', default: false, description: "Whether to queue the message on uazapi's internal queue" },
			{ displayName: 'Delay (Ms)', name: 'delay', type: 'number', default: 0, description: 'Milliseconds to show "typing..." before sending' },
			{ displayName: 'Forward', name: 'forward', type: 'boolean', default: false, description: 'Whether to mark the message as forwarded' },
			{ displayName: 'Link Preview', name: 'linkPreview', type: 'boolean', default: false, description: 'Whether to show a preview for the first link in the text', displayOptions: { show: { '/operation': ['sendText'] } } },
			{ displayName: 'Mark Chat as Read', name: 'readchat', type: 'boolean', default: false, description: 'Whether to mark the chat as read after sending' },
			{ displayName: 'Mark Messages as Read', name: 'readmessages', type: 'boolean', default: false, description: 'Whether to mark the last received messages as read' },
			{ displayName: 'Mentions', name: 'mentions', type: 'string', default: '', description: 'Comma-separated numbers to mention' },
			{ displayName: 'Reply to Message ID', name: 'replyid', type: 'string', default: '', description: 'ID of the message being answered' },
			{ displayName: 'Track ID', name: 'track_id', type: 'string', default: '', description: 'Free tracking ID returned by the webhook' },
		],
	},
];

export function splitList(value: string): string[] {
	return value.split(',').map((v) => v.trim()).filter(Boolean);
}

export function splitLines(value: string): string[] {
	return value.split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
}

const SEND_PATH: Record<string, string> = {
	sendText: '/send/text',
};

export async function buildMessageCall(operation: string, get: ParamGetter, readBinary: BinaryReader): Promise<ApiCall> {
	void readBinary; // used by Send Media (Task 3)
	const path = SEND_PATH[operation];
	if (!path) throw new Error(`Unsupported message operation: ${operation}`);

	const options = (get('options', {}) ?? {}) as IDataObject;
	const body: IDataObject = { number: String(get('number')) };
	if (operation === 'sendText') body.text = String(get('text'));
	Object.assign(body, options);
	const trackSource = String(get('trackSource', '')).trim();
	if (trackSource) body.track_source = trackSource;
	return { method: 'POST', path, body };
}
