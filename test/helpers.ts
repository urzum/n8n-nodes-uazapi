import { vi } from 'vitest';
import type { IDataObject, IHttpRequestOptions } from 'n8n-workflow';

export interface FakeOptions {
	params?: Record<string, unknown>;
	credentials?: IDataObject;
	responses?: unknown[];
	items?: number;
	continueOnFail?: boolean;
	webhookUrl?: string;
	staticData?: IDataObject;
	body?: IDataObject;
}

const NODE = { id: '1', name: 'Uazapi', type: 'uazapi', typeVersion: 1, position: [0, 0], parameters: {} };

function base(opts: FakeOptions) {
	const calls: IHttpRequestOptions[] = [];
	const responses = [...(opts.responses ?? [])];
	const logs: string[] = [];
	const ctx = {
		getNode: () => NODE,
		getCredentials: vi.fn(async () => opts.credentials ?? { serverUrl: 'https://x.uazapi.com/', adminToken: 'ADMIN' }),
		logger: {
			debug: (m: string) => logs.push(`debug: ${m}`),
			warn: (m: string) => logs.push(`warn: ${m}`),
			info: (m: string) => logs.push(`info: ${m}`),
			error: (m: string) => logs.push(`error: ${m}`),
		},
		helpers: {
			httpRequestWithAuthentication: vi.fn(async (_cred: string, req: IHttpRequestOptions) => {
				calls.push(req);
				const next = responses.shift();
				if (next instanceof Error) throw next;
				return next ?? {};
			}),
		},
	};
	return { ctx, calls, logs };
}

export function apiError(status: number, message = `status ${status}`): Error {
	return Object.assign(new Error(message), { httpCode: String(status) });
}

/** IExecuteFunctions: getNodeParameter(name, itemIndex, fallback, { extractValue }) */
export function fakeExecute(opts: FakeOptions) {
	const b = base(opts);
	const params = opts.params ?? {};
	return {
		...b,
		ctx: {
			...b.ctx,
			getInputData: () => Array.from({ length: opts.items ?? 1 }, () => ({ json: {} })),
			getNodeParameter: (name: string, _i: number, fallback?: unknown) => (name in params ? params[name] : fallback),
			continueOnFail: () => opts.continueOnFail ?? false,
			helpers: {
				...b.ctx.helpers,
				assertBinaryData: () => ({ mimeType: 'image/png', fileName: 'a.png', data: '' }),
				getBinaryDataBuffer: async () => ({ toString: () => 'QkFTRTY0' }),
			},
		},
	};
}

/** IHookFunctions / IWebhookFunctions: getNodeParameter(name, fallback) */
export function fakeHook(opts: FakeOptions) {
	const b = base(opts);
	const params = opts.params ?? {};
	const staticData = opts.staticData ?? {};
	return {
		...b,
		staticData,
		ctx: {
			...b.ctx,
			getNodeParameter: (name: string, fallback?: unknown) => (name in params ? params[name] : fallback),
			getNodeWebhookUrl: () => opts.webhookUrl ?? 'https://n8n.example/webhook/abc/webhook',
			getWorkflowStaticData: () => staticData,
			getBodyData: () => opts.body ?? {},
		},
	};
}

export const fakeWebhook = fakeHook;
