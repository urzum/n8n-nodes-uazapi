import type { IDataObject, INodeProperties } from 'n8n-workflow';
import type { ApiCall } from '../shared/transport';

export type ParamGetter = (name: string, fallback?: unknown) => unknown;

export interface BinaryFile {
	base64: string;
	mimeType: string;
	fileName: string;
}

export type BinaryReader = (propertyName: string) => Promise<BinaryFile>;

const SEND_OPERATIONS = ['sendContact', 'sendLocation', 'sendMedia', 'sendMenu', 'sendText'];
const show = (operation: string[]) => ({ show: { resource: ['message'], operation } });

export const messageProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['message'] } },
		options: [
			{ name: 'Mark as Read', value: 'markRead', action: 'Mark messages as read', description: 'Mark one or more received messages as read' },
			{ name: 'React', value: 'react', action: 'React to a message', description: 'Add an emoji reaction, or remove it with an empty emoji' },
			{ name: 'Send Contact', value: 'sendContact', action: 'Send a contact card', description: 'Send a contact card (vCard)' },
			{ name: 'Send Location', value: 'sendLocation', action: 'Send a location', description: 'Send a map location' },
			{ name: 'Send Media', value: 'sendMedia', action: 'Send media', description: 'Send an image, video, audio, document or sticker' },
			{ name: 'Send Menu', value: 'sendMenu', action: 'Send a menu', description: 'Send buttons, a list or a poll' },
			{ name: 'Send Presence', value: 'sendPresence', action: 'Send a presence', description: 'Show "typing..." or "recording..." in the chat' },
			{ name: 'Send Text', value: 'sendText', action: 'Send a text message', description: 'Send a text message to a number or chat' },
		],
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
		displayOptions: show([...SEND_OPERATIONS, 'sendPresence']),
	},
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		required: true,
		displayOptions: show(['sendMenu', 'sendText']),
	},
	{
		displayName: 'Media Type',
		name: 'mediaType',
		type: 'options',
		options: [
			{ name: 'Audio', value: 'audio' },
			{ name: 'Document', value: 'document' },
			{ name: 'Image', value: 'image' },
			{ name: 'My Audio', value: 'myaudio', description: 'Audio shown as recorded by you' },
			{ name: 'Round Video', value: 'ptv' },
			{ name: 'Sticker', value: 'sticker' },
			{ name: 'Video', value: 'video' },
			{ name: 'Video (Autoplay)', value: 'videoplay' },
			{ name: 'Voice Note', value: 'ptt' },
		],
		default: 'image',
		displayOptions: show(['sendMedia']),
	},
	{
		displayName: 'File Source',
		name: 'fileSource',
		type: 'options',
		options: [
			{ name: 'Binary File', value: 'binary', description: 'Use a binary property from the input item' },
			{ name: 'URL or Base64', value: 'url', description: 'Use a public URL or a base64 string' },
		],
		default: 'url',
		displayOptions: show(['sendMedia']),
	},
	{
		displayName: 'File',
		name: 'file',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. https://example.com/photo.jpg',
		description: 'Public URL or base64 of the file',
		displayOptions: { show: { resource: ['message'], operation: ['sendMedia'], fileSource: ['url'] } },
	},
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		default: 'data',
		required: true,
		description: 'Name of the binary property that holds the file',
		displayOptions: { show: { resource: ['message'], operation: ['sendMedia'], fileSource: ['binary'] } },
	},
	{
		displayName: 'Caption',
		name: 'caption',
		type: 'string',
		typeOptions: { rows: 2 },
		default: '',
		displayOptions: show(['sendMedia']),
	},
	{
		displayName: 'Full Name',
		name: 'fullName',
		type: 'string',
		default: '',
		required: true,
		displayOptions: show(['sendContact']),
	},
	{
		displayName: 'Phone Numbers',
		name: 'phoneNumber',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 5511999999999, 5511888888888',
		description: 'Comma-separated phone numbers of the contact',
		displayOptions: show(['sendContact']),
	},
	{
		displayName: 'Latitude',
		name: 'latitude',
		type: 'number',
		typeOptions: { numberPrecision: 6 },
		default: 0,
		required: true,
		displayOptions: show(['sendLocation']),
	},
	{
		displayName: 'Longitude',
		name: 'longitude',
		type: 'number',
		typeOptions: { numberPrecision: 6 },
		default: 0,
		required: true,
		displayOptions: show(['sendLocation']),
	},
	{
		displayName: 'Menu Type',
		name: 'menuType',
		type: 'options',
		options: [
			{ name: 'Buttons', value: 'button' },
			{ name: 'List', value: 'list' },
			{ name: 'Poll', value: 'poll' },
		],
		default: 'button',
		displayOptions: show(['sendMenu']),
	},
	{
		displayName: 'Choices',
		name: 'choices',
		type: 'string',
		typeOptions: { rows: 5 },
		default: '',
		required: true,
		placeholder: 'e.g. Yes|yes',
		description: 'One option per line. For lists, a line like [Section] starts a section.',
		displayOptions: show(['sendMenu']),
	},
	{
		displayName: 'Message ID',
		name: 'messageId',
		type: 'string',
		default: '',
		required: true,
		description: 'ID of the message that receives the reaction',
		displayOptions: show(['react']),
	},
	{
		displayName: 'Emoji',
		name: 'emoji',
		type: 'string',
		default: '',
		description: 'Emoji to react with. Leave empty to remove the reaction.',
		displayOptions: show(['react']),
	},
	{
		displayName: 'Message IDs',
		name: 'messageIds',
		type: 'string',
		default: '',
		required: true,
		description: 'Comma-separated IDs of the messages to mark as read',
		displayOptions: show(['markRead']),
	},
	{
		displayName: 'Presence',
		name: 'presence',
		type: 'options',
		options: [
			{ name: 'Paused', value: 'paused' },
			{ name: 'Recording', value: 'recording' },
			{ name: 'Typing', value: 'composing' },
		],
		default: 'composing',
		displayOptions: show(['sendPresence']),
	},
	{
		displayName: 'Duration (Ms)',
		name: 'duration',
		type: 'number',
		default: 0,
		description: 'How long the presence stays on, in milliseconds (max 5 minutes). 0 uses the uazapi default.',
		displayOptions: show(['sendPresence']),
	},
	{
		displayName: 'Track Source',
		name: 'trackSource',
		type: 'string',
		default: 'automa_uazapi',
		description:
			'Label saved with the message and returned by the webhook. The Uazapi Trigger ignores "automa_uazapi" by default, which prevents reply loops.',
		displayOptions: show(SEND_OPERATIONS),
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: show(SEND_OPERATIONS),
		options: [
			{ displayName: 'Async', name: 'async', type: 'boolean', default: false, description: "Whether to queue the message on uazapi's internal queue" },
			{ displayName: 'Delay (Ms)', name: 'delay', type: 'number', default: 0, description: 'Milliseconds to show "typing..." before sending' },
			{ displayName: 'Document Name', name: 'docName', type: 'string', default: '', description: 'File name shown for documents', displayOptions: { show: { '/operation': ['sendMedia'] } } },
			{ displayName: 'Email', name: 'email', type: 'string', placeholder: 'name@email.com', default: '', displayOptions: { show: { '/operation': ['sendContact'] } } },
			{ displayName: 'Footer Text', name: 'footerText', type: 'string', default: '', displayOptions: { show: { '/operation': ['sendMenu'] } } },
			{ displayName: 'Forward', name: 'forward', type: 'boolean', default: false, description: 'Whether to mark the message as forwarded' },
			{ displayName: 'Image Button URL', name: 'imageButton', type: 'string', default: '', description: 'Image shown above the buttons', displayOptions: { show: { '/operation': ['sendMenu'] } } },
			{ displayName: 'Link Preview', name: 'linkPreview', type: 'boolean', default: false, description: 'Whether to show a preview for the first link in the text', displayOptions: { show: { '/operation': ['sendText'] } } },
			{ displayName: 'List Button Text', name: 'listButton', type: 'string', default: '', description: 'Text of the button that opens the list', displayOptions: { show: { '/operation': ['sendMenu'] } } },
			{ displayName: 'Location Address', name: 'address', type: 'string', default: '', displayOptions: { show: { '/operation': ['sendLocation'] } } },
			{ displayName: 'Location Name', name: 'name', type: 'string', default: '', displayOptions: { show: { '/operation': ['sendLocation'] } } },
			{ displayName: 'Mark Chat as Read', name: 'readchat', type: 'boolean', default: false, description: 'Whether to mark the chat as read after sending' },
			{ displayName: 'Mark Messages as Read', name: 'readmessages', type: 'boolean', default: false, description: 'Whether to mark the last received messages as read' },
			{ displayName: 'Mentions', name: 'mentions', type: 'string', default: '', description: 'Comma-separated numbers to mention' },
			{ displayName: 'MIME Type', name: 'mimetype', type: 'string', default: '', description: 'Detected automatically when empty', displayOptions: { show: { '/operation': ['sendMedia'] } } },
			{ displayName: 'Organization', name: 'organization', type: 'string', default: '', displayOptions: { show: { '/operation': ['sendContact'] } } },
			{ displayName: 'Reply to Message ID', name: 'replyid', type: 'string', default: '', description: 'ID of the message being answered' },
			{ displayName: 'Selectable Count', name: 'selectableCount', type: 'number', default: 1, description: 'Maximum number of options a person can pick in a poll', displayOptions: { show: { '/operation': ['sendMenu'] } } },
			{ displayName: 'Thumbnail', name: 'thumbnail', type: 'string', default: '', description: 'URL or base64 of a preview image', displayOptions: { show: { '/operation': ['sendMedia'] } } },
			{ displayName: 'Track ID', name: 'track_id', type: 'string', default: '', description: 'Free tracking ID returned by the webhook' },
			{ displayName: 'View Once', name: 'viewOnce', type: 'boolean', default: false, description: 'Whether the media can be viewed only once', displayOptions: { show: { '/operation': ['sendMedia'] } } },
			{ displayName: 'Website', name: 'url', type: 'string', default: '', displayOptions: { show: { '/operation': ['sendContact'] } } },
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
	sendContact: '/send/contact',
	sendLocation: '/send/location',
	sendMedia: '/send/media',
	sendMenu: '/send/menu',
	sendText: '/send/text',
};

export async function buildMessageCall(operation: string, get: ParamGetter, readBinary: BinaryReader): Promise<ApiCall> {
	if (operation === 'react') {
		return { method: 'POST', path: '/message/react', body: { id: String(get('messageId')), text: String(get('emoji', '')) } };
	}
	if (operation === 'markRead') {
		return { method: 'POST', path: '/message/markread', body: { id: splitList(String(get('messageIds'))) } };
	}
	if (operation === 'sendPresence') {
		const body: IDataObject = { number: String(get('number')), presence: String(get('presence')) };
		const duration = Number(get('duration', 0));
		if (duration > 0) body.delay = duration;
		return { method: 'POST', path: '/message/presence', body };
	}

	const path = SEND_PATH[operation];
	if (!path) throw new Error(`Unsupported message operation: ${operation}`);

	const options = (get('options', {}) ?? {}) as IDataObject;
	const body: IDataObject = { number: String(get('number')) };

	if (operation === 'sendText') body.text = String(get('text'));
	if (operation === 'sendContact') {
		body.fullName = String(get('fullName'));
		body.phoneNumber = String(get('phoneNumber'));
	}
	if (operation === 'sendLocation') {
		body.latitude = Number(get('latitude'));
		body.longitude = Number(get('longitude'));
	}
	if (operation === 'sendMenu') {
		body.type = String(get('menuType'));
		body.text = String(get('text'));
		body.choices = splitLines(String(get('choices')));
	}
	if (operation === 'sendMedia') {
		body.type = String(get('mediaType'));
		if (get('fileSource', 'url') === 'binary') {
			const binary = await readBinary(String(get('binaryPropertyName', 'data')));
			body.file = binary.base64;
			if (!options.mimetype && binary.mimeType) body.mimetype = binary.mimeType;
			if (!options.docName && body.type === 'document' && binary.fileName) body.docName = binary.fileName;
		} else {
			body.file = String(get('file'));
		}
		const caption = String(get('caption', ''));
		if (caption) body.text = caption;
	}

	Object.assign(body, options);
	const trackSource = String(get('trackSource', '')).trim();
	if (trackSource) body.track_source = trackSource;
	return { method: 'POST', path, body };
}
