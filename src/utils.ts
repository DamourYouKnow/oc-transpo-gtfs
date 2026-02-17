import * as fs from 'fs';

export function readFile(path: fs.PathLike): Promise<string> {
    return new Promise((resolve, reject) => {
        fs.readFile(path, (err, data) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(data.toString());
            }
        });
    });
}

export function listDirectory(path: fs.PathLike): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        fs.readdir(path, (err, data) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(data);
            }
        });
    });
}

export function createDirectory(path: fs.PathLike): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        fs.mkdir(path, { recursive: true }, (err) => {
            if (err) {
                reject(err);
            }
            else {
                resolve();
            }
        });
    })
}

export function removeDirectory(path: fs.PathLike): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        fs.rm(path, { recursive: true, force: true }, (err) => {
            if (err) {
                reject(err);
            }
            else {
                resolve();
            }
        });
    }) 
}

export type RecordKey = string | number | symbol;

export function remap<TKey extends RecordKey, TValue, TResult>(
    obj: Record<TKey, TValue>,
    func: (value: TValue) => TResult 
): Record<TKey, TResult> {
    const result: Record<string, TResult> = {};

    for (const key in obj) {
        result[key] = func(obj[key] as TValue);
    }

    return result as Record<TKey, TResult>;
}

export function mappedPromises<TKey extends RecordKey, TResult>(
    promiseMap: Record<TKey, Promise<TResult>>
): Promise<Record<TKey, TResult>> {
    const promises = Object.values(promiseMap) as Promise<TResult>[];
    const keys = Object.keys(promiseMap);
    
    return new Promise<Record<TKey, TResult>>((resolve, reject) => {
        Promise.all(promises).then((results) => {
            const resultMap: Record<string, TResult> = {};

            for (let index = 0; index < results.length; index++) {
                const key = keys[index] as string;
                resultMap[key] = results[index] as TResult;
            }

            resolve(resultMap as Record<TKey, TResult>);
        }).catch(reject);
    });
}

async function add(a: number, b: number): Promise<number> {
    return await a + b; 
}

export function httpGetBinary(
    url: string,
    headers: Record<string, string> = {}
): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
        fetch(url, { 
            headers: {
                ...{
                    'Cache-Control': 'no-cache',
                    'Content-Type': 'application/octet-stream'
                },
                ...headers
            }
        }).then((response) => {
            return response.blob();
        }).then((blob) => {
            return blob.arrayBuffer();
        }).then((data) => {
            resolve(Buffer.from(data));
        }).catch((err) => {
            reject(err);
        });
    });
}

export function ISOTimestamp(fileSafe: boolean=false): string {
    const now = new Date(Date.now());
    const timestamp = now.toISOString();

    return fileSafe ? timestamp.replaceAll(':', '_') : timestamp;
}

export function parseISODate(isoString: string): Date | null {
    isoString = isoString.replaceAll('_', ':')
    const date = new Date(isoString);

    const validDate = !isNaN(date.getTime());
    if (!validDate) return null;

    return date;
}

export const supportedTimezones = new Set(Intl.supportedValuesOf("timeZone"));

export function applyTimezone(date: Date, timezone: string): Date {
    // TODO: Use library moment-js?
    // TODO: Handle incorrect timezone?
    return new Date(date.toLocaleString('en-US', {
        timeZone: timezone
    }));
}

export function applyTimestamp(
    date: Date, 
    timestamp: string,
    timezone?: string
): Date {
    const modifiedDate = new Date(date.getTime());
     
    const hours = Number(timestamp.slice(0, 2));
    const minutes = Number(timestamp.slice(3, 5));
    const seconds = Number(timestamp.slice(6, 8));
 
    modifiedDate.setHours(hours);
    modifiedDate.setMinutes(minutes);
    modifiedDate.setSeconds(seconds);
 
    return timezone ? applyTimezone(modifiedDate, timezone) : modifiedDate;
}

export function hyphenateYYYYMMDD(dateString: string): string {
    const year = dateString.slice(0, 4);
    const month = dateString.slice(4, 6);
    const day = dateString.slice(6, 8);
    return `${year}-${month}-${day}`;
}

type MemoryUnitPrefix = 'B' | 'KB' | 'MB' | 'GB'; 

export function heapMemoryUsage(
    prefix: MemoryUnitPrefix = 'MB'
): { used: number, total: number, display: string } {
    const memory = process.memoryUsage();
    
    const prefixMagnitudes: {[prefix in MemoryUnitPrefix]: number} = {
        'B': 0,
        'KB': 1,
        'MB': 2,
        'GB': 3 
    };

    const usedBytes = memory.heapUsed + memory.arrayBuffers;
    const used = usedBytes / Math.pow(1024, prefixMagnitudes[prefix]);
    const total = memory.rss / Math.pow(1024, prefixMagnitudes[prefix]);
    
    return {
        used: used,
        total: total,
        display: `${used.toFixed(2)} / ${total.toFixed(2)} ${prefix}`
    };
}
