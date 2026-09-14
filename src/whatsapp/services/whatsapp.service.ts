import { pocketbase } from '../commons/rest-config';
import { RecordModel } from 'pocketbase';
import { WhatsappMessagePayloadDto } from '../dtos/request.dto';
import { BadRequestException, Logger } from '@nestjs/common';
import {
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { Server } from "socket.io";
import { RemoteAuth } from 'whatsapp-web.js';
import { store, WWEBJS_AUTH_DATA_PATH } from '../commons/wwebjs-aws-s3-auth-store';


const { Client, WAState } = require('whatsapp-web.js');

const SEND_MESSAGE_TIMEOUT_MS = 25000;
const WATCHDOG_INTERVAL_MS = 300000;
const RECONNECT_BASE_DELAY_MS = 5000;
const RECONNECT_MAX_DELAY_MS = 60000;
const READY_STATES = [
    WAState.CONNECTED,
    WAState.OPENING,
    WAState.PAIRING,
    WAState.TIMEOUT,
];

@WebSocketGateway({ cors: true })
export class WhatsappService {

    wwjsClient: any;

    @WebSocketServer()
    websocketServer: Server;

    private logger: Logger = new Logger()

    private currentClient: any = null;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private reconnectAttempts = 0;
    private watchdogInterval: NodeJS.Timeout | null = null;
    private destroying = false;

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

    async initializeWWJSClient() {
        if (this.destroying) {
            console.log("WWJS CLIENT: teardown in progress, skipping re-init")
            return;
        }
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        await this.destroyCurrentClient();

        console.log("INITIALIZING WWJS CLIENT")
        
        const client = new Client({
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process',
                    '--disable-gpu'
                ],
            },
            authStrategy: new RemoteAuth({
                clientId: 'whatibot',
                dataPath: WWEBJS_AUTH_DATA_PATH,
                store: store,
                backupSyncIntervalMs: 600000
            }),
            takeoverOnConflict: true,
            restartOnAuthFail: true,
        });

        this.currentClient = client;
        this.wwjsClient = null;

        client.initialize().catch(error => {
            console.error('WWJS CLIENT INITIALIZATION FAILED', error);
            if (this.currentClient === client) this.currentClient = null;
            this.scheduleReconnect(`client.initialize failed: ${error.message}`);
        });
    
        client.on('qr', qr => {
            console.log("QRCODE READY")
            // qrcode.generate(qr, { small: true });
            this.websocketServer.emit('qrcode', qr);
        });
    
        client.on('authenticated', () => {
            console.log("AUTHENTICATED")
        });

        client.on('ready', async () => {
            console.log("READY");
            this.wwjsClient = client;
            this.reconnectAttempts = 0;
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

        client.on('remote_session_saved', () => {
            console.log("REMOTE SESSION SAVED");
        });
    
        client.on('auth_failure', msg => {
            console.error('AUTHENTICATION FAILURE', msg);
            this.scheduleReconnect(`auth_failure: ${msg}`);
        });
    
        client.on('disconnected', (reason) => {
            console.log('DISCONNECTED', reason);
            if (this.currentClient === client) this.currentClient = null;
            this.scheduleReconnect(`disconnected: ${reason}`);
        });

        this.ensureWatchdog();
        
        return client;
    }

    private async destroyCurrentClient() {
        const client = this.currentClient;
        this.currentClient = null;
        this.wwjsClient = null;
        if (!client) return;

        this.destroying = true;
        try {
            await this.withTimeout(client.destroy(), 15000, 'client.destroy');
        } catch (error) {
            console.error('WWJS CLIENT: destroy failed', error.message);
        } finally {
            this.destroying = false;
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

    private ensureWatchdog() {
        if (this.watchdogInterval) return;
        this.watchdogInterval = setInterval(() => {
            this.checkClientHealth();
        }, WATCHDOG_INTERVAL_MS);
    }

    private async checkClientHealth() {
        const client = this.currentClient;
        if (!client || client !== this.currentClient) return;

        let state: string | null = null;
        try {
            state = await this.withTimeout(client.getState(), SEND_MESSAGE_TIMEOUT_MS, 'watchdog getState');
        } catch (error) {
            if (this.currentClient !== client) return;
            console.error('WATCHDOG: state check failed, client is stuck', error.message);
            this.scheduleReconnect(`watchdog: state check failed (${error.message})`);
            return;
        }
        if (!state || this.currentClient !== client) return; // still starting up, waiting for a QR scan, or replaced

        const stuck = !READY_STATES.includes(state) &&
            state !== WAState.UNPAIRED &&
            state !== WAState.UNPAIRED_IDLE;
        if (stuck) {
            console.warn(`WATCHDOG: client stuck in ${state}, reconnecting`);
            this.scheduleReconnect(`watchdog: client state ${state}`);
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
            return {
                message: messagePayload.message,
                phoneNumber: messagePayload.phoneNumber,
                success: true
            }
        } catch (error) {
            console.error('Failed to send WhatsApp message', error);
            throw new BadRequestException(`Failed to send WhatsApp message: ${error.message}`);
        }
    }


}
