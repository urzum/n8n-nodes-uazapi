# n8n-nodes-uazapi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish `@urzum/n8n-nodes-uazapi` with a `Uazapi` action node (messages + instance), a `Uazapi Trigger` that manages its own webhook and emits the normalized message, and a `Uazapi API` credential.

**Architecture:** Programmatic-style n8n nodes. All HTTP goes through one transport (`nodes/shared/transport.ts`) that builds the URL from the credential and sends the per-instance `token` header; the credential's `authenticate` adds `admintoken` only when no instance token is present. Request bodies are built by pure functions (`buildMessageCall`, `buildInstanceCall`) and the webhook payload is shaped by a pure `normalizeMessage`, so all logic is unit-testable without n8n running.

**Tech Stack:** TypeScript 5.9, `n8n-workflow` 2.x (peer), `@n8n/node-cli` 0.50.x (build/lint/dev/release), Vitest 3.

**Spec:** `docs/specs/n8n-nodes-uazapi-spec.md`

## Global Constraints

- Package name `@urzum/n8n-nodes-uazapi`; `package.json` `n8n.strict: true`; no runtime `dependencies` (lint rule `no-runtime-dependencies`).
- Node code may not import Node.js built-ins (`no-nodejs-modules`); use `this.helpers.*`.
- Never call `this.helpers.httpRequest` in a function that calls `getCredentials`; use `httpRequestWithAuthentication` (`no-http-request-with-manual-auth`).
- Never `throw <catchParam>`; throw `new NodeApiError/NodeOperationError(...)` or `toNodeError(...)` (`require-node-api-error`).
- `POST /webhook` is only ever sent with `action: "add"` or `action: "delete"`.
- `track_source` default value: `automa_uazapi` — in the node's `Track Source` field and in the trigger's `Ignore Track Source` field.
- `message.role`: `user` if `!fromMe`; `assistant` if `fromMe && wasSentByApi`; `human` if `fromMe && !wasSentByApi`.
- UI strings in English (lint casing rules); README in Portuguese.
- Fixtures never contain a real token: use `TOKEN_REDACTED`.
- Publishing happens only through `.github/workflows/publish.yml` (npm provenance), triggered by `npm run release` with the Armando's approval. Not part of any task here.

## Review Focus

1. **Outbound messages (`fromMe`) keep the customer as `message.whatsapp`.** `sender_pn` on an outbound message is the connected number; using it would file history under the wrong conversation. Test in Task 4 (`outbound human keeps customer number`).
2. **Editing the trigger's events and re-activating.** `checkExists` must notice the config drift, delete the stale webhook and return `false` so `create` registers the new events — never leave two webhooks. Test in Task 5 (`checkExists replaces a webhook whose events changed`).
3. **List mode with many input items** must call `GET /instance/all` once per execution, not once per item. Test in Task 2 (`resolves the token once for many items`).
4. **Non-message events or a body without `message`** must pass through raw, not crash the normalizer. Tests in Task 4 (`normalizes an empty body without throwing`) and Task 5 (`passes non-message events through raw`).
5. **Ignore Track Source typed as `"a, b"` or left empty** — spaces trimmed, empty field filters nothing. Test in Task 5 (`parseList` cases).

---

## File Structure

| File | Responsibility |
|---|---|
| `credentials/UazapiApi.credentials.ts` | Server URL + optional Admin Token; adds `admintoken` header when no `token` header; credential test |
| `nodes/shared/transport.ts` | `uazapiRequest`, `statusOf`, `toNodeError`, `listInstances`, `resolveInstanceToken`, `baseUrl` |
| `nodes/shared/instanceLocator.ts` | `instanceLocator` property (list / by token) + `searchInstances` list search |
| `nodes/shared/normalize.ts` | Pure `normalizeMessage(body)` and helpers |
| `nodes/Uazapi/Uazapi.node.ts` | Action node: resource/operation routing, item loop, errors |
| `nodes/Uazapi/message.ts` | Message resource properties + `buildMessageCall` |
| `nodes/Uazapi/instance.ts` | Instance resource properties + `buildInstanceCall` |
| `nodes/UazapiTrigger/UazapiTrigger.node.ts` | Trigger: webhook lifecycle + `webhook()` |
| `nodes/UazapiTrigger/webhookConfig.ts` | Pure: `findOwnWebhook`, `sameConfig`, `addWebhookBody`, `deleteWebhookBody`, `dropReason`, `parseList` |
| `nodes/UazapiTrigger/media.ts` | Pure: `hasMedia`, `downloadPayload`, `applyDownload` |
| `test/helpers.ts` | Fake `IExecuteFunctions` / `IHookFunctions` / `IWebhookFunctions` |
| `test/fixtures/image-inbound.json` | Real `ImageMessage` webhook body (token redacted) |

---

### Task 1: Scaffold, credential and transport

**Files:**
- Create: `package.json`, `tsconfig.json`, `eslint.config.mjs`, `.prettierrc.js`, `CHANGELOG.md`, `.github/workflows/publish.yml`, `.agents/*` (copied from scaffold)
- Create: `credentials/UazapiApi.credentials.ts`, `nodes/Uazapi/uazapi.svg`, `nodes/Uazapi/uazapi.dark.svg`
- Create: `nodes/shared/transport.ts`
- Test: `test/helpers.ts`, `test/transport.test.ts`
- Modify: `AGENTS.md` (map line for `.agents/`), `PROJECT_STATE.md` (publish flow)

**Interfaces:**
- Produces:
  - `CREDENTIAL_NAME = 'uazapiApi'`
  - `interface ApiCall { method: IHttpRequestMethods; path: string; body?: IDataObject }`
  - `interface InstanceLocator { mode: string; value: string }`
  - `interface UazapiInstance { id: string; name: string; token: string; status?: string; profileName?: string }`
  - `type UazapiContext = IExecuteFunctions | IHookFunctions | ILoadOptionsFunctions | IWebhookFunctions`
  - `baseUrl(serverUrl: unknown): string`
  - `statusOf(error: unknown): string | null`
  - `toNodeError(node: INode, error: unknown, itemIndex?: number): NodeApiError | NodeOperationError`
  - `uazapiRequest(ctx: UazapiContext, call: ApiCall, token?: string): Promise<unknown>`
  - `listInstances(ctx: UazapiContext): Promise<UazapiInstance[]>`
  - `resolveInstanceToken(ctx: UazapiContext, locator: InstanceLocator, cache?: Map<string, string>): Promise<string>`
  - `test/helpers.ts`: `fakeExecute(opts)`, `fakeHook(opts)`, `fakeWebhook(opts)` returning `{ ctx, calls }`

- [ ] **Step 1: Generate the scaffold in a temp dir and copy what we keep**

```bash
TMP=$(mktemp -d)
(cd "$TMP" && npx -y @n8n/node-cli@0.50.4 new n8n-nodes-uazapi --template programmatic/example --skip-install </dev/null)
S="$TMP/n8n-nodes-uazapi"
cp "$S/package.json" "$S/tsconfig.json" "$S/eslint.config.mjs" "$S/.prettierrc.js" "$S/CHANGELOG.md" .
mkdir -p .github/workflows .vscode && cp "$S/.github/workflows/publish.yml" .github/workflows/ && cp -R "$S/.agents" . && cp "$S/.vscode/launch.json" .vscode/
```

Not copied on purpose: scaffold `AGENTS.md`/`CLAUDE.md` (ours exist), `ci.yml` (ours is `verify.yml`), `README.md` (written in Task 7), `nodes/Example`.

- [ ] **Step 2: Edit `package.json`**

Set these keys (keep `scripts`, `devDependencies`, `peerDependencies` from the scaffold, then add `test`):

```json
{
  "name": "@urzum/n8n-nodes-uazapi",
  "version": "0.1.0",
  "description": "n8n nodes for the uazapi WhatsApp API: send messages, manage the instance and receive normalized webhooks.",
  "license": "MIT",
  "homepage": "https://github.com/urzum/n8n-nodes-uazapi",
  "keywords": ["n8n-community-node-package", "uazapi", "whatsapp"],
  "repository": { "type": "git", "url": "https://github.com/urzum/n8n-nodes-uazapi.git" },
  "n8n": {
    "n8nNodesApiVersion": 1,
    "strict": true,
    "credentials": ["dist/credentials/UazapiApi.credentials.js"],
    "nodes": []
  }
}
```

Add `"test": "vitest run"` to `scripts`. Then:

```bash
npm install && npm i -D vitest@3
```

- [ ] **Step 3: Icons**

`nodes/Uazapi/uazapi.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#25D366"/><path fill="#fff" d="M32 14c-10 0-18 7.6-18 17 0 3.4 1 6.5 2.9 9.2L15 50l10.2-2.6A18.8 18.8 0 0 0 32 48c10 0 18-7.6 18-17s-8-17-18-17Zm-7 12h14a2 2 0 0 1 0 4H25a2 2 0 0 1 0-4Zm0 8h9a2 2 0 0 1 0 4h-9a2 2 0 0 1 0-4Z"/></svg>
```

`nodes/Uazapi/uazapi.dark.svg`: same file with `fill="#128C7E"` on the circle.

- [ ] **Step 4: Credential**

`credentials/UazapiApi.credentials.ts`:

```ts
import type {
	IAuthenticate,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	IDataObject,
	INodeProperties,
} from 'n8n-workflow';

export class UazapiApi implements ICredentialType {
	name = 'uazapiApi';

	displayName = 'Uazapi API';

	icon: Icon = {
		light: 'file:../nodes/Uazapi/uazapi.svg',
		dark: 'file:../nodes/Uazapi/uazapi.dark.svg',
	};

	documentationUrl = 'https://docs.uazapi.com/';

	properties: INodeProperties[] = [
		{
			displayName: 'Server URL',
			name: 'serverUrl',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'e.g. https://mycompany.uazapi.com',
			description: 'Address of your uazapi server, without a trailing slash',
		},
		{
			displayName: 'Admin Token',
			name: 'adminToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description:
				'Optional. Lets the nodes list your instances. Without it, choose the instance "By Token".',
		},
	];

	// The instance token is per call (it varies with the chosen instance), so it is sent by the
	// node itself. The admin token is only added when the call has no instance token.
	authenticate: IAuthenticate = async (credentials, requestOptions) => {
		const headers: IDataObject = { ...(requestOptions.headers ?? {}) };
		if (!headers.token && credentials.adminToken) {
			headers.admintoken = credentials.adminToken as string;
		}
		return { ...requestOptions, headers };
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.serverUrl.replace(/\\/+$/, "")}}',
			url: '={{$credentials.adminToken ? "/instance/all" : "/status"}}',
			method: 'GET',
		},
	};
}
```

- [ ] **Step 5: Test helpers**

`test/helpers.ts`:

```ts
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
```

- [ ] **Step 6: Write the failing transport tests**

`test/transport.test.ts`:

```ts
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
```

- [ ] **Step 7: Run to verify they fail**

Run: `npx vitest run test/transport.test.ts`
Expected: FAIL — `Cannot find module '../nodes/shared/transport'`.

- [ ] **Step 8: Implement the transport**

`nodes/shared/transport.ts`:

```ts
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
```

- [ ] **Step 9: Run tests and build**

Run: `npx vitest run test/transport.test.ts && npm run build`
Expected: all transport tests PASS; build exits 0. (`npm run lint` stays red until Task 2 registers a node — rule `community-package-json-n8n-nodes-empty`.)

- [ ] **Step 10: Point the docs at the scaffold reference and the real publish flow**

In `AGENTS.md`, add to the "Quando → onde" table:

```markdown
| Escrever node, credencial ou propriedade | `.agents/nodes.md`, `.agents/properties.md`, `.agents/nodes-programmatic.md`, `.agents/credentials.md` |
```

In `PROJECT_STATE.md` replace `Política de deploy: aprovação-obrigatória (deploy = \`npm publish\`)` with `Política de deploy: aprovação-obrigatória (deploy = \`npm run release\` → tag → \`.github/workflows/publish.yml\` com provenance)`, and in "Pergunte antes" replace `` - `npm publish` (qualquer versão). `` with `` - `npm run release` ou push de tag de versão (publica no npm). ``

Run: `node scripts/check-agent-pointers.mjs`
Expected: `ok: ... nenhum caminho quebrado`

- [ ] **Step 11: Commit (local only; push after Task 2 makes lint green)**

```bash
git add package.json package-lock.json tsconfig.json eslint.config.mjs .prettierrc.js CHANGELOG.md .github/workflows/publish.yml .agents .vscode credentials nodes/shared/transport.ts nodes/Uazapi/uazapi.svg nodes/Uazapi/uazapi.dark.svg test/helpers.ts test/transport.test.ts AGENTS.md PROJECT_STATE.md
git commit -m "feat(T1): scaffold, Uazapi API credential and transport"
```

---

### Task 2: Uazapi node — instance locator, Instance resource, Send Text

**Files:**
- Create: `nodes/shared/instanceLocator.ts`, `nodes/Uazapi/instance.ts`, `nodes/Uazapi/message.ts` (Send Text only in this task), `nodes/Uazapi/Uazapi.node.ts`, `nodes/Uazapi/Uazapi.node.json`
- Modify: `package.json` (`n8n.nodes`)
- Test: `test/uazapi-node.test.ts`

**Interfaces:**
- Consumes: `uazapiRequest`, `resolveInstanceToken`, `listInstances`, `toNodeError`, `InstanceLocator`, `ApiCall` (Task 1).
- Produces:
  - `instanceLocator: INodeProperties` (name `instance`, modes `list` and `token`)
  - `searchInstances(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult>`
  - `type ParamGetter = (name: string, fallback?: unknown) => unknown`
  - `interface BinaryFile { base64: string; mimeType: string; fileName: string }`
  - `type BinaryReader = (propertyName: string) => Promise<BinaryFile>`
  - `buildMessageCall(operation: string, get: ParamGetter, readBinary: BinaryReader): Promise<ApiCall>`
  - `buildInstanceCall(operation: string, get: ParamGetter): ApiCall`
  - `messageProperties: INodeProperties[]`, `instanceProperties: INodeProperties[]`
  - `splitList(value: string): string[]`, `splitLines(value: string): string[]`

- [ ] **Step 1: Write the failing node tests**

`test/uazapi-node.test.ts`:

```ts
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
			params: { resource: 'message', operation: 'sendText', instance: { mode: 'token', value: 'FROM_TRIGGER' }, number: '55', text: 'x', trackSource: '', options: { delay: 1000, linkPreview: true } },
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
			params: { resource: 'message', operation: 'sendText', instance: { mode: 'token', value: 'T' }, number: '55', text: 'x', trackSource: '', options: {} },
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
			params: { resource: 'instance', operation, instance: { mode: 'token', value: 'T' }, phone: '5511999999999' },
			responses: [{}],
		});
		await run(ctx);
		expect(calls[0].method).toBe(method);
		expect(calls[0].url).toBe(`https://x.uazapi.com${path}`);
		expect(calls[0].body).toEqual(body);
	});
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/uazapi-node.test.ts`
Expected: FAIL — `Cannot find module '../nodes/Uazapi/Uazapi.node'`.

- [ ] **Step 3: Instance locator**

`nodes/shared/instanceLocator.ts`:

```ts
import type { ILoadOptionsFunctions, INodeListSearchResult, INodeProperties } from 'n8n-workflow';
import { listInstances } from './transport';

export const instanceLocator: INodeProperties = {
	displayName: 'Instance',
	name: 'instance',
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	required: true,
	description: 'WhatsApp instance to use. "By Token" accepts the token delivered by the Uazapi Trigger.',
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			typeOptions: { searchListMethod: 'searchInstances', searchable: true },
		},
		{
			displayName: 'By Token',
			name: 'token',
			type: 'string',
			placeholder: 'e.g. 0af1bafe-02ed-4689-af8f-000000000000',
		},
	],
};

export async function searchInstances(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
	const term = (filter ?? '').toLowerCase();
	const instances = await listInstances(this);
	return {
		results: instances
			.filter((i) => !term || `${i.name} ${i.profileName ?? ''}`.toLowerCase().includes(term))
			.map((i) => ({
				name: `${i.name} (${i.status ?? 'unknown'}${i.profileName ? `, ${i.profileName}` : ''})`,
				value: i.id,
			})),
	};
}
```

- [ ] **Step 4: Instance resource**

`nodes/Uazapi/instance.ts`:

```ts
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
```

Note: the test for `connect` passes `phone`, so `body` is `{ phone }`; `getStatus`/`disconnect` send no body.

- [ ] **Step 5: Message resource (Send Text only)**

`nodes/Uazapi/message.ts`:

```ts
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

export async function buildMessageCall(operation: string, get: ParamGetter, _readBinary: BinaryReader): Promise<ApiCall> {
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
```

- [ ] **Step 6: The node**

`nodes/Uazapi/Uazapi.node.ts`:

```ts
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
```

`nodes/Uazapi/Uazapi.node.json`:

```json
{
	"node": "@urzum/n8n-nodes-uazapi.uazapi",
	"nodeVersion": "1.0",
	"codexVersion": "1.0",
	"categories": ["Communication"],
	"resources": {
		"credentialDocumentation": [{ "url": "https://github.com/urzum/n8n-nodes-uazapi#credencial" }],
		"primaryDocumentation": [{ "url": "https://github.com/urzum/n8n-nodes-uazapi#readme" }]
	}
}
```

In `package.json` set `"nodes": ["dist/nodes/Uazapi/Uazapi.node.js"]`.

- [ ] **Step 7: Run tests, build and lint**

Run: `npx vitest run && npm run build && npm run lint`
Expected: all tests PASS; build exits 0; lint reports 0 errors. Fix any lint message by following its text (casing, sorting, final periods) — do not disable rules.

- [ ] **Step 8: Commit and push (lint is green from here on)**

```bash
git add nodes/shared/instanceLocator.ts nodes/Uazapi package.json test/uazapi-node.test.ts
git commit -m "feat(T2): Uazapi node with instance locator, Instance resource and Send Text"
git push
gh run watch $(gh run list -L1 --json databaseId -q '.[0].databaseId') --exit-status
```

---

### Task 3: Remaining message operations

**Files:**
- Modify: `nodes/Uazapi/message.ts`
- Test: `test/message-call.test.ts`

**Interfaces:**
- Consumes: `buildMessageCall`, `messageProperties`, `ParamGetter`, `BinaryReader` (Task 2).
- Produces: operations `sendMedia`, `sendContact`, `sendLocation`, `sendMenu`, `react`, `markRead`, `sendPresence` in the same `buildMessageCall`.

- [ ] **Step 1: Write the failing builder tests**

`test/message-call.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildMessageCall } from '../nodes/Uazapi/message';
import type { BinaryReader, ParamGetter } from '../nodes/Uazapi/message';

const getter = (params: Record<string, unknown>): ParamGetter => (name, fallback) => (name in params ? params[name] : fallback);
const noBinary: BinaryReader = async () => { throw new Error('not used'); };
const pngBinary: BinaryReader = async () => ({ base64: 'QkFTRTY0', mimeType: 'image/png', fileName: 'foto.png' });

describe('buildMessageCall', () => {
	it('sendMedia from URL with caption', async () => {
		const call = await buildMessageCall('sendMedia', getter({ number: '55', mediaType: 'image', fileSource: 'url', file: 'https://f/a.jpg', caption: 'Olha', trackSource: 'automa_uazapi', options: { viewOnce: true } }), noBinary);
		expect(call).toEqual({ method: 'POST', path: '/send/media', body: { number: '55', type: 'image', file: 'https://f/a.jpg', text: 'Olha', viewOnce: true, track_source: 'automa_uazapi' } });
	});

	it('sendMedia from binary fills mimetype and document name', async () => {
		const call = await buildMessageCall('sendMedia', getter({ number: '55', mediaType: 'document', fileSource: 'binary', binaryPropertyName: 'data', caption: '', trackSource: '', options: {} }), pngBinary);
		expect(call.body).toEqual({ number: '55', type: 'document', file: 'QkFTRTY0', mimetype: 'image/png', docName: 'foto.png' });
	});

	it('sendMedia keeps a mimetype set in options', async () => {
		const call = await buildMessageCall('sendMedia', getter({ number: '55', mediaType: 'image', fileSource: 'binary', binaryPropertyName: 'data', caption: '', trackSource: '', options: { mimetype: 'image/webp' } }), pngBinary);
		expect(call.body?.mimetype).toBe('image/webp');
	});

	it('sendContact', async () => {
		const call = await buildMessageCall('sendContact', getter({ number: '55', fullName: 'Ana', phoneNumber: '5511988887777', trackSource: '', options: { organization: 'ACME' } }), noBinary);
		expect(call).toEqual({ method: 'POST', path: '/send/contact', body: { number: '55', fullName: 'Ana', phoneNumber: '5511988887777', organization: 'ACME' } });
	});

	it('sendLocation sends numbers', async () => {
		const call = await buildMessageCall('sendLocation', getter({ number: '55', latitude: '-23.5', longitude: '-46.6', trackSource: '', options: { name: 'Loja' } }), noBinary);
		expect(call.body).toEqual({ number: '55', latitude: -23.5, longitude: -46.6, name: 'Loja' });
	});

	it('sendMenu splits choices by line', async () => {
		const call = await buildMessageCall('sendMenu', getter({ number: '55', menuType: 'button', text: 'Escolha', choices: 'Sim|sim\n\n Não|nao ', trackSource: 'automa_uazapi', options: { footerText: 'rodapé' } }), noBinary);
		expect(call.body).toEqual({ number: '55', type: 'button', text: 'Escolha', choices: ['Sim|sim', 'Não|nao'], footerText: 'rodapé', track_source: 'automa_uazapi' });
	});

	it('react sends only id and emoji', async () => {
		const call = await buildMessageCall('react', getter({ messageId: 'M1', emoji: '👍' }), noBinary);
		expect(call).toEqual({ method: 'POST', path: '/message/react', body: { id: 'M1', text: '👍' } });
	});

	it('markRead sends an array of ids', async () => {
		const call = await buildMessageCall('markRead', getter({ messageIds: 'A, B,,C ' }), noBinary);
		expect(call).toEqual({ method: 'POST', path: '/message/markread', body: { id: ['A', 'B', 'C'] } });
	});

	it('sendPresence omits a zero duration', async () => {
		const call = await buildMessageCall('sendPresence', getter({ number: '55', presence: 'composing', duration: 0 }), noBinary);
		expect(call).toEqual({ method: 'POST', path: '/message/presence', body: { number: '55', presence: 'composing' } });
	});

	it('sendPresence sends a positive duration as delay', async () => {
		const call = await buildMessageCall('sendPresence', getter({ number: '55', presence: 'recording', duration: 3000 }), noBinary);
		expect(call.body).toEqual({ number: '55', presence: 'recording', delay: 3000 });
	});
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/message-call.test.ts`
Expected: FAIL — `Unsupported message operation: sendMedia`.

- [ ] **Step 3: Replace `nodes/Uazapi/message.ts` with the full resource**

```ts
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
```

- [ ] **Step 4: Run tests, build and lint**

Run: `npx vitest run && npm run build && npm run lint`
Expected: all PASS; lint 0 errors (follow lint text for any casing/sorting complaint).

- [ ] **Step 5: Commit and push**

```bash
git add nodes/Uazapi/message.ts test/message-call.test.ts
git commit -m "feat(T3): media, contact, location, menu, react, mark read and presence"
git push
```

---

### Task 4: Normalizer

**Files:**
- Create: `nodes/shared/normalize.ts`
- Create: `test/fixtures/image-inbound.json`
- Test: `test/normalize.test.ts`

**Interfaces:**
- Produces:
  - `interface NormalizedMessage extends IDataObject { message: IDataObject; attachment: IDataObject; instance: IDataObject; raw: IDataObject }`
  - `normalizeMessage(body: IDataObject): NormalizedMessage`
  - `extractContent(msg: IDataObject): string`
  - `isBase64OrBinary(value: unknown): boolean`

- [ ] **Step 1: Save the real fixture**

`test/fixtures/image-inbound.json` = the `body` of the `start` pinData the Armando shared on 2026-10-03 (the `ImageMessage` from "Armando Urzum"), with two edits: `"token": "TOKEN_REDACTED"` and `"JPEGThumbnail": "/9j/4AAQSkZJRg"`. The `message` part must be:

```json
{
  "BaseUrl": "https://smileia.uazapi.com",
  "EventType": "messages",
  "instanceName": "Mestre",
  "owner": "551151965511",
  "token": "TOKEN_REDACTED",
  "message": {
    "buttonOrListid": "",
    "chatid": "5511994989615@s.whatsapp.net",
    "chatlid": "275582348714164@lid",
    "content": {
      "URL": "https://mmg.whatsapp.net/o1/v/t24/f2/m232/AQMN5wDW.enc",
      "mimetype": "image/jpeg",
      "fileSHA256": "YkXRFpRLH+7mHQPOaVddU4gsI3BmEz8EjTCupKGlhvo=",
      "fileLength": 165051,
      "JPEGThumbnail": "/9j/4AAQSkZJRg",
      "contextInfo": { "statusSourceType": 0 }
    },
    "fromMe": false,
    "groupName": "",
    "id": "551151965511:3AD93C7D7A45DD37ACA6",
    "isGroup": false,
    "mediaType": "image",
    "messageTimestamp": 1790039087000,
    "messageType": "ImageMessage",
    "messageid": "3AD93C7D7A45DD37ACA6",
    "owner": "551151965511",
    "quoted": "",
    "sender": "275582348714164@lid",
    "senderName": "Armando Urzum",
    "sender_lid": "275582348714164@lid",
    "sender_pn": "5511994989615@s.whatsapp.net",
    "source": "ios",
    "text": "",
    "track_id": "",
    "track_source": "",
    "type": "media",
    "wasSentByApi": false
  }
}
```

Verify no real token: `grep -c 0af1bafe test/fixtures/image-inbound.json` → `0`.

- [ ] **Step 2: Write the failing normalizer tests**

`test/normalize.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { IDataObject } from 'n8n-workflow';
import imageInbound from './fixtures/image-inbound.json';
import { normalizeMessage } from '../nodes/shared/normalize';

/** Real payload with the `message` fields replaced; content is replaced, not merged. */
function body(message: IDataObject): IDataObject {
	const base = structuredClone(imageInbound) as IDataObject;
	return { ...base, message: { ...(base.message as IDataObject), content: {}, mediaType: '', ...message } };
}

describe('normalizeMessage — real image payload', () => {
	const out = normalizeMessage(imageInbound as IDataObject);

	it('maps identity fields', () => {
		expect(out.message).toMatchObject({
			message_id: '3AD93C7D7A45DD37ACA6',
			chat_id: '5511994989615@s.whatsapp.net',
			jid: '5511994989615@s.whatsapp.net',
			pushName: 'Armando Urzum',
			whatsapp: '5511994989615',
			sender: '5511994989615',
			lid: '275582348714164@lid',
			origem: 'individual',
			content_type: 'imagemessage',
			participant: '',
			content: '',
			timestamp: '2026-09-22T01:04:47.000Z',
			event: 'inbound',
			role: 'user',
			source: 'ios',
			track: '',
			reply: '',
			was_sent_by_api: false,
		});
	});

	it('maps the attachment', () => {
		expect(out.attachment).toMatchObject({ mimetype: 'image/jpeg', extension: 'jpeg', fileid: 'YkXRFpRLH+7mHQPOaVddU4gsI3BmEz8EjTCupKGlhvo=', file_url: '', base64: '', contato: [] });
	});

	it('maps the instance and keeps raw', () => {
		expect(out.instance).toEqual({ token: 'TOKEN_REDACTED', owner: '551151965511', name: 'Mestre', base_url: 'https://smileia.uazapi.com' });
		expect(out.raw).toBe(imageInbound);
	});
});

describe('normalizeMessage — roles and numbers', () => {
	it('outbound human keeps customer number', () => {
		const out = normalizeMessage(body({ fromMe: true, wasSentByApi: false, sender_pn: '551151965511@s.whatsapp.net', messageType: 'Conversation', text: 'oi' }));
		expect(out.message).toMatchObject({ whatsapp: '5511994989615', role: 'human', event: 'outbound' });
	});

	it('outbound from the API is assistant and keeps track_source', () => {
		const out = normalizeMessage(body({ fromMe: true, wasSentByApi: true, track_source: 'smileia_n8n', track_id: 'T9', messageType: 'Conversation', text: 'oi' }));
		expect(out.message).toMatchObject({ role: 'assistant', track: 'smileia_n8n', track_id: 'T9', was_sent_by_api: true });
	});

	it('uses sender_pn when the chat id is a LID', () => {
		const out = normalizeMessage(body({ chatid: '275582348714164@lid', messageType: 'Conversation', text: 'oi' }));
		expect(out.message.whatsapp).toBe('5511994989615');
	});

	it('falls back to sender_lid when there is no phone', () => {
		const out = normalizeMessage(body({ chatid: '275582348714164@lid', sender_pn: '', messageType: 'Conversation', text: 'oi' }));
		expect(out.message.whatsapp).toBe('275582348714164@lid');
	});

	it('group message has origem grupo and the participant number', () => {
		const out = normalizeMessage(body({ chatid: '120363000000000000@g.us', isGroup: true, sender_pn: '5511977776666@s.whatsapp.net', messageType: 'Conversation', text: 'oi' }));
		expect(out.message).toMatchObject({ origem: 'grupo', participant: '5511977776666' });
	});
});

describe('normalizeMessage — content', () => {
	it('conversation keeps line breaks', () => {
		expect(normalizeMessage(body({ messageType: 'Conversation', text: 'linha 1\nlinha 2\n' })).message.content).toBe('linha 1\nlinha 2');
	});

	it('image caption becomes content', () => {
		expect(normalizeMessage(body({ messageType: 'ImageMessage', content: { caption: '  foto  do   pedido ' } })).message.content).toBe('foto do pedido');
	});

	it('base64 caption is dropped', () => {
		expect(normalizeMessage(body({ messageType: 'ImageMessage', content: { caption: '/9j/abc' } })).message.content).toBe('');
	});

	it('extended text from an ad summarizes the ad and the link', () => {
		const out = normalizeMessage(body({
			messageType: 'ExtendedTextMessage',
			content: { text: 'Quero saber o preço', contextInfo: { externalAdReply: { title: 'Promo', body: 'Clareamento', sourceURL: 'https://ad.example' } } },
		}));
		expect(out.message.content).toBe('Mensagem vinda de anuncio | Anuncio: Promo | Conteudo: Clareamento | Mensagem: Quero saber o preço');
		expect(out.attachment.link).toBe('https://ad.example');
	});

	it('extended text quoting an image mentions the caption', () => {
		const out = normalizeMessage(body({ messageType: 'ExtendedTextMessage', content: { text: 'esse aqui', contextInfo: { quotedMessage: { imageMessage: { caption: 'modelo A' } }, stanzaID: 'Q1' } } }));
		expect(out.message.content).toBe('esse aqui (Img: modelo A)');
		expect(out.message.reply).toBe('Q1');
	});

	it('button response joins text, id and body', () => {
		const out = normalizeMessage(body({
			messageType: 'ButtonsResponseMessage',
			content: { contextInfo: { quotedMessage: { interactiveMessage: { body: { text: 'Confirma?' }, InteractiveMessage: { NativeFlowMessage: { buttons: [{ buttonParamsJSON: '{"display_text":"Sim","id":"sim"}' }] } } } } } },
		}));
		expect(out.message.content).toBe('Sim | sim | Confirma?');
	});

	it('button response with broken JSON yields empty content', () => {
		const out = normalizeMessage(body({
			messageType: 'ButtonsResponseMessage',
			content: { contextInfo: { quotedMessage: { interactiveMessage: { InteractiveMessage: { NativeFlowMessage: { buttons: [{ buttonParamsJSON: '{oops' }] } } } } } },
		}));
		expect(out.message.content).toBe('');
	});
});

describe('normalizeMessage — attachments', () => {
	it('single contact', () => {
		const vcard = 'BEGIN:VCARD\nFN:Ana Souza\nORG:ACME;\nTITLE:Gerente\nTEL;type=CELL;waid=5511988887777:+55 11 98888-7777\nEND:VCARD';
		const out = normalizeMessage(body({ messageType: 'ContactMessage', content: { vcard } }));
		expect(out.attachment.contato).toEqual([{ nome: 'Ana Souza', telefones: ['5511988887777'], empresa: 'ACME;', cargo: 'Gerente' }]);
	});

	it('several contacts', () => {
		const out = normalizeMessage(body({ messageType: 'ContactsArrayMessage', content: { contacts: [{ vcard: 'FN:A\nTEL:+55 11 1111-1111\n' }, { vcard: 'FN:B\nTEL;waid=552222:x\n' }, { other: 1 }] } }));
		expect(out.attachment.contato).toEqual([
			{ nome: 'A', telefones: ['551111111111'], empresa: '', cargo: '' },
			{ nome: 'B', telefones: ['552222'], empresa: '', cargo: '' },
		]);
	});

	it('location', () => {
		const out = normalizeMessage(body({ messageType: 'LocationMessage', content: { degreesLatitude: -23.5, degreesLongitude: -46.6, address: 'Av. Paulista' } }));
		expect(out.attachment.location).toEqual({ end: 'Av. Paulista', latitude: -23.5, longitude: -46.6 });
	});
});

describe('normalizeMessage — robustness', () => {
	it('normalizes an empty body without throwing', () => {
		const out = normalizeMessage({});
		expect(out.message.message_id).toBe('');
		expect(out.message.role).toBe('user');
		expect(out.attachment.contato).toEqual([]);
	});
});
```

Enable JSON imports for tests: Vitest handles `import x from './fixtures/x.json'` natively; no config needed.

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run test/normalize.test.ts`
Expected: FAIL — `Cannot find module '../nodes/shared/normalize'`.

- [ ] **Step 4: Implement the normalizer**

`nodes/shared/normalize.ts`:

```ts
import type { IDataObject } from 'n8n-workflow';

export interface NormalizedMessage extends IDataObject {
	message: IDataObject;
	attachment: IDataObject;
	instance: IDataObject;
	raw: IDataObject;
}

const BASE64_RE = /^[A-Za-z0-9+/=]+$/;
const URL_RE = /^https?:\/\//;

function obj(value: unknown): IDataObject {
	return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as IDataObject) : {};
}

function str(value: unknown): string {
	if (value === undefined || value === null) return '';
	return typeof value === 'string' ? value : String(value);
}

function beforeAt(value: unknown): string {
	return str(value).split('@')[0];
}

export function isBase64OrBinary(value: unknown): boolean {
	const text = str(value);
	if (!text) return false;
	if (text.startsWith('data:image') || text.startsWith('/9j/')) return true;
	return text.length > 100 && BASE64_RE.test(text);
}

function clean(value: unknown, keepLineBreaks = false): string {
	let text = str(value).replace(/[\n\r]+$/, '').trim();
	if (!keepLineBreaks) text = text.replace(/\s+/g, ' ');
	return text;
}

function firstText(msg: IDataObject, content: IDataObject): string {
	const found = [msg.text, content.text, content.caption, msg.conversation].find(
		(t) => typeof t === 'string' && t.trim() !== '' && !isBase64OrBinary(t),
	);
	return str(found);
}

function adSummary(ad: IDataObject, text: string): string {
	const parts = ['Mensagem vinda de anuncio'];
	if (ad.title) parts.push(`Anuncio: ${clean(ad.title)}`);
	if (ad.body) parts.push(`Conteudo: ${clean(ad.body)}`);
	if (text && !URL_RE.test(text) && !isBase64OrBinary(text)) parts.push(`Mensagem: ${clean(text)}`);
	return parts.join(' | ');
}

/** WhatsApp sends button params as a JSON string; a malformed one means "no button text". */
function parseButtonParams(text: string): IDataObject {
	if (!text.trim().startsWith('{')) return {};
	try {
		return obj(JSON.parse(text));
	} catch (error) {
		return { parseError: (error as Error).message };
	}
}

export function extractContent(msg: IDataObject): string {
	const type = str(msg.messageType).toLowerCase();
	const content = obj(msg.content);
	const contextInfo = obj(content.contextInfo);
	const quoted = obj(contextInfo.quotedMessage);
	const ad = obj(contextInfo.externalAdReply);
	const hasAd = Boolean(ad.title || ad.body);

	if (type === 'buttonsresponsemessage') {
		const interactive = obj(quoted.interactiveMessage);
		const nativeFlow = obj(obj(interactive.InteractiveMessage).NativeFlowMessage);
		const buttons = Array.isArray(nativeFlow.buttons) ? nativeFlow.buttons : [];
		const params = parseButtonParams(str(obj(buttons[0]).buttonParamsJSON));
		if (params.parseError || Object.keys(params).length === 0) return '';
		const parts = [params.display_text, params.id, obj(interactive.body).text].filter(Boolean).map(str);
		return clean(parts.join(' | '));
	}

	if (type === 'imagemessage') {
		const caption = content.caption;
		if (!caption || isBase64OrBinary(caption)) return '';
		return clean(caption);
	}

	if (type === 'extendedtextmessage') {
		const text = str(content.text);
		const imageCaption = obj(quoted.imageMessage).caption;
		const interactiveText = obj(obj(quoted.interactiveMessage).body).text;
		const extended = obj(quoted.extendedTextMessage);

		if (hasAd) return adSummary(ad, text);
		if (imageCaption && !isBase64OrBinary(imageCaption)) return clean(`${text} (Img: ${str(imageCaption)})`);
		if (interactiveText && !isBase64OrBinary(interactiveText)) {
			return clean(`${text} (Interativa: ${str(interactiveText)})`);
		}
		const extParts = [extended.title, extended.text].filter((t) => t && !isBase64OrBinary(t)).map(str);
		if (extParts.length > 0) return clean(`${text} (${extParts.join(' - ')})`);
		if (text && !isBase64OrBinary(text)) return clean(text);
		return '';
	}

	if (hasAd) return adSummary(ad, firstText(msg, content));
	if (type === 'conversation') return clean(firstText(msg, content), true);
	return clean(firstText(msg, content));
}

function extractContacts(content: IDataObject): IDataObject[] {
	const list = Array.isArray(content.contacts) ? (content.contacts as unknown[]) : [content];
	return list
		.map(obj)
		.filter((c) => typeof c.vcard === 'string' && c.vcard !== '')
		.map((c) => {
			const vcard = str(c.vcard);
			const waids = [...vcard.matchAll(/waid=(\d+)/g)].map((m) => m[1]);
			const tels = [...vcard.matchAll(/TEL[^:]*:(\+?\d[\d\s-]+)/g)].map((m) => m[1].replace(/\D/g, ''));
			return {
				nome: (/FN:(.+?)(?:\n|$)/.exec(vcard)?.[1] ?? '').trim(),
				telefones: waids.length ? waids : tels,
				empresa: (/ORG:(.+?)(?:\n|$)/.exec(vcard)?.[1] ?? '').trim(),
				cargo: (/TITLE:(.+?)(?:\n|$)/.exec(vcard)?.[1] ?? '').trim(),
			};
		});
}

function extractLink(content: IDataObject): string {
	const ad = obj(obj(content.contextInfo).externalAdReply);
	const text = str(content.text);
	const textUrl = URL_RE.test(text) ? text : '';
	if (Object.keys(ad).length > 0) return str(ad.sourceURL) || textUrl;
	return str(content.matchedText) || textUrl;
}

/** The conversation peer: the customer, also on messages we sent. */
function conversationNumber(msg: IDataObject): string {
	const chatid = str(msg.chatid);
	if (chatid.endsWith('@s.whatsapp.net')) return beforeAt(chatid);
	if (!msg.fromMe && str(msg.sender_pn)) return beforeAt(msg.sender_pn);
	return str(msg.sender_lid);
}

function messageRole(msg: IDataObject): string {
	if (!msg.fromMe) return 'user';
	return msg.wasSentByApi === true ? 'assistant' : 'human';
}

function toIso(value: unknown): string {
	const ms = Number(value);
	return ms > 0 ? new Date(ms).toISOString() : '';
}

export function normalizeMessage(body: IDataObject): NormalizedMessage {
	const msg = obj(body.message);
	const content = obj(msg.content);
	const contextInfo = obj(content.contextInfo);
	const chatid = str(msg.chatid);
	const isGroup = chatid.includes('@g.');
	const mimetype = str(content.mimetype);
	const number = conversationNumber(msg);

	return {
		message: {
			message_id: str(msg.messageid),
			chat_id: chatid,
			jid: chatid,
			pushName: str(msg.senderName),
			whatsapp: number,
			sender: number,
			lid: str(msg.sender_lid),
			origem: isGroup ? 'grupo' : 'individual',
			content_type: str(msg.messageType).toLowerCase(),
			participant: isGroup ? beforeAt(str(msg.sender_pn) || str(msg.sender)) : '',
			content: extractContent(msg),
			timestamp: toIso(msg.messageTimestamp),
			event: msg.fromMe ? 'outbound' : 'inbound',
			role: messageRole(msg),
			source: str(msg.source),
			track: str(msg.track_source),
			track_id: str(msg.track_id),
			reply: str(obj(content.key).ID) || str(contextInfo.stanzaID) || str(msg.quoted),
			was_sent_by_api: msg.wasSentByApi === true,
		},
		attachment: {
			title: str(content.title),
			mimetype,
			filename: str(content.fileName),
			fileid: str(content.fileSHA256),
			extension: mimetype.split('/').pop() ?? '',
			content_url: str(content.URL),
			file_url: '',
			base64: '',
			contato: extractContacts(content),
			location: {
				end: str(content.address),
				latitude: (content.degreesLatitude as number | undefined) ?? '',
				longitude: (content.degreesLongitude as number | undefined) ?? '',
			},
			link: extractLink(content),
		},
		instance: {
			token: str(body.token),
			owner: beforeAt(body.owner),
			name: str(body.instanceName),
			base_url: str(body.BaseUrl),
		},
		raw: body,
	};
}
```

- [ ] **Step 5: Run tests, build and lint**

Run: `npx vitest run && npm run build && npm run lint`
Expected: all PASS. The timestamp is `toISOString()` of the payload's milliseconds (UTC), so it does not depend on the machine's timezone.

- [ ] **Step 6: Commit and push**

```bash
git add nodes/shared/normalize.ts test/normalize.test.ts test/fixtures/image-inbound.json
git commit -m "feat(T4): webhook normalizer with user/assistant/human roles"
git push
```

---

### Task 5: Uazapi Trigger — webhook lifecycle, filters, output

**Files:**
- Create: `nodes/UazapiTrigger/webhookConfig.ts`, `nodes/UazapiTrigger/UazapiTrigger.node.ts`, `nodes/UazapiTrigger/UazapiTrigger.node.json`, `nodes/UazapiTrigger/uazapi.svg`, `nodes/UazapiTrigger/uazapi.dark.svg` (copies of Task 1 icons)
- Modify: `package.json` (`n8n.nodes`)
- Test: `test/trigger.test.ts`

**Interfaces:**
- Consumes: `uazapiRequest`, `resolveInstanceToken`, `statusOf`, `toNodeError`, `InstanceLocator` (Task 1); `instanceLocator`, `searchInstances` (Task 2); `normalizeMessage` (Task 4).
- Produces:
  - `interface WebhookEntry { id: string; url: string; events: string[]; excludeMessages: string[] }`
  - `findOwnWebhook(response: unknown, url: string): WebhookEntry | undefined`
  - `sameConfig(entry: WebhookEntry, events: string[], exclude: string[]): boolean`
  - `addWebhookBody(url: string, events: string[], exclude: string[]): IDataObject`
  - `deleteWebhookBody(id: string): IDataObject`
  - `parseList(value: string): string[]`
  - `dropReason(body: IDataObject, opts: { token: string; ignoreTrackSources: string[] }): string | null`
  - `class UazapiTrigger` with `webhookMethods.default.{checkExists,create,delete}` and `webhook()`

- [ ] **Step 1: Write the failing trigger tests**

`test/trigger.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/trigger.test.ts`
Expected: FAIL — `Cannot find module '../nodes/UazapiTrigger/UazapiTrigger.node'`.

- [ ] **Step 3: Pure webhook helpers**

`nodes/UazapiTrigger/webhookConfig.ts`:

```ts
import type { IDataObject } from 'n8n-workflow';

export interface WebhookEntry {
	id: string;
	url: string;
	events: string[];
	excludeMessages: string[];
}

function strings(value: unknown): string[] {
	return Array.isArray(value) ? value.map(String) : [];
}

export function findOwnWebhook(response: unknown, url: string): WebhookEntry | undefined {
	const list = Array.isArray(response) ? (response as IDataObject[]) : [];
	const found = list.find((w) => w && w.url === url);
	if (!found) return undefined;
	return { id: String(found.id), url, events: strings(found.events), excludeMessages: strings(found.excludeMessages) };
}

export function sameConfig(entry: WebhookEntry, events: string[], exclude: string[]): boolean {
	const same = (a: string[], b: string[]) => [...a].sort().join(',') === [...b].sort().join(',');
	return same(entry.events, events) && same(entry.excludeMessages, exclude);
}

/** Always "add": the simple mode (no action) overwrites the instance's main webhook. */
export function addWebhookBody(url: string, events: string[], exclude: string[]): IDataObject {
	return { action: 'add', enabled: true, url, events, excludeMessages: exclude, addUrlEvents: false, addUrlTypesMessages: false };
}

export function deleteWebhookBody(id: string): IDataObject {
	return { action: 'delete', id };
}

export function parseList(value: string): string[] {
	return String(value ?? '').split(',').map((v) => v.trim()).filter(Boolean);
}

export function dropReason(body: IDataObject, opts: { token: string; ignoreTrackSources: string[] }): string | null {
	if (String(body.token ?? '') !== opts.token) return 'token does not match the configured instance';
	if (body.EventType === 'messages') {
		const track = String((body.message as IDataObject | undefined)?.track_source ?? '');
		if (track && opts.ignoreTrackSources.includes(track)) return `track_source "${track}" is ignored`;
	}
	return null;
}
```

- [ ] **Step 4: The trigger node (media download comes in Task 6)**

`nodes/UazapiTrigger/UazapiTrigger.node.ts`:

```ts
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
```

`nodes/UazapiTrigger/UazapiTrigger.node.json`:

```json
{
	"node": "@urzum/n8n-nodes-uazapi.uazapiTrigger",
	"nodeVersion": "1.0",
	"codexVersion": "1.0",
	"categories": ["Communication"],
	"resources": {
		"credentialDocumentation": [{ "url": "https://github.com/urzum/n8n-nodes-uazapi#credencial" }],
		"primaryDocumentation": [{ "url": "https://github.com/urzum/n8n-nodes-uazapi#readme" }]
	}
}
```

```bash
cp nodes/Uazapi/uazapi.svg nodes/Uazapi/uazapi.dark.svg nodes/UazapiTrigger/
```

In `package.json` set `"nodes": ["dist/nodes/Uazapi/Uazapi.node.js", "dist/nodes/UazapiTrigger/UazapiTrigger.node.js"]`.

- [ ] **Step 5: Run tests, build and lint**

Run: `npx vitest run && npm run build && npm run lint`
Expected: all PASS; lint 0 errors (rules `webhook-lifecycle-complete` and `trigger-node-conventions` satisfied).

- [ ] **Step 6: Commit and push**

```bash
git add nodes/UazapiTrigger package.json test/trigger.test.ts
git commit -m "feat(T5): Uazapi Trigger with own webhook lifecycle, token check and track_source filter"
git push
```

---

### Task 6: Media download and audio transcription in the trigger

**Files:**
- Create: `nodes/UazapiTrigger/media.ts`
- Modify: `nodes/UazapiTrigger/UazapiTrigger.node.ts` (two properties + download block in `webhook()`)
- Test: `test/media.test.ts`

**Interfaces:**
- Consumes: `NormalizedMessage` (Task 4); `UazapiTrigger.webhook()` (Task 5).
- Produces:
  - `type MediaMode = 'none' | 'link' | 'linkBase64'`
  - `hasMedia(body: IDataObject): boolean`
  - `downloadPayload(messageId: string, mode: MediaMode, transcribe: boolean): IDataObject`
  - `applyDownload(item: NormalizedMessage, response: unknown, transcribe: boolean): NormalizedMessage`

- [ ] **Step 1: Write the failing tests**

`test/media.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { IDataObject, IWebhookFunctions } from 'n8n-workflow';
import imageInbound from './fixtures/image-inbound.json';
import { applyDownload, downloadPayload, hasMedia } from '../nodes/UazapiTrigger/media';
import { normalizeMessage } from '../nodes/shared/normalize';
import { UazapiTrigger } from '../nodes/UazapiTrigger/UazapiTrigger.node';
import { apiError, fakeWebhook } from './helpers';

const run = (ctx: unknown) => new UazapiTrigger().webhook.call(ctx as IWebhookFunctions);
const params = (extra: IDataObject) => ({ instance: { mode: 'token', value: 'TOKEN_REDACTED' }, ignoreTrackSource: '', output: 'normalized', ...extra });

describe('media helpers', () => {
	it('detects media by mediaType', () => {
		expect(hasMedia(imageInbound as IDataObject)).toBe(true);
		expect(hasMedia({ message: { mediaType: '' } })).toBe(false);
	});

	it('builds the download payload', () => {
		expect(downloadPayload('M1', 'linkBase64', true)).toEqual({ id: 'M1', return_link: true, return_base64: true, generate_mp3: true, transcribe: true });
		expect(downloadPayload('M1', 'link', false)).toEqual({ id: 'M1', return_link: true, return_base64: false, generate_mp3: true, transcribe: false });
	});

	it('fills file_url, base64 and the transcription', () => {
		const item = normalizeMessage(imageInbound as IDataObject);
		applyDownload(item, { fileURL: 'https://f/x.mp3', base64Data: 'QUJD', transcription: 'olá' }, true);
		expect(item.attachment).toMatchObject({ file_url: 'https://f/x.mp3', base64: 'QUJD' });
		expect(item.message.content).toBe('olá');
	});

	it('keeps the original content when transcription is off', () => {
		const item = normalizeMessage(imageInbound as IDataObject);
		applyDownload(item, { fileURL: 'https://f/x.jpg', transcription: 'ignored' }, false);
		expect(item.message.content).toBe('');
	});
});

describe('webhook() with media', () => {
	it('downloads the media with the instance token', async () => {
		const { ctx, calls } = fakeWebhook({ params: params({ media: 'link', transcribeAudio: false }), body: imageInbound as IDataObject, responses: [{ fileURL: 'https://f/x.jpg' }] });
		const result = await run(ctx);
		expect(calls[0].url).toBe('https://x.uazapi.com/message/download');
		expect(calls[0].headers).toMatchObject({ token: 'TOKEN_REDACTED' });
		expect(((result.workflowData?.[0][0].json as IDataObject).attachment as IDataObject).file_url).toBe('https://f/x.jpg');
	});

	it('still emits the message when the download fails', async () => {
		const { ctx, logs } = fakeWebhook({ params: params({ media: 'link', transcribeAudio: false }), body: imageInbound as IDataObject, responses: [apiError(500)] });
		const result = await run(ctx);
		const attachment = (result.workflowData?.[0][0].json as IDataObject).attachment as IDataObject;
		expect(String(attachment.download_error)).toContain('/message/download');
		expect(logs.join()).toMatch(/^warn:.*3AD93C7D7A45DD37ACA6/);
	});

	it('does not call the API when media is off', async () => {
		const { ctx, calls } = fakeWebhook({ params: params({ media: 'none' }), body: imageInbound as IDataObject });
		await run(ctx);
		expect(calls).toHaveLength(0);
	});
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/media.test.ts`
Expected: FAIL — `Cannot find module '../nodes/UazapiTrigger/media'`.

- [ ] **Step 3: Media helpers**

`nodes/UazapiTrigger/media.ts`:

```ts
import type { IDataObject } from 'n8n-workflow';
import type { NormalizedMessage } from '../shared/normalize';

export type MediaMode = 'none' | 'link' | 'linkBase64';

export function hasMedia(body: IDataObject): boolean {
	const message = (body.message ?? {}) as IDataObject;
	return String(message.mediaType ?? '') !== '';
}

export function downloadPayload(messageId: string, mode: MediaMode, transcribe: boolean): IDataObject {
	return { id: messageId, return_link: true, return_base64: mode === 'linkBase64', generate_mp3: true, transcribe };
}

export function applyDownload(item: NormalizedMessage, response: unknown, transcribe: boolean): NormalizedMessage {
	const data = (response ?? {}) as IDataObject;
	item.attachment.file_url = String(data.fileURL ?? '');
	item.attachment.base64 = String(data.base64Data ?? '');
	const transcription = String(data.transcription ?? '').trim();
	if (transcribe && transcription) item.message.content = transcription;
	return item;
}
```

- [ ] **Step 4: Wire it into the trigger**

In `nodes/UazapiTrigger/UazapiTrigger.node.ts`:

Add to imports:

```ts
import type { MediaMode } from './media';
import { applyDownload, downloadPayload, hasMedia } from './media';
```

Append to `properties` (after `Output`):

```ts
			{
				displayName: 'Media',
				name: 'media',
				type: 'options',
				default: 'none',
				description: 'Download received media through uazapi. The URL inside the webhook is encrypted and cannot be opened.',
				displayOptions: { show: { output: ['normalized'] } },
				options: [
					{ name: 'Do Not Download', value: 'none' },
					{ name: 'Link', value: 'link', description: 'Public link valid for 2 days in attachment.file_url' },
					{ name: 'Link and Base64', value: 'linkBase64', description: 'Also fills attachment.base64 (heavier)' },
				],
			},
			{
				displayName: 'Transcribe Audio',
				name: 'transcribeAudio',
				type: 'boolean',
				default: false,
				description: 'Whether to put the audio transcription in message.content (uses the OpenAI key saved on the instance)',
				displayOptions: { show: { output: ['normalized'], media: ['link', 'linkBase64'] } },
			},
```

Replace the last two lines of `webhook()` (`const item ... return ...`) with:

```ts
		const item = normalizeMessage(body);
		const media = this.getNodeParameter('media', 'none') as MediaMode;
		if (media !== 'none' && hasMedia(body)) {
			const transcribe = this.getNodeParameter('transcribeAudio', false) as boolean;
			const messageId = String(item.message.message_id);
			try {
				const response = await uazapiRequest(
					this,
					{ method: 'POST', path: '/message/download', body: downloadPayload(messageId, media, transcribe) },
					token,
				);
				applyDownload(item, response, transcribe);
			} catch (error) {
				item.attachment.download_error = (error as Error).message;
				this.logger.warn(`Uazapi Trigger: media download failed for message ${messageId}: ${(error as Error).message}`);
			}
		}
		return { workflowData: [[{ json: item }]] };
```

- [ ] **Step 5: Run tests, build and lint**

Run: `npx vitest run && npm run build && npm run lint`
Expected: all PASS; lint 0 errors.

- [ ] **Step 6: Commit and push**

```bash
git add nodes/UazapiTrigger/media.ts nodes/UazapiTrigger/UazapiTrigger.node.ts test/media.test.ts
git commit -m "feat(T6): optional media download and audio transcription in the trigger"
git push
```

---

### Task 7: README, CHANGELOG, live test and guide

**Files:**
- Create: `README.md`, `docs/guias/n8n-nodes-uazapi.html`
- Modify: `CHANGELOG.md`, `MEMORY.md`
- Test: manual, in `npm run dev`

**Interfaces:**
- Consumes: everything above.
- Produces: user documentation and evidence of a live run.

- [ ] **Step 1: README (Portuguese)**

`README.md` sections, in this order, each with real content:

1. `# @urzum/n8n-nodes-uazapi` — one sentence.
2. `## Instalação` — n8n → Settings → Community Nodes → Install → `@urzum/n8n-nodes-uazapi`.
3. `## Credencial` — Server URL (ex.: `https://minhaempresa.uazapi.com`), Admin Token opcional (habilita a lista de instâncias; sem ele use "By Token").
4. `## Uazapi (ação)` — table Resource → Operations, and the "By Token" example `{{ $json.instance.token }}` to reply from the same number the trigger received on.
5. `## Uazapi Trigger` — events, Ignore Track Source (`automa_uazapi` default, how it prevents loops), Exclude at Source, Output, Media, Transcribe Audio; note that the trigger creates its own webhook and never touches the instance's main webhook (Chatwoot etc. stay intact).
6. `## Formato normalizado` — the field table from the spec (`message.*`, `attachment.*`, `instance.*`, `raw`) including the three roles.
7. `## Limitações conhecidas` — retry can duplicate a send if the response was lost; media link valid for 2 days; in list mode the trigger calls `/instance/all` once per event.

- [ ] **Step 2: CHANGELOG**

Under `## 0.1.0`: list the credential, both nodes and their operations.

- [ ] **Step 3: Live test (ask the Armando for a test number first)**

```bash
npm run dev
```

In `http://localhost:5678`, with a credential pointing at the real server and the **test number** agreed with the Armando:

1. Credential test passes (with and without Admin Token).
2. Uazapi → Send Text "By Token" and "From List" → message arrives on the phone.
3. Uazapi → Send Media (URL) → image arrives.
4. Uazapi Trigger, activate (or "Listen for test event"), send a text and an audio from the phone → normalized item; with Media = Link and Transcribe on, `message.content` has the transcription and `attachment.file_url` opens.
5. Reply from the phone itself → item with `role: human`.
6. Send via the Uazapi node → trigger does **not** fire (ignored `automa_uazapi`).
7. Deactivate → `curl -s -H "token: <test token>" <server>/webhook` no longer lists the n8n URL, and any other webhook (e.g. Chatwoot) is still there.
8. Send a `connection` event (disconnect/reconnect the test instance only with the Armando's OK) → arrives raw. If it is dropped with "token does not match", the event has no `token` field: record it in `LESSON.md` and open an issue.

Save a sanitized payload of the audio message (token → `TOKEN_REDACTED`) as `test/fixtures/audio-inbound.json` and add a normalizer test asserting `content_type: 'audiomessage'` and `mimetype` from the payload.

- [ ] **Step 4: Test guide**

Run `/guia-de-teste n8n-nodes-uazapi` to produce `docs/guias/n8n-nodes-uazapi.html` from the steps above.

- [ ] **Step 5: Update memory and commit**

Overwrite `MEMORY.md` "Estado atual" with what was verified live and what was not. Then:

```bash
git add README.md CHANGELOG.md MEMORY.md docs/guias/n8n-nodes-uazapi.html test/fixtures/audio-inbound.json test/normalize.test.ts
git commit -m "docs(T7): README, changelog, live verification and test guide"
git push
```

Release (`npm run release`) is **not** part of this task: it is the go-live issue and needs the Armando's approval.
