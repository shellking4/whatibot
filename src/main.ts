import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { appLogger } from './log/commons/app-logger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';
import { join } from 'path';

// whatsapp-web.js fires some promises without handling them (e.g. RemoteAuth's session backups to R2).
// On Node >= 15 one failed backup would otherwise kill the whole service.
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION', reason);
});

async function bootstrap() {
  const appOptions = {
    cors: true,
    rawBody: true, 
    bufferLogs: true,
    logger: appLogger
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule, appOptions);
  app.useStaticAssets(join(__dirname, '..', 'static'))
  app.useGlobalPipes(
    new ValidationPipe({
      exceptionFactory: (errors: ValidationError[]) => {
        console.log(errors)
        throw new BadRequestException(errors);
      }, 
      transform: true
    })
  );
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  await app.listen(3009, '0.0.0.0');
}
bootstrap();
