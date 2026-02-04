import * as fs from 'fs';
import * as path from 'path';

import * as utils from './utils';

type LogLevel = 'Info' | 'Warning' | 'Error'

export default class Logger {
    private static instance: Logger | null = null;
    private logPath: string;
    private logFile: string;

    private static console: { 
        [key in LogLevel]: (...data: any[]) => void 
    } = {
        'Info': console.log,
        'Warning': console.warn,
        'Error': console.error
    }; 

    public constructor(logPath: string) {
        this.logPath = logPath;
        this.logFile = path.resolve(this.logPath, utils.ISOTimestamp(true));
        Logger.instance = this;
    }

    private log(
        logLevel: LogLevel='Info',
        message: string, 
        err?: unknown
    ): Promise<void> {
        const timestamp = utils.ISOTimestamp();

        let formattedMessage = `${timestamp} | ${logLevel} | ${message}`;
        Logger.console[logLevel](formattedMessage);

        formattedMessage += '\n';

        if (err && err instanceof Error) {
            console.error(err);
            
            if (err.stack) {
                formattedMessage += `${err.stack}\n`;
            }
        }

        const options: fs.WriteFileOptions = {
            encoding: 'utf8',
            flag: 'a'
        };

        return new Promise((resolve, reject) => {
            fs.appendFile(this.logFile, formattedMessage, options, (err) => {
                if (err) {
                    console.error(err);
                    reject();
                }
                else {
                    resolve();
                }
            });
        });
    }

    public static async log(
        logLevel: LogLevel='Info',
        message: string,
        err?: unknown
    ): Promise<void> {
        if (!Logger.instance) {
            console.error("No instance of Logger available to log message");
        }
        else {
            await Logger.instance.log(logLevel, message, err);
        }
    }

    public static logInfo(message: string) {
        Logger.log('Info', message);
    }

    public static logWarning(message: string) {
        Logger.log('Warning', message);
    }

    public static logError(message: string, err?: unknown) {
        Logger.log('Error', message, err);
    }
}