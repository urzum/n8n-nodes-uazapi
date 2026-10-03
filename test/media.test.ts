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
