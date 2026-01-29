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

