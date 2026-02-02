import * as fs from 'fs';

export function readFile(path: string): Promise<string> {
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

export function listDirectory(path: string): Promise<string[]> {
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

export function createDirectory(path: string): Promise<void> {
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

export function removeDirectory(path: string): Promise<void> {
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

export function parseISODate(isoString: string): Date | null {
    isoString = isoString.replaceAll('_', ':')
    const date = new Date(isoString);

    const validDate = !isNaN(date.getTime());
    if (!validDate) return null;

    return date;
}
