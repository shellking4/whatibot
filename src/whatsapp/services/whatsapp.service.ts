import { Injectable } from '@nestjs/common';
import { pocketbase } from '../commons/rest-config';
import { RecordModel } from 'pocketbase';
import * as qrcode from "qrcode-terminal";
import { WAState } from 'whatsapp-web.js';
import { WhatsappMessagePayloadDto } from '../dtos/request.dto';
import { Logger } from '@nestjs/common';
import {
    ConnectedSocket,
    MessageBody,
    OnGatewayInit,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from "socket.io"


const { Client, LocalAuth } = require('whatsapp-web.js');



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
        const client = new Client({
            puppeteer: {
                headless: true,
                args: ['--no-sandbox'],
            },
            authStrategy: new LocalAuth({
                clientId: 'donald1234'
            }),
            restartOnAuthFail: true,
        });
        
        client.initialize();
    
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
            this.syncClientStateToPocketbase({ state: 'READY' });
            const chatId = (await client.getNumberId("62798845"))?._serialized!
            await this.wwjsClient.sendMessage(chatId, 'connected')
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
        const chatId = (await this.wwjsClient.getNumberId(messagePayload.phoneNumber))?._serialized!;
        await this.wwjsClient.sendMessage(chatId, messagePayload.message);
        return;
    }

    
    

}
