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



type PromiseMap<TKey, TResult> = {[key in keyof TKey]: Promise<TResult>};
type PromiseMapResult<TKey, TResult> = {[key in keyof TKey]: TResult }; 

export function mappedPromises<TKey, TResult>(
    promiseMap: PromiseMap<TKey, TResult>
): Promise<PromiseMapResult<TKey, TResult>> {
    const promises = Object.values(promiseMap) as Promise<TResult>[];
    
    return new Promise<PromiseMapResult<TKey, TResult>>((resolve, reject) => {
        
    });
}

async function add(a: number, b: number) {
    return await a + b; 
}

async function test() {
    const results = await mappedPromises<string, number>({
        'promiseA': add(1, 1),
        'promiseB': add(-1, 1)
    });

    const test = results.promiseA;
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
