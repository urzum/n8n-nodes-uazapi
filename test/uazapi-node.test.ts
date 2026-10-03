import { describe, expect, it } from 'vitest';
import type { IExecuteFunctions } from 'n8n-workflow';
import { Uazapi } from '../nodes/Uazapi/Uazapi.node';
import { apiError, fakeExecute } from './helpers';

const run = (ctx: unknown) => new Uazapi().execute.call(ctx as IExecuteFunctions);

const LIST = { mode: 'list', value: 'inst-1' };
const INSTANCES = [{ id: 'inst-1', name: 'Mestre', token: 'TOK1' }];

describe('Uazapi node — Send Text', () => {
	it('sends text with the instance token and the default track_source', async () => {
		const { ctx, calls } = fakeExecute({
			params: { resource: 'message', operation: 'sendText', instance: LIST, number: '5511999999999', text: 'Oi', trackSource: 'automa_uazapi', options: {} },
			responses: [INSTANCES, { messageid: 'M1' }],
		});
		const [out] = await run(ctx);
		expect(calls[1].url).toBe('https://x.uazapi.com/send/text');
		expect(calls[1].headers).toMatchObject({ token: 'TOK1' });
		expect(calls[1].body).toEqual({ number: '5511999999999', text: 'Oi', track_source: 'automa_uazapi' });
		expect(out[0].json).toEqual({ messageid: 'M1' });
	});

	it('resolves the token once for many items', async () => {
		const { ctx, calls } = fakeExecute({
			items: 3,
			params: { resource: 'message', operation: 'sendText', instance: LIST, number: '55', text: 'x', trackSource: 'automa_uazapi', options: {} },
			responses: [INSTANCES, {}, {}, {}],
		});
		await run(ctx);
		expect(calls.filter((c) => c.url.endsWith('/instance/all'))).toHaveLength(1);
		expect(calls.filter((c) => c.url.endsWith('/send/text'))).toHaveLength(3);
	});

	it('uses the token typed in "By Token" without calling /instance/all', async () => {
		const { ctx, calls } = fakeExecute({
			params: { resource: 'message', operation: 'sendText', instance: { mode: 'manual', value: 'FROM_TRIGGER' }, number: '55', text: 'x', trackSource: '', options: { delay: 1000, linkPreview: true } },
			responses: [{}],
		});
		await run(ctx);
		expect(calls).toHaveLength(1);
		expect(calls[0].headers).toMatchObject({ token: 'FROM_TRIGGER' });
		expect(calls[0].body).toEqual({ number: '55', text: 'x', delay: 1000, linkPreview: true });
	});

	it('returns the error on the item when "Continue On Fail" is on', async () => {
		const { ctx } = fakeExecute({
			continueOnFail: true,
			params: { resource: 'message', operation: 'sendText', instance: { mode: 'manual', value: 'T' }, number: '55', text: 'x', trackSource: '', options: {} },
			responses: [apiError(500)],
		});
		const [out] = await run(ctx);
		expect(String(out[0].json.error)).toContain('/send/text');
	});
});

describe('Uazapi node — Instance', () => {
	it.each([
		['getStatus', 'GET', '/instance/status', undefined],
		['disconnect', 'POST', '/instance/disconnect', undefined],
		['connect', 'POST', '/instance/connect', { phone: '5511999999999' }],
	])('%s calls %s %s', async (operation, method, path, body) => {
		const { ctx, calls } = fakeExecute({
			params: { resource: 'instance', operation, instance: { mode: 'manual', value: 'T' }, phone: '5511999999999' },
			responses: [{}],
		});
		await run(ctx);
		expect(calls[0].method).toBe(method);
		expect(calls[0].url).toBe(`https://x.uazapi.com${path}`);
		expect(calls[0].body).toEqual(body);
	});
});
