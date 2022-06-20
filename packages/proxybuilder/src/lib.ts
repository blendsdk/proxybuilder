import fs from "fs";
import path from "path";

export function isArray(value: any): boolean {
    return Array.isArray(value);
}

export function wrapInArray<T>(obj: any): T[] {
    return isArray(obj) ? obj : isNullOrUndef(obj) ? [] : [obj];
}

export function isNullOrUndef(value: any): boolean {
    return value === null || value === undefined || value === "undefined";
}
export function symlinkExists(file: string) {
    return fs.statSync(file, { throwIfNoEntry: false }) && fs.statSync(file).isSymbolicLink();
}

export function folderExists(folder: string) {
    return fs.lstatSync(folder, { throwIfNoEntry: false }) && fs.statSync(folder).isDirectory();
}

export function fileExists(file: string) {
    return fs.lstatSync(file, { throwIfNoEntry: false }) && fs.statSync(file).isFile();
}

function log(type: string, message: string, data?: any) {
    const msg = `[${type}] ${message} ${data ? JSON.stringify(data) : ""}`.trim();
    if (type === "ERROR") {
        console.error(msg);
    } else {
        console.log(msg);
    }
}

export function logInfo(message: string, data?: any) {
    log("INFO", message, data);
}

export function logWarn(message: string, data?: any) {
    log("WARN", message, data);
}

export function logError(message: string, data?: any) {
    log("ERROR", message, data);
}

export function renderTemplate<TemplateParams = any>(file: string, data: TemplateParams, outFile: string) {
    let template = fs.readFileSync(path.join(__dirname, "..", "resources", file)).toString();
    Object.entries(data || {}).forEach(([key, value]) => {
        key = `%${key}%`;
        template = template.replace(new RegExp(key, "g"), value.toString());
    });
    fs.writeFileSync(outFile, template);
}
