import AdmZip from 'adm-zip';
import { decode } from './protobuffer';

import { httpGetBinary } from './utils';

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
    incrementality: "FULL_DATASET" | "DIFFERENTIAL",
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

export async function realtime(): Promise<FeedMessage<TripUpdateEntity>> {
    const buffer = await getGTFS(`${apiRoot}/TripUpdates`);
    const json = await decode('gtfs/gtfs-realtime.proto', 'FeedMessage', buffer);
    return json as FeedMessage<TripUpdateEntity>;
}

export class ScheduleUpdater {
    private url: string;
    private cachePath: string;
    private updateFrequency = 24 * 60 * 60 * 1000;
    private updateCheckFrequency = 1 * 60 * 1000;

    public constructor(url: string, cachePath: string) {
        this.url = url;
        this.cachePath = cachePath;
    }


    public async update(): Promise<void> {
        const timestamp = new Date().toISOString().replace(/:/g, '');
        const zipData = await httpGetBinary(this.url);
        const zip = new AdmZip(zipData);
        await zip.extractAllToAsync(`${this.cachePath}/schedule/${timestamp}`, true);

        // TODO: Proper log system
        console.log("Schedule updated");
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
