import { describe, expect, it } from 'vitest';
import type { IDataObject, IHookFunctions, IWebhookFunctions } from 'n8n-workflow';
import imageInbound from './fixtures/image-inbound.json';
import { UazapiTrigger } from '../nodes/UazapiTrigger/UazapiTrigger.node';
import { dropReason, parseList } from '../nodes/UazapiTrigger/webhookConfig';
import { apiError, fakeHook, fakeWebhook } from './helpers';

const URL = 'https://n8n.example/webhook/abc/webhook';
const TOKEN_MODE = { mode: 'token', value: 'TOKEN_REDACTED' };
const lifecycle = new UazapiTrigger().webhookMethods.default;
const hook = (ctx: unknown) => ctx as IHookFunctions;
const params = (extra: IDataObject = {}) => ({ instance: TOKEN_MODE, events: ['messages'], excludeMessages: [], ...extra });

const postsToWebhook = (calls: { method?: string; url: string; body?: unknown }[]) =>
	calls.filter((c) => c.method === 'POST' && c.url.endsWith('/webhook'));

describe('parseList', () => {
	it.each([
		['automa_uazapi', ['automa_uazapi']],
		[' a, b ,,c ', ['a', 'b', 'c']],
		['', []],
	])('%j → %j', (input, expected) => {
		expect(parseList(input)).toEqual(expected);
	});
});

describe('dropReason', () => {
	const body = { token: 'T', EventType: 'messages', message: { track_source: 'automa_uazapi' } };
	it('drops a payload whose token is not the instance token', () => {
		expect(dropReason({ ...body, token: 'X' }, { token: 'T', ignoreTrackSources: [] })).toMatch(/token/);
	});
	it('drops an ignored track_source', () => {
		expect(dropReason(body, { token: 'T', ignoreTrackSources: ['automa_uazapi'] })).toMatch(/automa_uazapi/);
	});
	it('keeps everything when the ignore list is empty', () => {
		expect(dropReason(body, { token: 'T', ignoreTrackSources: [] })).toBeNull();
	});
});

describe('webhook lifecycle', () => {
	it('checkExists finds the webhook by URL and stores its id', async () => {
		const { ctx, staticData } = fakeHook({ params: params(), webhookUrl: URL, responses: [[{ id: 'other', url: 'https://chatwoot' }, { id: 'w1', url: URL, events: ['messages'], excludeMessages: [] }]] });
		expect(await lifecycle.checkExists.call(hook(ctx))).toBe(true);
		expect(staticData.webhookId).toBe('w1');
	});

	it('checkExists returns false when there is no webhook for this URL', async () => {
		const { ctx } = fakeHook({ params: params(), webhookUrl: URL, responses: [[{ id: 'other', url: 'https://chatwoot' }]] });
		expect(await lifecycle.checkExists.call(hook(ctx))).toBe(false);
	});

	it('checkExists replaces a webhook whose events changed', async () => {
		const { ctx, calls } = fakeHook({
			params: params({ events: ['messages', 'connection'] }),
			webhookUrl: URL,
			responses: [[{ id: 'w1', url: URL, events: ['messages'], excludeMessages: [] }], []],
		});
		expect(await lifecycle.checkExists.call(hook(ctx))).toBe(false);
		expect(postsToWebhook(calls)[0].body).toEqual({ action: 'delete', id: 'w1' });
	});

	it('create adds with action "add" and stores the returned id', async () => {
		const { ctx, calls, staticData } = fakeHook({
			params: params({ excludeMessages: ['isGroupYes'] }),
			webhookUrl: URL,
			responses: [[{ id: 'other', url: 'https://chatwoot' }, { id: 'w2', url: URL }]],
		});
		expect(await lifecycle.create.call(hook(ctx))).toBe(true);
		expect(calls[0].body).toEqual({ action: 'add', enabled: true, url: URL, events: ['messages'], excludeMessages: ['isGroupYes'], addUrlEvents: false, addUrlTypesMessages: false });
		expect(staticData.webhookId).toBe('w2');
	});

	it('create looks the webhook up again when the add response does not list it', async () => {
		const { ctx, staticData } = fakeHook({ params: params(), webhookUrl: URL, responses: [{ ok: true }, [{ id: 'w3', url: URL }]] });
		expect(await lifecycle.create.call(hook(ctx))).toBe(true);
		expect(staticData.webhookId).toBe('w3');
	});

	it('delete removes only its own id', async () => {
		const { ctx, calls, staticData } = fakeHook({ params: params(), webhookUrl: URL, staticData: { webhookId: 'w1' }, responses: [[]] });
		expect(await lifecycle.delete.call(hook(ctx))).toBe(true);
		expect(calls[0].body).toEqual({ action: 'delete', id: 'w1' });
		expect(staticData.webhookId).toBeUndefined();
	});

	it('delete treats 404 as already removed', async () => {
		const { ctx } = fakeHook({ params: params(), webhookUrl: URL, staticData: { webhookId: 'w1' }, responses: [apiError(404)] });
		expect(await lifecycle.delete.call(hook(ctx))).toBe(true);
	});

	it('delete without a stored id finds it by URL', async () => {
		const { ctx, calls } = fakeHook({ params: params(), webhookUrl: URL, responses: [[{ id: 'w9', url: URL }], []] });
		await lifecycle.delete.call(hook(ctx));
		expect(calls[1].body).toEqual({ action: 'delete', id: 'w9' });
	});

	it('never posts to /webhook without an action', async () => {
		const { ctx, calls } = fakeHook({ params: params(), webhookUrl: URL, responses: [[{ id: 'w1', url: URL, events: ['x'], excludeMessages: [] }], [], [{ id: 'w2', url: URL }], []] });
		await lifecycle.checkExists.call(hook(ctx));
		await lifecycle.create.call(hook(ctx));
		await lifecycle.delete.call(hook(ctx));
		for (const call of postsToWebhook(calls)) expect((call.body as IDataObject).action).toMatch(/^(add|delete)$/);
	});
});

describe('webhook()', () => {
	const run = (ctx: unknown) => new UazapiTrigger().webhook.call(ctx as IWebhookFunctions);
	const triggerParams = (extra: IDataObject = {}) => ({ instance: TOKEN_MODE, ignoreTrackSource: 'automa_uazapi', output: 'normalized', media: 'none', ...extra });

	it('emits the normalized message', async () => {
		const { ctx } = fakeWebhook({ params: triggerParams(), body: imageInbound as IDataObject });
		const result = await run(ctx);
		const json = result.workflowData?.[0][0].json as IDataObject;
		expect((json.message as IDataObject).message_id).toBe('3AD93C7D7A45DD37ACA6');
	});

	it('emits the raw body when output is raw', async () => {
		const { ctx } = fakeWebhook({ params: triggerParams({ output: 'raw' }), body: imageInbound as IDataObject });
		const result = await run(ctx);
		expect(result.workflowData?.[0][0].json).toBe(imageInbound);
	});

	it('passes non-message events through raw', async () => {
		const event = { token: 'TOKEN_REDACTED', EventType: 'connection', instance: { status: 'connected' } };
		const { ctx } = fakeWebhook({ params: triggerParams(), body: event });
		const result = await run(ctx);
		expect(result.workflowData?.[0][0].json).toBe(event);
	});

	it('drops its own automation messages and logs why', async () => {
		const ownMessage = { ...imageInbound, message: { ...imageInbound.message, track_source: 'automa_uazapi' } };
		const { ctx, logs } = fakeWebhook({ params: triggerParams(), body: ownMessage as IDataObject });
		expect(await run(ctx)).toEqual({});
		expect(logs.join()).toMatch(/automa_uazapi/);
	});

	it('drops a forged payload with a warning', async () => {
		const { ctx, logs } = fakeWebhook({ params: triggerParams(), body: { ...imageInbound, token: 'FORGED' } as IDataObject });
		expect(await run(ctx)).toEqual({});
		expect(logs.join()).toMatch(/^warn:/);
	});
});
