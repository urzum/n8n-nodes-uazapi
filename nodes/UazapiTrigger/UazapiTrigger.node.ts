import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { instanceLocator, searchInstances } from '../shared/instanceLocator';
import { normalizeMessage } from '../shared/normalize';
import type { InstanceLocator } from '../shared/transport';
import { resolveInstanceToken, statusOf, toNodeError, uazapiRequest } from '../shared/transport';
import {
	addWebhookBody,
	deleteWebhookBody,
	dropReason,
	findOwnWebhook,
	parseList,
	sameConfig,
} from './webhookConfig';

async function hookSetup(ctx: IHookFunctions) {
	return {
		url: ctx.getNodeWebhookUrl('default') as string,
		token: await resolveInstanceToken(ctx, ctx.getNodeParameter('instance') as InstanceLocator),
		events: ctx.getNodeParameter('events', []) as string[],
		exclude: ctx.getNodeParameter('excludeMessages', []) as string[],
	};
}

export class UazapiTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Uazapi Trigger',
		name: 'uazapiTrigger',
		icon: { light: 'file:uazapi.svg', dark: 'file:uazapi.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description: 'Starts the workflow when uazapi sends a WhatsApp event',
		defaults: { name: 'Uazapi Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'uazapiApi', required: true }],
		webhooks: [{ name: 'default', httpMethod: 'POST', responseMode: 'onReceived', path: 'webhook' }],
		properties: [
			instanceLocator,
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				default: ['messages'],
				options: [
					{ name: 'Call', value: 'call' },
					{ name: 'Chat Labels', value: 'chat_labels' },
					{ name: 'Chats', value: 'chats' },
					{ name: 'Connection', value: 'connection' },
					{ name: 'Contacts', value: 'contacts' },
					{ name: 'Groups', value: 'groups' },
					{ name: 'History', value: 'history' },
					{ name: 'Labels', value: 'labels' },
					{ name: 'Message Updates', value: 'messages_update', description: 'Delivery and read status of sent messages' },
					{ name: 'Messages', value: 'messages' },
					{ name: 'Newsletter Messages', value: 'newsletter_messages' },
					{ name: 'Presence', value: 'presence' },
					{ name: 'Sender (Campaigns)', value: 'sender' },
					{ name: 'Status Posts', value: 'status_posts' },
				],
			},
			{
				displayName: 'Ignore Track Source',
				name: 'ignoreTrackSource',
				type: 'string',
				default: 'automa_uazapi',
				description:
					'Comma-separated track_source values to ignore. Messages sent by the Uazapi node carry "automa_uazapi" by default. Leave empty to receive everything.',
			},
			{
				displayName: 'Exclude at Source',
				name: 'excludeMessages',
				type: 'multiOptions',
				default: [],
				description: 'Messages uazapi should not send to this webhook at all',
				options: [
					{ name: 'From Me', value: 'fromMeYes' },
					{ name: 'Group Messages', value: 'isGroupYes' },
					{ name: 'Not From Me', value: 'fromMeNo' },
					{ name: 'Not Sent by API', value: 'wasNotSentByApi' },
					{ name: 'Private Messages', value: 'isGroupNo' },
					{ name: 'Sent by API', value: 'wasSentByApi' },
				],
			},
			{
				displayName: 'Output',
				name: 'output',
				type: 'options',
				default: 'normalized',
				options: [
					{ name: 'Normalized', value: 'normalized', description: 'Same shape for every message type, plus the raw body' },
					{ name: 'Raw', value: 'raw', description: 'The webhook body exactly as uazapi sent it' },
				],
			},
		],
	};

	methods = { listSearch: { searchInstances } };

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const { url, token, events, exclude } = await hookSetup(this);
				const own = findOwnWebhook(await uazapiRequest(this, { method: 'GET', path: '/webhook' }, token), url);
				if (!own) return false;
				if (!sameConfig(own, events, exclude)) {
					await uazapiRequest(this, { method: 'POST', path: '/webhook', body: deleteWebhookBody(own.id) }, token);
					return false;
				}
				this.getWorkflowStaticData('node').webhookId = own.id;
				return true;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const { url, token, events, exclude } = await hookSetup(this);
				const response = await uazapiRequest(this, { method: 'POST', path: '/webhook', body: addWebhookBody(url, events, exclude) }, token);
				const own =
					findOwnWebhook(response, url) ??
					findOwnWebhook(await uazapiRequest(this, { method: 'GET', path: '/webhook' }, token), url);
				if (!own) throw new NodeOperationError(this.getNode(), `uazapi did not register the webhook ${url}`);
				this.getWorkflowStaticData('node').webhookId = own.id;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				const { url, token } = await hookSetup(this);
				const id =
					(staticData.webhookId as string | undefined) ??
					findOwnWebhook(await uazapiRequest(this, { method: 'GET', path: '/webhook' }, token), url)?.id;
				if (id) {
					try {
						await uazapiRequest(this, { method: 'POST', path: '/webhook', body: deleteWebhookBody(id) }, token);
					} catch (error) {
						if (statusOf(error) !== '404') throw toNodeError(this.getNode(), error);
					}
				}
				delete staticData.webhookId;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const body = this.getBodyData();
		const token = await resolveInstanceToken(this, this.getNodeParameter('instance') as InstanceLocator);
		const reason = dropReason(body, {
			token,
			ignoreTrackSources: parseList(this.getNodeParameter('ignoreTrackSource', '') as string),
		});
		if (reason) {
			const log = reason.startsWith('token') ? this.logger.warn : this.logger.debug;
			log.call(this.logger, `Uazapi Trigger ignored an event: ${reason}`);
			return {};
		}

		const output = this.getNodeParameter('output', 'normalized') as string;
		if (output === 'raw' || body.EventType !== 'messages') return { workflowData: [[{ json: body }]] };

		const item: IDataObject = normalizeMessage(body);
		return { workflowData: [[{ json: item }]] };
	}
}
