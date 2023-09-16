import { Body, Controller, Get, Post } from '@nestjs/common';
import { WhatsappService } from '../services/whatsapp.service';
import { WhatsappMessagePayloadDto } from '../dtos/request.dto';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Post('send-message')
  async sendMessage(@Body() body: WhatsappMessagePayloadDto): Promise<WhatsappMessagePayloadDto> {
    await this.whatsappService.sendWhatsappMessage(body);
    return body;
  }

  @Get('init-client')
  async getMessage(): Promise<any> {
    await this.whatsappService.initializeWWJSClient();
    return;
  }


}
