import fs from "fs";
import { glob } from "glob";
import mkdirp from "mkdirp";
import path from "path";
import shelljs from "shelljs";
import { fileExists, folderExists, logWarn, symlinkExists, wrapInArray } from "./lib";
import { TemplateEntry } from "./templates/entry_conf";
import { TemplateGeneralConf } from "./templates/general_conf";
import { TemplateInitialSite } from "./templates/initial_site";
import { TemplateLetsEncryptConf } from "./templates/letsencrypt_conf";
import { TemplateNginxConf } from "./templates/nginx_conf";
import { TemplateSecurityConf } from "./templates/security_conf";
import { TemplateSite } from "./templates/site_conf";

export class ProxyBuilder {
    protected targetFolder: string;
    protected nginxFolder: string;
    protected sslFolder: string;
    protected proxyFolder: string;
    protected sitesFolder: string;
    protected logsFolder: string;
    protected varLetsEncryptFolder: string;
    protected isDebug: boolean;
    protected appsFolder: string;

    public constructor(targetFolder: string, debug: boolean) {
        this.targetFolder = targetFolder;
        this.isDebug = debug;
    }

    protected initFolder(folder: string | string[], root?: boolean) {
        const fldr = root
            ? path.resolve(...wrapInArray<string>(folder))
            : path.resolve(this.targetFolder, ...wrapInArray<string>(folder));
        if (!folderExists(fldr)) {
            mkdirp.sync(fldr);
        }
        return fldr;
    }

    protected createDhParam() {
        const dhparamFile = path.join(this.targetFolder, "dhparam.pem");
        if (!fileExists(dhparamFile)) {
            this.executeCommand(`openssl dhparam -out ${dhparamFile} 2048`);
        }
        return dhparamFile;
    }

    protected createSSLCertificate() {
        if (!fileExists(path.join(this.sslFolder, "self-ssl.key"))) {
            this.executeCommand(
                `openssl req -batch -x509 -nodes -days 365 -newkey rsa:2048 -keyout ${this.sslFolder}/self-ssl.key -out ${this.sslFolder}/self-ssl.crt`
            );
        }
    }

    protected init() {
        this.targetFolder = this.initFolder(this.targetFolder, true);
        this.nginxFolder = this.initFolder("nginx");
        this.proxyFolder = this.initFolder("proxy");
        this.sslFolder = this.initFolder("ssl");
        this.appsFolder = this.initFolder("apps");

        this.createSSLCertificate();

        const nginxConfFile = path.join(this.nginxFolder, "nginx.conf");
        const nginxConfFileSystem = "/etc/nginx/nginx.conf";

        fs.writeFileSync(
            nginxConfFile,
            TemplateNginxConf({
                dhparamFile: this.createDhParam(),
                modulesEnabled: this.initFolder([this.nginxFolder, "modules-enabled"]),
                logsFolder: (this.logsFolder = this.initFolder(["var", "logs"])),
                confDFolder: this.initFolder([this.nginxFolder, "conf.d"]),
                sitesEnabled: (this.sitesFolder = this.initFolder([this.nginxFolder, "sites-enabled"]))
            })
        );

        if (!symlinkExists(nginxConfFileSystem)) {
            this.executeCommand(`mv /etc/nginx/nginx.conf /etc/nginx/nginx.conf.${Date.now()}`);
            this.executeCommand(`ln -s ${nginxConfFile} ${nginxConfFileSystem}`);
        }

        fs.writeFileSync(path.join(this.proxyFolder, "general.conf"), TemplateGeneralConf());
        fs.writeFileSync(path.join(this.proxyFolder, "security.conf"), TemplateSecurityConf());
        fs.writeFileSync(
            path.join(this.proxyFolder, "letsencrypt.conf"),
            TemplateLetsEncryptConf((this.varLetsEncryptFolder = this.initFolder(["var", "letsencrypt"])))
        );
    }

    protected executeCommand(command: string) {
        const result = shelljs.exec(command, { fatal: true });
        if (result.code === 0) {
            return true;
        } else {
            throw new Error(result.toString());
        }
    }

    protected nginxReload() {
        this.executeCommand("nginx -t");
        this.executeCommand("nginx -s reload");
    }

    protected requestSSLCertificate(domain: string) {
        const mainConf = path.join(this.sitesFolder, `${domain}.conf`);
        fs.writeFileSync(mainConf, TemplateInitialSite({ domain, proxyFolder: this.proxyFolder }));
        this.nginxReload();
        this.renewCertificate(domain);
    }

    protected renewCertificate(domain: string) {
        this.executeCommand(
            [
                "/usr/bin/certbot",
                "certonly",
                this.isDebug ? "--test-cert" : " ",
                "--webroot",
                `-d ${domain}`,
                `--work-dir ${this.varLetsEncryptFolder}/lib`,
                `--logs-dir ${this.logsFolder}`,
                `--config-dir ${this.sslFolder}`,
                "--keep-until-expiring",
                "-n",
                "--agree-tos",
                `--webroot-path ${this.varLetsEncryptFolder}`,
                `-m info@truesoftware.nl`,
                `--expand`
            ].join(" ")
        );
    }

    protected createSiteProxy(domain: string) {
        const mainConf = path.join(this.sitesFolder, `${domain}.conf`);
        const appFolder = this.initFolder(["apps", domain]);
        fs.writeFileSync(
            mainConf,
            TemplateSite({
                domain,
                proxyFolder: this.proxyFolder,
                logFolder: this.logsFolder,
                sslFolder: this.sslFolder,
                appFolder
            })
        );
        fs.writeFileSync(path.join(appFolder, "main.conf"), TemplateEntry({ proxyFolder: this.proxyFolder, domain }));
        this.nginxReload();
    }

    public create(domain: string) {
        this.init();
        const mainConf = path.join(this.sitesFolder, `${domain}.conf`);
        if (!fileExists(mainConf)) {
            this.requestSSLCertificate(domain);
            this.createSiteProxy(domain);
        } else {
            logWarn(`Domain ${domain} already exists!`);
        }
    }

    public renew(domains: string[]) {
        this.init();
        if (domains.length === 0) {
            glob.sync(path.join(this.sitesFolder, "*.conf")).forEach((file) => {
                domains.push(path.parse(file).name);
            });
        }
        domains.forEach((domain) => {
            this.renewCertificate(domain);
        });
        this.nginxReload();
    }
}
