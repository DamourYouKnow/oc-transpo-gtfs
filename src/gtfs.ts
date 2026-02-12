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
    readonly header: FeedHeader,
    readonly entity: TFeedEntity[],
}

interface FeedHeader {
    readonly gtfsRealtimeVersion: string,
    readonly incrementality: 'FULL_DATASET' | 'DIFFERENTIAL',
    readonly timestamp: string, // uint64
    readonly feed_version: string | undefined
}

interface FeedEntity {
    readonly id: string,
    readonly is_deleted: boolean,
}

interface Trip {
    readonly tripId: string,
    readonly startTime: string,
    readonly startDate: string,
    readonly scheduleRelationship: ScheduleRelationship,
    readonly routeId: string
}

interface TripUpdateEntity extends FeedEntity {
    readonly tripUpdate: {
        readonly trip: Trip,
        readonly stopTimeUpdate:  {
            readonly stopSequence: number,
            readonly arrival: {
                readonly time: string
            },
            readonly stopId: string,
            readonly scheduleRelationship: ScheduleRelationship
        }[]
    }
}   

interface VehiclePositionEntity extends FeedEntity {
    readonly vehicle: {
        readonly trip: Trip,
        readonly position: {
            readonly lattitude: number
            readonly longitude: number
            readonly bearing: number
        },
        readonly timestamp: string
    }
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
    readonly agency_id: string,
    readonly agency_name: string,
    readonly agency_url: string,
    readonly agency_timezone: string,
    readonly agency_lang?: string,
    readonly agency_phone?: string,
    readonly agency_fare_url?: string,
    readonly agency_email?: string
}

interface CalendarDateCSVRecord extends CSVRecord {
    readonly service_id: string,
    readonly date: string,
    readonly exception_type: string
}

interface CalendarCSVRecord extends CSVRecord {
    readonly service_id: string,
    readonly monday: string,
    readonly tuesday: string,
    readonly wednesday: string,
    readonly thursday: string,
    readonly friday: string,
    readonly saturday: string,
    readonly sunday: string,
    readonly start_date: string,
    readonly end_date: string
}

interface FeedInfoCSVRecord extends CSVRecord {
    readonly feed_publisher_name: string,
    readonly feed_publisher_url: string,
    readonly feed_lang: string,
    readonly default_lang: string,
    readonly feed_start_date: string,
    readonly feed_end_date: string,
    readonly feed_version: string,
    readonly feed_contact_email: string,
    readonly feed_contact_url: string
}

interface RouteCSVRecord extends CSVRecord {
    readonly route_id: string,
    readonly agency_id?: string,
    readonly route_short_name?: string,
    readonly route_long_name?: string,
    readonly route_desc?: string,
    readonly route_type: string,
    readonly route_url?: string,
    readonly route_color?: string,
    readonly route_text_color?: string,
    readonly route_sort_order?: string,
    readonly continuous_pickup?: string,
    readonly continuous_drop_off?: string,
    readonly network_id: string
}

interface ShapeCSVRecord extends CSVRecord {
    readonly shape_id: string,
    readonly shape_pt_lat: string,
    readonly shape_pt_lon: string,
    readonly shape_pt_sequence: string,
    readonly shape_dist_traveled: string
}

interface StopTimeCSVRecord extends CSVRecord {
    readonly trip_id: string,
    readonly arrival_time?: string,
    readonly departure_time?: string,
    readonly stop_id?: string,
    readonly stop_sequence: string,
    readonly stop_headsign?: string,
    readonly pickup_type?: string,
    readonly drop_off_type?: string,
    readonly shape_dist_traveled?: string,
    readonly timepoint?: string
}

interface StopCSVRecord extends CSVRecord {
    readonly stop_id: string,
    readonly stop_code?: string,
    readonly stop_name: string,
    readonly tts_stop_name?: string,
    readonly stop_desc?: string,
    readonly stop_lat: string,
    readonly stop_lon: string,
    readonly zone_id?: string,
    readonly stop_url?: string,
    readonly location_type?: string,
    readonly parent_station?: string,
    readonly stop_timezone?: string,
    readonly wheelchair_boarding?: string,
    readonly level_id?: string,
    readonly platform_code?: string
}

interface TripCSVRecord extends CSVRecord {
    readonly route_id: string,
    readonly service_id: string,
    readonly trip_id: string,
    readonly trip_headsign?: string,
    readonly trip_short_name?: string,
    readonly direction_id?: string,
    readonly block_id?: string,
    readonly shape_id?: string,
    readonly wheelchair_accessible?: string,
    readonly bikes_allowed?: string,
    readonly cars_allowed?: string
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

type ScheduleDataTypes = {
    agency: AgencyCSVRecord,
    calendar_dates: CalendarDateCSVRecord,
    calendar: CalendarCSVRecord
    feed_info: FeedInfoCSVRecord,
    routes: RouteCSVRecord,
    shapes: ShapeCSVRecord,
    stop_times: StopTimeCSVRecord,
    stops: StopCSVRecord,
    trips: TripCSVRecord
}

type ScheduleCache = { 
    [key in keyof ScheduleDataTypes]: ScheduleDataTypes[key][]
};

export class ScheduleManager {
    private url: string;
    private cachePath: string;
    private updateFrequency = 24 * 60 * 60 * 1000; // 24 hours
    private scheduler: TaskScheduler;
    
    public data: ScheduleCache | null = null;

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

    public async update(): Promise<void> {
        try {
            Logger.logConsole("Executing static schedule update check");

            // Ensure cache directory exists
            await utils.createDirectory(this.cachePath);

            const updateRequired = await this.checkForUpdate();
            if (updateRequired) {
                const timestamp = utils.ISOTimestamp(true);
                const zipPath = path.resolve(this.cachePath, timestamp);

                const zipData = await utils.httpGetBinary(this.url);
                const zip = new AdmZip(zipData);
                await zip.extractAllToAsync(zipPath, true);

                Logger.logInfo(`Schedule file downloaded to cache: ${zipPath}`);

                await this.cacheData();
            }

            if (!this.data) {
                await this.cacheData();
            }
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

    private async cacheData(): Promise<void> {
        try {
            const cacheDirectoryNames = await utils.listDirectory(
                this.cachePath
            );

            if (cacheDirectoryNames.length == 0) {
                throw Error("No schedule file cache directory");
            };

            const cacheDirectoryName = cacheDirectoryNames[0] as string;

            const readData = async <TCSVRecord extends CSVRecord>(
                scheduleType: ScheduleType,
            ): Promise<TCSVRecord[]> => {     
                const file = path.resolve(
                    this.cachePath, 
                    cacheDirectoryName, 
                    `${scheduleType}.txt`
                );

                const csvData = await readCSVFile<TCSVRecord>(file);
                await Logger.logInfo(`Schedule data ${file} cached into memory`);
                return csvData;
            }
            
            const promises: {
                [TKey in keyof ScheduleCache]: Promise<CSVRecord[]>
            } = { 
                agency: readData('agency'),
                calendar_dates: readData('calendar_dates'),
                calendar: readData('calendar'),
                feed_info:  readData('feed_info'),
                routes: readData('routes'),
                shapes: readData('shapes'),
                stop_times: readData('stop_times'),
                stops: readData('stops'),
                trips: readData('trips')
            };

            const data = await utils.mappedPromises(promises);
            this.data = data as ScheduleCache;

            Logger.logInfo(`Schedule ${cacheDirectoryName} cached into memory`);
        }
        catch (err) {
            Logger.logError("Failed to cache schedule into memory", err);
        }
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
