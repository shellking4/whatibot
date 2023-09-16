import { Body, Controller, Post } from '@nestjs/common';
import { WhatsappService } from '../services/whatsapp.service';
import { WhatsappMessagePayloadDto } from '../dtos/request.dto';

@Controller()
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Post('whatsapp-message')
  async createTool(@Body() body: WhatsappMessagePayloadDto): Promise<WhatsappMessagePayloadDto> {
    return await this.whatsappService.sendWhatsappMessage(body);
  }


}
