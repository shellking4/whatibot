import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { getErrorStatus } from './constants';


@Catch()
export class AppExceptionFilter implements ExceptionFilter {

    private readonly logger = new Logger(AppExceptionFilter.name);
    
    async catch(exception: unknown, host: ArgumentsHost) {        
        const context = host.switchToHttp();
        const response = context.getResponse<Response>();
        const request = context.getRequest<Request>();
        
        let message = (exception as any).message.message;
        let code = 'HttpException';
        let status = HttpStatus.INTERNAL_SERVER_ERROR;

        const errorStatus = getErrorStatus(exception);

        message = errorStatus.message;
        code = errorStatus.code;
        status = errorStatus.status;

        response.status(status).json(GlobalResponseError(status, message, code, request, { short: true }));
    }
}

export const GlobalResponseError: (
    statusCode: number,
    message: string,
    code: string,
    request: Request,
    options: { short: boolean }) => IResponseError = (
        statusCode: number,
        message: string,
        code: string,
        request: Request,
        options: { short: boolean }
    ): any => {
        return !options.short ? {
            statusCode: statusCode,
            message,
            code,
            timestamp: new Date().toISOString(),
            path: request.url,
            method: request.method
        } : message
    };

export interface IResponseError {
    statusCode: number;
    message: string | string[];
    code: string;
    timestamp: string;
    path: string;
    method: string;
}