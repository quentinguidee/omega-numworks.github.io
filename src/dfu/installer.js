import DFU from '../dfu/dfu'
import DFUse from '../dfu/dfuse'

import {releases} from '../firmware/firmwares'

export default class Installer {
    constructor(install) {
        this.installInstance = install;
        this.device = null;
        this.transferSize = 2048;
        this.manifestationTolerant = false;
        this.toInstall = "latest";
        this.firmwareInfos = null;
        this.ignore_disconnect = false;
    }
    
    init(versionToInstall) {
        this.toInstall = versionToInstall;
        if (this.toInstall === "latest") {
            this.toInstall = releases.latest;
        }
        
        
        for (var firm in releases.firmwares) {
            if (releases.firmwares[firm].name === this.toInstall) {
                this.firmwareInfos = releases.firmwares[firm];
                break;
            }
        }
        
        if (this.firmwareInfos == null) {
            this.installInstance.firmwareNotFound(this.toInstall);
            return;
        } else {
            this.installInstance.calculatorError(false, null);
        }
        
        
        if (typeof navigator.usb === 'undefined') {
            this.installInstance.installerNotCompatibleWithThisBrowser();
        } else {
            navigator.usb.addEventListener("disconnect", this.onUnexpectedDisconnect.bind(this));
            this.autoConnect(0x0483, 0xa291);
        }
    }
    
    async __connect(device) {
        try {
            await device.open();
        } catch (error) {
            // this.installInstance.calculatorError(true, error);
            throw error;
        }

        // Attempt to parse the DFU functional descriptor
        let desc = {};
        try {
            desc = await getDFUDescriptorProperties(device);
        } catch (error) {
            // this.installInstance.calculatorError(true, error);
            throw error;
        }

        if (desc && Object.keys(desc).length > 0) {
            device.properties = desc;
            this.transferSize = desc.TransferSize;
            if (desc.CanDnload) {
                this.manifestationTolerant = desc.ManifestationTolerant;
            }

            if ((desc.DFUVersion === 0x100 || desc.DFUVersion === 0x011a) && device.settings.alternate.interfaceProtocol === 0x02) {
                device = new DFUse.Device(device.device_, device.settings);
                if (device.memoryInfo) {
                    // We have to add RAM manually, because... meh.
                    device.memoryInfo.segments.unshift({
                        start: 0x20000000,
                        sectorSize: 1024,
                        end: 0x20040000,
                        readable: true,
                        erasable: false,
                        writable: true
                    });
                
                    /*
                    let totalSize = 0;
                    for (let segment of device.memoryInfo.segments) {
                        totalSize += segment.end - segment.start;
                    }
                    */
                }
            }
        }

        // Bind logging methods
        device.logDebug = console.log;
        device.logInfo = console.info;
        device.logWarning = console.warn;
        device.logError = console.error;
        device.logProgress = console.log;
        
        return device;
    }
    
    __getModel() {
        var n = this.device.memoryInfo.segments[this.device.memoryInfo.segments.length-1].end;
        return n > 0x080E0000 && n < 0x90000000 ? "0100" : "0110";
    }
    
    async __getPlatformInfo() {
        this.device.startAddress = 0x080001c4;
        const blob = await this.device.do_upload(this.transferSize, 0x48);
        return parsePlatformInfo(await blob.arrayBuffer());
    }
    
    async __setCalculatorInfos() {
        this.installInstance.setModel("N" + this.__getModel());
        
        let pinfo = await this.__getPlatformInfo();
        
        // {"magik":true,"oldplatform":false,"omega":{"installed":true,"version":"1.19.0-0","user":""},"version":"13.0.0","commit":"dcaa1cb","storage":{"address":536874844,"size":32768}}
        
        if (pinfo.magik) {
            this.installInstance.setEpsilonVersion(pinfo.version);
            if (pinfo.omega.installed) {
                this.installInstance.setOmegaVersion(pinfo.omega.version);
                
                if (pinfo.omega.user.trim().length > 0) {
                    this.installInstance.setUsername(pinfo.omega.user.trim());
                }
            }
        }
        
        this.installInstance.calculatorDetected(pinfo.omega.installed ? "omega" : "epsilon");
        
    }
    
    async __sha256(blob) {
        const msgUint8 = await blob.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    }
    
    __downloadFirmware(model, version, fwname, callback) {
        var oReq = new XMLHttpRequest();
        
        var urlBase = "/firmwares/" + version + "/" + model.toLowerCase() + "/" + fwname;
        console.log("[DOWNLOAD] " + urlBase);
        
        oReq.open("GET", urlBase, true);
        oReq.responseType = "blob";

        oReq.onload = function(oEvent) {
            var blob = oReq.response;
            callback(blob);
        };

        oReq.send();
    }
    
    __downloadSHA256(model, version, fwname, callback) {
        var oReq = new XMLHttpRequest();
        
        var urlBase = "/firmwares/" + version + "/" + model.toLowerCase() + "/" + fwname + ".sha256";
        console.log("[DOWNLOAD] " + urlBase);
        
        oReq.open("GET", urlBase, true);
        oReq.onload = function(e) {
            callback(oReq.responseText.split(' ')[0]);
            
        }
        oReq.send();
    }
    
    __downloadFirmwareCheck(model, version, firmware, callback) {
        this.__downloadFirmware(model, version, firmware, async blob => {
            this.__downloadSHA256(model, version, firmware, async sha256 => {
                var calcSha256 = await this.__sha256(blob);
                
                console.log(sha256);
                console.log(calcSha256);
                
                if (sha256 === calcSha256) {
                    callback(true, blob);
                } else {
                    callback(false, blob);
                }
            });
            
        });
    }
    
    install() {
        console.log("install version" + this.toInstall + "/" + this.installInstance.state.model);
        
        // this.__downloadSHA256(this.installInstance.state.model, this.toInstall, "epsilon.onboarding.external.bin", sha256 => {
        //     console.log(sha256);
        // });
        
        if (this.installInstance.state.model === "N0100") {
            this.__installN0100();
        } else {
            this.__installN0110();
        }
        

    }
    
    __installN0100() {
        var _this = this;
        
        _this.__downloadFirmwareCheck(_this.installInstance.state.model, _this.toInstall, "epsilon.onboarding.internal.bin", async (internal_check, internal_blob) => {
            if (!internal_check) {
                _this.installInstance.calculatorError(true, "Download of internal seems corrupted, please retry.");
            }
            
            _this.device.logProgress = function(done, total) {
                _this.installInstance.setProgressPercentage(done / total * 100);
            };
            
            this.ignore_disconnect = true;
            
            _this.device.startAddress = 0x08000000;
            await _this.device.do_download(_this.transferSize, await internal_blob.arrayBuffer(), true);
            
            _this.installInstance.installationFinished();
        });
    }
    
    __installN0110() {
        var _this = this;
        
        this.__downloadFirmwareCheck(this.installInstance.state.model, this.toInstall, "epsilon.onboarding.external.bin", async (external_check, external_blob) => {
            if (!external_check) {
                _this.installInstance.calculatorError(true, "Download of external seems corrupted, please retry.");
            }
            
            _this.__downloadFirmwareCheck(_this.installInstance.state.model, _this.toInstall, "epsilon.onboarding.internal.bin", async (internal_check, internal_blob) => {
                if (!internal_check) {
                    _this.installInstance.calculatorError(true, "Download of internal seems corrupted, please retry.");
                }
                
                _this.device.logProgress = function(done, total) {
                    _this.installInstance.setProgressPercentage(done / total  * 100);
                };
                
                _this.device.startAddress = 0x90000000;
                await _this.device.do_download(_this.transferSize, await external_blob.arrayBuffer(), false);
                    
                this.ignore_disconnect = true;
                
                _this.device.startAddress = 0x08000000;
                await _this.device.do_download(_this.transferSize, await internal_blob.arrayBuffer(), true);
                
                _this.installInstance.installationFinished();
            });
        });
    }
    
    detect() {
        this.installInstance.calculatorError(false, null);
        navigator.usb.requestDevice({ 'filters': [{'vendorId': 0x0483, 'productId': 0xa291}]}).then(
            async selectedDevice => {
                let interfaces = DFU.findDeviceDfuInterfaces(selectedDevice);
                await fixInterfaceNames(selectedDevice, interfaces);
                this.device = await this.__connect(new DFU.Device(selectedDevice, interfaces[0]));
                
                
                
                
                await this.__setCalculatorInfos();
            }
        ).catch(error => {
            this.installInstance.calculatorError(true, error);
        });
    }
    
    autoConnect(vid, pid, serial) {
        // !TODO
    }
    
    onUnexpectedDisconnect(event) {
        if (this.device !== null && this.device.device_ !== null) {
            if (this.device.device_ === event.device) {
                this.device.disconnected = true;
                if (this.ignore_disconnect === false)
                    this.installInstance.calculatorError(true, event);
                this.device = null;
            }
        }
    }
}















function readFString(dv, index, len) {
    var out = "";
    for(var i = 0; i < len; i++) {
        var chr = dv.getUint8(index + i);
        
        if (chr === 0) {
            break;
        }
        
        out += String.fromCharCode(chr);
    }
    
    return out;
}

function parsePlatformInfo(array) {
    var dv = new DataView(array);
    // console.log(hexBuffer(array));
    var data = {};
    
    data["magik"] = dv.getUint32(0x00, false) === 0xF00DC0DE;
    
    data["magik"] = dv.getUint32(0x00, false) === 0xF00DC0DE;
    
    if (data["magik"]) {
        data["oldplatform"] = !(dv.getUint32(0x1C, false) === 0xF00DC0DE);
        
        data["omega"] = {};
        
        if (data["oldplatform"]) {
            data["omega"]["installed"] = dv.getUint32(0x1C + 8, false) === 0xF00DC0DE || dv.getUint32(0x1C + 16, false) === 0xDEADBEEF || dv.getUint32(0x1C + 32, false) === 0xDEADBEEF;
            if (data["omega"]["installed"]) {
                data["omega"]["version"] = readFString(dv, 0x0C, 16);
                
                data["omega"]["user"] = "";
                
            }
            
            data["version"] = readFString(dv, 0x04, 8);
            var offset = 0;
            if (dv.getUint32(0x1C + 8, false) === 0xF00DC0DE) {
                offset = 8;
            } else if (dv.getUint32(0x1C + 16, false) === 0xF00DC0DE) {
                offset = 16;
            } else if (dv.getUint32(0x1C + 32, false) === 0xF00DC0DE) {
                offset = 32;
            }
            
            data["commit"] = readFString(dv, 0x0C + offset, 8);
            data["storage"] = {};
            data["storage"]["address"] = dv.getUint32(0x14 + offset, true);
            data["storage"]["size"] = dv.getUint32(0x18 + offset, true);
        } else {
            data["omega"]["installed"] = dv.getUint32(0x20, false) === 0xDEADBEEF && dv.getUint32(0x44, false) === 0xDEADBEEF;
            if (data["omega"]["installed"]) {
                data["omega"]["version"] = readFString(dv, 0x24, 16);
                data["omega"]["user"] = readFString(dv, 0x34, 16);
            }

            data["version"] = readFString(dv, 0x04, 8);
            data["commit"] = readFString(dv, 0x0C, 8);
            data["storage"] = {};
            data["storage"]["address"] = dv.getUint32(0x14, true);
            data["storage"]["size"] = dv.getUint32(0x18, true);
        }
    } else {
        data["omega"] = false;
    }
    
    return data;
}

function getDFUDescriptorProperties(device) {
    // Attempt to read the DFU functional descriptor
    // TODO: read the selected configuration's descriptor
    return device.readConfigurationDescriptor(0).then(
        data => {
            let configDesc = DFU.parseConfigurationDescriptor(data);
            let funcDesc = null;
            let configValue = device.settings.configuration.configurationValue;
            if (configDesc.bConfigurationValue === configValue) {
                for (let desc of configDesc.descriptors) {
                    if (desc.bDescriptorType === 0x21 && desc.hasOwnProperty("bcdDFUVersion")) {
                        funcDesc = desc;
                        break;
                    }
                }
            }

            if (funcDesc) {
                return {
                    WillDetach:            ((funcDesc.bmAttributes & 0x08) !== 0),
                    ManifestationTolerant: ((funcDesc.bmAttributes & 0x04) !== 0),
                    CanUpload:             ((funcDesc.bmAttributes & 0x02) !== 0),
                    CanDnload:             ((funcDesc.bmAttributes & 0x01) !== 0),
                    TransferSize:          funcDesc.wTransferSize,
                    DetachTimeOut:         funcDesc.wDetachTimeOut,
                    DFUVersion:            funcDesc.bcdDFUVersion
                };
            } else {
                return {};
            }
        },
        error => {}
    );
}

async function fixInterfaceNames(device_, interfaces) {
    // Check if any interface names were not read correctly
    if (interfaces.some(intf => (intf.name === null))) {
        // Manually retrieve the interface name string descriptors
        let tempDevice = new DFU.Device(device_, interfaces[0]);
        await tempDevice.device_.open();
        let mapping = await tempDevice.readInterfaceNames();
        await tempDevice.close();

        for (let intf of interfaces) {
            if (intf.name === null) {
                let configIndex = intf.configuration.configurationValue;
                let intfNumber = intf["interface"].interfaceNumber;
                let alt = intf.alternate.alternateSetting;
                intf.name = mapping[configIndex][intfNumber][alt];
            }
        }
    }
}
