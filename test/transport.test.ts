import { describe, expect, it } from 'vitest';
import { NodeApiError } from 'n8n-workflow';
import type { IExecuteFunctions } from 'n8n-workflow';
import { UazapiApi } from '../credentials/UazapiApi.credentials';
import { baseUrl, resolveInstanceToken, uazapiRequest } from '../nodes/shared/transport';
import { apiError, fakeExecute } from './helpers';

const asExec = (ctx: unknown) => ctx as IExecuteFunctions;

describe('baseUrl', () => {
	it('strips trailing slashes and spaces', () => {
		expect(baseUrl(' https://x.uazapi.com// ')).toBe('https://x.uazapi.com');
	});
});

describe('credential authenticate', () => {
	const auth = new UazapiApi().authenticate as (c: object, r: object) => Promise<{ headers: Record<string, string> }>;

	it('adds admintoken when the call has no instance token', async () => {
		const out = await auth({ adminToken: 'ADMIN' }, { url: '/instance/all', headers: {} });
		expect(out.headers.admintoken).toBe('ADMIN');
	});

	it('never sends admintoken next to an instance token', async () => {
		const out = await auth({ adminToken: 'ADMIN' }, { url: '/send/text', headers: { token: 'T' } });
		expect(out.headers.admintoken).toBeUndefined();
	});
});

describe('uazapiRequest', () => {
	it('joins server URL and path and sends the instance token', async () => {
		const { ctx, calls } = fakeExecute({ responses: [{ ok: true }] });
		await uazapiRequest(asExec(ctx), { method: 'POST', path: '/send/text', body: { a: 1 } }, 'TOK');
		expect(calls[0].url).toBe('https://x.uazapi.com/send/text');
		expect(calls[0].headers).toMatchObject({ token: 'TOK' });
		expect(calls[0].body).toEqual({ a: 1 });
	});

	it('wraps failures in NodeApiError keeping the status', async () => {
		const { ctx } = fakeExecute({ responses: [apiError(401)] });
		const failure = await uazapiRequest(asExec(ctx), { method: 'GET', path: '/instance/status' }, 'BAD').catch((e) => e);
		expect(failure).toBeInstanceOf(NodeApiError);
		expect(failure.httpCode).toBe('401');
		expect(failure.message).toContain('invalid token');
	});
});

describe('resolveInstanceToken', () => {
	it('returns the value directly in token mode', async () => {
		const { ctx, calls } = fakeExecute({});
		expect(await resolveInstanceToken(asExec(ctx), { mode: 'token', value: ' T1 ' })).toBe('T1');
		expect(calls).toHaveLength(0);
	});

	it('looks the token up by id in list mode and caches every instance', async () => {
		const { ctx, calls } = fakeExecute({ responses: [[{ id: 'a', name: 'A', token: 'TA' }, { id: 'b', name: 'B', token: 'TB' }]] });
		const cache = new Map<string, string>();
		expect(await resolveInstanceToken(asExec(ctx), { mode: 'list', value: 'b' }, cache)).toBe('TB');
		expect(await resolveInstanceToken(asExec(ctx), { mode: 'list', value: 'a' }, cache)).toBe('TA');
		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe('https://x.uazapi.com/instance/all');
	});

	it('explains how to fix list mode without an admin token', async () => {
		const { ctx } = fakeExecute({ credentials: { serverUrl: 'https://x.uazapi.com', adminToken: '' } });
		await expect(resolveInstanceToken(asExec(ctx), { mode: 'list', value: 'a' })).rejects.toThrow(/Admin Token/);
	});

	it('fails clearly when the instance id does not exist', async () => {
		const { ctx } = fakeExecute({ responses: [[{ id: 'a', name: 'A', token: 'TA' }]] });
		await expect(resolveInstanceToken(asExec(ctx), { mode: 'list', value: 'zz' })).rejects.toThrow(/zz not found/);
	});
});
