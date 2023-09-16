import { WinstonModule } from "nest-winston";
import { format, transports } from "winston";
import { loggingService } from "./logging-service";

const writeLog = (writeParams: { 
  level: 'info' | 'warning' | 'error', 
  log: any,
  persist: boolean
}) => {
  let level = writeParams.level;
  let log = writeParams.log;
  let persist = writeParams.persist;
  const logContent = `[Nest] 5277 - ${log.timestamp} : ${log.context} : ${log.level} : ${log.message} : ${log.stack}`
  if (persist) {
    loggingService.writeLog({
      level: level,
      content: logContent
    }).catch(error => {
      console.log(error);
    });
  }
  return logContent;
}

export const appLogger = WinstonModule.createLogger({
  transports: [
    new transports.Console({
      level: "info",
      format: format.combine(
        format.timestamp({ format: "DD/MM/YYYY, HH:mm:ss" }),
        format.colorize({ all: true }),
        format.printf((log) => {
          return writeLog({ 
            level: 'info',
            log: log,
            persist: false
          });
        }),
      ),
    }),
    new transports.Console({
      level: "warning",
      format: format.combine(
        format.timestamp({ format: "DD/MM/YYYY, HH:mm:ss" }),
        format.colorize({ level: true }),
        format.printf((log) => {
          return writeLog({
            level: 'warning',
            log: log,
            persist: false
          });
        })
      ),
    }),
    new transports.Console({
      level: "error",
      format: format.combine(
        format.timestamp({ format: "DD/MM/YYYY, HH:mm:ss" }),
        format.colorize({ level: true }),
        format.printf((log) => {
          return writeLog({
            level: 'error',
            log: log,
            persist: false
          });
        })
      ),
    }),
  ],
})