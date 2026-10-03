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
