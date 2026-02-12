import * as path from 'path';

import Logger from './logger.ts';

import { 
    tripUpdates,
    vehiclePositions,
    ScheduleManager
} from './gtfs.ts';


const scheduleHost = "https://oct-gtfs-emasagcnfmcgeham.z01.azurefd.net";
const scheduleUrl = `${scheduleHost}/public-access/GTFSExport.zip`;

const rootDirectory = path.resolve(__dirname, "../");

test();

async function test() {
    const logger = new Logger(path.resolve(rootDirectory, 'logs'));
    await logger.start();
    Logger.logInfo("Application start");

    // Test manual update
    const scheduleUpdater = new ScheduleManager(
        scheduleUrl,
        path.resolve(rootDirectory, 'cache/schedule'),
        1 * 60 * 1000
    );
    await scheduleUpdater.start();

    const updates = (await tripUpdates()).entity;
    
    const routeUpdates = updates.filter((update) => {
        return update.tripUpdate.trip.routeId == '75'
    });

    const stopUpdates = routeUpdates.reduce((acc: any[], update) => {
        const stopTimeUpdates = update.tripUpdate.stopTimeUpdate;
        if (!stopTimeUpdates) return acc;

        const stopTimes = stopTimeUpdates.filter((stopUpdate) => {
            return stopUpdate.stopId == "3836"; // 3014- LF
        });

        const append = stopTimes.map((stopTime) => {
            return {
                stopId: stopTime.stopId,
                arrival: datetime(stopTime.arrival.time)
            };
        });

        return [...acc, ...append];
    }, []);

    const positions = (await vehiclePositions()).entity
}


function datetime(timestamp: string): Date {
    return new Date(Number(timestamp) * 1000);
} 
