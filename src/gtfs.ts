import * as path from 'path';

import AdmZip from 'adm-zip';
import { decode } from './protobuffer';

import { 
    httpGetBinary,
    createDirectory, 
    listDirectory,
    parseISODate, 
    removeDirectory
} from './utils';

import { CSVRecord, readCSVFile } from './csv';
import TaskScheduler from './task-scheduler';

// TODO: Move to index.ts
const apiHost = "https://nextrip-public-api.azure-api.net"
const apiRoot = `${apiHost}/octranspo/gtfs-rt-tp/beta/v1`;

// https://gtfs.org/documentation/realtime/reference/
type ScheduleRelationship = "SCHEDULED" | "ADDED" | "UNSCHEDULED" | "CANCELED"
        | "REPLACEMENT" | "DUPLICATED" | "NEW" | "DELETED";

export interface FeedMessage<TFeedEntity extends FeedEntity> {
    header: FeedHeader,
    entity: TFeedEntity[],
}

interface FeedHeader {
    gtfsRealtimeVersion: string,
    incrementality: 'FULL_DATASET' | 'DIFFERENTIAL',
    timestamp: string, // uint64
    feed_version: string | undefined
}

interface FeedEntity {
    id: string,
    is_deleted: boolean,
}

interface TripUpdateEntity extends FeedEntity {
    tripUpdate: TripUpdate
}   

interface TripUpdate {
    trip: Trip,
    stopTimeUpdate: StopTimeUpdate[]
}

interface Trip {
    tripId: string,
    startTime: string,
    startDate: string,
    scheduleRelationship: ScheduleRelationship,
    routeId: string
}

interface StopTimeUpdate {
    stopSequence: number,
    arrival: StopTimeEvent,
    stopId: string,
    scheduleRelationship: ScheduleRelationship
}

interface StopTimeEvent {
    time: string
}

// TODO: Better name for this type?
type ScheduleType = 'agency' | 'calendar_dates' | 'calendar' | 'feed_info'
    | 'routes' | 'shapes' | 'stop_times' | 'stops' | 'trips';

interface StopCSVRecord extends CSVRecord {
    stop_id: string,
    stop_code: string,
    stop_name: string,
    tts_stop_name: string,
    stop_desc: string,
    stop_lat: string,
    stop_lon: string,
    zone_id: string,
    stop_url: string,
    location_type: string,
    parent_station: string,
    stop_timezone: string,
    wheelchair_boarding: string,
    level_id: string,
    platform_code: string
}

export async function realtime(): Promise<FeedMessage<TripUpdateEntity>> {
    const buffer = await getGTFS(`${apiRoot}/TripUpdates`);

    const json = await decode(
        'gtfs/gtfs-realtime.proto', 
        'FeedMessage', buffer
    );
    
    return json as FeedMessage<TripUpdateEntity>;
}

export class ScheduleManager {
    private url: string;
    private cachePath: string;
    private updateFrequency = 24 * 60 * 60 * 1000; // 24 hours
    private scheduler: TaskScheduler;

    public constructor(
        url: string, 
        cachePath: string, 
        updateCheckFrequency: number
    ) {
        this.url = url;
        this.cachePath = cachePath;
        this.scheduler = new TaskScheduler(updateCheckFrequency, this.update);
    }

    public async start() {
        await this.scheduler.start();
    }

    public async ReadData(): Promise<void> {
        try {
            const cacheDirectoryNames = await listDirectory(this.cachePath);
            if (cacheDirectoryNames.length == 0) return;

            const cacheDirectoryName = cacheDirectoryNames[0] as string; 
            
            const stops = await readCSVFile<StopCSVRecord>(
                path.resolve(this.cachePath, cacheDirectoryName, 'stops.txt')
            );

            console.log(stops);
        }
        catch (err) {
            console.error(err);
        }
    } 

    public async update(): Promise<void> {
        try {
            // Ensure cache directory exists
            await createDirectory(this.cachePath);

            const updateRequired = await this.checkForUpdate();
            if (!updateRequired) return;

            const timestamp = new Date().toISOString().replaceAll(':', '_');
            const zipData = await httpGetBinary(this.url);
            const zip = new AdmZip(zipData);
            await zip.extractAllToAsync(
                path.resolve(this.cachePath, timestamp), 
                true
            );

            // TODO: Proper log system
            console.log("Schedule updated");
        }
        catch (err) {
            console.error(err);
        }
    }

    private async checkForUpdate(): Promise<boolean> {
        const names = await listDirectory(this.cachePath)
        if (names.length == 0) return true;
        
        // Identify expired or invalid items
        const flaggedForRemove = names.filter((name) => {
            const date = parseISODate(name);
            if (!date) return true;

            const delta = Date.now() - date.getTime();
            return delta > this.updateFrequency;
        });

        // Remove expired or invalid items in parallel
        const removeDirectoryPromises = flaggedForRemove.map((name) => {
            return removeDirectory(path.resolve(this.cachePath, name));
        });

        await Promise.all(removeDirectoryPromises);

        // Update required if all items are removed
        return flaggedForRemove.length >= names.length;
    }
}

async function getGTFS(url: string): Promise<Buffer> {
    const appKey = process.env.OC_TRANSPO_APP_KEY;
    if (!appKey) {
        throw Error("OC_TRANSPO_APP_KEY environment variable missing");
    }

    return await httpGetBinary(url, {
        'Ocp-Apim-Subscription-Key': appKey
    });
};
