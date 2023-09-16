import { Body, Controller, Get, Post } from '@nestjs/common';
import { WhatsappService } from '../services/whatsapp.service';
import { WhatsappMessagePayloadDto } from '../dtos/request.dto';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Post('send-message')
  async sendMessage(@Body() body: WhatsappMessagePayloadDto): Promise<WhatsappMessagePayloadDto> {
    return await this.whatsappService.sendWhatsappMessage(body);
  }

  @Get('send-message')
  async getMessage(): Promise<WhatsappMessagePayloadDto> {
    return {
      phoneNumber: "62798845",
      message: "Hello"
    };
  }


}
