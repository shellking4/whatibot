import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { LoggingService } from './logging-service';
import { getErrorStatus } from './constants';
import { uuid } from 'uuidv4';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  constructor(private loggingService: LoggingService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() === 'http') {
      return this.logHttpCall(context, next);
    }
  }

  private logHttpCall(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest();
    const userAgent = request.get('user-agent') || '';
    const { ip: clientIp, method, path: url } = request;
    const correlationKey = uuid();
    const userId = request.user?.userId;

    const now = Date.now();

    return next.handle().pipe(
      tap({
        next: async (_) => {
          const response = context.switchToHttp().getResponse();
          const { statusCode } = response;
          const contentLength = response.get('content-length');
          const latency = Date.now() - now;
          await this.loggingService.writeRequest({
            correlationKey: correlationKey,
            method: method,
            url: url,
            statusCode: statusCode,
            userAgent: userAgent,
            clientIp: clientIp,
            userId: userId,
            contentLength: contentLength,
            latency: `${latency}ms`
          });
          this.logger.log(`${correlationKey} : ${method} : ${url} : ${statusCode} : ${userAgent} : ${clientIp} : ${userId} : ${contentLength} : ${latency}ms`);
        },
        error: async (error) => {
          const errorStatus = getErrorStatus(error);
          const { status } = errorStatus;
          const latency = Date.now() - now;
          await this.loggingService.writeRequest({
            correlationKey: correlationKey,
            method: method,
            url: url,
            statusCode: status.toString(),
            userAgent: userAgent,
            clientIp: clientIp,
            userId: userId,
            latency: `${latency}ms`,
            metadata: `${error.stack}`
          })
          this.logger.error(`${correlationKey} : ${method} : ${url} : ${status} : ${userAgent} : ${clientIp} : ${userId} : ${error} : ${latency}ms`);
        }
      }),
    );
  }
}