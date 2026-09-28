jest.mock('../commons/rest-config', () => ({ pocketbase: {} }));
jest.mock('../commons/wwebjs-aws-s3-auth-store', () => ({ store: {}, WWEBJS_AUTH_DATA_PATH: '/tmp' }));
jest.mock('../commons/safe-remote-auth', () => ({ SafeRemoteAuth: class {} }));
jest.mock('whatsapp-web.js', () => ({
    Client: class {
        on() { }
        initialize() { return new Promise(() => { }); }
        destroy() { return Promise.resolve(); }
    },
    WAState: {
        CONFLICT: 'CONFLICT',
        CONNECTED: 'CONNECTED',
        OPENING: 'OPENING',
        PAIRING: 'PAIRING',
        TIMEOUT: 'TIMEOUT',
        UNPAIRED: 'UNPAIRED',
        UNPAIRED_IDLE: 'UNPAIRED_IDLE',
    },
}));

import { BadRequestException } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';

const GET_CHAT_ERROR = "Cannot read properties of undefined (reading 'getChat')";
const payload = { phoneNumber: '+216 12345678', message: 'hello' } as any;

function fakeClient() {
    const client = {
        utilsPresent: true,
        getState: jest.fn().mockResolvedValue('CONNECTED'),
        getNumberId: jest.fn().mockResolvedValue({ _serialized: '21612345678@c.us' }),
        sendMessage: jest.fn().mockResolvedValue({}),
        pupPage: {
            evaluate: jest.fn(async () => client.utilsPresent),
        },
    };
    return client;
}

describe('WhatsappService.sendWhatsappMessage during a WhatsApp Web page reload', () => {
    let service: any;
    let client: ReturnType<typeof fakeClient>;

    beforeEach(async () => {
        service = new WhatsappService();
        await service.initializing;
        client = fakeClient();
        service.currentClient = client;
        service.wwjsClient = client;
    });

    afterEach(() => {
        clearInterval(service.watchdogInterval);
        clearTimeout(service.reconnectTimer);
        jest.useRealTimers();
    });

    it('sends normally when window.WWebJS is present', async () => {
        await expect(service.sendWhatsappMessage(payload)).resolves.toMatchObject({ success: true });
        expect(client.sendMessage).toHaveBeenCalledTimes(1);
        expect(client.sendMessage).toHaveBeenCalledWith('21612345678@c.us', 'hello');
    });

    it('waits for window.WWebJS to be re-injected before sending', async () => {
        client.utilsPresent = false;
        setTimeout(() => { client.utilsPresent = true; }, 1200);

        await expect(service.sendWhatsappMessage(payload)).resolves.toMatchObject({ success: true });
        expect(client.pupPage.evaluate.mock.calls.length).toBeGreaterThan(1);
        expect(client.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('treats a page mid-navigation (evaluate throws) as not ready yet', async () => {
        client.pupPage.evaluate
            .mockRejectedValueOnce(new Error('Execution context was destroyed'))
            .mockRejectedValueOnce(new Error('Execution context was destroyed'));

        await expect(service.sendWhatsappMessage(payload)).resolves.toMatchObject({ success: true });
        expect(client.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('retries once when the page reloads between the check and the send', async () => {
        client.sendMessage.mockRejectedValueOnce(new TypeError(GET_CHAT_ERROR));

        await expect(service.sendWhatsappMessage(payload)).resolves.toMatchObject({ success: true });
        expect(client.sendMessage).toHaveBeenCalledTimes(2);
        expect(service.consecutiveFailures).toBe(0);
    });

    it('does not retry other send errors', async () => {
        client.sendMessage.mockRejectedValueOnce(new Error('something else'));

        await expect(service.sendWhatsappMessage(payload)).rejects.toThrow('Failed to send WhatsApp message: something else');
        expect(client.sendMessage).toHaveBeenCalledTimes(1);
        expect(service.consecutiveFailures).toBe(1);
    });

    it('surfaces the original error if the retry hits the reload again', async () => {
        client.sendMessage.mockRejectedValue(new TypeError(GET_CHAT_ERROR));

        await expect(service.sendWhatsappMessage(payload)).rejects.toThrow(GET_CHAT_ERROR);
        expect(client.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('gives up after 30s if window.WWebJS never comes back, without calling sendMessage', async () => {
        jest.useFakeTimers();
        client.utilsPresent = false;

        const result = service.sendWhatsappMessage(payload).catch((e: any) => e);
        await jest.advanceTimersByTimeAsync(31000);
        const error = await result;

        expect(error).toBeInstanceOf(BadRequestException);
        expect(error.message).toBe('WhatsApp Web is reloading, please retry shortly');
        expect(client.getNumberId).not.toHaveBeenCalled();
        expect(client.sendMessage).not.toHaveBeenCalled();
        expect(service.consecutiveFailures).toBe(1);
    });
});

describe('WhatsappService watchdog', () => {
    let service: any;
    let client: ReturnType<typeof fakeClient>;

    beforeEach(async () => {
        service = new WhatsappService();
        await service.initializing;
        client = fakeClient();
        (client as any).info = { wid: { server: 'c.us', user: '21612345678' } };
        service.currentClient = client;
        service.wwjsClient = client;
        service.watchdogTicks = 4; // next tick runs the round-trip probe
    });

    afterEach(() => {
        clearInterval(service.watchdogInterval);
        clearTimeout(service.reconnectTimer);
    });

    it('records a failure when window.WWebJS is missing on a healthy socket', async () => {
        client.utilsPresent = false;
        await service.checkClientHealth();
        expect(service.consecutiveFailures).toBe(1);
    });

    it('schedules a restart after 3 checks with window.WWebJS missing', async () => {
        client.utilsPresent = false;
        await service.checkClientHealth();
        await service.checkClientHealth();
        await service.checkClientHealth();
        expect(service.reconnectTimer).not.toBeNull();
    });

    it('resets the failure count once helpers are back', async () => {
        service.consecutiveFailures = 2;
        await service.checkClientHealth();
        expect(service.consecutiveFailures).toBe(0);
        expect(service.reconnectTimer).toBeNull();
    });
});
