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

describe('normalizeMessage — LID chats', () => {
	const lidChat = { chatid: '275582348714164@lid' };
	const withChat = (message: IDataObject, chat: IDataObject): IDataObject => ({ ...body(message), chat });

	it('outbound in a LID chat takes the customer number from chat.wa_chatid', () => {
		const out = normalizeMessage(withChat({ ...lidChat, fromMe: true, sender_pn: '551151965511@s.whatsapp.net', sender_lid: '999@lid', messageType: 'Conversation', text: 'oi' }, { wa_chatid: '5511994989615@s.whatsapp.net' }));
		expect(out.message).toMatchObject({ whatsapp: '5511994989615', sender: '5511994989615' });
	});

	it('outbound in a LID chat without chat keeps the conversation LID, never the owner LID', () => {
		const out = normalizeMessage(body({ ...lidChat, fromMe: true, sender_pn: '551151965511@s.whatsapp.net', sender_lid: '999@lid', messageType: 'Conversation', text: 'oi' }));
		expect(out.message).toMatchObject({ whatsapp: '275582348714164@lid', sender: '275582348714164@lid' });
	});

	it('outbound in a group keeps the group chatid', () => {
		const out = normalizeMessage(withChat({ chatid: '120363000000000000@g.us', isGroup: true, fromMe: true, messageType: 'Conversation', text: 'oi' }, { wa_chatid: '120363000000000000@g.us' }));
		expect(out.message.whatsapp).toBe('120363000000000000@g.us');
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

describe('normalizeMessage — voice note mimetype', () => {
	it('drops mimetype parameters from the extension', () => {
		const out = normalizeMessage(body({ messageType: 'AudioMessage', content: { mimetype: 'audio/ogg; codecs=opus' } }));
		expect(out.attachment).toMatchObject({ mimetype: 'audio/ogg; codecs=opus', extension: 'ogg' });
	});
});
