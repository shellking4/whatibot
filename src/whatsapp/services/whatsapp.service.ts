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


const { Client } = require('whatsapp-web.js');

@WebSocketGateway({ cors: true })
export class WhatsappService {

    wwjsClient: any;

    @WebSocketServer()
    websocketServer: Server;

    private logger: Logger = new Logger()

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

    initializeWWJSClient() {
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
            restartOnAuthFail: true,
        });

        client.initialize().catch(error => {
            console.error('WWJS CLIENT INITIALIZATION FAILED', error);
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
        });
    
        client.on('disconnected', (reason) => {
            console.log('DISCONNECTED', reason);
        });
        
        return client;
    }


    async sendWhatsappMessage(messagePayload: WhatsappMessagePayloadDto) {
        try {
            const phoneNumber = messagePayload.phoneNumber.replace('+', '').replace(/\s+/g, '');
            const chatId = (await this.wwjsClient.getNumberId(phoneNumber))?._serialized!;
            await this.wwjsClient.sendMessage(chatId, messagePayload.message);
            return {
                message: messagePayload.message,
                phoneNumber: messagePayload.phoneNumber,
                success: true
            }
        } catch (error) {
            console.log("error", error)
            throw new BadRequestException('Failed to send WhatsApp message', error);
        }
    }


}
