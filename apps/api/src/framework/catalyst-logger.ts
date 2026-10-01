

 
import fs from 'fs';
import util from 'util';

const LOG_FD: number = process.env.X_ZOHO_SPARKLET_LOG_FD
    ? parseInt(process.env.X_ZOHO_SPARKLET_LOG_FD)
    : process.stdout.fd;

const SPARKP_ENCODING = 2;

enum SPARKP_PATH {
    LOG = 0,
    ADD_LOG_APPEND,
}

const SEND_SPARKP_LOG = (PATH: SPARKP_PATH, MESSAGE: string): void => {
    /**
     *  SparkP packet format
     *
     *  +-------------------+---------------+-------------------------+-------------------------------+
     *  | Encoding (1 byte) | Path (1 byte) | Content-Length (4 byte) | Message (Content-Length byte) |
     *  +-------------------+---------------+-------------------------+-------------------------------+
     *
     *  Expected values:
     *
     *  Encoding = 2
     *  Path = `SPARKP_PATH`
     */
    const LOG: Buffer = Buffer.from(MESSAGE, 'utf8');

    const frameMsb: Buffer = Buffer.alloc(6);
    frameMsb.writeUInt8(SPARKP_ENCODING, 0);
    frameMsb.writeUInt8(PATH, 1);
    frameMsb.writeUInt32BE(LOG.length, 2);

    fs.writeSync(LOG_FD, frameMsb);
    fs.writeSync(LOG_FD, LOG);
};

type LOG_APPENDS = Record<string, string | number>;

const ADD_LOG_APPENDS = (logAppends: LOG_APPENDS): void => {
    SEND_SPARKP_LOG(SPARKP_PATH.ADD_LOG_APPEND, JSON.stringify(logAppends));
};

/**
 * Add log pair
 *
 * @param {string} logKey log key
 * @param {string | number} logValue log message.
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
function addLogEntry(logKey: string, logValue: string | number): void {
    const logAppend: LOG_APPENDS = {};
    logAppend[logKey] = logValue;
    ADD_LOG_APPENDS(logAppend);
}

type LOG_DATA = {
    _zl_timestamp: number;
    level: string;
    message: string;
};

const customLogger = (level: string) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    return (message: any, ...args: any[]) => {
        message = util.format(message, ...args);

        if (process.env.X_ZOHO_SPARKLET_LOG_FD) {
            const LOG: LOG_DATA = {
                _zl_timestamp: Date.now(),
                level: level,
                message: message,
            };

            SEND_SPARKP_LOG(SPARKP_PATH.LOG, JSON.stringify(LOG));
        } else {
            message = `${Date.now()}\t${level}\t${message}\n`;
            message = Buffer.from(message, 'utf-8');

            process.stdout.write(message);
        }
    };
};

console.debug = customLogger("debug");
console.error = customLogger("error");
console.info = customLogger("info");
console.log = customLogger("info");
console.warn = customLogger("warn");
