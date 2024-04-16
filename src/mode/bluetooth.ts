"use strict";

import noble from "@abandonware/noble";
import { EventEmitter } from "events";

let bluetooth: Bluetooth = undefined;
let debug = 0;

const services = new Map([
    ["1800", "Generic Access"],
    ["1801", "Generic Attribute"],
    ["180a", "Device Information"],
    ["180f", "Battery Service"],
    ["00dbec3a90aa11eda1eb0242ac120002", "Tracker Service"],
    ["ef84369a90a911eda1eb0242ac120002", "Setting Service"],
]);

const characteristics = new Map([
    // Battery Service
    ["2a19", "BatteryLevel"],
    // BT device info
    ["2a25", "SerialNumber"],
    ["2a29", "Manufacturer"],
    ["2a27", "HardwareRevision"],
    ["2a26", "FirmwareRevision"],
    ["2a28", "SoftwareRevision"],
    ["2a24", "ModelNumber"],
    // Sensor Service
    ["00002a1900001000800000805f9b34fb", "Battery"],
    ["00002a2800001000800000805f9b34fb", "SoftwareRevision"],
    ["00dbf1c690aa11eda1eb0242ac120002", "Sensor"],
    ["00dbf30690aa11eda1eb0242ac120002", "Magnetometer"],
    ["00dbf45090aa11eda1eb0242ac120002", "MainButton"],
    ["00dbf58690aa11eda1eb0242ac120002", "SecondaryButton"],
    // Setting Service
    ["ef84420290a911eda1eb0242ac120002", "FpsSetting"],
    ["ef8443f690a911eda1eb0242ac120002", "TofSetting"],
    ["ef8445c290a911eda1eb0242ac120002", "SensorModeSetting"],
    ["ef84c30090a911eda1eb0242ac120002", "WirelessModeSetting"],
    ["ef84c30590a911eda1eb0242ac120002", "AutoCalibrationSetting"],
    //["ef843b5490a911eda1eb0242ac120002", "Something"], unsure what this is, reports randomly like battery level
]);

let activeDevices: any[] = [];
let activeServices: any[] = [];
let activeCharacteristics: any[] = [];

let allowReconnect = true;

export default class Bluetooth extends EventEmitter {
    constructor(debugMode = 0) {
        super();
        noble.on("discover", this.onDiscover.bind(this));
        debug = debugMode;
        bluetooth = this;
        console.log(`(haritorax-interpreter) - Debug mode for BT: ${debug}`);
    }

    startConnection() {
        log("Connected to bluetooth");

        if (noble.state === "poweredOn") {
            try {
                noble.startScanning([], true);
                this.emit("connected");
                return true;
            } catch (err) {
                error(`Error starting scanning of BT devices:\n${err}`);
                return false;
            }
        } else {
            noble.on("stateChange", (state) => {
                if (state === "poweredOn") {
                    try {
                        noble.startScanning([], true);
                        this.emit("connected");
                        return true;
                    } catch (err) {
                        error(`Error starting scanning of BT devices:\n${err}`);
                        return false;
                    }
                }
            });
            return true;
        }
    }

    onDiscover(peripheral: {
        connect?: any;
        discoverServices?: any;
        on?: any;
        advertisement?: any;
    }) {
        const {
            advertisement: { localName },
        } = peripheral;
        if (
            localName &&
            localName.startsWith("HaritoraX") &&
            !activeDevices.includes(peripheral)
        ) {
            log(`Found device: ${localName}`);
            // I do not have any device other than the wireless device, so I cannot test this
            if (localName.startsWith("HaritoraX-"))
                log(
                    "HaritoraX (1.0/1.1/1.1b) detected. Device is not fully supported and you may experience issues."
                );
            activeDevices.push(peripheral);

            peripheral.connect((err: any) => {
                if (err) {
                    error(`Error connecting to ${localName}: ${err}`);
                    return;
                }
                log(`Connected to ${localName}`);
                this.emit("connect", peripheral);

                peripheral.discoverServices(
                    null,
                    (err: any, services: any[]) => {
                        if (err) {
                            error(`Error discovering services: ${err}`);
                            return;
                        }

                        services.forEach(
                            (service: {
                                discoverCharacteristics: (
                                    arg0: any[],
                                    arg1: (
                                        error: any,
                                        characteristics: any
                                    ) => void
                                ) => void;
                                uuid: any;
                            }) => {
                                //log(`Discovered service ${service.uuid}`);
                                activeServices.push(service);
                                this.emit("serviceDiscovered", service.uuid);
                                service.discoverCharacteristics(
                                    [],
                                    (err: any, characteristics: any[]) => {
                                        if (err) {
                                            error(
                                                `Error discovering characteristics of service ${service.uuid}: ${err}`
                                            );
                                            return;
                                        }

                                        characteristics.forEach(
                                            (characteristic: {
                                                on: (
                                                    arg0: string,
                                                    arg1: (data: any) => void
                                                ) => void;
                                                uuid: any;
                                                subscribe: (
                                                    arg0: (err: any) => void
                                                ) => void;
                                            }) => {
                                                activeCharacteristics.push(
                                                    characteristic
                                                );
                                                this.emit(
                                                    "characteristicDiscovered",
                                                    characteristic.uuid
                                                );
                                                characteristic.on(
                                                    "data",
                                                    (data: any) => {
                                                        emitData(
                                                            this,
                                                            localName,
                                                            service.uuid,
                                                            characteristic.uuid,
                                                            data
                                                        );
                                                    }
                                                );
                                                characteristic.subscribe(
                                                    (err: any) => {
                                                        if (err) {
                                                            error(
                                                                `Error subscribing to characteristic ${characteristic.uuid} of service ${service.uuid}: ${err}`
                                                            );
                                                        }
                                                    }
                                                );
                                            }
                                        );
                                    }
                                );
                            }
                        );
                    }
                );
            });

            peripheral.on("disconnect", () => {
                if (!allowReconnect) return;
                log(`Disconnected from ${localName}`);
                this.emit("disconnect", peripheral);
                const index = activeDevices.indexOf(peripheral);
                if (index !== -1) {
                    activeDevices.splice(index, 1);
                }

                // search again
                setTimeout(() => {
                    noble.startScanning([], true);
                }, 3000);
            });
        }
    }

    stopConnection() {
        try {
            noble.stopScanning();
            for (let device of activeDevices) {
                device.disconnect();
            }
        } catch (err) {
            error(`Error while closing bluetooth connection: ${err}`);
            return false;
        }

        activeDevices = [];
        allowReconnect = false;

        this.emit("disconnected");
        log("Disconnected from bluetooth");
        return true;
    }

    read(
        localName: any,
        service: string,
        characteristic: string,
        callback: (error: any, data: any) => void
    ) {
        log(
            `Active services: ${activeServices
                .map((s: { uuid: string }) => s.uuid)
                .join(", ")}`
        );
        log(`Reading characteristic ${characteristic} of service ${service}`);
        const device = this.getDeviceInfo(localName);
        if (!device) {
            error(`Device ${localName} not found`);
            callback(new Error(`Device ${localName} not found`), null);
            return;
        }

        const serviceInstance = activeServices.find(
            (s: { uuid: string }) => s.uuid === service
        );
        if (!serviceInstance) {
            error(`Service ${service} not found`);
            callback(new Error(`Service ${service} not found`), null);
            return;
        }

        const characteristicInstance = activeCharacteristics.find(
            (c: { uuid: string }) => c.uuid === characteristic
        );
        if (!characteristicInstance) {
            error(`Characteristic ${characteristic} not found`);
            callback(
                new Error(`Characteristic ${characteristic} not found`),
                null
            );
            return;
        }

        characteristicInstance.read((err: any, data: any) => {
            if (err) {
                error(`Error reading characteristic ${characteristic}: ${err}`);
                callback(err, null);
                return;
            }

            log(`Read data from characteristic ${characteristic}`);
            callback(null, data);
        });
    }

    async write(
        localName: any,
        service: string,
        characteristic: string,
        data: any
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const device = this.getDeviceInfo(localName);
            if (!device) {
                error(`Device ${localName} not found`);
                reject(new Error(`Device ${localName} not found`));
                return;
            }

            device.discoverServices([], (err: any, services: any) => {
                if (err) {
                    error(`Error discovering services: ${err}`);
                    reject(err);
                    return;
                }

                const serviceInstance = services.find(
                    (s: { uuid: string }) => s.uuid === service
                );
                if (!serviceInstance) {
                    error(`Service ${service} not found`);
                    reject(new Error(`Service ${service} not found`));
                    return;
                }
                log(`Service instance: ${serviceInstance}`);
                serviceInstance.discoverCharacteristics(
                    [],
                    (err: any, characteristics: any) => {
                        if (err) {
                            error(`Error discovering characteristics: ${err}`);
                            reject(err);
                            return;
                        }

                        const characteristicInstance = characteristics.find(
                            (c: { uuid: string }) => c.uuid === characteristic
                        );
                        if (!characteristicInstance) {
                            error(`Characteristic ${characteristic} not found`);
                            reject(
                                new Error(
                                    `Characteristic ${characteristic} not found`
                                )
                            );
                            return;
                        }

                        characteristicInstance.write(
                            data,
                            false,
                            (err: any) => {
                                if (err) {
                                    error(
                                        `Error writing to characteristic ${characteristic}: ${err}`
                                    );
                                    reject(err);
                                    return;
                                }
                                resolve();
                            }
                        );
                    }
                );
            });
        });
    }

    getServices() {
        return services;
    }

    getCharacteristics() {
        return characteristics;
    }

    getActiveDevices() {
        return activeDevices;
    }

    getActiveServices() {
        return activeServices;
    }

    getActiveCharacteristics() {
        return activeCharacteristics;
    }

    getAllowReconnect() {
        return allowReconnect;
    }

    getActiveTrackers() {
        return activeDevices.map((device) => device.advertisement.localName);
    }

    getServiceUUID(name: string) {
        for (let [uuid, serviceName] of services) {
            if (serviceName === name) {
                return uuid;
            }
        }
        return null;
    }

    getCharacteristicUUID(name: string) {
        for (let [uuid, characteristicName] of characteristics) {
            if (characteristicName === name) {
                return uuid;
            }
        }
        return null;
    }

    getDeviceInfo(localName: any) {
        for (let device of activeDevices) {
            if (device.advertisement.localName === localName) {
                return device;
            }
        }
        return null;
    }
}

function emitData(
    classInstance: Bluetooth,
    localName: any,
    service: string,
    characteristic: string,
    data: any
) {
    classInstance.emit(
        "data",
        localName,
        services.get(service),
        characteristics.get(characteristic),
        data
    );
}

/*
 * Helper functions
 */

function log(message: string) {
    bluetooth.emit("log", message);
}

function error(message: string) {
    bluetooth.emit("logError", message);
}

export { Bluetooth };
