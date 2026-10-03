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
