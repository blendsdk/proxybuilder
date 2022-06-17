import fs from "fs";
import mkdirp from "mkdirp";
import path from "path";
import shelljs from "shelljs";
import { fileExists, folderExists, logWarn, wrapInArray } from "./lib";
import { TemplateGeneralConf } from "./templates/general_conf";
import { TemplateInitialSite } from "./templates/initial_site";
import { TemplateLetsEncryptConf } from "./templates/letsencrypt_conf";
import { TemplateNginxConf } from "./templates/nginx_conf";
import { TemplateSecurityConf } from "./templates/security_conf";

export class ProxyBuilder {
    protected targetFolder: string;
    protected nginxFolder: string;
    protected sslFolder: string;
    protected proxyFolder: string;
    protected sitesFolder: string;
    protected logsFolder: string;
    protected varLetsEncryptFolder: string;

    public constructor(targetFolder: string) {
        this.targetFolder = targetFolder;
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
        this.proxyFolder = this.initFolder(["proxy"]);
        this.sslFolder = this.initFolder(["ssl"]);

        this.createSSLCertificate();

        fs.writeFileSync(
            path.join(this.nginxFolder, "nginx.conf"),
            TemplateNginxConf({
                dhparamFile: this.createDhParam(),
                modulesEnabled: this.initFolder([this.nginxFolder, "modules-enabled"]),
                logsFolder: (this.logsFolder = this.initFolder(["var", "logs"])),
                confDFolder: this.initFolder([this.nginxFolder, "conf.d"]),
                sitesEnabled: (this.sitesFolder = this.initFolder([this.nginxFolder, "sites-enabled"]))
            })
        );

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

    protected requestSSLCertificate(domain: string) {
        const mainConf = path.join(this.sitesFolder, `${domain}.conf`);
        fs.writeFileSync(mainConf, TemplateInitialSite({ domain, proxyFolder: this.proxyFolder }));
        this.executeCommand("nginx -t");
        this.executeCommand("nginx -s reload");
        this.renewCertificate(domain);
    }

    protected renewCertificate(domain: string) {
        this.executeCommand(
            [
                "/usr/bin/certbot",
                "certonly",
                process.env.DEBUG ? "--test-cert" : " ",
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

    public create(domain: string) {
        this.init();
        const mainConf = path.join(this.sitesFolder, `${domain}.conf`);
        if (!fileExists(mainConf)) {
            this.requestSSLCertificate(domain);
        } else {
            logWarn(`Domain ${domain} already exists!`);
        }
    }
}
