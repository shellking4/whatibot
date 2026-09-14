import { pocketbase } from '../commons/rest-config';
import { RecordModel } from 'pocketbase';
import { WhatsappMessagePayloadDto } from '../dtos/request.dto';
import { BadRequestException, Logger } from '@nestjs/common';
import {
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { Server } from "socket.io";
import { store, WWEBJS_AUTH_DATA_PATH } from '../commons/wwebjs-aws-s3-auth-store';
import { SafeRemoteAuth } from '../commons/safe-remote-auth';


const { Client, WAState } = require('whatsapp-web.js');

const SEND_MESSAGE_TIMEOUT_MS = 25000;
const DESTROY_TIMEOUT_MS = 15000;
const WATCHDOG_INTERVAL_MS = 60000;
// A socket can report CONNECTED while requests to WhatsApp hang, so every few ticks the watchdog does a real lookup
const WATCHDOG_ROUND_TRIP_EVERY_TICKS = 5;
// Consecutive failed health checks or sends before the client is restarted
const MAX_CONSECUTIVE_FAILURES = 3;
// A client that is neither ready nor showing a QR code after this long is restarted
const STARTUP_GRACE_MS = 300000;
const RECONNECT_BASE_DELAY_MS = 5000;
const RECONNECT_MAX_DELAY_MS = 60000;
const READY_STATES = [
    WAState.CONNECTED,
    WAState.OPENING,
    WAState.PAIRING,
    WAState.TIMEOUT,
];
const LOGGED_OUT_STATES = [WAState.UNPAIRED, WAState.UNPAIRED_IDLE];

@WebSocketGateway({ cors: true })
export class WhatsappService {

    wwjsClient: any;

    @WebSocketServer()
    websocketServer: Server;

    private logger: Logger = new Logger()

    private currentClient: any = null;
    private clientStartedAt = 0;
    private initializing: Promise<any> | null = null;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private reconnectAttempts = 0;
    private watchdogInterval: NodeJS.Timeout | null = null;
    private watchdogTicks = 0;
    private consecutiveFailures = 0;

    afterInit() {
        this.logger.log("Subscriptions WebSocketGateway Initialized")
    }

    constructor() {
        this.initializeWWJSClient();
    }

    async syncClientStateToPocketbase(params: { state: string }) {
        const pb = pocketbase;
        let clientStateTracker!: RecordModel;
        try {
            clientStateTracker = await pb.collection('constants').getFirstListItem('name = "wwjs-client-state"')
        } catch (error) {
            if ((error as any).status = 404) {
                const data = {
                    name: "wwjs-client-state",
                    value: `${params.state}`
                };
                clientStateTracker = await pb.collection('constants').create(data);
                return clientStateTracker;
            }
        }
        const data = {
            value: `${params.state}`
        };
        clientStateTracker = await pb.collection('constants').update(clientStateTracker.id, data);
        return clientStateTracker;
    }

    // Serialized so two clients never run on the same session folder at once
    initializeWWJSClient(): Promise<any> {
        if (!this.initializing) {
            this.initializing = this.createClient().finally(() => {
                this.initializing = null;
            });
        }
        return this.initializing;
    }

    private async createClient() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        await this.destroyCurrentClient();

        console.log("INITIALIZING WWJS CLIENT")

        const client = new Client({
            puppeteer: {
                headless: true,
                // no --single-process / --no-zygote: in single-process mode one hung renderer freezes the whole browser
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--disable-gpu'
                ],
            },
            authStrategy: new SafeRemoteAuth({
                clientId: 'whatibot',
                dataPath: WWEBJS_AUTH_DATA_PATH,
                store: store,
                backupSyncIntervalMs: 600000
            }),
            takeoverOnConflict: true,
        });

        this.currentClient = client;
        this.wwjsClient = null;
        this.clientStartedAt = Date.now();
        this.consecutiveFailures = 0;

        client.on('qr', qr => {
            console.log("QRCODE READY")
            this.clientStartedAt = Date.now();
            this.websocketServer?.emit('qrcode', qr);
        });

        client.on('authenticated', () => {
            console.log("AUTHENTICATED")
            this.clientStartedAt = Date.now();
        });

        client.on('ready', async () => {
            console.log("READY");
            this.wwjsClient = client;
            this.reconnectAttempts = 0;
            this.consecutiveFailures = 0;
            // this.syncClientStateToPocketbase({ state: 'READY' });
            // RemoteAuth only uploads the session 60s after 'ready', so a throw here must not crash the process
            try {
                const chatId = (await client.getNumberId("62798845"))?._serialized;
                if (chatId) {
                    await client.sendMessage(chatId, 'connected');
                } else {
                    console.warn('CONNECTED NOTIFICATION SKIPPED: 62798845 is not a registered WhatsApp number');
                }
            } catch (error) {
                console.error('CONNECTED NOTIFICATION FAILED', error);
            }
        });

        client.on('change_state', state => {
            console.log('WWJS STATE', state);
        });

        client.on('remote_session_saved', () => {
            console.log("REMOTE SESSION SAVED");
        });

        client.on('auth_failure', msg => {
            console.error('AUTHENTICATION FAILURE', msg);
        });

        client.on('disconnected', (reason) => {
            console.log('DISCONNECTED', reason);
            if (this.currentClient === client) this.scheduleReconnect(`disconnected: ${reason}`);
        });

        this.ensureWatchdog();

        client.initialize().catch(error => {
            console.error('WWJS CLIENT INITIALIZATION FAILED', error);
            if (this.currentClient === client) this.scheduleReconnect(`client.initialize failed: ${error?.message}`);
        });

        return client;
    }

    private async destroyCurrentClient() {
        const client = this.currentClient;
        this.currentClient = null;
        this.wwjsClient = null;
        if (!client) return;

        try {
            await this.withTimeout(client.destroy(), DESTROY_TIMEOUT_MS, 'client.destroy');
        } catch (error) {
            // A frozen Chrome never answers browser.close(); kill it so it can't keep the session folder busy
            console.error('WWJS CLIENT: destroy failed, killing browser', error?.message);
            try {
                client.pupBrowser?.process()?.kill('SIGKILL');
            } catch (killError) {
                console.error('WWJS CLIENT: could not kill browser', killError?.message);
            }
        }
    }

    private scheduleReconnect(reason: string) {
        if (this.reconnectTimer) return;

        const attempt = this.reconnectAttempts++;
        const delay = Math.min(RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt), RECONNECT_MAX_DELAY_MS);
        console.log(`WWJS RECONNECT scheduled in ${delay}ms (attempt ${attempt}) - ${reason}`);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.initializeWWJSClient();
        }, delay);
    }

    private recordFailure(client: any, reason: string) {
        if (this.currentClient !== client) return;
        this.consecutiveFailures++;
        console.warn(`WWJS HEALTH: ${reason} (${this.consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`);
        if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            this.consecutiveFailures = 0;
            this.scheduleReconnect(`unresponsive client: ${reason}`);
        }
    }

    private ensureWatchdog() {
        if (this.watchdogInterval) return;
        this.watchdogInterval = setInterval(() => {
            this.checkClientHealth().catch(error => {
                console.error('WATCHDOG: health check crashed', error);
            });
        }, WATCHDOG_INTERVAL_MS);
    }

    private async checkClientHealth() {
        if (this.initializing || this.reconnectTimer) return; // recovery already under way

        const client = this.currentClient;
        if (!client) {
            this.scheduleReconnect('watchdog: no WhatsApp client running');
            return;
        }
        const isReady = this.wwjsClient === client;
        const startupExpired = Date.now() - this.clientStartedAt > STARTUP_GRACE_MS;

        let state: string | null = null;
        try {
            state = await this.withTimeout(client.getState(), SEND_MESSAGE_TIMEOUT_MS, 'watchdog getState');
        } catch (error) {
            // Before the page exists getState throws; that's only a problem once startup should be over
            if (isReady || startupExpired) this.recordFailure(client, `state check failed (${error?.message})`);
            return;
        }
        if (this.currentClient !== client) return;

        if (LOGGED_OUT_STATES.includes(state)) {
            // Session expired or device unlinked: the QR code is up, only a scan can fix this
            this.clientStartedAt = Date.now();
            this.consecutiveFailures = 0;
            return;
        }

        if (!isReady) {
            if (startupExpired) {
                this.scheduleReconnect(`watchdog: client not ready after ${STARTUP_GRACE_MS / 1000}s (state ${state})`);
            }
            return;
        }

        if (state !== WAState.CONNECTED) {
            this.recordFailure(client, `state is ${state}`);
            return;
        }

        const ownNumber = client.info?.wid?.server === 'c.us' ? client.info.wid.user : null;
        const probe = this.consecutiveFailures > 0 || ++this.watchdogTicks % WATCHDOG_ROUND_TRIP_EVERY_TICKS === 0;
        if (!probe || !ownNumber) return;

        try {
            await this.withTimeout(client.getNumberId(ownNumber), SEND_MESSAGE_TIMEOUT_MS, 'watchdog round trip');
            this.consecutiveFailures = 0;
        } catch (error) {
            this.recordFailure(client, `round trip to WhatsApp failed (${error?.message})`);
        }
    }


    private withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
        let timer: NodeJS.Timeout;
        return Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timer = setTimeout(() => {
                    reject(new Error(`${label} timed out after ${timeoutMs}ms`));
                }, timeoutMs);
            }),
        ]).finally(() => clearTimeout(timer)) as Promise<T>;
    }

    async sendWhatsappMessage(messagePayload: WhatsappMessagePayloadDto) {
        const client = this.wwjsClient;
        if (!client) {
            throw new BadRequestException('WhatsApp client is not ready yet');
        }

        try {
            const state = await this.withTimeout(client.getState(), SEND_MESSAGE_TIMEOUT_MS, 'getState');
            if (state === WAState.CONFLICT) {
                throw new BadRequestException('WhatsApp client is in CONFLICT state - another instance may be using the same session');
            }
            if (state && !READY_STATES.includes(state)) {
                throw new BadRequestException(`WhatsApp client is not connected (state: ${state})`);
            }
        } catch (error) {
            if (error instanceof BadRequestException) throw error;
            this.recordFailure(client, `send: getState failed (${error.message})`);
            throw new BadRequestException(`Failed to check WhatsApp client state: ${error.message}`);
        }

        const phoneNumber = messagePayload.phoneNumber.replace('+', '').replace(/\s+/g, '');

        let chatId: string | undefined;
        try {
            const numberId = await this.withTimeout<any>(
                client.getNumberId(phoneNumber),
                SEND_MESSAGE_TIMEOUT_MS,
                `getNumberId(${phoneNumber})`,
            );
            chatId = numberId?._serialized;
        } catch (error) {
            this.recordFailure(client, `send: getNumberId failed (${error.message})`);
            throw new BadRequestException(`Could not resolve phone number ${messagePayload.phoneNumber}: ${error.message}`);
        }
        if (!chatId) {
            throw new BadRequestException(`Phone number ${messagePayload.phoneNumber} is not registered on WhatsApp`);
        }

        try {
            await this.withTimeout(
                client.sendMessage(chatId, messagePayload.message),
                SEND_MESSAGE_TIMEOUT_MS,
                'sendMessage',
            );
            this.consecutiveFailures = 0;
            return {
                message: messagePayload.message,
                phoneNumber: messagePayload.phoneNumber,
                success: true
            }
        } catch (error) {
            console.error('Failed to send WhatsApp message', error);
            this.recordFailure(client, `send: sendMessage failed (${error.message})`);
            throw new BadRequestException(`Failed to send WhatsApp message: ${error.message}`);
        }
    }


}
