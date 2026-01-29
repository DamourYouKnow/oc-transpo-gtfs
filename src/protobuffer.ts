import * as protobuf from 'protobufjs'

export async function decode(
    path: string, 
    messageType: string,
    buffer: Buffer
): Promise<any> {
    const root = await protobuf.load(path);

    let message = root.lookup(
        `transit_realtime.${messageType}`
    );

    if (!message) {
        throw(Error("Error looking up protobuffer"));
    }

    //message = message.lookup("tripId")
    //console.log(message.toJSON());
    //message = message.lookupType("startTime");

    // TODO: Remove any
    const content = (message as any).decode(buffer);

    //console.log(content);
    //const result = message.toObject(content); 

    return content.toJSON();
};
