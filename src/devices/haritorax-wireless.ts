"use strict";

import { Buffer } from "buffer";
import { EventEmitter } from "events";
import Quaternion from "quaternion";
import GX from "../mode/gx.js";
import Bluetooth from "../mode/bluetooth.js";

let debug = 0;
let printTrackerIMUData = false;

let gx: GX;
let bluetooth: Bluetooth;
let gxEnabled = false;
let bluetoothEnabled = false;
let haritora: HaritoraXWireless;

const SENSOR_MODE_1 = 1;
const SENSOR_MODE_2 = 0;
const FPS_MODE_100 = 1;
const FPS_MODE_50 = 0;

const trackerButtons: Map<string, [number, number]> = new Map([
    // trackerName, [mainButton, subButton]
    ["rightKnee", [0, 0]],
    ["rightAnkle", [0, 0]],
    ["hip", [0, 0]],
    ["chest", [0, 0]],
    ["leftKnee", [0, 0]],
    ["leftAnkle", [0, 0]],
    ["leftElbow", [0, 0]],
    ["rightElbow", [0, 0]],
]);

const trackerSettingsRaw: Map<string, string> = new Map([
    // trackerName, raw hex value
    ["rightKnee", ""],
    ["rightAnkle", ""],
    ["hip", ""],
    ["chest", ""],
    ["leftKnee", ""],
    ["leftAnkle", ""],
    ["leftElbow", ""],
    ["rightElbow", ""],
]);

const trackerSettings: Map<string, [number, number, string[], boolean]> =
    new Map([
        // trackerName, [sensorMode, fpsMode, sensorAutoCorrection, ankleMotionDetection]
        ["rightKnee", [2, 50, [], false]],
        ["rightAnkle", [2, 50, [], false]],
        ["hip", [2, 50, [], false]],
        ["chest", [2, 50, [], false]],
        ["leftKnee", [2, 50, [], false]],
        ["leftAnkle", [2, 50, [], false]],
        ["leftElbow", [2, 50, [], false]],
        ["rightElbow", [2, 50, [], false]],
    ]);

const trackerBattery: Map<string, [number, number, string]> = new Map([
    // trackerName, [batteryRemaining, batteryVoltage, chargeStatus]
    ["rightKnee", [0, 0, ""]],
    ["rightAnkle", [0, 0, ""]],
    ["hip", [0, 0, ""]],
    ["chest", [0, 0, ""]],
    ["leftKnee", [0, 0, ""]],
    ["leftAnkle", [0, 0, ""]],
    ["leftElbow", [0, 0, ""]],
    ["rightElbow", [0, 0, ""]],
]);

const trackerMag: Map<string, string> = new Map([
    // trackerName, magStatus
    ["rightKnee", ""],
    ["rightAnkle", ""],
    ["hip", ""],
    ["chest", ""],
    ["leftKnee", ""],
    ["leftAnkle", ""],
    ["leftElbow", ""],
    ["rightElbow", ""],
]);

let trackerService: string;
let settingsService: string;
let batteryService: string;
let magnetometerCharacteristic: string;
let batteryLevelCharacteristic: string;
let sensorModeCharacteristic: string;
let fpsModeCharacteristic: string;
let correctionCharacteristic: string;
let ankleCharacteristic: string;

let activeDevices: string[] = [];

// JSDoc comments for events

/**
 * The "imu" event which provides info about the tracker's IMU data.
 * Support: GX6, GX2, Bluetooth
 *
 * @event this#imu
 * @type {object}
 * @property {string} trackerName - The name of the tracker. Possible values for GX6: "rightKnee", "rightAnkle", "hip", "chest", "leftKnee", "leftAnkle", "leftElbow", "rightElbow".
 * @property {object} rotation - The rotation data of the tracker.
 * @property {number} rotation.x - The x component of the rotation.
 * @property {number} rotation.y - The y component of the rotation.
 * @property {number} rotation.z - The z component of the rotation.
 * @property {number} rotation.w - The w component of the rotation.
 * @property {object} gravity - The gravity data of the tracker.
 * @property {number} gravity.x - The x component of the gravity.
 * @property {number} gravity.y - The y component of the gravity.
 * @property {number} gravity.z - The z component of the gravity.
 * @property {number|undefined} ankle - The ankle motion data of the tracker if enabled. Undefined if disabled.
 **/

/**
 * The "tracker" event which provides info about the tracker's other data.
 * Support: GX6, GX2
 *
 * @event this#tracker
 * @type {object}
 * @property {string} trackerName - The name of the tracker. (rightKnee, rightAnkle, hip, chest, leftKnee, leftAnkle, leftElbow, rightElbow)
 * @property {string} data - The data received from the tracker.
 **/

/**
 * The "mag" event which provides the tracker's magnetometer status
 * Support: GX6, GX2, Bluetooth
 *
 * @event this#mag
 * @type {object}
 * @property {string} trackerName - The name of the tracker.
 * @property {string} magStatus - The magnetometer status of the tracker. (green, yellow, red)
 **/

/**
 * The "button" event which provides info about the tracker's button data.
 * Support: GX6, GX2, Bluetooth
 *
 * @event this#button
 * @type {object}
 * @property {string} trackerName - The name of the tracker.
 * @property {number} mainButton - Amount of times the main button was pressed.
 * @property {number} subButton - Amount of times the sub button was pressed.
 * @property {boolean} isOn - Whether the tracker is turning on/is on (true) or turning off/is off (false).
 **/

/**
 * The "battery" event which provides info about the tracker's battery data.
 * Support: GX6, GX2, Bluetooth (partial)
 *
 * @event this#battery
 * @type {object}
 * @property {string} trackerName - The name of the tracker.
 * @property {number} batteryRemaining - The remaining battery percentage of the tracker.
 * @property {number} batteryVoltage - The voltage of the tracker's battery. (GX only)
 * @property {string} chargeStatus - The charge status of the tracker. (GX only)
 **/

/**
 * The "info" event which provides info about the tracker or dongle.
 * Support: GX6, GX2, Bluetooth
 *
 * @event this#info
 * @type {object}
 * @property {string} name - The name of the device.
 * @property {string} version - The version of the device.
 * @property {string} model - The model of the device.
 * @property {string} serial - The serial number of the device.
 **/

/**
 * The "connect" event which provides the name of the tracker that has connected.
 * Support: GX6, GX2, Bluetooth
 *
 * @event this#connect
 * @type {string}
 * @property {string} trackerName - The name of the tracker.
 **/

/**
 * The "disconnect" event which provides the name of the tracker that has disconnected.
 * Support: GX6, GX2, Bluetooth
 *
 * @event this#disconnect
 * @type {string}
 * @property {string} trackerName - The name of the tracker.
 **/

/**
 * The HaritoraXWireless class.
 *
 * This class represents a HaritoraX wireless device. It provides methods to start/stop a connection,
 * set settings for all/individual trackers, and emits events for: IMU data, tracker data, button data, battery data, and settings data.
 *
 * @param {boolean} debugMode - Enable logging of debug messages depending on verbosity. (0 = none, 1 = debug, 2 = debug w/ function info)
 * @param {boolean} printTrackerIMUProcessing - Print the tracker IMU processing data (processIMUData()). (true or false)
 *
 * @example
 * let device = new HaritoraXWireless(2);
 **/
export default class HaritoraXWireless extends EventEmitter {
    constructor(debugMode = 0, printTrackerIMUProcessing = false) {
        super();
        debug = debugMode;
        printTrackerIMUData = printTrackerIMUProcessing;
        haritora = this;
        log(`Set debug mode for HaritoraXWireless: ${debug}`);
        log(`Print tracker IMU processing: ${printTrackerIMUData}`);
    }

    /**
     * Starts the connection to the trackers with the specified mode.
     *
     * @param {string} connectionMode - Connect to the trackers with the specified mode (GX6 or bluetooth).
     * @param {string[]} [portNames] - The port names to connect to. (GX6 only)
     *
     * @example
     * device.startConnection("gx");
     **/
    startConnection(connectionMode: string, portNames?: string[]) {
        gx = new GX(debug);
        bluetooth = new Bluetooth(debug);

        if (connectionMode === "gx") {
            gx.startConnection(portNames);
            gxEnabled = true;
        } else if (connectionMode === "bluetooth") {
            bluetooth.startConnection();
            bluetoothEnabled = true;

            trackerService = bluetooth.getServiceUUID("Tracker Service");
            settingsService = bluetooth.getServiceUUID("Setting Service");
            batteryService = bluetooth.getServiceUUID("Battery Service");
            magnetometerCharacteristic =
                bluetooth.getCharacteristicUUID("Magnetometer");
            batteryLevelCharacteristic =
                bluetooth.getCharacteristicUUID("BatteryLevel");
            sensorModeCharacteristic =
                bluetooth.getCharacteristicUUID("SensorModeSetting");
            fpsModeCharacteristic =
                bluetooth.getCharacteristicUUID("FpsSetting");
            correctionCharacteristic = bluetooth.getCharacteristicUUID(
                "AutoCalibrationSetting"
            );
            ankleCharacteristic = bluetooth.getCharacteristicUUID("TofSetting");
        }

        listenToDeviceEvents();
    }

    /**
     * Stops the connection to the trackers with the specified mode.
     *
     * @param {string} connectionMode - Disconnect from the trackers with the specified mode (gx6 or bluetooth).
     *
     * @example
     * device.stopConnection("gx");
     **/
    stopConnection(connectionMode: string) {
        if (connectionMode === "gx" && gxEnabled) {
            gx.stopConnection();
            gxEnabled = false;
        } else if (connectionMode === "bluetooth" && bluetoothEnabled) {
            bluetooth.stopConnection();
            bluetoothEnabled = false;
        }

        activeDevices = [];
    }

    /**
     * Sets the tracker settings for a specific tracker.
     * Support: GX6, GX2
     *
     * @param {string} trackerName - The name of the tracker to apply settings to (rightKnee, rightAnkle, hip, chest, leftKnee, leftAnkle, leftElbow, rightElbow).
     * @param {number} sensorMode - The sensor mode, which controls whether magnetometer is used (1 or 2).
     * @param {number} fpsMode - The posture data transfer rate/FPS (50 or 100).
     * @param {string[]} sensorAutoCorrection - The sensor auto correction mode, multiple or none can be used (accel, gyro, mag).
     * @param {boolean} ankleMotionDetection - Whether ankle motion detection is enabled. (true or false)
     * @returns {boolean} Whether the settings were successfully sent to the tracker.
     * @fires this#settings
     *
     * @example
     * trackers.setTrackerSettings("rightAnkle", 1, 100, ['accel', 'gyro'], true);
     **/

    setTrackerSettings(
        trackerName: string,
        sensorMode: number,
        fpsMode: number,
        sensorAutoCorrection: string[],
        ankleMotionDetection: boolean
    ) {
        // elbows untested, might not work
        const TRACKERS_GROUP_ONE = [
            "rightAnkle",
            "rightKnee",
            "leftAnkle",
            "leftElbow",
        ];
        const TRACKERS_GROUP_TWO = ["hip", "chest", "leftKnee", "rightElbow"];

        log(gx.getTrackerAssignment().toString());

        let sensorAutoCorrectionBit = 0;
        if (sensorAutoCorrection.includes("accel"))
            sensorAutoCorrectionBit |= 0x01;
        if (sensorAutoCorrection.includes("gyro"))
            sensorAutoCorrectionBit |= 0x02;
        if (sensorAutoCorrection.includes("mag"))
            sensorAutoCorrectionBit |= 0x04;

        log(`Setting tracker settings for ${trackerName}...`);
        if (trackerName.startsWith("HaritoraX")) {
            // Bluetooth
            let sensorModeData;
            if (sensorMode === 1) sensorModeData = 5;
            else sensorModeData = 8;

            const sensorModeBuffer = Buffer.from([sensorModeData]);
            const sensorModeValue = new DataView(
                sensorModeBuffer.buffer
            ).getInt8(0);
            bluetooth.write(
                trackerName,
                settingsService,
                sensorModeCharacteristic,
                sensorModeBuffer
            );

            const fpsModeBuffer = Buffer.from([fpsMode === 50 ? 1 : 2]);
            const fpsModeValue = new DataView(fpsModeBuffer.buffer).getInt8(0);
            bluetooth.write(
                trackerName,
                settingsService,
                fpsModeCharacteristic,
                fpsModeBuffer
            );

            let correctionBit = 0;
            if (sensorAutoCorrection.includes("accel")) correctionBit |= 0x01;
            if (sensorAutoCorrection.includes("gyro")) correctionBit |= 0x02;
            if (sensorAutoCorrection.includes("mag")) correctionBit |= 0x04;
            const correctionBuffer = Buffer.from([correctionBit]);
            const correctionValue = new DataView(
                correctionBuffer.buffer
            ).getInt8(0);
            bluetooth.write(
                trackerName,
                settingsService,
                correctionCharacteristic,
                correctionBuffer
            );

            const ankleBuffer = Buffer.from([ankleMotionDetection ? 1 : 0]);
            const ankleValue = new DataView(ankleBuffer.buffer).getInt8(0);
            bluetooth.write(
                trackerName,
                settingsService,
                ankleCharacteristic,
                ankleBuffer
            );

            log(`Setting the following settings onto tracker ${trackerName}:`);
            log(`Sensor mode: ${sensorMode}`);
            log(`FPS mode: ${fpsMode}`);
            log(`Sensor auto correction: ${sensorAutoCorrection}`);
            log(`Ankle motion detection: ${ankleMotionDetection}`);

            log(`Raw hex data calculated to be sent:`);
            log(`Sensor mode: ${sensorModeValue}`);
            log(`FPS mode: ${fpsModeValue}`);
            log(`Sensor auto correction: ${correctionValue}`);
            log(`Ankle motion detection: ${ankleValue}`);

            trackerSettings.set(trackerName, [
                sensorMode,
                fpsMode,
                sensorAutoCorrection,
                ankleMotionDetection,
            ]);

            return true;
        } else {
            // GX dongle(s)
            const sensorModeBit =
                sensorMode === 1 ? SENSOR_MODE_1 : SENSOR_MODE_2; // Default to mode 2
            const postureDataRateBit =
                fpsMode === 100 ? FPS_MODE_100 : FPS_MODE_50; // Default to 50 FPS
            const ankleMotionDetectionBit = ankleMotionDetection ? 1 : 0; // Default to false

            let hexValue = `00000${postureDataRateBit}${sensorModeBit}010${sensorAutoCorrectionBit}00${ankleMotionDetectionBit}`;
            let trackerSettingsBuffer = undefined;

            if (TRACKERS_GROUP_ONE.includes(trackerName)) {
                trackerSettingsBuffer = this.getTrackerSettingsBuffer(
                    trackerName,
                    hexValue,
                    1
                );
            } else if (TRACKERS_GROUP_TWO.includes(trackerName)) {
                trackerSettingsBuffer = this.getTrackerSettingsBuffer(
                    trackerName,
                    hexValue,
                    -1
                );
            } else {
                log(`Invalid tracker name: ${trackerName}`);
                return;
            }

            log(`Setting the following settings onto tracker ${trackerName}:`);
            log(`Sensor mode: ${sensorMode}`);
            log(`FPS mode: ${fpsMode}`);
            log(`Sensor auto correction: ${sensorAutoCorrection}`);
            log(`Ankle motion detection: ${ankleMotionDetection}`);
            log(`Raw hex data calculated to be sent: ${hexValue}`);

            trackerSettings.set(trackerName, [
                sensorMode,
                fpsMode,
                sensorAutoCorrection,
                ankleMotionDetection,
            ]);

            try {
                log(
                    `Sending tracker settings to ${trackerName}: ${trackerSettingsBuffer.toString()}`
                );
                let ports = gx.getActivePorts();
                let trackerPort = gx.getTrackerPort(trackerName);

                ports[trackerPort].write(trackerSettingsBuffer, (err) => {
                    if (err) {
                        error(
                            `${trackerName} - Error writing data to serial port ${trackerPort}: ${err}`
                        );
                    } else {
                        trackerSettingsRaw.set(trackerName, hexValue);
                        log(
                            `${trackerName} - Data written to serial port ${trackerPort}: ${trackerSettingsBuffer
                                .toString()
                                .replace(/\r\n/g, " ")}`
                        );
                    }
                });
            } catch (err) {
                error(`Error sending tracker settings:\n${err}`);
                return false;
            }
        }

        return true;
    }

    getTrackerSettingsBuffer(
        trackerName: string,
        hexValue: string,
        direction: number
    ) {
        const entries = Array.from(trackerSettingsRaw.entries());
        const currentIndex = entries.findIndex(([key]) => key === trackerName);

        if (
            currentIndex !== -1 &&
            currentIndex + direction >= 0 &&
            currentIndex + direction < entries.length
        ) {
            const adjacentKey = entries[currentIndex + direction][0];
            let adjacentValue = trackerSettingsRaw.get(adjacentKey);
            return Buffer.from(
                `o0:${direction === 1 ? hexValue : adjacentValue}\r\no1:${
                    direction === 1 ? adjacentValue : hexValue
                }\r\n`,
                "utf-8"
            );
        }

        log(`${trackerName} - Calculated hex value: ${hexValue}`);
        return null;
    }

    /**
     * Sets the tracker settings for all connected trackers
     * Support: GX6, GX2, Bluetooth
     *
     * @param {number} sensorMode - The sensor mode, which controls whether magnetometer is used (1 or 2).
     * @param {number} fpsMode - The posture data transfer rate/FPS (50 or 100).
     * @param {string[]} sensorAutoCorrection - The sensor auto correction mode, multiple or none can be used (accel, gyro, mag).
     * @param {boolean} ankleMotionDetection - Whether ankle motion detection is enabled. (true or false)
     * @returns {boolean} Whether the settings were successfully sent to all trackers.
     * @fires this#settings
     *
     * @example
     * trackers.setAllTrackerSettings(2, 50, ['mag'], false);
     **/

    setAllTrackerSettings(
        sensorMode: number,
        fpsMode: number,
        sensorAutoCorrection: string[],
        ankleMotionDetection: boolean
    ) {
        if (gxEnabled) {
            try {
                const sensorModeBit =
                    sensorMode === 1 ? SENSOR_MODE_1 : SENSOR_MODE_2; // Default to mode 2
                const postureDataRateBit =
                    fpsMode === 100 ? FPS_MODE_100 : FPS_MODE_50; // Default to 50 FPS
                const ankleMotionDetectionBit = ankleMotionDetection ? 1 : 0; // Default to false
                let sensorAutoCorrectionBit = 0;
                if (sensorAutoCorrection.includes("accel"))
                    sensorAutoCorrectionBit |= 0x01;
                if (sensorAutoCorrection.includes("gyro"))
                    sensorAutoCorrectionBit |= 0x02;
                if (sensorAutoCorrection.includes("mag"))
                    sensorAutoCorrectionBit |= 0x04;

                const hexValue = `00000${postureDataRateBit}${sensorModeBit}010${sensorAutoCorrectionBit}00${ankleMotionDetectionBit}`;
                const trackerSettingsBuffer = Buffer.from(
                    "o0:" + hexValue + "\r\n" + "o1:" + hexValue + "\r\n",
                    "utf-8"
                );

                log(
                    `Setting the following settings onto all connected trackers:`
                );
                log(`Connected trackers: ${activeDevices}`);
                log(`Sensor mode: ${sensorMode}`);
                log(`FPS mode: ${fpsMode}`);
                log(`Sensor auto correction: ${sensorAutoCorrection}`);
                log(`Ankle motion detection: ${ankleMotionDetection}`);
                log(`Raw hex data calculated to be sent: ${hexValue}`);

                for (let trackerName of trackerSettingsRaw.keys()) {
                    let ports = gx.getActivePorts();
                    let trackerPort = gx.getTrackerPort(trackerName);

                    ports[trackerPort].write(trackerSettingsBuffer, (err) => {
                        if (err) {
                            error(
                                `${trackerName} - Error writing data to serial port ${trackerPort}: ${err}`
                            );
                        } else {
                            trackerSettingsRaw.set(trackerName, hexValue);
                            log(
                                `${trackerName} - Data written to serial port ${trackerPort}: ${trackerSettingsBuffer
                                    .toString()
                                    .replace(/\r\n/g, " ")}`
                            );
                        }
                    });
                }
            } catch (err) {
                error(`Error sending tracker settings:\n ${err}`);
                return false;
            }
        }

        if (bluetoothEnabled) {
            for (let trackerName of bluetooth.getActiveTrackers()) {
                this.setTrackerSettings(
                    trackerName,
                    sensorMode,
                    fpsMode,
                    sensorAutoCorrection,
                    ankleMotionDetection
                );
            }
        }

        for (let trackerName of trackerSettingsRaw.keys()) {
            trackerSettings.set(trackerName, [
                sensorMode,
                fpsMode,
                sensorAutoCorrection,
                ankleMotionDetection,
            ]);
        }
        return true;
    }

    /**
     * Returns device info for the specified tracker or dongle.
     * Support: GX6, GX2, Bluetooth
     *
     * @function getDeviceInfo
     * @returns {object} The device info (version, model, serial)
     * @fires this#info
     **/

    async getDeviceInfo(trackerName: string) {
        // GX
        const VERSION_INDEX = 0;
        const MODEL_INDEX = 1;
        const SERIAL_INDEX = 2;

        // Bluetooth
        const SERVICE_UUID = "180a";
        const VERSION_UUID = "2a28";
        const MODEL_UUID = "2a24";
        const SERIAL_UUID = "2a25";

        // Global
        let serial = undefined;
        let model = undefined;
        let version = undefined;

        if (trackerName === "(DONGLE)" || gxEnabled) {
            serial = gx.getDeviceInformation(trackerName)[SERIAL_INDEX];
            model = gx.getDeviceInformation(trackerName)[MODEL_INDEX];
            version = gx.getDeviceInformation(trackerName)[VERSION_INDEX];
        } else if (trackerName.startsWith("HaritoraX")) {
            let trackerObject = bluetooth
                .getActiveDevices()
                .find((device) => device[0] === trackerName);
            if (!trackerObject) {
                log(`Tracker ${trackerName} not found`);
                return null;
            }

            // grab services from trackerObject, get all characteristics
            let characteristics = trackerObject[3];
            let versionCharacteristic = characteristics.find(
                (characteristic) => characteristic.uuid === VERSION_UUID
            );
            let modelCharacteristic = characteristics.find(
                (characteristic) => characteristic.uuid === MODEL_UUID
            );
            let serialCharacteristic = characteristics.find(
                (characteristic) => characteristic.uuid === SERIAL_UUID
            );

            const decoder = new TextDecoder("utf-8");

            // Get buffers
            let versionBuffer = await bluetooth.read(
                trackerName,
                SERVICE_UUID,
                versionCharacteristic.uuid
            );

            let modelBuffer = await bluetooth.read(
                trackerName,
                SERVICE_UUID,
                modelCharacteristic.uuid
            );

            let serialBuffer = await bluetooth.read(
                trackerName,
                SERVICE_UUID,
                serialCharacteristic.uuid
            );

            // Convert to UTF-8 string
            version = decoder.decode(versionBuffer);
            serial = decoder.decode(serialBuffer);
            model = decoder.decode(modelBuffer);
        }

        log(`Tracker ${trackerName} info: ${version}, ${model}, ${serial}`);
        this.emit("info", trackerName, version, model, serial);
        return { version, model, serial };
    }

    /**
     * Get battery info from the trackers.
     * Support: GX6, GX2, Bluetooth
     *
     * @function getBatteryInfo
     * @returns {object} The battery info (batteryRemaining, batteryVoltage, chargeStatus)
     * @fires this#battery
     **/

    async getBatteryInfo(trackerName: string) {
        let batteryRemaining,
            batteryVoltage,
            chargeStatus = undefined;

        log(`Getting battery info for ${trackerName}`);

        try {
            if (trackerBattery.has(trackerName)) {
                [batteryRemaining, batteryVoltage, chargeStatus] =
                    trackerBattery.get(trackerName);
            } else {
                if (gxEnabled) {
                    log(`Tracker ${trackerName} battery info not found`);
                    return null;
                } else if (trackerName.startsWith("HaritoraX")) {
                    log(`Reading battery info for ${trackerName}...`);
                    batteryRemaining = await bluetooth.read(
                        trackerName,
                        batteryService,
                        batteryLevelCharacteristic
                    );
                }
            }
        } catch (err) {
            error(`Error getting battery info for ${trackerName}: ${err}`);
        }

        log(`Tracker ${trackerName} battery remaining: ${batteryRemaining}%`);
        log(`Tracker ${trackerName} battery voltage: ${batteryVoltage}`);
        log(`Tracker ${trackerName} charge status: ${chargeStatus}`);

        trackerBattery.set(trackerName, [
            batteryRemaining,
            batteryVoltage,
            chargeStatus,
        ]);

        this.emit(
            "battery",
            trackerName,
            batteryRemaining,
            batteryVoltage,
            chargeStatus
        );

        return { batteryRemaining, batteryVoltage, chargeStatus };
    }

    /**
     * Get the active trackers.
     * Support: GX6, GX2, Bluetooth
     *
     * @function getActiveTrackers
     * @returns {array} The active trackers.
     **/

    getActiveTrackers() {
        if (gxEnabled && bluetoothEnabled) {
            return activeDevices.concat(bluetooth.getActiveTrackers());
        } else if (gxEnabled) {
            return activeDevices;
        } else if (bluetoothEnabled) {
            return bluetooth.getActiveTrackers();
        } else {
            return null;
        }
    }

    /**
     * Get the tracker's settings.
     * Support: GX6, GX2
     *
     * @function getTrackerSettings
     * @param {string} trackerName
     * @returns {Object} The tracker settings (sensorMode, fpsMode, sensorAutoCorrection, ankleMotionDetection)
     **/
    async getTrackerSettings(
        trackerName: string,
        forceBluetoothRead?: boolean
    ) {
        log(`trackerName: ${trackerName}`);
        log(`forceBluetoothRead: ${forceBluetoothRead}`);

        if (
            (forceBluetoothRead &&
                bluetoothEnabled &&
                trackerName.startsWith("HaritoraX")) ||
            (bluetoothEnabled && trackerName.startsWith("HaritoraX")) ||
            !trackerSettings.has(trackerName)
        ) {
            log(`Forcing BLE reading for ${trackerName}`);
            try {
                const sensorModeValue = new DataView(
                    await bluetooth.read(
                        trackerName,
                        settingsService,
                        sensorModeCharacteristic
                    )
                ).getInt8(0);
                const fpsModeValue = new DataView(
                    await bluetooth.read(
                        trackerName,
                        settingsService,
                        fpsModeCharacteristic
                    )
                ).getInt8(0);
                const correctionValue = new DataView(
                    await bluetooth.read(
                        trackerName,
                        settingsService,
                        correctionCharacteristic
                    )
                ).getInt8(0);
                const ankleValue = new DataView(
                    await bluetooth.read(
                        trackerName,
                        settingsService,
                        ankleCharacteristic
                    )
                ).getInt8(0);

                let sensorMode;
                if (sensorModeValue === 5) sensorMode = 1;
                else sensorMode = 2;

                let fpsMode;
                if (fpsModeValue === 1) fpsMode = 50;
                else fpsMode = 100;

                let sensorAutoCorrection = [];
                if (correctionValue & 0x01) sensorAutoCorrection.push("accel");
                if (correctionValue & 0x02) sensorAutoCorrection.push("gyro");
                if (correctionValue & 0x04) sensorAutoCorrection.push("mag");

                let ankleMotionDetection = ankleValue === 1;

                log(`Tracker ${trackerName} raw settings:`);
                log(`Sensor mode: ${sensorModeValue}`);
                log(`FPS mode: ${fpsModeValue}`);
                log(`Sensor auto correction: ${correctionValue}`);
                log(`Ankle motion detection: ${ankleValue}`);

                log(`Tracker ${trackerName} settings:`);
                log(`Sensor mode: ${sensorMode}`);
                log(`FPS mode: ${fpsMode}`);
                log(`Sensor auto correction: ${sensorAutoCorrection}`);
                log(`Ankle motion detection: ${ankleMotionDetection}`);

                return {
                    sensorMode,
                    fpsMode,
                    sensorAutoCorrection,
                    ankleMotionDetection,
                };
            } catch (err) {
                error(`Error reading characteristic: ${err}`);
            }
        } else {
            // GX trackers (or not forcing BLE reading)
            log(
                `Getting tracker settings for ${trackerName} (GX/no BLE reading)`
            );
            if (trackerSettings.has(trackerName)) {
                let [
                    sensorMode,
                    fpsMode,
                    sensorAutoCorrection,
                    ankleMotionDetection,
                ] = trackerSettings.get(trackerName);
                log(`Tracker ${trackerName} settings:`);
                log(`Sensor mode: ${sensorMode}`);
                log(`FPS mode: ${fpsMode}`);
                log(`Sensor auto correction: ${sensorAutoCorrection}`);
                log(`Ankle motion detection: ${ankleMotionDetection}`);
                return {
                    sensorMode,
                    fpsMode,
                    sensorAutoCorrection,
                    ankleMotionDetection,
                };
            } else {
                log(`Tracker ${trackerName} settings not found`);
                return null;
            }
        }
    }

    /**
     * Get the tracker's (raw hex) settings
     * Support: GX6, GX2
     *
     * @function getTrackerSettingsRaw
     * @param {string} trackerName
     * @returns {Map} The tracker settings map
     **/
    getTrackerSettingsRaw(trackerName: string) {
        if (trackerSettingsRaw.has(trackerName)) {
            let hexValue = trackerSettingsRaw.get(trackerName);
            log(`Tracker ${trackerName} raw hex settings: ${hexValue}`);
            return hexValue;
        } else {
            log(`Tracker ${trackerName} raw hex settings not found`);
            return null;
        }
    }

    /**
     * Get the tracker's buttons.
     * Support: GX6, GX2, Bluetooth
     *
     * @function getTrackerButtons
     * @param {string} trackerName
     * @returns {Map} The tracker button map
     **/
    getTrackerButtons(trackerName: string) {
        if (trackerButtons.has(trackerName)) {
            let [mainButton, subButton] = trackerButtons.get(trackerName);
            log(`Tracker ${trackerName} main button: ${mainButton}`);
            log(`Tracker ${trackerName} sub button: ${subButton}`);
            return { mainButton, subButton };
        } else {
            log(`Tracker ${trackerName} buttons not found`);
            return null;
        }
    }

    /**
     * Get the tracker's magnetometer status
     * Support: GX6, GX2, Bluetooth
     *
     * @function getTrackerMag
     * @param {string} trackerName
     * @returns {string} The tracker's magnetometer status
     */
    async getTrackerMag(trackerName: string) {
        if (trackerMag.has(trackerName)) {
            let magStatus = trackerMag.get(trackerName);
            log(`Tracker ${trackerName} magnetometer status: ${magStatus}`);
            this.emit("mag", trackerName, magStatus);
            return magStatus;
        } else {
            if (trackerName.startsWith("HaritoraX")) {
                // Read from BLE
                let magStatus = await bluetooth.read(
                    trackerName,
                    trackerService,
                    magnetometerCharacteristic
                );
                return processMagData(magStatus, trackerName);
            } else {
                log(`Tracker ${trackerName} magnetometer status not found`);
                return null;
            }
        }
    }

    /**
     * Check whether the connection mode is active or not.
     * Support: GX6, GX2, Bluetooth
     *
     * @function getConnectionModeActive
     * @param {string} connectionMode
     * @returns {boolean} Whether the connection mode is active or not
     **/
    getConnectionModeActive(connectionMode: string) {
        switch (connectionMode) {
            case "gx":
                return gxEnabled;
            case "bluetooth":
                return bluetoothEnabled;
            default:
                return null;
        }
    }
}

function listenToDeviceEvents() {
    gx.on(
        "data",
        (
            trackerName: string,
            port: string,
            portId: string,
            identifier: string,
            portData: string
        ) => {
            switch (identifier[0]) {
                case "x":
                    processIMUData(portData, trackerName);
                    break;
                case "a":
                    processTrackerData(portData, trackerName);
                    break;
                case "r":
                    processButtonData(portData, trackerName);
                    break;
                case "v":
                    processBatteryData(portData, trackerName);
                    break;
                case "o":
                    // Let the person set the tracker settings manually
                    break;
                case "i":
                    // Handled by GX6 class
                    break;
                default:
                    log(
                        `${port} - Unknown data from ${trackerName}: ${portData}`
                    );
            }
        }
    );

    gx.on("log", (message: string) => {
        log(message);
    });

    gx.on("logError", (message: string) => {
        error(message);
    });

    bluetooth.on(
        "data",
        (
            localName: string,
            service: string,
            characteristic: string,
            data: string
        ) => {
            if (service === "Device Information") return;

            switch (characteristic) {
                case "Sensor":
                    processIMUData(data, localName);
                    break;
                case "MainButton":
                case "SecondaryButton":
                    processButtonData(data, localName, characteristic);
                    break;
                case "BatteryLevel":
                    processBatteryData(data, localName);
                    break;
                case "SensorModeSetting":
                case "FpsSetting":
                case "AutoCalibrationSetting":
                case "TofSetting":
                    // No need to process, we add the case here but don't do anything because it's not "unknown data".
                    break;
                case "Magnetometer":
                    processMagData(data, localName);
                    break;
                default:
                    log(
                        `Unknown data from ${localName}: ${data} - ${characteristic} - ${service}`
                    );
                    log(
                        `Data in utf-8: ${Buffer.from(data, "base64").toString(
                            "utf-8"
                        )}`
                    );
                    log(
                        `Data in hex: ${Buffer.from(data, "base64").toString(
                            "hex"
                        )}`
                    );
                    log(
                        `Data in base64: ${Buffer.from(data, "base64").toString(
                            "base64"
                        )}`
                    );
            }
        }
    );

    bluetooth.on("log", (message: string) => {
        log(message);
    });

    bluetooth.on("logError", (message: string) => {
        error(message);
    });

    bluetooth.on("connect", (peripheral) => {
        const trackerName = peripheral.advertisement.localName;
        if (trackerName && !activeDevices.includes(trackerName)) {
            activeDevices.push(trackerName);
            haritora.emit("connect", trackerName);
            log(`(haritorax-wireless) Connected to ${peripheral.advertisement.localName}`);
        }
    });

    bluetooth.on("disconnect", (peripheral) => {
        haritora.emit("disconnect", peripheral.advertisement.localName);
        log(`Disconnected from ${peripheral.advertisement.localName}`);
    });
}

/**
 * Processes the IMU data received from the tracker by the dongle.
 * The data contains the information about the rotation, gravity, and ankle motion (if enabled) of the tracker.
 * Support: GX6, GX2, Bluetooth
 *
 * @function processIMUData
 *
 * @param {string} data - The data to process.
 * @param {string} trackerName - The name of the tracker.
 * @fires haritora#imu
 **/

function processIMUData(data: string, trackerName: string) {
    // If tracker isn't in activeDevices, add it and emit "connect" event
    if (trackerName && !activeDevices.includes(trackerName)) {
        log(
            `Tracker ${trackerName} isn't in active devices, adding and emitting connect event`
        );
        activeDevices.push(trackerName);
        haritora.emit("connect", trackerName);
    }

    // Decode and log the data
    try {
        const { rotation, gravity, ankle, magStatus } = decodeIMUPacket(
            data,
            trackerName
        );

        if (printTrackerIMUData) {
            log(
                `Tracker ${trackerName} rotation: (${rotation.x.toFixed(
                    5
                )}, ${rotation.y.toFixed(5)}, ${rotation.z.toFixed(
                    5
                )}, ${rotation.w.toFixed(5)})`
            );
            log(
                `Tracker ${trackerName} gravity: (${gravity.x.toFixed(
                    5
                )}, ${gravity.y.toFixed(5)}, ${gravity.z.toFixed(5)})`
            );
            if (ankle) log(`Tracker ${trackerName} ankle: ${ankle}`);
            if (magStatus)
                log(`Tracker ${trackerName} magnetometer status: ${magStatus}`);
        }

        haritora.emit("imu", trackerName, rotation, gravity, ankle);
        if (!trackerName.startsWith("HaritoraX")) haritora.emit("mag", trackerName, magStatus);
    } catch (err) {
        error(`Error decoding tracker ${trackerName} IMU packet data: ${err}`);
    }
}

/**
 * The logic to decode the IMU packet received by the dongle.
 * Thanks to sim1222 and BracketProto's project for helping with the math and acceleration/drift code respectively :p
 * @see {@link https://github.com/sim1222/haritorax-slimevr-bridge/}
 * @see {@link https://github.com/OCSYT/SlimeTora/}
 **/

const DRIFT_INTERVAL = 15000;
let trackerAccel: { [key: string]: any } = {};
let trackerRotation: { [key: string]: any } = {};
let driftValues: { [key: string]: any } = {};
let calibrated: { [key: string]: any } = {};
let startTimes: { [key: string]: any } = {};
let initialRotations: { [key: string]: any } = {};

function decodeIMUPacket(data: string, trackerName: string) {
    try {
        if (data.length < 14) {
            throw new Error("Too few bytes to decode IMU packet");
        }

        const elapsedTime = Date.now() - startTimes[trackerName];

        const buffer = Buffer.from(data, "base64");
        const rotationX = buffer.readInt16LE(0);
        const rotationY = buffer.readInt16LE(2);
        const rotationZ = buffer.readInt16LE(4);
        const rotationW = buffer.readInt16LE(6);

        const gravityRawX = buffer.readInt16LE(8);
        const gravityRawY = buffer.readInt16LE(10);
        const gravityRawZ = buffer.readInt16LE(12);

        let ankle =
            data.slice(-2) !== "=="
                ? buffer.readInt16LE(buffer.length - 2)
                : undefined;

        let magStatus = undefined;
        if (!trackerName.startsWith("HaritoraX")) {
            const magnetometerData = data.charAt(data.length - 5);

            switch (magnetometerData) {
                case "A":
                    magStatus = "red";
                    break;
                case "B":
                    magStatus = "red";
                    break;
                case "C":
                    magStatus = "yellow";
                    break;
                case "D":
                    magStatus = "green";
                    break;
                default:
                    magStatus = "unknown";
                    break;
            }

            trackerMag.set(trackerName, magStatus);
        }

        const rotation = {
            x: (rotationX / 180.0) * 0.01,
            y: (rotationY / 180.0) * 0.01,
            z: (rotationZ / 180.0) * 0.01 * -1.0,
            w: (rotationW / 180.0) * 0.01 * -1.0,
        };
        trackerRotation[trackerName] = rotation;

        const gravityRaw = {
            x: gravityRawX / 256.0,
            y: gravityRawY / 256.0,
            z: gravityRawZ / 256.0,
        };
        trackerAccel[trackerName] = gravityRaw;

        const rc = [rotation.w, rotation.x, rotation.y, rotation.z];
        const r = [rc[0], -rc[1], -rc[2], -rc[3]];
        const p = [0.0, 0.0, 0.0, 9.8];

        const hrp = [
            r[0] * p[0] - r[1] * p[1] - r[2] * p[2] - r[3] * p[3],
            r[0] * p[1] + r[1] * p[0] + r[2] * p[3] - r[3] * p[2],
            r[0] * p[2] - r[1] * p[3] + r[2] * p[0] + r[3] * p[1],
            r[0] * p[3] + r[1] * p[2] - r[2] * p[1] + r[3] * p[0],
        ];

        const hFinal = [
            hrp[0] * rc[0] - hrp[1] * rc[1] - hrp[2] * rc[2] - hrp[3] * rc[3],
            hrp[0] * rc[1] + hrp[1] * rc[0] + hrp[2] * rc[3] - hrp[3] * rc[2],
            hrp[0] * rc[2] - hrp[1] * rc[3] + hrp[2] * rc[0] + hrp[3] * rc[1],
            hrp[0] * rc[3] + hrp[1] * rc[2] - hrp[2] * rc[1] + hrp[3] * rc[0],
        ];

        const gravity = {
            x: gravityRaw.x - hFinal[1] * -1.2,
            y: gravityRaw.y - hFinal[2] * -1.2,
            z: gravityRaw.z - hFinal[3] * 1.2,
        };

        if (elapsedTime >= DRIFT_INTERVAL) {
            if (!calibrated[trackerName]) {
                calibrated[trackerName] = {
                    pitch: driftValues[trackerName].pitch,
                    roll: driftValues[trackerName].roll,
                    yaw: driftValues[trackerName].yaw,
                };
            }
        }

        if (elapsedTime < DRIFT_INTERVAL) {
            if (!driftValues[trackerName]) {
                driftValues[trackerName] = { pitch: 0, roll: 0, yaw: 0 };
            }

            const rotationDifference = calculateRotationDifference(
                new Quaternion(
                    initialRotations[trackerName].w,
                    initialRotations[trackerName].x,
                    initialRotations[trackerName].y,
                    initialRotations[trackerName].z
                ).toEuler("XYZ"),
                new Quaternion(
                    rotation.w,
                    rotation.x,
                    rotation.y,
                    rotation.z
                ).toEuler("XYZ")
            );

            const prevMagnitude = Math.sqrt(
                driftValues[trackerName].pitch ** 2 +
                    driftValues[trackerName].roll ** 2 +
                    driftValues[trackerName].yaw ** 2
            );
            const currMagnitude = Math.sqrt(
                rotationDifference.pitch ** 2 +
                    rotationDifference.roll ** 2 +
                    rotationDifference.yaw ** 2
            );

            if (currMagnitude > prevMagnitude) {
                driftValues[trackerName] = rotationDifference;
                log(driftValues[trackerName]);
            }
        }

        if (elapsedTime >= DRIFT_INTERVAL && calibrated) {
            const driftCorrection = {
                pitch:
                    (calibrated[trackerName].pitch *
                        (elapsedTime / DRIFT_INTERVAL)) %
                    (2 * Math.PI),
                roll:
                    (calibrated[trackerName].roll *
                        (elapsedTime / DRIFT_INTERVAL)) %
                    (2 * Math.PI),
                yaw:
                    (calibrated[trackerName].yaw *
                        (elapsedTime / DRIFT_INTERVAL)) %
                    (2 * Math.PI),
            };

            const rotQuat = new Quaternion([
                rotation.w,
                rotation.x,
                rotation.y,
                rotation.z,
            ]);

            const rotationDriftCorrected = RotateAround(
                rotQuat,
                trackerAccel[trackerName],
                driftCorrection.yaw
            );

            log("Applied drift fix");

            return {
                rotation: {
                    x: rotationDriftCorrected.x,
                    y: rotationDriftCorrected.y,
                    z: rotationDriftCorrected.z,
                    w: rotationDriftCorrected.w,
                },
                gravity,
                ankle,
                magStatus,
            };
        }

        return { rotation, gravity, ankle, magStatus };
    } catch (error: any) {
        throw new Error("Error decoding IMU packet: " + error.message);
    }
}

function RotateAround(
    quat: Quaternion,
    vector: { x: number; y: number; z: number },
    angle: number
) {
    // Create a copy of the input quaternion
    var initialQuaternion = new Quaternion(quat.w, quat.x, quat.y, quat.z);

    // Create a rotation quaternion
    var rotationQuaternion = Quaternion.fromAxisAngle(
        [vector.x, vector.y, vector.z],
        angle
    );

    // Apply the rotation to the copy of the input quaternion
    initialQuaternion = initialQuaternion.mul(rotationQuaternion).normalize();

    // Return the resulting quaternion as a dictionary
    return {
        x: initialQuaternion.x,
        y: initialQuaternion.y,
        z: initialQuaternion.z,
        w: initialQuaternion.w,
    };
}

function calculateRotationDifference(
    prevRotation: number[],
    currentRotation: number[]
) {
    const pitchDifferenceRad = currentRotation[0] - prevRotation[0];
    const rollDifferenceRad = currentRotation[1] - prevRotation[1];
    const yawDifferenceRad = currentRotation[2] - prevRotation[2];

    return {
        pitch: pitchDifferenceRad,
        roll: rollDifferenceRad,
        yaw: yawDifferenceRad,
    };
}

/**
 * Processes other tracker data received from the tracker by the dongle.
 * Read function comments for more information.
 * Support: GX6, GX2
 *
 * @function processTrackerData
 * @param {string} data - The data to process.
 * @param {string} trackerName - The name of the tracker.
 * @fires haritora#tracker
 **/

function processTrackerData(data: string, trackerName: string) {
    /*
     * Currently unsure what other data a0/a1 could represent other than trying to find the trackers, I see other values for it too reporting every second.
     * This could also be used to report calibration data when running the calibration through the software.
     */

    if (data === "7f7f7f7f7f7f") {
        //log(`Searching for tracker ${trackerName}...`);
        if (activeDevices.includes(trackerName))
            activeDevices.splice(activeDevices.indexOf(trackerName), 1);
        haritora.emit("disconnect", trackerName);
    } else {
        //log(`Tracker ${trackerName} other data processed: ${data}`);
    }

    // TODO - Find out what "other data" represents, then add to emitted event.
    haritora.emit("tracker", trackerName, data);
}

/**
 * Processes the magnetometer data received from the Bluetooth tracker.
 * GX mag status is processed by decodeIMUPacket()
 * Support: Bluetooth
 *
 * @function processMagData
 * @param {string} data - The data to process.
 * @param {string} trackerName - The name of the tracker.
 * @fires haritora#mag
 **/
function processMagData(data: string, trackerName: string) {
    const GREEN = 3;
    const YELLOW = 2;
    const RED_2 = 1;
    const RED = 0;
    let magStatus;
    const buffer = Buffer.from(data, "base64");
    const magData = buffer.readUInt8(0);

    switch (magData) {
        case GREEN:
            magStatus = "green";
            break;
        case YELLOW:
            magStatus = "yellow";
            break;
        case RED:
            magStatus = "red";
            break;
        case RED_2:
            magStatus = "red";
            break;
        default:
            magStatus = "unknown";
            log(`Unknown mag data for ${trackerName}: ${magData}`);
            break;
    }

    log(`Tracker ${trackerName} mag status: ${magStatus}`);
    trackerMag.set(trackerName, magStatus);
    haritora.emit("mag", trackerName, magStatus);
    return magStatus;
}

/**
 * Processes the button data received from the tracker by the dongle.
 * The data contains the information about the main and sub buttons on the tracker.
 * Support: GX6, GX2, Bluetooth
 *
 * @function processButtonData
 * @param {string} data - The data to process.
 * @param {string} trackerName - The name of the tracker.
 * @param {string} characteristic - The characteristic of the data, if bluetooth trackers. (MainButton, SecondaryButton)
 * @fires haritora#button
 **/

function processButtonData(
    data: string,
    trackerName: string,
    characteristic?: string
) {
    const MAIN_BUTTON_INDEX = 0;
    const SUB_BUTTON_INDEX = 1;
    const TRACKER_OFF = false;
    const TRACKER_ON = true;

    let currentButtons = trackerButtons.get(trackerName) || [0, 0];
    let buttonState = undefined;

    try {
        if (trackerName && trackerName.startsWith("HaritoraX")) {
            if (characteristic === "MainButton") {
                currentButtons[MAIN_BUTTON_INDEX] += 1;
            } else if (characteristic === "SecondaryButton") {
                currentButtons[SUB_BUTTON_INDEX] += 1;
            }
            buttonState = TRACKER_ON; // Tracker is always on when connected via bluetooth, because need to be connected to read button data
        } else if (gxEnabled) {
            currentButtons[MAIN_BUTTON_INDEX] = parseInt(data[6], 16);
            currentButtons[SUB_BUTTON_INDEX] = parseInt(data[9], 16);

            if (
                data[0] === "0" ||
                data[7] === "f" ||
                data[8] === "f" ||
                data[10] === "f" ||
                data[11] === "f"
            ) {
                log(`Tracker ${trackerName} is off/turning off...`);
                log(`Raw data: ${data}`);
                buttonState = TRACKER_OFF;
            } else {
                log(`Tracker ${trackerName} is on/turning on...`);
                log(`Raw data: ${data}`);
                buttonState = TRACKER_ON;
            }
        }
    } catch (err) {
        error(`Error processing button data for ${trackerName}: ${err}`);
        return false;
    }

    trackerButtons.set(trackerName, currentButtons);
    haritora.emit(
        "button",
        trackerName,
        currentButtons[MAIN_BUTTON_INDEX],
        currentButtons[SUB_BUTTON_INDEX],
        buttonState
    );

    log(
        `Tracker ${trackerName} main button: ${currentButtons[MAIN_BUTTON_INDEX]}`
    );
    log(
        `Tracker ${trackerName} sub button: ${currentButtons[SUB_BUTTON_INDEX]}`
    );
    return true;
}

/**
 * Processes the battery data received from the tracker by the dongle.
 * It contains the information about the battery percentage, voltage, and charge status of the tracker.
 * Support: GX6, GX2, Bluetooth (partial)
 *
 * @function processBatteryData
 * @param {string} data - The data to process.
 * @param {string} trackerName - The name of the tracker.
 * @fires haritora#battery
 **/

function processBatteryData(data: string, trackerName: string) {
    const BATTERY_REMAINING_INDEX = 0;
    const BATTERY_VOLTAGE_INDEX = 1;
    const CHARGE_STATUS_INDEX = 2;
    let batteryData: [number, number, string] = [
        undefined,
        undefined,
        undefined,
    ];

    if (trackerName.startsWith("HaritoraX")) {
        try {
            let batteryRemainingHex = Buffer.from(data, "base64").toString(
                "hex"
            );
            batteryData[0] = parseInt(batteryRemainingHex, 16);
            log(
                `Tracker ${trackerName} battery remaining: ${batteryData[BATTERY_REMAINING_INDEX]}%`
            );
        } catch {
            error(
                `Error converting battery data to hex for ${trackerName}: ${data}`
            );
        }
    } else if (gxEnabled) {
        try {
            const batteryInfo = JSON.parse(data);
            log(
                `Tracker ${trackerName} remaining: ${batteryInfo["battery remaining"]}%`
            );
            log(
                `Tracker ${trackerName} voltage: ${batteryInfo["battery voltage"]}`
            );
            log(
                `Tracker ${trackerName} Status: ${batteryInfo["charge status"]}`
            );
            batteryData[BATTERY_REMAINING_INDEX] =
                batteryInfo["battery remaining"];
            batteryData[BATTERY_VOLTAGE_INDEX] = batteryInfo["battery voltage"];
            batteryData[CHARGE_STATUS_INDEX] = batteryInfo["charge status"];
        } catch (err) {
            error(`Error parsing battery data JSON for ${trackerName}: ${err}`);
        }
    }

    trackerBattery.set(trackerName, batteryData);
    haritora.emit("battery", trackerName, ...batteryData);
}

function log(message: string) {
    let emittedMessage = undefined;
    if (debug === 1) {
        emittedMessage = `(haritorax-interpreter) - ${message}`;
        console.log(emittedMessage);
        haritora.emit("log", emittedMessage);
    } else if (debug === 2) {
        const stack = new Error().stack;
        const callerLine = stack.split("\n")[2];
        const callerName = callerLine.match(/at (\S+)/)[1];
        const lineNumber = callerLine.match(/:(\d+):/)[1];

        emittedMessage = `(haritorax-interpreter) - ${callerName} (line ${lineNumber}) || ${message}`;
        console.log(emittedMessage);
        haritora.emit("log", emittedMessage);
    }
}

function error(message: string) {
    let emittedError = undefined;
    if (debug === 1) {
        emittedError = `(haritorax-interpreter) - ${message}`;
        console.error(emittedError);
        haritora.emit("logError", emittedError);
    } else if (debug === 2) {
        const stack = new Error().stack;
        const callerLine = stack.split("\n")[2];
        const callerName = callerLine.match(/at (\S+)/)[1];
        const lineNumber = callerLine.match(/:(\d+):/)[1];

        emittedError = `(haritorax-interpreter) - ${callerName} (line ${lineNumber}) || ${message}`;
        console.error(emittedError);
        haritora.emit("logError", emittedError);
    }
}

export { HaritoraXWireless };
