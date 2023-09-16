import { Injectable, NotFoundException } from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';

@Injectable()
export class AppService {

  constructor() {

  }

  tools: string[] = [
    "knife",
    "drill",
    "scissors",
    "hammer"
  ]

  findTools() {
    return this.tools;
  }

  findToolByName(name: string) {
    let tool = this.tools.find(tool => tool === name);
    if (!tool) {
      throw new NotFoundException(`Tool of that name does not exist`)
    }
    return tool;
  }

  createTool(toolPayload: ToolDto) {
    this.tools.push(toolPayload.name);
    return this.tools;
  }


}

export class ToolDto {

  @IsString()
  name: string;
}
