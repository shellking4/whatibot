import { Inject, Injectable } from '@nestjs/common';
import { PG_CONNECTION, db as sqliteDb } from './constants';
import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { LogDto, RequestDto } from './dto';
import { logs, requests } from './schema';

@Injectable()
export class LoggingService {
    constructor(
        @Inject(PG_CONNECTION) private db?: BetterSQLite3Database,
    ) { 
        this.database = this.db ? this.db : sqliteDb
    }

    private database: BetterSQLite3Database;

    async writeLog(logData: LogDto) {
        const insertedLog = this.database
            .insert(logs)
            .values({ ...logData })
            .returning();
        return insertedLog;
    }

    async writeRequest(requestData: RequestDto) {
        const insertedRequest = this.database
            .insert(requests)
            .values({ ...requestData })
            .returning();
        return insertedRequest;
    }
}

export const loggingService = new LoggingService();
