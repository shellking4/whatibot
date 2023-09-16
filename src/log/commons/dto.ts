export class RequestDto {
    correlationKey: string
    method: string;
    url: string;
    statusCode: string;
    userAgent: string;
    clientIp: string;
    userId: string;
    contentLength?: string;
    latency: string;
    metadata?: string;
}

export class LogDto {
    level: string;
    content: string;
}