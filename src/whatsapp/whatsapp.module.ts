import { MiddlewareConsumer, Module } from '@nestjs/common';
import { WhatsappService } from './services/whatsapp.service';
import { WhatsappController } from './controllers/whatsapp.controller';
import { AuthMiddleware } from './commons/auth-middleware';

@Module({
  providers: [WhatsappService],
  controllers: [WhatsappController]
})
export class WhatsappModule {

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuthMiddleware).forRoutes(
      'whatsapp/init-client',
      'whatsapp/send-message'
    );
  }
  
}
