import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
 
export const requests = sqliteTable('requests', {
    id: integer('id').primaryKey(),
    correlationKey: text('correlation_key'),
    method: text('method'),
    url: text('url'),
    statusCode: text('status_code'),
    userAgent: text('user_agent'),
    clientIp: text('client_ip'),
    userId: text('user_id'),
    contentLength: text('content_length'),
    latency: text('latency'),
    metadata: text('metadata')
  }
);
 
export const logs = sqliteTable('logs', {
  id: integer('id').primaryKey(),
  level: text('level'),
  content: text('content')
})