import { glob } from "glob";
import mkdirp from "mkdirp";
import path from "path";
import shelljs from "shelljs";
import { fileExists, folderExists, logInfo, logWarn, renderTemplate, symlinkExists, wrapInArray } from "./lib";

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

    protected createNginxConf() {
        const nginxConfFile = path.join(this.nginxFolder, "nginx.conf");
        const nginxConfFileSystem = "/etc/nginx/nginx.conf";

        renderTemplate(
            "nginx.conf",
            {
                dhparamFile: this.createDhParam(),
                modulesEnabled: this.initFolder([this.nginxFolder, "modules-enabled"]),
                logsFolder: (this.logsFolder = this.initFolder(["var", "logs"])),
                confDFolder: this.initFolder([this.nginxFolder, "conf.d"]),
                sitesEnabled: (this.sitesFolder = this.initFolder([this.nginxFolder, "sites-enabled"]))
            },
            nginxConfFile
        );

        if (!symlinkExists(nginxConfFileSystem)) {
            this.executeCommand(`mv /etc/nginx/nginx.conf /etc/nginx/nginx.conf.${Date.now()}`, true);
            this.executeCommand(`ln -s ${nginxConfFile} ${nginxConfFileSystem}`, true);
            this.executeCommand(`ln -s ${this.targetFolder}`, true);
        }
    }

    protected renderProxyConfigs() {
        this.varLetsEncryptFolder = this.initFolder(["var", "letsencrypt"]);
        ["site-general.conf", "proxy.conf", "letsencrypt.conf"].forEach((conf) => {
            renderTemplate(
                conf,
                {
                    wwwFolder: this.varLetsEncryptFolder
                },
                path.join(this.proxyFolder, conf.replace("site-", ""))
            );
        });
    }

    protected init() {
        this.targetFolder = this.initFolder(this.targetFolder, true);
        this.nginxFolder = this.initFolder("nginx");
        this.proxyFolder = this.initFolder("proxy");
        this.sslFolder = this.initFolder("ssl");
        this.appsFolder = this.initFolder("apps");

        this.createSSLCertificate();
        this.createNginxConf();
        this.renderProxyConfigs();
    }

    protected executeCommand(command: string, dryRun?: boolean) {
        if (dryRun && process.env.DRYRUN) {
            return true;
        }
        const result = shelljs.exec(command, { fatal: true });
        if (result.code === 0) {
            return true;
        } else {
            throw new Error(result.toString());
        }
    }

    protected nginxReload() {
        this.executeCommand("nginx -t", true);
        this.executeCommand("nginx -s reload", true);
    }

    protected requestSSLCertificate(domain: string) {
        const mainConf = path.join(this.sitesFolder, `${domain}.conf`);
        renderTemplate("initial.conf", { domain, proxyFolder: this.proxyFolder }, mainConf);
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
            ].join(" "),
            true
        );
    }

    protected createSiteProxy(domain: string) {
        const mainConf = path.join(this.sitesFolder, `${domain}.conf`);
        const appFolder = this.initFolder(["apps", domain]);
        renderTemplate(
            "site.conf",
            {
                domain,
                proxyFolder: this.proxyFolder,
                logFolder: this.logsFolder,
                sslFolder: this.sslFolder,
                appFolder
            },
            mainConf
        );
        [
            "site-main.conf",
            "site-ssl.conf",
            "site-log.conf",
            "site-security.conf",
            "site-custom.conf",
            "site-general.conf"
        ].forEach((conf) => {
            renderTemplate(
                conf,
                {
                    domain,
                    appFolder: this.appsFolder,
                    sslFolder: this.sslFolder,
                    logFolder: this.logsFolder,
                    proxyFolder: this.proxyFolder
                },
                path.join(this.appsFolder, domain, conf.replace("site-", ""))
            );
        });
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
            logInfo(`Trying to renew ${domain}`);
            this.renewCertificate(domain);
        });
        this.nginxReload();
    }
}
