import AdmZip from 'adm-zip';
import { decode } from './protobuffer';

import { 
    httpGetBinary,
    createDirectory, 
    listDirectory,
    parseISODate, 
    removeDirectory
} from './utils';

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
    private updateCheckFrequency = 1 * 60 * 1000; // 1 minute
    private timeout: NodeJS.Timeout | null = null;

    public constructor(url: string, cachePath: string) {
        this.url = url;
        this.cachePath = cachePath;
    }

    public async run() {
        await this.update();

        this.timeout = setInterval(() => {
            this.update();
        }, this.updateCheckFrequency);
    }

    public stop() {
        if (this.timeout) {
            clearInterval(this.timeout);
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
            await zip.extractAllToAsync(`${this.cachePath}${timestamp}`, true);

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
            return removeDirectory(`${this.cachePath}${name}`);
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
