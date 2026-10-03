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
			name: 'manual',
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
