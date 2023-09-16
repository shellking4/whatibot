import { Body, Controller, Post, Get, Param } from '@nestjs/common';
import { AppService, ToolDto } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('tools/:name')
  getToolByName(@Param('name') name: string): string {
    return this.appService.findToolByName(name);
  }

  @Get('tools')
  getTools(): string[] {
    return this.appService.findTools()
  }

  @Post('tools')
  createTool(@Body() body: ToolDto): string[] {
    return this.appService.createTool(body);
  }


}
