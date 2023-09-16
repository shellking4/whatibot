import { Module } from '@nestjs/common';
import { WhatsappService } from './services/whatsapp.service';
import { WhatsappController } from './controllers/whatsapp.controller';

@Module({
  providers: [WhatsappService],
  controllers: [WhatsappController]
})
export class WhatsappModule {}
