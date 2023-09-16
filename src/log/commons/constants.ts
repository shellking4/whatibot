import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as Database from 'better-sqlite3';
import { BadRequestException, HttpException, HttpStatus, InternalServerErrorException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ValidationError } from 'class-validator';

export const PG_CONNECTION = 'PG_CONNECTION';

const sqlite = new Database('src/log/commons/logs.db');
sqlite.pragma('journal_mode = WAL');
export const db: BetterSQLite3Database = drizzle(sqlite);


export const getErrorStatus = (exception: any) => {
    let message = (exception as any).message.message;
    let code = 'HttpException';
    let status = HttpStatus.INTERNAL_SERVER_ERROR;

    switch (exception.constructor) {
        case HttpException:
            status = (exception as HttpException).getStatus();
            message = getErrorsMessages(exception);
            break;
        case UnauthorizedException:
            status = (exception as HttpException).getStatus();
            message = getErrorsMessages(exception);
            code = (exception as any).code;
            break;
        case BadRequestException:
            status = (exception as BadRequestException).getStatus();
            message = getErrorsMessages(exception);
            code = (exception as any).code;
            break;
        case NotFoundException:
            status = (exception as NotFoundException).getStatus();
            message = (exception as NotFoundException).message;
            code = (exception as any).code;
            break;
        case Error:
            if ((exception as any).code === "ENOENT") {
                status = HttpStatus.NOT_FOUND
                message = `Endpoint or file not found ${exception}`;
                code = (exception as any).code;
            }
            break;
        default:
            status = HttpStatus.INTERNAL_SERVER_ERROR;
            message = (exception as InternalServerErrorException).message;
            code = (exception as any).code;
            break;
    }

    return {
        message,
        code,
        status
    }
}

export const getErrorsMessages = (exception: any) => {
    let exceptionResponse = (exception as BadRequestException).getResponse();
    let errorsObjects = (exceptionResponse as any).message
    if (errorsObjects instanceof Array && errorsObjects.some((error) => error instanceof ValidationError)) {
        let errorMessages: string[] = [];
        errorsObjects.forEach(
            (errorObject) => {
                let constraints = errorObject.constraints;
                Object.keys(constraints).forEach(
                    (key) => {
                        errorMessages.push(constraints[key]);
                    }
                );
            }
        );
        return errorMessages;
    }
    return (exceptionResponse as any).message;
}