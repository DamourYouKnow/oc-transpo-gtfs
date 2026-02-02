import { readFile } from './utils';


// TODO: Move to GTFS
interface StopCSVRecord {
    stop_id: number,
    stop_code: string
}


export function readCSVFile() {

}


type CSVCasts<TCSVRecord> = { 
    [TKey in keyof TCSVRecord]?: (columnName: string) => TCSVRecord[TKey] 
};


export function parse<TCSVRecord extends object>(
    string: string,
    casts: CSVCasts<TCSVRecord>
): TCSVRecord[] {
    // TODO: Add no header option?
    const rows = string.split('\n');

    const header = rows[0] as string;
    const columnNames = header.split(',');

    return rows.map((row) => {
        const values = row.split(',');
        const record: TCSVRecord = { } as TCSVRecord;

        columnNames.forEach((columnName, index) => {
            const cast = casts[columnName];
            record[columnName] = values[index];
        });

        return record;
    });
}


function test() {
    parse<StopCSVRecord>(
        "",
        {
            'stop_id': (value: string) => Number(value),
            'stop_code': (value: string) => value
        }
    );


    const test: { [key: string ]: number } = {
        'd': 23
    };
}



