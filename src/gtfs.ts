import * as path from 'path';

import AdmZip from 'adm-zip';
import { decode } from './protobuffer';

import Logger from './logger';
import * as utils from './utils';
import { CSVRecord, readCSVFile } from './csv';
import TaskScheduler from './task-scheduler';

// TODO: Move to index.ts
const apiHost = "https://nextrip-public-api.azure-api.net"
const tripUpdateRoot = `${apiHost}/octranspo/gtfs-rt-tp/beta/v1`;
const vehiclePositionRoot = `${apiHost}/octranspo/gtfs-rt-vp/beta/v1`;

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

// Trip update
// TODO: Merge into single nested interface
interface TripUpdateEntity extends FeedEntity {
    tripUpdate: {
        trip: {
            tripId: string,
            startTime: string,
            startDate: string,
            scheduleRelationship: ScheduleRelationship,
            routeId: string
        },
        stopTimeUpdate:  {
            stopSequence: number,
            arrival: {
                time: string
            },
            stopId: string,
            scheduleRelationship: ScheduleRelationship
        }[]
    }
}   


// Vehicle position
// TODO: Merge into single nested interface
interface VehiclePositionEntity extends FeedEntity {
    
}

// TODO: Better name for this type?
type ScheduleType = 'agency' | 'calendar_dates' | 'calendar' | 'feed_info'
    | 'routes' | 'shapes' | 'stop_times' | 'stops' | 'trips';

enum RouteType {
    Tram = 0,
    Subway = 1,
    Rail = 2,
    Bus = 3,
    Ferry = 4,
    Cable = 5,
    AerialLift = 6,
    Funicular = 7,
    TrolleyBus = 11,
    Monorail = 12
}

// https://gtfs.org/documentation/schedule/reference/#agencytxt
interface AgencyCSVRecord extends CSVRecord {
    agency_id: string,
    agency_name: string,
    agency_url: string,
    agency_timezone: string,
    agency_lang?: string,
    agency_phone?: string,
    agency_fare_url?: string,
    agency_email?: string
}

interface CalendarDateCSVRecord extends CSVRecord {
    service_id: string,
    date: string,
    exception_type: string
}

interface CalendarCSVRecord extends CSVRecord {
    service_id: string,
    monday: string,
    tuesday: string,
    wednesday: string,
    thursday: string,
    friday: string,
    saturday: string,
    sunday: string,
    start_date: string,
    end_date: string
}

interface FeedInfoRecord extends CSVRecord {
    feed_publisher_name: string,
    feed_publisher_url: string,
    feed_lang: string,
    default_lang: string,
    feed_start_date: string,
    feed_end_date: string,
    feed_version: string,
    feed_contact_email: string,
    feed_contact_url: string
}

interface RouteCSVRecord extends CSVRecord {
    route_id: string,
    agency_id?: string,
    route_short_name?: string,
    route_long_name?: string,
    route_desc?: string,
    route_type: string,
    route_url?: string,
    route_color?: string,
    route_text_color?: string,
    route_sort_order?: string,
    continuous_pickup?: string,
    continuous_drop_off?: string,
    network_id: string
}

interface ShapeCSVRecord extends CSVRecord {
    shape_id: string,
    shape_pt_lat: string,
    shape_pt_lon: string,
    shape_pt_sequence: string,
    shape_dist_traveled: string
}

interface StopTimeCSVRecord extends CSVRecord {
    trip_id: string,
    arrival_time?: string,
    departure_time?: string,
    stop_id?: string,
    stop_sequence: string,
    stop_headsign?: string,
    pickup_type?: string,
    drop_off_type?: string,
    shape_dist_traveled?: string,
    timepoint?: string
}

interface StopCSVRecord extends CSVRecord {
    stop_id: string,
    stop_code?: string,
    stop_name: string,
    tts_stop_name?: string,
    stop_desc?: string,
    stop_lat: string,
    stop_lon: string,
    zone_id?: string,
    stop_url?: string,
    location_type?: string,
    parent_station?: string,
    stop_timezone?: string,
    wheelchair_boarding?: string,
    level_id?: string,
    platform_code?: string
}

interface TripCSVRecord extends CSVRecord {
    route_id: string,
    service_id: string,
    trip_id: string,
    trip_headsign?: string,
    trip_short_name?: string,
    direction_id?: string,
    block_id?: string,
    shape_id?: string,
    wheelchair_accessible?: string,
    bikes_allowed?: string,
    cars_allowed?: string
}

type TripUpdateMessage = Promise<FeedMessage<TripUpdateEntity>>;
type VehiclePositionMessage = Promise<FeedMessage<VehiclePositionEntity>>;

export async function tripUpdates(): Promise<TripUpdateMessage> {
    const buffer = await getGTFS(`${tripUpdateRoot}/TripUpdates`);

    // TODO: Path resolution for .proto file
    const json = await decode(
        'gtfs/gtfs-realtime.proto', 
        'FeedMessage', 
        buffer
    );
    
    return json as TripUpdateMessage;
}

export async function vehiclePositions(): Promise<VehiclePositionMessage> {
    const buffer = await getGTFS(`${vehiclePositionRoot}/VehiclePositions`);

    // TODO: Path resolution for .proto file
    const json = await decode(
        'gtfs/gtfs-realtime.proto',
        'FeedMessage',
        buffer
    );

    return json as VehiclePositionMessage;
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
        this.scheduler = new TaskScheduler(
            updateCheckFrequency, 
            this.update.bind(this)
        );
    }

    public async start() {
        Logger.logInfo("Schedule manager started");
        await this.scheduler.start();
    }

    public async ReadData(): Promise<void> {
        try {
            const cacheDirectoryNames = await utils.listDirectory(
                this.cachePath
            );

            if (cacheDirectoryNames.length == 0) return;

            const cacheDirectoryName = cacheDirectoryNames[0] as string; 
            const filepath = path.resolve(
                this.cachePath, 
                cacheDirectoryName, 
                'stops.txt'
            );

            const stops = await readCSVFile<StopCSVRecord>(filepath);

            Logger.logInfo(`Schedule ${cacheDirectoryName} read from cache`);
        }
        catch (err) {
            Logger.logError("Failed to read from cache", err);
        }
    } 

    public async update(): Promise<void> {
        try {
            // Ensure cache directory exists
            await utils.createDirectory(this.cachePath);

            const updateRequired = await this.checkForUpdate();
            if (!updateRequired) return;

            const timestamp = utils.ISOTimestamp(true);
            const zipPath = path.resolve(this.cachePath, timestamp);

            const zipData = await utils.httpGetBinary(this.url);
            const zip = new AdmZip(zipData);
            await zip.extractAllToAsync(zipPath, true);

            // TODO: Proper log system
            Logger.logInfo(`Schedule cache updated: ${zipPath}`);
        }
        catch (err) {
            Logger.logError("Schedule cache update failed", err);
        }
    }

    private async checkForUpdate(): Promise<boolean> {
        const names = await utils.listDirectory(this.cachePath)
        if (names.length == 0) return true;
        
        // Identify expired or invalid items
        const flaggedForRemove = names.filter((name) => {
            const date = utils.parseISODate(name);
            if (!date) return true;

            const delta = Date.now() - date.getTime();
            return delta > this.updateFrequency;
        });

        // Remove expired or invalid items in parallel
        const removeDirectoryPromises = flaggedForRemove.map((name) => {
            return utils.removeDirectory(path.resolve(this.cachePath, name));
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

    const data = await utils.httpGetBinary(url, {
        'Ocp-Apim-Subscription-Key': appKey
    });

    Logger.logInfo(`GTFS realtime data downloaded from ${url}`);

    return data;
};
