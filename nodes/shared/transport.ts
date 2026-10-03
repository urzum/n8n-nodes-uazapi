import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	ILoadOptionsFunctions,
	INode,
	IWebhookFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

export const CREDENTIAL_NAME = 'uazapiApi';

export type UazapiContext = IExecuteFunctions | IHookFunctions | ILoadOptionsFunctions | IWebhookFunctions;

export interface ApiCall {
	method: IHttpRequestMethods;
	path: string;
	body?: IDataObject;
}

export interface InstanceLocator {
	mode: string;
	value: string;
}

export interface UazapiInstance {
	id: string;
	name: string;
	token: string;
	status?: string;
	profileName?: string;
}

export function baseUrl(serverUrl: unknown): string {
	return String(serverUrl ?? '').trim().replace(/\/+$/, '');
}

export function statusOf(error: unknown): string | null {
	const e = (error ?? {}) as { httpCode?: unknown; statusCode?: unknown; status?: unknown; response?: { status?: unknown } };
	const value = e.httpCode ?? e.statusCode ?? e.response?.status ?? e.status;
	return value === undefined || value === null ? null : String(value);
}

/** Keeps errors that are already n8n errors; wraps anything else with the item index. */
export function toNodeError(node: INode, error: unknown, itemIndex?: number): NodeApiError | NodeOperationError {
	if (error instanceof NodeApiError || error instanceof NodeOperationError) return error;
	return new NodeOperationError(node, error as Error, { itemIndex });
}

export async function uazapiRequest(ctx: UazapiContext, call: ApiCall, token?: string): Promise<unknown> {
	const credentials = await ctx.getCredentials(CREDENTIAL_NAME);
	const headers: IDataObject = { Accept: 'application/json' };
	if (token) headers.token = token;
	try {
		return await ctx.helpers.httpRequestWithAuthentication.call(ctx, CREDENTIAL_NAME, {
			method: call.method,
			url: `${baseUrl(credentials.serverUrl)}${call.path}`,
			headers,
			body: call.body,
			json: true,
		});
	} catch (error) {
		const httpCode = statusOf(error) ?? undefined;
		const denied = httpCode === '401' || httpCode === '403';
		throw new NodeApiError(ctx.getNode(), error as JsonObject, {
			httpCode,
			message: denied
				? `uazapi ${call.method} ${call.path}: invalid token or missing permission`
				: `uazapi ${call.method} ${call.path} failed`,
		});
	}
}

export async function listInstances(ctx: UazapiContext): Promise<UazapiInstance[]> {
	const credentials = await ctx.getCredentials(CREDENTIAL_NAME);
	if (!credentials.adminToken) {
		throw new NodeOperationError(
			ctx.getNode(),
			'Set the Admin Token in the Uazapi API credential, or choose the instance "By Token"',
		);
	}
	const response = await uazapiRequest(ctx, { method: 'GET', path: '/instance/all' });
	return Array.isArray(response) ? (response as UazapiInstance[]) : [];
}

export async function resolveInstanceToken(
	ctx: UazapiContext,
	locator: InstanceLocator,
	cache?: Map<string, string>,
): Promise<string> {
	const value = String(locator?.value ?? '').trim();
	if (!value) throw new NodeOperationError(ctx.getNode(), 'Choose an instance');
	if (locator.mode !== 'list') return value;

	const cached = cache?.get(value);
	if (cached) return cached;

	const instances = await listInstances(ctx);
	for (const instance of instances) cache?.set(instance.id, instance.token);
	const found = instances.find((instance) => instance.id === value);
	if (!found?.token) {
		throw new NodeOperationError(ctx.getNode(), `Instance ${value} not found on the uazapi server`);
	}
	return found.token;
}
