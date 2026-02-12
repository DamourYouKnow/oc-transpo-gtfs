import * as fs from 'fs';
import * as path from 'path';

import * as utils from './utils';

type LogLevel = 'Info' | 'Warning' | 'Error' | 'Console';

type Color = string | number;

export default class Logger {
    private static instance: Logger | null = null;
    private logPath: string;
    private logFile: string;
    private labelOffset: number;

    private static console: { 
        [key in LogLevel]: (...data: any[]) => void 
    } = {
        Info: console.log,
        Warning: console.warn,
        Error: console.error,
        Console: console.log,
    }; 

    private static levelLabels: {[key in LogLevel]: string} = {
        Info: 'Info',
        Warning: 'Warning',
        Error: 'Error',
        Console: 'Console'
    }

    private static levelColors: {[key in LogLevel]?: Color } = {
        Info: '#999999',
        Warning: '#ffd100',
        Error: '#ed1c24'
    };

    public constructor(logPath: string) {
        this.logPath = logPath;
        
        this.logFile = path.resolve(
            this.logPath, 
            `${utils.ISOTimestamp(true)}.log`
        );

        this.labelOffset = Math.max(
            ...Object.values(Logger.levelLabels).map((label) => label.length)
        )

        Logger.instance = this;
    }

    public async start() {
        // Ensure log directory exists.
        await utils.createDirectory(this.logPath);
    }

    private async log(
        logLevel: LogLevel='Info',
        message: string, 
        err?: unknown
    ): Promise<void> {
        const timestamp = utils.ISOTimestamp();
        const levelLabel = Logger.levelLabels[logLevel].padStart(this.labelOffset);
        const levelColor = Logger.levelColors[logLevel];

        let formattedMessage = `${levelLabel} | ${timestamp} | ${message}`;
        Logger.console[logLevel](ansiColor(formattedMessage, levelColor));

        if (logLevel == 'Console') return;

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

    public static async logInfo(message: string) {
        await Logger.log('Info', message);
    }

    public static async logWarning(message: string) {
        await Logger.log('Warning', message);
    }

    public static async logError(message: string, err?: unknown) {
        await Logger.log('Error', message, err);
    }

    public static async logConsole(message: string) {
        await Logger.log('Console', message);
    }
}

function ansiColor(string: string, colorHex: Color | undefined) {
    if (colorHex == undefined) {
        return string;
    }

    if (typeof colorHex == 'number') {
        colorHex = colorHex.toString(16);
    }

    if (colorHex.startsWith('#')) {
        colorHex = colorHex.slice(1);
    }
    
    if (colorHex.length != 6) {
        return string;
    }

    const red = parseInt(colorHex.slice(0, 2), 16);
    const green = parseInt(colorHex.slice(2, 4), 16);
    const blue = parseInt(colorHex.slice(4), 16);

    return `\x1b[38;2;${red};${green};${blue}m${string}\x1b[0m`;
}
