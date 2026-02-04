import { PathLike } from 'fs';
import { readFile } from './utils';

export type CSVRecord = object;

type CSVCasts<TCSVRecord extends CSVRecord> = { 
    [TKey in keyof TCSVRecord]?: (columnName: string) => TCSVRecord[TKey] 
};

export function readCSVFile<TCSVRecord extends CSVRecord>(
    path: PathLike,
    casts?: CSVCasts<TCSVRecord>
): Promise<TCSVRecord[]> {
    return new Promise<TCSVRecord[]>((resolve, reject) => {
        readFile(path).then((data) => {
            resolve(parse(data, casts));
        }).catch(reject);
    });
}

export function parse<TCSVRecord extends CSVRecord>(
    string: string,
    casts?: CSVCasts<TCSVRecord>
): TCSVRecord[] {
    // TODO: Add no header option?
    const rows = string.split('\n');

    const header = rows[0] as string;
    const columnNames = header.split(',').map((columnName) => {
        return columnName.replaceAll('\r', '');
    });

    const records = rows.map((row) => {
        const values = row.split(',');
        const record = { } as Record<string, unknown>;

        columnNames.forEach((columnName, index) => {
            const cast = casts ? casts[columnName as keyof TCSVRecord] : null;
            const valueString = values[index]?.replaceAll('\r', '') as string;
            const value = cast ? cast(valueString) : valueString;
            record[columnName] = value;
        });

        return record as TCSVRecord;
    });

    return records;
}
