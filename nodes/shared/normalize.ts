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

const PHONE_JID = '@s.whatsapp.net';

/**
 * The conversation peer: the customer, also on messages we sent. In a LID chat on a message we sent,
 * `sender_lid` is the owner's own LID, so the customer comes from `chat.wa_chatid` or the chat id itself.
 */
function conversationNumber(msg: IDataObject, body: IDataObject): string {
	const chatid = str(msg.chatid);
	if (chatid.endsWith(PHONE_JID)) return beforeAt(chatid);
	const waChatid = str(obj(body.chat).wa_chatid);
	if (waChatid.endsWith(PHONE_JID)) return beforeAt(waChatid);
	if (!msg.fromMe && str(msg.sender_pn)) return beforeAt(msg.sender_pn);
	return chatid;
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
	const number = conversationNumber(msg, body);

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
			extension: (mimetype.split(';')[0].split('/').pop() ?? '').trim(),
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
