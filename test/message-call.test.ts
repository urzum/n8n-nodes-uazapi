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
