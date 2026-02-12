import * as fs from 'fs';
import Logger from './logger';

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
