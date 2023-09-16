import { Body, Controller, Post } from '@nestjs/common';
import { WhatsappService } from '../services/whatsapp.service';
import { WhatsappMessagePayloadDto } from '../dtos/request.dto';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Post('send-message')
  async sendMessage(@Body() body: WhatsappMessagePayloadDto): Promise<WhatsappMessagePayloadDto> {
    return await this.whatsappService.sendWhatsappMessage(body);
  }


}
