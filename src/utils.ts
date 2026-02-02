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