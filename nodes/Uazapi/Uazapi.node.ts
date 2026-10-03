import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import { instanceLocator, searchInstances } from '../shared/instanceLocator';
import type { InstanceLocator } from '../shared/transport';
import { resolveInstanceToken, toNodeError, uazapiRequest } from '../shared/transport';
import { buildInstanceCall, instanceProperties } from './instance';
import type { BinaryFile, ParamGetter } from './message';
import { buildMessageCall, messageProperties } from './message';

function toJson(response: unknown): IDataObject {
	if (response !== null && typeof response === 'object' && !Array.isArray(response)) return response as IDataObject;
	return { data: response as IDataObject[] };
}

export class Uazapi implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Uazapi',
		name: 'uazapi',
		icon: { light: 'file:uazapi.svg', dark: 'file:uazapi.dark.svg' },
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Send WhatsApp messages and manage instances through the uazapi API',
		defaults: { name: 'Uazapi' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'uazapiApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Instance', value: 'instance' },
					{ name: 'Message', value: 'message' },
				],
				default: 'message',
			},
			instanceLocator,
			...messageProperties,
			...instanceProperties,
		],
	};

	methods = { listSearch: { searchInstances } };

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const tokenCache = new Map<string, string>();

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const locator = this.getNodeParameter('instance', i) as InstanceLocator;
				const get: ParamGetter = (name, fallback) => this.getNodeParameter(name, i, fallback);
				const readBinary = async (property: string): Promise<BinaryFile> => {
					const binary = this.helpers.assertBinaryData(i, property);
					const buffer = await this.helpers.getBinaryDataBuffer(i, property);
					return { base64: buffer.toString('base64'), mimeType: binary.mimeType, fileName: binary.fileName ?? '' };
				};

				const call =
					resource === 'instance'
						? buildInstanceCall(operation, get)
						: await buildMessageCall(operation, get, readBinary);
				const token = await resolveInstanceToken(this, locator, tokenCache);
				const response = await uazapiRequest(this, call, token);
				returnData.push({ json: toJson(response), pairedItem: { item: i } });
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				throw toNodeError(this.getNode(), error, i);
			}
		}

		return [returnData];
	}
}
