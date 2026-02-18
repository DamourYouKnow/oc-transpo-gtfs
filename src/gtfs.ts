import * as path from 'path';

import AdmZip from 'adm-zip';
import { decode } from './protobuffer';

import Logger from './logger';
import * as utils from './utils';
import { CSVRecord, readCSVFile } from './csv';
import TaskScheduler from './task-scheduler';
import { load } from 'protobufjs';

// TODO: Move to index.ts
const apiHost = "https://nextrip-public-api.azure-api.net"
const tripUpdateRoot = `${apiHost}/octranspo/gtfs-rt-tp/beta/v1`;
const vehiclePositionRoot = `${apiHost}/octranspo/gtfs-rt-vp/beta/v1`;

type StopID = string;
type StopCode = string;
type RouteID = string;
type TripID = string;
type ServiceID = string;

// https://gtfs.org/documentation/realtime/reference/
type ScheduleRelationship = "SCHEDULED" | "ADDED" | "UNSCHEDULED" | "CANCELED"
        | "REPLACEMENT" | "DUPLICATED" | "NEW" | "DELETED";

enum ExceptionType {
    ADDED = '1',
    REMOVED = '2'
}

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

interface TripEntity {
    readonly tripId: TripID,
    readonly startTime: string,
    readonly startDate: string,
    readonly scheduleRelationship: ScheduleRelationship,
    readonly routeId: RouteID
}

interface TripUpdateEntity extends FeedEntity {
    readonly tripUpdate: {
        readonly trip: TripEntity,
        readonly stopTimeUpdate:  {
            readonly stopSequence: number,
            readonly arrival: {
                readonly time: string
            },
            readonly stopId: StopID,
            readonly scheduleRelationship: ScheduleRelationship
        }[]
    }
}   

interface VehiclePositionEntity extends FeedEntity {
    readonly vehicle: {
        readonly trip: TripEntity,
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
    readonly exception_type: ExceptionType
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

interface Stop {
    readonly id: StopID,
    readonly code: StopCode | null,
    readonly name: string,
    readonly position: Position
}

interface Route {
    readonly id: RouteID;
}

interface Trip {
    readonly id: TripID,
    readonly service: TripID,
    readonly route: RouteID,
    readonly headsign: string | null
}

interface Position {
    readonly lattitude: number,
    readonly longitude: number
}

interface StopSchedule {
    stop: StopID,
    routes: Map<string, StopTime[]> 
}

interface StopTime {
    stop: StopID,
    route: RouteID,
    trip: TripID,
    arrival: Date | null,
    departure: Date | null,
    realtime: boolean
}

type ServiceDays = [
    boolean, // Sunday
    boolean, // Monday
    boolean, // Tuesday
    boolean, // Wednesday
    boolean, // Thursday
    boolean, // Friday
    boolean  // Saturday
];

interface Service {
    readonly id: ServiceID,
    readonly startTime: Date,
    readonly endTime: Date,
    readonly days: ServiceDays
}

interface ServiceException {
    readonly service: ServiceID,
    readonly date: Date,
    readonly exceptionType: ExceptionType
}

interface FeedInfo {
    startTime: Date,
    endTime: Date
}

interface Agency {
    name: string,
    timezone: string
}

class GTFSFeed {
    private loadTime: Date;
    private agency: Agency;
    private info: FeedInfo;
    private services = new Map<ServiceID, Service>();
    // TODO: Replace with Map<Date, ServiceException>
    private activeServices: Set<ServiceID>;
    private stops = new Map<StopID, Stop>();
    private stopCodes = new Map<StopCode, StopID>();
    private routes = new Map<RouteID, Route>();
    private trips = new Map<TripID, Trip>();
    private schedules = new Map<StopID, StopSchedule>();

    public constructor(schedule: ScheduleCache, loadTime: Date) {
        this.loadTime = loadTime; 

        // Load agency and feed info
        const agency = schedule.agency[0];
        if (!agency) {
            throw Error("No agency in static schedule");
        }

        Logger.logInfo(`Initializing GTFS feed for ${agency.agency_name}`);

        this.agency = {
            name: agency.agency_name,
            timezone: agency.agency_timezone
        };
            
        const feedInfo = schedule.feed_info[0];
        if (!feedInfo) {
            throw Error("No feed information in static schedule");
        }

        this.info = {
            startTime: this.dateStart(feedInfo.feed_start_date),
            endTime: this.dateEnd(feedInfo.feed_end_date)
        };

        // Load stop data
        for (const stop of schedule.stops) {
            this.stops.set(stop.stop_id, {
                id: stop.stop_id,
                code: stop.stop_code || null,
                name: stop.stop_name,
                position: {
                    lattitude: Number(stop.stop_lat),
                    longitude: Number(stop.stop_lon)
                }
            });

            // Register stop code if it exists
            if (stop.stop_code) {
                this.stopCodes.set(stop.stop_code, stop.stop_id);
            }
        }

        // Load route data
        for (const route of schedule.routes) {
            this.routes.set(route.route_id, {
                id: route.route_id
            });
        }

        // Load trip data
        for (const trip of schedule.trips) {
            this.trips.set(trip.trip_id, {
                id: trip.trip_id,
                service: trip.service_id,
                route: trip.route_id,
                headsign: trip.trip_headsign || null
            });
        }

        // Load active services
        loadTime = utils.applyTimezone(loadTime, this.agency.timezone);
        Logger.logInfo(`Agency time: ${utils.datetimeString(loadTime)}`);

        const dayOfWeek = loadTime.getDay();
        const isActiveDay = (dayString: string): boolean => dayString == '1';

        const services: Service[] = schedule.calendar.map((service) => {
            return {
                id: service.service_id,
                startTime: this.dateStart(service.start_date),
                endTime: this.dateEnd(service.end_date),
                days: [
                    isActiveDay(service.sunday),
                    isActiveDay(service.monday),
                    isActiveDay(service.tuesday),
                    isActiveDay(service.wednesday),
                    isActiveDay(service.thursday),
                    isActiveDay(service.friday),
                    isActiveDay(service.saturday)
                ]
            };
        });

        for (const service of services) {
            this.services.set(service.id, service);
        }

        let activeServices = services.filter((service) => {
            return service.days[dayOfWeek]
        });

        this.activeServices = new Set<ServiceID>(
            activeServices.map((service) => service.id)
        );

        // Get service exceptions for date
        const calendarDates = schedule.calendar_dates;

        const exceptions: ServiceException[] = calendarDates.map((date) => {
            return {
                service: date.service_id,
                date: new Date(
                    `${utils.hyphenateYYYYMMDD(date.date)}T00:00:00`
                ),
                exceptionType: date.exception_type
            };
        });

        const activeExceptions = exceptions.filter((exception) => {
            return utils.sameDate(exception.date, loadTime)
        });
        const activeAddExceptions = activeExceptions.filter((exception) => {
            return exception.exceptionType == ExceptionType.ADDED;
        });
        const activeRemoveExceptions = activeExceptions.filter((exception) => {
            return exception.exceptionType == ExceptionType.REMOVED;
        });

        // Apply service exceptions
        const findService = (serviceId: ServiceID) => {
            const foundService = services.find((service) => {
                return service.id == serviceId;
            });

            if (!foundService) {
                Logger.logWarning(
                    `Service not found for service exception ${serviceId}`
                );
            }

            return foundService;
        }

        for (const exception of activeAddExceptions) {
            const service = findService(exception.service);
            if (service) {
                this.activeServices.add(service.id);
                Logger.logInfo(`Service exception added: ${service.id}`);
            }
        }
        for (const exception of activeRemoveExceptions) {
            const service = findService(exception.service);
            if (service) {
                this.activeServices.delete(service.id);
                Logger.logInfo(`Service exception removed: ${service.id}`);
            }
        }

        for (const serviceId of this.activeServices) {
            Logger.logInfo(`Service ${serviceId} loaded`);
        }

        // Load stop time data
        Logger.logInfo(`Loading stop time data for ${this.agency.name}`);

        for (const stopTime of schedule.stop_times) {
            const trip = this.trips.get(stopTime.trip_id);

            if (!trip) {
                Logger.logWarning(`Trip ID ${stopTime.trip_id} not found`);
                continue;
            }

            const service = this.services.get(trip.service);
            if (!service) {
                Logger.logWarning(`Service ID ${trip.service} not found`);
                continue;
            }
            
            const isActiveTrip = this.activeServices.has(trip.service)
            if (!isActiveTrip) continue;

            const route = this.routes.get(trip.route);
            if (!route) {
                Logger.logWarning(`Route ID ${trip.route} not found`);
                continue;
            }

            if (!stopTime.stop_id) {
                Logger.logWarning(`Stop ID ${stopTime.stop_id} not found`);
                continue;
            }

            const serviceDate = this.agencyDate(service.startTime);

            const arrivalTime = stopTime.arrival_time ? utils.applyTimestamp(
                serviceDate,
                stopTime.arrival_time,
                this.agency.timezone
            ) : null;

            const departureTime = stopTime.departure_time ? utils.applyTimestamp(
                serviceDate,
                stopTime.departure_time,
                this.agency.timezone
            ) : null;

            this.updateStopTime({
                stop: stopTime.stop_id,
                route: route.id,
                trip: stopTime.trip_id,
                arrival: arrivalTime,
                departure: departureTime,
                realtime: false
            });
        }

        Logger.logInfo(`GTFS feed for ${this.agency.name} loaded`);
    }
    
    public lookupId(stopId: string): StopSchedule | null {
        const schedule = this.schedules.get(stopId);
        return schedule ? schedule : null;
    }

    public lookupCode(stopCode: string): StopSchedule | null {
        const stopId = this.stopCodes.get(stopCode);
        return stopId ? this.lookupId(stopId) : null;
    }

    public update(feed: TripUpdateMessage) {
        throw Error("Not implemented");
    }

    public agencyDate(date?: Date): Date {
        if (!date) date = new Date(Date.now());
        return utils.applyTimezone(date, this.agency.timezone);
    }

    private updateStopTime(stopTime: StopTime) {
        let stopSchedule = this.schedules.get(stopTime.stop);
        if (!stopSchedule) {
            stopSchedule = {
                stop: stopTime.stop,
                routes: new Map<RouteID, StopTime[]>(),
                
            };

            this.schedules.set(stopTime.stop, stopSchedule);
        }

        const stopTimes = stopSchedule.routes.get(stopTime.route);
        if (!stopTimes) {
            stopSchedule.routes.set(stopTime.route, [stopTime]);
        }
        else {
            stopTimes.push(stopTime);
        }
    }

    private dateStart(datestring: string): Date {
        datestring = `${utils.hyphenateYYYYMMDD(datestring)}T00:00:00`;
        return this.agencyDate(new Date(datestring));
    }

    private dateEnd(datestring: string): Date {
        datestring = `${utils.hyphenateYYYYMMDD(datestring)}T24:00:00`;
        return this.agencyDate(new Date(datestring));
    }
}

// TODO: Rename to feed manager?
export class ScheduleManager {
    private url: string;
    private cachePath: string;
    private updateFrequency = 24 * 60 * 60 * 1000; // 24 hours
    private scheduler: TaskScheduler;
    
    // TODO: Remove cache, use feed instead
    public cache: ScheduleCache | null = null;
    public feed: GTFSFeed | null = null;

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

            if (!this.cache) {
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
            this.cache = data as ScheduleCache;

            Logger.logInfo(`Schedule ${cacheDirectoryName} cached into memory`);

            // TODO: Move outside cache date function
            this.feed = new GTFSFeed(this.cache, new Date());
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
